import express from 'express'
import pg from 'pg'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const app = express()
const port = Number(process.env.API_PORT || 3001)
const uploadsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
const acceptedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf', '.dwg', '.dxf'])
const employeeRoles = ['Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Монтажник']
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'aquastone',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  max: 10,
  connectionTimeoutMillis: 3000,
})

app.use(express.json({ limit: '2mb' }))

let databaseReady = false
let startupError = null

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processes (
      process_number TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes (updated_at DESC)')
  await pool.query("UPDATE processes SET data = data - 'cutouts' - 'surveyPhotos' - 'drawingPhotos' WHERE data ? 'cutouts' OR data ? 'surveyPhotos' OR data ? 'drawingPhotos'")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS process_attachments (
      id UUID PRIMARY KEY,
      process_number TEXT NOT NULL REFERENCES processes(process_number) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      original_name TEXT NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS process_attachments_process_idx ON process_attachments (process_number, created_at)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS process_history (
      id BIGSERIAL PRIMARY KEY,
      process_number TEXT NOT NULL REFERENCES processes(process_number) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS process_history_process_idx ON process_history (process_number, created_at DESC)')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Монтажник')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (name, role)
    )
  `)
  await pool.query(`
    INSERT INTO process_history (process_number, action, actor, details, created_at)
    SELECT p.process_number, 'created', COALESCE(p.data->>'manager', 'Менеджер'),
           jsonb_build_object('processNumber', p.process_number), p.created_at
    FROM processes p
    WHERE NOT EXISTS (
      SELECT 1 FROM process_history h
      WHERE h.process_number = p.process_number AND h.action = 'created'
    )
  `)
  await mkdir(uploadsPath, { recursive: true })
  databaseReady = true
  startupError = null
  console.log(`Connected to PostgreSQL database "${process.env.PGDATABASE || 'aquastone'}"`)
}

const requireDatabase = (_req, res, next) => {
  if (!databaseReady) return res.status(503).json({ error: 'PostgreSQL is unavailable. Check the local server and .env settings.' })
  next()
}

app.get('/api/health', (_req, res) => {
  res.status(databaseReady ? 200 : 503).json({ database: databaseReady ? 'connected' : 'disconnected', error: startupError })
})

app.get('/api/employees', requireDatabase, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, role, active FROM employees WHERE active = TRUE ORDER BY name')
    res.json(rows)
  } catch (error) { next(error) }
})

app.post('/api/employees', requireDatabase, async (req, res, next) => {
  const name = String(req.body?.name || '').trim()
  const role = String(req.body?.role || '')
  if (!name) return res.status(400).json({ error: 'Укажите имя сотрудника.' })
  if (!employeeRoles.includes(role)) return res.status(400).json({ error: 'Выберите корректную роль сотрудника.' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO employees (name, role) VALUES ($1, $2)
       ON CONFLICT (name, role) DO UPDATE SET active = TRUE
       RETURNING id, name, role, active`,
      [name, role],
    )
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.delete('/api/employees/:id', requireDatabase, async (req, res, next) => {
  try {
    const { rows } = await pool.query('UPDATE employees SET active = FALSE WHERE id = $1 RETURNING id', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Сотрудник не найден.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/processes', requireDatabase, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT process_number, data, created_at, updated_at FROM processes ORDER BY updated_at DESC')
    res.json(rows.map(({ process_number, data, created_at, updated_at }) => ({ ...data, id: process_number, createdAt: created_at, updatedAt: updated_at })))
  } catch (error) { next(error) }
})

app.post('/api/processes', requireDatabase, async (req, res, next) => {
  const id = String(req.body?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'Process number is required.' })
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'A process object is required.' })
  try {
    const data = { ...req.body, id }
    if (!data.manager) return res.status(400).json({ error: 'Назначьте ответственного менеджера.' })
    if (data.manager) {
      const { rows: managers } = await pool.query(
        'SELECT 1 FROM employees WHERE name = $1 AND role = $2 AND active = TRUE',
        [data.manager, 'Менеджер'],
      )
      if (!managers.length) return res.status(400).json({ error: 'Назначьте менеджера из справочника сотрудников.' })
    }
    const { rows } = await pool.query(
      'INSERT INTO processes (process_number, data) VALUES ($1, $2::jsonb) RETURNING process_number, data, created_at, updated_at',
      [id, JSON.stringify(data)],
    )
    const row = rows[0]
    await pool.query(
      'INSERT INTO process_history (process_number, action, actor, details) VALUES ($1, $2, $3, $4::jsonb)',
      [id, 'created', String(data.manager || 'Менеджер'), JSON.stringify({ processNumber: id })],
    )
    res.status(201).json({ ...row.data, id: row.process_number, createdAt: row.created_at, updatedAt: row.updated_at })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: `Process #${id} already exists.` })
    next(error)
  }
})

app.put('/api/processes/:id', requireDatabase, async (req, res, next) => {
  const id = String(req.params.id || '').trim()
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'A process object is required.' })
  try {
    const { updatedBy, ...processData } = req.body
    const data = { ...processData, id }
    const { rows: previousRows } = await pool.query('SELECT data FROM processes WHERE process_number = $1', [id])
    if (!previousRows.length) return res.status(404).json({ error: `Process #${id} was not found.` })
    const previous = previousRows[0].data
    const assignmentRoles = { manager: 'Менеджер', surveyor: 'Замерщик', technologist: 'Технолог', cncOperator: 'ЧПУ', installers: 'Монтажник' }
    for (const [field, expectedRole] of Object.entries(assignmentRoles)) {
      if (!data[field] || data[field] === previous[field]) continue
      const { rows: matches } = await pool.query(
        'SELECT 1 FROM employees WHERE name = $1 AND role = $2 AND active = TRUE',
        [data[field], expectedRole],
      )
      if (!matches.length) return res.status(400).json({ error: `Для поля «${field}» выберите активного сотрудника с ролью «${expectedRole}».` })
    }
    const changedFields = Object.keys(data).filter((key) => key !== 'id' && JSON.stringify(previous[key] ?? null) !== JSON.stringify(data[key] ?? null))
    const { rows } = await pool.query(
      'UPDATE processes SET data = $2::jsonb, updated_at = NOW() WHERE process_number = $1 RETURNING process_number, data, created_at, updated_at',
      [id, JSON.stringify(data)],
    )
    if (!rows.length) return res.status(404).json({ error: `Process #${id} was not found.` })
    const row = rows[0]
    if (changedFields.length) {
      await pool.query(
        'INSERT INTO process_history (process_number, action, actor, details) VALUES ($1, $2, $3, $4::jsonb)',
        [id, 'updated', String(updatedBy || data.manager || 'Сотрудник'), JSON.stringify({ changedFields })],
      )
    }
    res.json({ ...row.data, id: row.process_number, createdAt: row.created_at, updatedAt: row.updated_at })
  } catch (error) { next(error) }
})

app.get('/api/processes/:id/history', requireDatabase, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, action, actor, details, created_at FROM process_history WHERE process_number = $1 ORDER BY created_at DESC, id DESC',
      [req.params.id],
    )
    res.json(rows.map((row) => ({ id: row.id, action: row.action, actor: row.actor, details: row.details, createdAt: row.created_at })))
  } catch (error) { next(error) }
})

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsPath),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    callback(acceptedExtensions.has(extension) ? null : new Error('Допускаются JPG, PNG, WEBP, HEIC, PDF, DWG и DXF.'), acceptedExtensions.has(extension))
  },
})

app.get('/api/processes/:id/attachments', requireDatabase, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, field_key, original_name, mime_type, file_size, created_at FROM process_attachments WHERE process_number = $1 ORDER BY created_at',
      [req.params.id],
    )
    res.json(rows.map((row) => ({ ...row, url: `/api/processes/${encodeURIComponent(req.params.id)}/attachments/${row.id}` })))
  } catch (error) { next(error) }
})

app.post('/api/processes/:id/attachments', requireDatabase, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Select a file to upload.' })
  try {
    const fieldKey = String(req.body.fieldKey || 'documents').slice(0, 80)
    const { rows } = await pool.query(
      `INSERT INTO process_attachments (id, process_number, field_key, original_name, storage_name, mime_type, file_size)
       SELECT $1, process_number, $2, $3, $4, $5, $6 FROM processes WHERE process_number = $7
       RETURNING id, field_key, original_name, mime_type, file_size, created_at`,
      [randomUUID(), fieldKey, req.file.originalname, req.file.filename, req.file.mimetype || 'application/octet-stream', req.file.size, req.params.id],
    )
    if (!rows.length) {
      await rm(req.file.path, { force: true })
      return res.status(404).json({ error: `Process #${req.params.id} was not found.` })
    }
    res.status(201).json({ ...rows[0], url: `/api/processes/${encodeURIComponent(req.params.id)}/attachments/${rows[0].id}` })
  } catch (error) {
    await rm(req.file.path, { force: true }).catch(() => {})
    next(error)
  }
})

app.get('/api/processes/:id/attachments/:attachmentId', requireDatabase, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT original_name, storage_name, mime_type FROM process_attachments WHERE process_number = $1 AND id = $2',
      [req.params.id, req.params.attachmentId],
    )
    if (!rows.length) return res.status(404).json({ error: 'File was not found.' })
    res.type(rows[0].mime_type).download(path.join(uploadsPath, rows[0].storage_name), rows[0].original_name)
  } catch (error) { next(error) }
})

app.delete('/api/processes/:id/attachments/:attachmentId', requireDatabase, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM process_attachments WHERE process_number = $1 AND id = $2 RETURNING storage_name',
      [req.params.id, req.params.attachmentId],
    )
    if (!rows.length) return res.status(404).json({ error: 'File was not found.' })
    await rm(path.join(uploadsPath, rows[0].storage_name), { force: true })
    res.status(204).end()
  } catch (error) { next(error) }
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'File size limit is 50 MB.' : error.message })
  }
  if (error.message?.startsWith('Допускаются JPG')) return res.status(400).json({ error: error.message })
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(port, '127.0.0.1', () => console.log(`Aquastone API listening on http://127.0.0.1:${port}`))
initializeDatabase().catch((error) => {
  startupError = error.message
  console.error('PostgreSQL connection failed:', error.message)
  console.error('Check that PostgreSQL is running and that PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD in .env are correct.')
})
setInterval(() => {
  if (!databaseReady) initializeDatabase().catch(() => {})
}, 5000).unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => { await pool.end(); process.exit(0) })
}
