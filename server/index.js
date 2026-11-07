import express from 'express'
import pg from 'pg'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  LOGIN_PATTERN, PASSWORD_MIN, hashPassword, issueCredentials, newSessionToken, normalizeLogin,
  readCookie, tokenHash, uniqueLogin, verifyPassword,
} from './auth.js'
import { ASSIGNMENT_FIELDS, INSTALLATION_PHOTOS, LIST_FIELDS, PRODUCTION_STAGES, READY, ROLES, STAGE_OWNERS, STATUS_STAGES, TAKE_STEPS, availableActions, canEditAttachment, forbiddenFields, stageChangeError, statusOf } from '../src/permissions.js'
import { fieldName } from '../src/historyFields.js'
import { DECOR_GLUE_SEEDS, normalizeDecorGlue, sortDecorGlues } from '../src/decorGlues.js'
import { normalizeCompany, sortCompanies } from '../src/furniture.js'
import { formatRussianPhone } from '../src/phone.js'
import { REQUEST_STATUSES, normalizeContact, normalizeProject, requestSummary } from '../src/requests.js'
import { LEGACY_ITEM_FIELDS, cleanItems, itemLine } from '../src/processItems.js'

const { Pool } = pg
const app = express()
const port = Number(process.env.API_PORT || 3001)
const uploadsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
const acceptedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf', '.dwg', '.dxf'])
// Поля, в которые можно загрузить только определённый формат.
const fieldExtensions = { cadDrawing: ['.dwg'], dxfDrawing: ['.dxf'], [INSTALLATION_PHOTOS]: ['.jpg', '.jpeg', '.png', '.webp', '.heic'] }
// Справочники для выпадающих списков: клеи и материалы финальной шлифовки.
const catalogKinds = ['glue', 'sanding']
const catalogSeeds = {
  glue: ['A-White', 'N-White', 'S-White', 'L-Peanut', 'C-Onyx'],
  sanding: ['Шкурка 220', 'Шкурка 320', 'Шкурка 400', 'Черепашка 100', 'Черепашка 200'],
}
// Служебные поля ответа API (createdAt, version…) и устаревшие ключи в данных процесса не храним.
const technicalFields = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'version']
const stripRemovedFields = (data) => { for (const key of [...LEGACY_PROCESS_FIELDS, ...technicalFields]) delete data[key]; return data }
const assignmentFields = ASSIGNMENT_FIELDS

// Сессии: cookie живёт 30 дней, «последний визит» обновляем не чаще раза в 5 минут.
const SESSION_COOKIE = 'aq_session'
const SESSION_DAYS = 30
const secureCookie = process.env.COOKIE_SECURE === '1'

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

// ---------- Сотрудники: роли ----------
/** Роли из запроса: только известные, без повторов, в привычном порядке. */
const parseRoles = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return ROLES.filter((role) => list.map(String).includes(role))
}
const sortRoles = (roles) => ROLES.filter((role) => (roles || []).includes(role))
/** Директор может всё, что может менеджер. */
const hasRight = (user, role) => Boolean(user?.roles?.includes(role) || (role === 'Менеджер' && user?.roles?.includes('Директор')))
const rolesLabel = (roles) => sortRoles(roles).join(', ')
const employeeRow = (row, { full = false } = {}) => ({
  id: row.id, name: row.name, roles: sortRoles(row.roles), active: row.active, hasAccess: Boolean(row.password_hash),
  ...(full ? { login: row.login || null, passwordChangedAt: row.password_changed_at || null, lastSeenAt: row.last_seen_at || null } : {}),
})

/**
 * Раньше сотрудник хранился отдельной строкой на каждую роль (Иван · Технолог, Иван · Монтажник).
 * Теперь сотрудник — один человек со списком ролей. Склеиваем старые строки по имени.
 */
// ---------- Схема базы ----------
// Итоговая схема таблиц. ADD COLUMN IF NOT EXISTS — для баз, созданных до появления этих столбцов.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS processes (
    process_number TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE processes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
  CREATE INDEX IF NOT EXISTS processes_updated_at_idx ON processes (updated_at DESC);

  CREATE TABLE IF NOT EXISTS process_attachments (
    id UUID PRIMARY KEY,
    process_number TEXT NOT NULL REFERENCES processes(process_number) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    storage_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS process_attachments_process_idx ON process_attachments (process_number, created_at);

  CREATE TABLE IF NOT EXISTS process_history (
    id BIGSERIAL PRIMARY KEY,
    process_number TEXT NOT NULL REFERENCES processes(process_number) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_id BIGINT,
    version INTEGER,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE process_history ADD COLUMN IF NOT EXISTS actor_id BIGINT;
  ALTER TABLE process_history ADD COLUMN IF NOT EXISTS version INTEGER;
  CREATE INDEX IF NOT EXISTS process_history_process_idx ON process_history (process_number, created_at DESC);
  CREATE INDEX IF NOT EXISTS process_history_actor_idx ON process_history (actor_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS process_comments (
    id BIGSERIAL PRIMARY KEY,
    process_number TEXT NOT NULL REFERENCES processes(process_number) ON DELETE CASCADE ON UPDATE CASCADE,
    author_id BIGINT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS process_comments_process_idx ON process_comments (process_number, created_at);

  CREATE TABLE IF NOT EXISTS requests (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('client', 'manager')),
    client_name TEXT NOT NULL DEFAULT '',
    client_phone TEXT NOT NULL DEFAULT '',
    author_id BIGINT,
    author TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Новая',
    note TEXT NOT NULL DEFAULT '',
    process_number TEXT REFERENCES processes(process_number) ON DELETE SET NULL ON UPDATE CASCADE,
    project JSONB NOT NULL,
    estimate INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS requests_created_idx ON requests (created_at DESC);

  CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    login TEXT,
    password_hash TEXT,
    password_changed_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    notifications_read_at TIMESTAMPTZ
  );
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS notifications_read_at TIMESTAMPTZ;
  CREATE UNIQUE INDEX IF NOT EXISTS employees_name_unique ON employees (lower(name));
  CREATE UNIQUE INDEX IF NOT EXISTS employees_login_unique ON employees (lower(login)) WHERE login IS NOT NULL;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_employee_idx ON sessions (employee_id);

  CREATE TABLE IF NOT EXISTS catalog_items (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('glue', 'sanding')),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (kind, name)
  );

  CREATE TABLE IF NOT EXISTS furniture_companies (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS furniture_companies_name_unique ON furniture_companies (lower(name));
  CREATE TABLE IF NOT EXISTS furniture_makers (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES furniture_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS furniture_makers_company_idx ON furniture_makers (company_id, position);
`

/** Устаревшее: столбцы, которые больше нигде не читаются, и служебная таблица старого демо-скрипта. */
const OBSOLETE = `
  ALTER TABLE employees DROP COLUMN IF EXISTS created_at;
  ALTER TABLE sessions DROP COLUMN IF EXISTS created_at;
  ALTER TABLE catalog_items DROP COLUMN IF EXISTS created_at;
  ALTER TABLE furniture_companies DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
  DROP TABLE IF EXISTS demo_seed_people;
`
// Ключи данных процесса из старых версий: удаляются из базы при запуске и не принимаются при сохранении.
const LEGACY_PROCESS_FIELDS = [
  'color', 'initials', 'date', 'completeness', 'address', 'phone', 'surveyAccess', 'elevatorType', 'installationResult',
  'surveyNotes', 'demoSeed', 'cutouts', 'surveyPhotos', 'drawingPhotos', 'cadFile', 'cutPlan', 'cncTransfer', 'cncCutting',
  'edgeFinishing', 'packaging', 'productionNotes', 'installationNotes', 'installationAccess',
  // Изделие, материал, декор и клей теперь у каждого изделия в списке items.
  ...LEGACY_ITEM_FIELDS,
]
/**
 * Процессы до появления списка изделий: изделие, материал, декор и клей становятся изделием №1.
 * Выполняется при запуске до удаления старых полей; «Не выбран» превращается в пустое значение.
 */
const MIGRATE_ITEMS = `
  UPDATE processes SET data = jsonb_set(data, '{items}', jsonb_build_array(jsonb_build_object(
    'product', COALESCE(NULLIF(data->>'product', 'Не выбран'), ''),
    'material', COALESCE(NULLIF(data->>'material', 'Не выбран'), ''),
    'decor', COALESCE(NULLIF(data->>'decor', 'Не выбран'), ''),
    'glue', COALESCE(NULLIF(data->>'glue', 'Не выбран'), '')
  )))
  WHERE NOT (data ? 'items') AND data ?| ARRAY['product', 'material', 'decor', 'glue']
`
/**
 * Дата завершения (completedAt) для процессов, завершённых до её появления: последний переход в «Завершён»
 * из истории, иначе — время последней смены этапа, иначе — последнего сохранения.
 */
const MIGRATE_COMPLETED_AT = `
  UPDATE processes p SET data = jsonb_set(p.data, '{completedAt}', to_jsonb(COALESCE(
    (SELECT to_char(max(h.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM process_history h
      WHERE h.process_number = p.process_number AND h.details->'changes'->'stage'->>'to' = 'Завершён'),
    p.data->>'stageChangedAt',
    to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )))
  WHERE p.data->>'stage' = 'Завершён' AND NOT (p.data ? 'completedAt')
`

/** Если в системе нет ни одного директора с паролем — создаём его и печатаем логин и пароль в консоль. */
async function ensureDirector() {
  const { rows: ready } = await pool.query("SELECT 1 FROM employees WHERE active AND 'Директор' = ANY(roles) AND password_hash IS NOT NULL LIMIT 1")
  if (ready.length) return
  let { rows } = await pool.query("SELECT id, name, login FROM employees WHERE active AND 'Директор' = ANY(roles) ORDER BY id LIMIT 1")
  if (!rows.length) {
    const { rows: byName } = await pool.query("SELECT id FROM employees WHERE lower(name) = 'директор'")
    if (byName.length) {
      ({ rows } = await pool.query("UPDATE employees SET active = TRUE, roles = CASE WHEN 'Директор' = ANY(roles) THEN roles ELSE array_prepend('Директор', roles) END WHERE id = $1 RETURNING id, name, login", [byName[0].id]))
    } else {
      const login = await uniqueLogin(pool, 'director')
      ;({ rows } = await pool.query("INSERT INTO employees (name, roles, login) VALUES ('Директор', ARRAY['Директор'], $1) RETURNING id, name, login", [login]))
    }
  }
  const credentials = await issueCredentials(pool, rows[0])
  const line = '='.repeat(64)
  console.log(`\n${line}\n  Учётная запись директора для входа на сайт:\n    логин:  ${credentials.login}\n    пароль: ${credentials.password}\n  Войдите и смените пароль в «Личном кабинете».\n  Потеряли пароль? npm run reset-password -- ${credentials.login}\n${line}\n`)
}

/** Справочник «Клей по декорам». При первом создании таблицы — заполняем стартовыми позициями. */
async function initializeDecorGlues() {
  const { rows: existed } = await pool.query("SELECT to_regclass('public.decor_glues') AS t")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS decor_glues (
      id BIGSERIAL PRIMARY KEY,
      material TEXT NOT NULL,
      brand TEXT NOT NULL,
      decor TEXT NOT NULL,
      main_glue TEXT NOT NULL,
      alt_glue TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT ''
    );
    ALTER TABLE decor_glues DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS updated_at;
    CREATE UNIQUE INDEX IF NOT EXISTS decor_glues_unique ON decor_glues (lower(material), lower(brand), lower(decor));
  `)
  if (existed[0].t) return
  for (const item of DECOR_GLUE_SEEDS) {
    await pool.query('INSERT INTO decor_glues (material, brand, decor, main_glue, alt_glue) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [item.material, item.brand, item.decor, item.mainGlue, item.altGlue])
  }
  // Клеи из стартовых позиций добавляем в справочник клеев, чтобы их можно было выбрать в процессе.
  const glues = [...new Set(DECOR_GLUE_SEEDS.flatMap((item) => [item.mainGlue, item.altGlue]).filter(Boolean))]
  await pool.query(
    `INSERT INTO catalog_items (kind, name)
     SELECT 'glue', g FROM UNNEST($1::text[]) AS g
     WHERE NOT EXISTS (SELECT 1 FROM catalog_items c WHERE c.kind = 'glue' AND lower(c.name) = lower(g))`,
    [glues],
  )
  console.log(`Справочник «Клей по декорам» заполнен стартовыми позициями: ${DECOR_GLUE_SEEDS.length}.`)
}

/** Создать (id = null) или обновить компанию вместе со списком мебельщиков. */
async function saveCompany(db, id, value) {
  const { rows } = id
    ? await db.query('UPDATE furniture_companies SET name = $2 WHERE id = $1 RETURNING id', [id, value.name])
    : await db.query('INSERT INTO furniture_companies (name) VALUES ($1) RETURNING id', [value.name])
  if (!rows.length) return null
  const companyId = rows[0].id
  await db.query('DELETE FROM furniture_makers WHERE company_id = $1', [companyId])
  for (const [position, maker] of value.makers.entries()) {
    await db.query('INSERT INTO furniture_makers (company_id, name, phone, position) VALUES ($1, $2, $3, $4)', [companyId, maker.name, maker.phone, position])
  }
  return companyId
}

async function loadCompanies(db, id = null) {
  const { rows } = await db.query(
    `SELECT c.id, c.name,
            COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name, 'phone', m.phone) ORDER BY m.position, m.id) FILTER (WHERE m.id IS NOT NULL), '[]') AS makers
     FROM furniture_companies c LEFT JOIN furniture_makers m ON m.company_id = c.id
     ${id ? 'WHERE c.id = $1' : ''} GROUP BY c.id`,
    id ? [id] : [],
  )
  return sortCompanies(rows.map((row) => ({ id: row.id, name: row.name, makers: row.makers })))
}

async function initializeDatabase() {
  await pool.query(SCHEMA)
  await pool.query(OBSOLETE)
  await pool.query(MIGRATE_ITEMS)
  await pool.query(MIGRATE_COMPLETED_AT)
  await pool.query('UPDATE processes SET data = data - $1::text[] WHERE data ?| $1::text[]', [LEGACY_PROCESS_FIELDS])
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()')
  for (const kind of catalogKinds) {
    const { rows } = await pool.query('SELECT 1 FROM catalog_items WHERE kind = $1 LIMIT 1', [kind])
    if (!rows.length) await pool.query('INSERT INTO catalog_items (kind, name) SELECT $1, UNNEST($2::text[]) ON CONFLICT DO NOTHING', [kind, catalogSeeds[kind]])
  }
  await initializeDecorGlues()
  await ensureDirector()
  await mkdir(uploadsPath, { recursive: true })
  databaseReady = true
  startupError = null
  console.log(`Connected to PostgreSQL database "${process.env.PGDATABASE || 'aquastone'}"`)
}

// ---------- Проверки доступа ----------
const requireDatabase = (_req, res, next) => {
  if (!databaseReady) return res.status(503).json({ error: 'PostgreSQL is unavailable. Check the local server and .env settings.' })
  next()
}

/** Кто вошёл: по cookie сессии находим активного сотрудника. */
/** Сотрудник по cookie сессии или null (нет cookie, сессия закончилась). */
async function sessionUser(req) {
  const token = readCookie(req.headers?.cookie, SESSION_COOKIE)
  if (!token) return null
  const { rows } = await pool.query(
    `SELECT s.token_hash, s.last_seen_at, e.id, e.name, e.roles, e.login
     FROM sessions s JOIN employees e ON e.id = s.employee_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND e.active = TRUE`,
    [tokenHash(token)],
  )
  if (!rows.length) return null
  const row = rows[0]
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60 * 1000) {
    pool.query('UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1', [row.token_hash]).catch(() => {})
  }
  return { id: row.id, name: row.name, roles: sortRoles(row.roles), login: row.login, sessionHash: row.token_hash }
}

/** Кто вошёл: по cookie сессии находим активного сотрудника. */
async function requireAuth(req, res, next) {
  try {
    const user = await sessionUser(req)
    if (!user) return res.status(401).json({ error: readCookie(req.headers?.cookie, SESSION_COOKIE) ? 'Сессия закончилась — войдите снова.' : 'Войдите на сайт.' })
    const { sessionHash, ...rest } = user
    req.user = rest
    req.sessionHash = sessionHash
    next()
  } catch (error) { next(error) }
}
/** Доступ только для указанных ролей (директор проходит везде, где нужен менеджер). */
const requireRole = (...roles) => (req, res, next) => {
  if (roles.some((role) => hasRight(req.user, role))) return next()
  res.status(403).json({ error: `Это действие доступно только: ${roles.join(', ').toLowerCase()}.` })
}
const authed = [requireDatabase, requireAuth]

function setSessionCookie(res, token, maxAgeSeconds) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secureCookie ? '; Secure' : ''}`)
}
const meOf = (user) => ({ id: user.id, name: user.name, roles: user.roles, login: user.login })

// Защита от перебора паролей: не больше 8 неудачных попыток за 15 минут с одного адреса на один логин.
const loginAttempts = new Map()
const attemptKey = (req, login) => `${req.ip || req.socket?.remoteAddress || ''}|${login}`
const tooManyAttempts = (key) => (loginAttempts.get(key) || []).filter((t) => Date.now() - t < 15 * 60 * 1000).length >= 8
const noteFailure = (key) => loginAttempts.set(key, [...(loginAttempts.get(key) || []).filter((t) => Date.now() - t < 15 * 60 * 1000), Date.now()])

// ---------- История: что именно изменилось ----------
/** Значение поля для истории: короткий текст или undefined, если поле сложное (чертёж и т.п.). */
const describeValue = (value) => {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет'
  if (typeof value === 'number' || typeof value === 'string') return String(value).slice(0, 300)
  if (Array.isArray(value)) {
    if (!value.length) return null
    if (value.every((item) => item === null || typeof item !== 'object')) return value.join(', ').slice(0, 300)
    if (value.every((item) => item && typeof item === 'object' && 'phone' in item)) return value.map((c) => [c.label, c.phone].filter(Boolean).join(': ')).join('; ').slice(0, 300)
    // Изделия: «Столешница для кухни — Кварцевый агломерат, Avant 1111 (клей A-White); …»
    if (value.every((item) => item && typeof item === 'object' && 'product' in item)) return value.map(itemLine).join('; ').slice(0, 300)
  }
  return undefined
}
function describeChanges(previous, data, fields) {
  const changes = {}
  for (const key of fields) {
    const from = describeValue(previous[key])
    const to = describeValue(data[key])
    changes[key] = from === undefined || to === undefined ? { complex: true } : { from, to }
  }
  return changes
}
const writeHistory = (db, processNumber, action, user, details, version = null) => db.query(
  'INSERT INTO process_history (process_number, action, actor, actor_id, details, version) VALUES ($1, $2, $3, $4, $5::jsonb, $6)',
  [processNumber, action, user.name, user.id, JSON.stringify({ ...details, actorRole: rolesLabel(user.roles) }), version],
)
const processRow = (row) => ({ ...row.data, id: row.process_number, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at })
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

app.get('/api/health', (_req, res) => {
  res.status(databaseReady ? 200 : 503).json({ database: databaseReady ? 'connected' : 'disconnected', error: startupError })
})

// ---------- Вход и личный кабинет ----------
app.post('/api/auth/login', requireDatabase, async (req, res, next) => {
  const login = normalizeLogin(req.body?.login)
  const password = String(req.body?.password || '')
  const key = attemptKey(req, login)
  if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль.' })
  if (tooManyAttempts(key)) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' })
  try {
    const { rows } = await pool.query('SELECT id, name, roles, login, password_hash FROM employees WHERE lower(login) = $1 AND active = TRUE', [login])
    if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
      noteFailure(key)
      return res.status(401).json({ error: 'Неверный логин или пароль.' })
    }
    loginAttempts.delete(key)
    await pool.query('UPDATE employees SET last_login_at = NOW() WHERE id = $1', [rows[0].id])
    const token = newSessionToken()
    await pool.query(`INSERT INTO sessions (token_hash, employee_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DAYS} days')`, [tokenHash(token), rows[0].id])
    setSessionCookie(res, token, SESSION_DAYS * 86400)
    res.json(meOf({ ...rows[0], roles: sortRoles(rows[0].roles) }))
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', requireDatabase, async (req, res, next) => {
  try {
    const token = readCookie(req.headers?.cookie, SESSION_COOKIE)
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
    setSessionCookie(res, '', 0)
    res.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/auth/me', ...authed, (req, res) => res.json(meOf(req.user)))

app.put('/api/auth/password', ...authed, async (req, res, next) => {
  const current = String(req.body?.currentPassword || '')
  const next_ = String(req.body?.newPassword || '')
  if (next_.length < PASSWORD_MIN) return res.status(400).json({ error: `Новый пароль — не короче ${PASSWORD_MIN} символов.` })
  try {
    const { rows } = await pool.query('SELECT password_hash FROM employees WHERE id = $1', [req.user.id])
    if (!(await verifyPassword(current, rows[0]?.password_hash))) return res.status(400).json({ error: 'Текущий пароль указан неверно.' })
    await pool.query('UPDATE employees SET password_hash = $2, password_changed_at = NOW() WHERE id = $1', [req.user.id, await hashPassword(next_)])
    // Остальные устройства выходят из системы, текущее остаётся.
    await pool.query('DELETE FROM sessions WHERE employee_id = $1 AND token_hash <> $2', [req.user.id, req.sessionHash])
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.put('/api/auth/login', ...authed, async (req, res, next) => {
  const login = normalizeLogin(req.body?.login)
  const current = String(req.body?.currentPassword || '')
  if (!LOGIN_PATTERN.test(login)) return res.status(400).json({ error: 'Логин: от 3 до 32 символов — латинские буквы, цифры, точка, дефис или подчёркивание.' })
  try {
    const { rows } = await pool.query('SELECT password_hash FROM employees WHERE id = $1', [req.user.id])
    if (!(await verifyPassword(current, rows[0]?.password_hash))) return res.status(400).json({ error: 'Текущий пароль указан неверно.' })
    const { rows: clash } = await pool.query('SELECT 1 FROM employees WHERE lower(login) = $1 AND id <> $2', [login, req.user.id])
    if (clash.length) return res.status(409).json({ error: 'Такой логин уже занят.' })
    await pool.query('UPDATE employees SET login = $2 WHERE id = $1', [req.user.id, login])
    res.json(meOf({ ...req.user, login }))
  } catch (error) { next(error) }
})

// ---------- Сотрудники ----------
app.get('/api/employees', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT e.id, e.name, e.roles, e.active, e.login, e.password_hash, e.password_changed_at, GREATEST(s.last_seen_at, e.last_login_at) AS last_seen_at
      FROM employees e LEFT JOIN (SELECT employee_id, max(last_seen_at) AS last_seen_at FROM sessions GROUP BY employee_id) s ON s.employee_id = e.id
      WHERE e.active = TRUE ORDER BY e.name`)
    const full = hasRight(req.user, 'Директор')
    res.json(rows.map((row) => employeeRow(row, { full })))
  } catch (error) { next(error) }
})

/** Регистрация сотрудника: директор получает логин и пароль, чтобы передать их человеку. */
app.post('/api/employees', ...authed, requireRole('Директор'), async (req, res, next) => {
  const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const roles = parseRoles(req.body?.roles ?? req.body?.role)
  if (!name) return res.status(400).json({ error: 'Укажите имя сотрудника.' })
  if (!roles.length) return res.status(400).json({ error: 'Отметьте хотя бы одну роль.' })
  const client = await pool.connect()
  try {
    const { rows: existing } = await client.query('SELECT id, active FROM employees WHERE lower(name) = lower($1)', [name])
    if (existing.length && existing[0].active) return res.status(409).json({ error: 'Сотрудник с таким именем уже есть — добавьте ему роль на его странице.' })
    await client.query('BEGIN')
    const { rows } = existing.length
      ? await client.query('UPDATE employees SET active = TRUE, roles = $2, name = $3 WHERE id = $1 RETURNING *', [existing[0].id, roles, name])
      : await client.query('INSERT INTO employees (name, roles) VALUES ($1, $2) RETURNING *', [name, roles])
    const credentials = await issueCredentials(client, rows[0])
    await client.query('COMMIT')
    res.status(201).json({ employee: employeeRow({ ...rows[0], login: credentials.login, password_hash: 'set', password_changed_at: new Date() }, { full: true }), credentials })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

app.put('/api/employees/:id', ...authed, requireRole('Директор'), async (req, res, next) => {
  const client = await pool.connect()
  try {
    const { rows: found } = await client.query('SELECT * FROM employees WHERE id = $1 AND active = TRUE', [req.params.id])
    if (!found.length) return res.status(404).json({ error: 'Сотрудник не найден.' })
    const current = found[0]
    const name = req.body?.name === undefined ? current.name : String(req.body.name).replace(/\s+/g, ' ').trim().slice(0, 120)
    const roles = req.body?.roles === undefined ? sortRoles(current.roles) : parseRoles(req.body.roles)
    if (!name) return res.status(400).json({ error: 'Укажите имя сотрудника.' })
    if (!roles.length) return res.status(400).json({ error: 'У сотрудника должна остаться хотя бы одна роль.' })
    if (current.roles.includes('Директор') && !roles.includes('Директор')) {
      const { rows: others } = await client.query("SELECT 1 FROM employees WHERE active AND 'Директор' = ANY(roles) AND id <> $1 LIMIT 1", [current.id])
      if (!others.length) return res.status(409).json({ error: 'Нельзя снять роль «Директор» с единственного директора.' })
    }
    if (name.toLowerCase() !== current.name.toLowerCase()) {
      const { rows: clash } = await client.query('SELECT 1 FROM employees WHERE lower(name) = lower($1) AND id <> $2', [name, current.id])
      if (clash.length) return res.status(409).json({ error: 'Сотрудник с таким именем уже есть.' })
    }
    await client.query('BEGIN')
    const { rows } = await client.query('UPDATE employees SET name = $2, roles = $3 WHERE id = $1 RETURNING *', [current.id, name, roles])
    // Назначения в процессах хранятся по имени — при переименовании переносим их на новое имя.
    if (name !== current.name) {
      for (const field of Object.keys(assignmentFields)) {
        if (LIST_FIELDS.includes(field)) {
          await client.query(`UPDATE processes SET data = jsonb_set(data, '{${field}}', (SELECT jsonb_agg(CASE WHEN x = $1 THEN $2 ELSE x END) FROM jsonb_array_elements_text(data->'${field}') x))
                              WHERE jsonb_typeof(data->'${field}') = 'array' AND data->'${field}' ? $1`, [current.name, name])
        } else {
          await client.query(`UPDATE processes SET data = jsonb_set(data, '{${field}}', to_jsonb($2::text)) WHERE data->>'${field}' = $1`, [current.name, name])
        }
      }
    }
    await client.query('COMMIT')
    res.json(employeeRow(rows[0], { full: true }))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

/** Новый пароль (и логин, если его ещё не было). Все сессии сотрудника закрываются. */
app.post('/api/employees/:id/credentials', ...authed, requireRole('Директор'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM employees WHERE id = $1 AND active = TRUE', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Сотрудник не найден.' })
    const credentials = await issueCredentials(pool, rows[0])
    res.json({ credentials })
  } catch (error) { next(error) }
})

app.delete('/api/employees/:id', ...authed, requireRole('Директор'), async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) return res.status(409).json({ error: 'Нельзя удалить самого себя.' })
    const { rows: found } = await pool.query('SELECT roles FROM employees WHERE id = $1 AND active = TRUE', [req.params.id])
    if (!found.length) return res.status(404).json({ error: 'Сотрудник не найден.' })
    await pool.query('UPDATE employees SET active = FALSE WHERE id = $1', [req.params.id])
    await pool.query('DELETE FROM sessions WHERE employee_id = $1', [req.params.id])
    res.status(204).end()
  } catch (error) { next(error) }
})

/** Активность сотрудника: все его изменения процессов. Старые записи без ссылки находим по имени. */
app.get('/api/employees/:id/activity', ...authed, requireRole('Директор', 'Менеджер'), async (req, res, next) => {
  try {
    const { rows: found } = await pool.query('SELECT id, name FROM employees WHERE id = $1', [req.params.id])
    if (!found.length) return res.status(404).json({ error: 'Сотрудник не найден.' })
    const limit = Math.min(Math.max(Number(req.query?.limit) || 300, 1), 1000)
    const { rows } = await pool.query(
      `SELECT h.id, h.process_number, h.action, h.details, h.created_at, p.data->>'client' AS client, p.data->>'stage' AS stage
       FROM process_history h LEFT JOIN processes p ON p.process_number = h.process_number
       WHERE h.actor_id = $1 OR (h.actor_id IS NULL AND h.actor = $2)
       ORDER BY h.created_at DESC, h.id DESC LIMIT $3`,
      [found[0].id, found[0].name, limit],
    )
    res.json(rows.map((row) => ({ id: row.id, processNumber: row.process_number, client: row.client, stage: row.stage, action: row.action, details: row.details, createdAt: row.created_at })))
  } catch (error) { next(error) }
})

// ---------- Справочники ----------
app.get('/api/catalogs', ...authed, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, kind, name FROM catalog_items WHERE active = TRUE ORDER BY name')
    res.json(Object.fromEntries(catalogKinds.map((kind) => [kind, rows.filter((row) => row.kind === kind).map(({ id, name }) => ({ id, name }))])))
  } catch (error) { next(error) }
})

app.post('/api/catalogs/:kind', ...authed, async (req, res, next) => {
  const kind = req.params.kind
  const name = String(req.body?.name || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!catalogKinds.includes(kind)) return res.status(404).json({ error: 'Такого справочника нет.' })
  if (!name) return res.status(400).json({ error: 'Укажите название.' })
  try {
    // Без учёта регистра: «a-white» и «A-White» — одна позиция.
    const { rows: existing } = await pool.query('SELECT id FROM catalog_items WHERE kind = $1 AND lower(name) = lower($2) LIMIT 1', [kind, name])
    const { rows } = existing.length
      ? await pool.query('UPDATE catalog_items SET active = TRUE WHERE id = $1 RETURNING id, name', [existing[0].id])
      : await pool.query('INSERT INTO catalog_items (kind, name) VALUES ($1, $2) RETURNING id, name', [kind, name])
    res.status(201).json(rows[0])
  } catch (error) { next(error) }
})

app.delete('/api/catalogs/:kind/:id', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('UPDATE catalog_items SET active = FALSE WHERE kind = $1 AND id = $2 RETURNING id', [req.params.kind, req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Позиция не найдена.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

// ---------- Уведомления ----------
const NOTIFY_DAYS = 14
/** SQL-условие «процесс назначен на сотрудника» по любому полю команды. Имя — параметр $n. */
const assignedSql = (alias, param) => '(' + Object.keys(assignmentFields).map((field) => (LIST_FIELDS.includes(field)
  ? `(jsonb_typeof(${alias}.data->'${field}') = 'array' AND ${alias}.data->'${field}' ? ${param})`
  : `${alias}.data->>'${field}' = ${param}`)).join(' OR ') + ')'

/**
 * Лента сотрудника: изменения и комментарии коллег по его процессам за 2 недели
 * (директору — ещё создание процессов и смена этапов по всем), плюс напоминания на сегодня.
 */
app.get('/api/notifications', ...authed, async (req, res, next) => {
  try {
    const user = req.user
    const director = user.roles.includes('Директор')
    const { rows: me } = await pool.query('SELECT notifications_read_at FROM employees WHERE id = $1', [user.id])
    const readAt = me[0]?.notifications_read_at || null
    const scope = `(${assignedSql('p', '$2')}${director ? " OR h.action = 'created' OR h.details->'changedFields' ? 'stage'" : ''})`
    const { rows: events } = await pool.query(
      `SELECT h.id, h.process_number, h.action, h.actor, h.details, h.created_at, p.data->>'client' AS client
       FROM process_history h JOIN processes p ON p.process_number = h.process_number
       WHERE h.created_at > NOW() - INTERVAL '${NOTIFY_DAYS} days'
         AND h.actor_id IS DISTINCT FROM $1 AND NOT (h.actor_id IS NULL AND h.actor = $2)
         AND ${scope}
       ORDER BY h.created_at DESC LIMIT 60`,
      [user.id, user.name],
    )
    const { rows: comments } = await pool.query(
      `SELECT c.id, c.process_number, c.author, c.body, c.created_at, p.data->>'client' AS client
       FROM process_comments c JOIN processes p ON p.process_number = c.process_number
       WHERE c.created_at > NOW() - INTERVAL '${NOTIFY_DAYS} days' AND c.author_id IS DISTINCT FROM $1 AND ${assignedSql('p', '$2')}
       ORDER BY c.created_at DESC LIMIT 40`,
      [user.id, user.name],
    )
    // Менеджеру и директору — новые заявки из конструктора (кроме своих).
    const { rows: newRequests } = hasRight(user, 'Менеджер')
      ? await pool.query(`SELECT id, source, client_name, author, estimate, created_at FROM requests
          WHERE created_at > NOW() - INTERVAL '${NOTIFY_DAYS} days' AND author_id IS DISTINCT FROM $1 ORDER BY created_at DESC LIMIT 30`, [user.id])
      : { rows: [] }
    const items = [
      ...newRequests.map((row) => ({ kind: 'request', id: `r${row.id}`, requestId: row.id, client: row.client_name, actor: row.source === 'manager' ? row.author : 'Клиент', estimate: row.estimate, createdAt: row.created_at })),
      ...events.map((row) => ({ kind: 'event', id: `e${row.id}`, processNumber: row.process_number, client: row.client, actor: row.actor, action: row.action, details: row.details, createdAt: row.created_at })),
      ...comments.map((row) => ({ kind: 'comment', id: `c${row.id}`, processNumber: row.process_number, client: row.client, actor: row.author, body: row.body.slice(0, 200), createdAt: row.created_at })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 60)

    // Напоминания: монтаж сегодня и завтра, просроченный срок производства — по процессам сотрудника.
    const { rows: mine } = await pool.query(`SELECT p.process_number, p.data FROM processes p WHERE ${assignedSql('p', '$1')} AND COALESCE(p.data->>'stage', '') <> 'Завершён'`, [user.name])
    const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('sv-SE') }
    const today = day(0), tomorrow = day(1)
    const reminders = []
    for (const { process_number: id, data } of mine) {
      const dates = [...(Array.isArray(data.installationDates) ? data.installationDates : []), data.installationDate].filter(Boolean).map((d) => String(d).slice(0, 10))
      if (dates.includes(today)) reminders.push({ kind: 'install_today', processNumber: id, client: data.client || '', date: today })
      else if (dates.includes(tomorrow)) reminders.push({ kind: 'install_tomorrow', processNumber: id, client: data.client || '', date: tomorrow })
      if (data.productionDate && String(data.productionDate).slice(0, 10) < today && PRODUCTION_STAGES.includes(data.stage)) {
        reminders.push({ kind: 'overdue', processNumber: id, client: data.client || '', date: String(data.productionDate).slice(0, 10), stage: data.stage })
      }
    }
    // Очередь: процессы, которые сотрудник может взять в работу, и готовые к закрытию у менеджера.
    const { rows: open } = await pool.query("SELECT process_number, data FROM processes WHERE COALESCE(data->>'stage', '') NOT IN ('Новый заказ', 'Завершён')")
    for (const { process_number: id, data } of open) {
      const status = statusOf(data)
      const take = TAKE_STEPS.find((step) => step.from[0] === data.stage && step.from[1] === status)
      if (take && user.roles.includes(STAGE_OWNERS[take.to].role)) reminders.push({ kind: 'queue', processNumber: id, client: data.client || '', stage: data.stage, status, next: take.to })
      if (data.stage === 'Монтаж' && status === READY && (data.manager === user.name || (director && !data.manager))) reminders.push({ kind: 'to_close', processNumber: id, client: data.client || '' })
    }
    const order = { install_today: 0, overdue: 1, to_close: 2, queue: 3, install_tomorrow: 4 }
    reminders.sort((a, b) => order[a.kind] - order[b.kind] || String(a.date || a.processNumber).localeCompare(String(b.date || b.processNumber)))
    const unread = items.filter((item) => !readAt || new Date(item.createdAt) > new Date(readAt)).length
    res.json({ readAt, unread, items, reminders })
  } catch (error) { next(error) }
})

app.post('/api/notifications/read', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query('UPDATE employees SET notifications_read_at = NOW() WHERE id = $1 RETURNING notifications_read_at', [req.user.id])
    res.json({ readAt: rows[0].notifications_read_at })
  } catch (error) { next(error) }
})

// ---------- Мебельщики ----------
app.get('/api/furniture', ...authed, async (_req, res, next) => {
  try { res.json(await loadCompanies(pool)) } catch (error) { next(error) }
})

const saveCompanyRoute = (mode) => async (req, res, next) => {
  const { value, error: invalid } = normalizeCompany(req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const id = await saveCompany(client, mode === 'update' ? req.params.id : null, value)
    if (!id) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Компания не найдена — возможно, её уже удалили.' }) }
    await client.query('COMMIT')
    res.status(mode === 'update' ? 200 : 201).json((await loadCompanies(pool, id))[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    if (error.code === '23505') return res.status(409).json({ error: `Компания «${value.name}» уже есть в справочнике.` })
    next(error)
  } finally { client.release() }
}
app.post('/api/furniture', ...authed, requireRole('Менеджер'), saveCompanyRoute('create'))
app.put('/api/furniture/:id', ...authed, requireRole('Менеджер'), saveCompanyRoute('update'))
app.delete('/api/furniture/:id', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM furniture_companies WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'Компания не найдена.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

// ---------- Заявки из конструктора ----------
const requestRow = (row) => ({
  id: Number(row.id), source: row.source, clientName: row.client_name, clientPhone: row.client_phone, author: row.author,
  status: row.status, note: row.note, processNumber: row.process_number, project: row.project, estimate: row.estimate,
  createdAt: row.created_at, updatedAt: row.updated_at,
})
// Защита от спама: с одного адреса — не больше 5 клиентских заявок за 10 минут.
const requestAttempts = new Map()
// Конструктор ходит через свой прокси (Vite или nginx на этой же машине) — тогда настоящий адрес в X-Forwarded-For.
const clientIp = (req) => {
  const remote = req.socket?.remoteAddress || ''
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return forwarded && /^(::1|127\.|::ffff:127\.)/.test(remote) ? forwarded : remote
}
const tooManyRequests = (ip) => {
  const recent = (requestAttempts.get(ip) || []).filter((t) => Date.now() - t < 10 * 60 * 1000)
  requestAttempts.set(ip, recent)
  return recent.length >= 5
}

/**
 * Заявка из конструктора. Менеджер или директор, вошедший на сайт, отправляет без контакта;
 * клиент — с ФИО и телефоном. Поле website — ловушка для ботов: люди его не видят и не заполняют.
 */
app.post('/api/requests', requireDatabase, async (req, res, next) => {
  try {
    const user = await sessionUser(req)
    const staff = user && hasRight(user, 'Менеджер') ? user : null
    const { value: project, error: projectError } = normalizeProject(req.body?.project)
    if (projectError) return res.status(400).json({ error: projectError })
    let contact = { name: '', phone: '' }
    if (!staff) {
      if (req.body?.website) return res.status(201).json({ id: 0 })
      const ip = clientIp(req)
      if (tooManyRequests(ip)) return res.status(429).json({ error: 'Слишком много заявок подряд. Попробуйте через 10 минут или позвоните нам.' })
      const checked = normalizeContact(req.body?.contact)
      if (checked.error) return res.status(400).json({ error: checked.error })
      contact = checked.value
      requestAttempts.get(ip).push(Date.now())
    }
    const { rows } = await pool.query(
      `INSERT INTO requests (source, client_name, client_phone, author_id, author, project, estimate)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
      [staff ? 'manager' : 'client', contact.name, contact.phone, staff?.id ?? null, staff?.name ?? '', JSON.stringify(project), project.estimate],
    )
    res.status(201).json(requestRow(rows[0]))
  } catch (error) { next(error) }
})

app.get('/api/requests', ...authed, requireRole('Менеджер'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM requests ORDER BY created_at DESC LIMIT 500')
    res.json(rows.map(requestRow))
  } catch (error) { next(error) }
})

/** Статус, комментарий или связь с созданным процессом (тогда в процесс добавляется комментарий с расчётом). */
app.patch('/api/requests/:id', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  try {
    const { rows: found } = await pool.query('SELECT * FROM requests WHERE id = $1', [req.params.id])
    if (!found.length) return res.status(404).json({ error: 'Заявка не найдена.' })
    const current = found[0]
    const status = req.body?.status === undefined ? current.status : String(req.body.status)
    if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ error: 'Неизвестный статус заявки.' })
    const note = req.body?.note === undefined ? current.note : String(req.body.note).trim().slice(0, 2000)
    let processNumber = current.process_number
    if (req.body?.processNumber !== undefined) {
      processNumber = String(req.body.processNumber || '').trim() || null
      if (processNumber) {
        const { rows: process } = await pool.query('SELECT 1 FROM processes WHERE process_number = $1', [processNumber])
        if (!process.length) return res.status(404).json({ error: `Процесс #${processNumber} не найден.` })
      }
    }
    const { rows } = await pool.query(
      'UPDATE requests SET status = $2, note = $3, process_number = $4, updated_at = NOW() WHERE id = $1 RETURNING *',
      [current.id, processNumber ? 'Создан процесс' : status, note, processNumber],
    )
    if (processNumber && processNumber !== current.process_number) {
      await pool.query('INSERT INTO process_comments (process_number, author_id, author, body) VALUES ($1, $2, $3, $4)', [processNumber, req.user.id, req.user.name, requestSummary(requestRow(current))])
    }
    res.json(requestRow(rows[0]))
  } catch (error) { next(error) }
})

// ---------- Клей по декорам ----------
const decorGlueRow = (row) => ({ id: row.id, material: row.material, brand: row.brand, decor: row.decor, mainGlue: row.main_glue, altGlue: row.alt_glue, note: row.note })
const decorGlueClash = (error) => error.code === '23505'

app.get('/api/decor-glues', ...authed, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM decor_glues')
    res.json(sortDecorGlues(rows.map(decorGlueRow)))
  } catch (error) { next(error) }
})

app.post('/api/decor-glues', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  const { value, error: invalid } = normalizeDecorGlue(req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  try {
    const { rows } = await pool.query(
      'INSERT INTO decor_glues (material, brand, decor, main_glue, alt_glue, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [value.material, value.brand, value.decor, value.mainGlue, value.altGlue, value.note],
    )
    res.status(201).json(decorGlueRow(rows[0]))
  } catch (error) {
    if (decorGlueClash(error)) return res.status(409).json({ error: `Декор «${value.decor}» (${value.material} ${value.brand}) уже есть в списке.` })
    next(error)
  }
})

app.put('/api/decor-glues/:id', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  const { value, error: invalid } = normalizeDecorGlue(req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  try {
    const { rows } = await pool.query(
      'UPDATE decor_glues SET material = $2, brand = $3, decor = $4, main_glue = $5, alt_glue = $6, note = $7 WHERE id = $1 RETURNING *',
      [req.params.id, value.material, value.brand, value.decor, value.mainGlue, value.altGlue, value.note],
    )
    if (!rows.length) return res.status(404).json({ error: 'Позиция не найдена — возможно, её уже удалили.' })
    res.json(decorGlueRow(rows[0]))
  } catch (error) {
    if (decorGlueClash(error)) return res.status(409).json({ error: `Декор «${value.decor}» (${value.material} ${value.brand}) уже есть в списке.` })
    next(error)
  }
})

app.delete('/api/decor-glues/:id', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM decor_glues WHERE id = $1', [req.params.id])
    if (!rowCount) return res.status(404).json({ error: 'Позиция не найдена.' })
    res.status(204).end()
  } catch (error) { next(error) }
})

// ---------- Процессы ----------
app.get('/api/processes', ...authed, async (_req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT process_number, data, version, created_at, updated_at FROM processes ORDER BY updated_at DESC')
    res.json(rows.map(processRow))
  } catch (error) { next(error) }
})

app.post('/api/processes', ...authed, requireRole('Менеджер'), async (req, res, next) => {
  const id = String(req.body?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'Укажите номер процесса.' })
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'A process object is required.' })
  try {
    const data = stripRemovedFields({ ...req.body, id, stage: 'Новый заказ', stageStatus: null })
    data.items = cleanItems(req.body.items)
    delete data.completedAt // ставит только сервер — при переходе в «Завершён»
    if (!data.manager) return res.status(400).json({ error: 'Назначьте ответственного менеджера.' })
    const { rows: managers } = await pool.query(
      'SELECT 1 FROM employees WHERE name = $1 AND $2 = ANY(roles) AND active = TRUE',
      [data.manager, 'Менеджер'],
    )
    if (!managers.length) return res.status(400).json({ error: 'Назначьте менеджера из справочника сотрудников.' })
    const { rows } = await pool.query(
      'INSERT INTO processes (process_number, data) VALUES ($1, $2::jsonb) RETURNING process_number, data, version, created_at, updated_at',
      [id, JSON.stringify(data)],
    )
    await writeHistory(pool, id, 'created', req.user, { processNumber: id }, rows[0].version)
    res.status(201).json(processRow(rows[0]))
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: `Процесс #${id} уже существует.` })
    next(error)
  }
})

// Старый способ сохранения (весь процесс целиком) затирал правки коллег. Открытые до обновления вкладки
// получают понятную ошибку и после перезагрузки сохраняют только изменённые поля.
app.put('/api/processes/:id', ...authed, (_req, res) => {
  res.status(409).json({ error: 'Сайт обновился — перезагрузите страницу (F5) и повторите изменение.' })
})

/**
 * Сохранение процесса: { changes: { поле: значение }, baseVersion }.
 * Меняются только присланные поля. Если после baseVersion кто-то уже изменил те же поля — 409 с актуальным процессом.
 */
app.patch('/api/processes/:id', ...authed, async (req, res, next) => {
  const id = String(req.params.id || '').trim()
  const incoming = req.body?.changes
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return res.status(400).json({ error: 'Нет изменений для сохранения.' })
  const baseVersion = Number(req.body?.baseVersion) || null
  const changes = stripRemovedFields({ ...incoming })
  delete changes.id
  if (typeof changes.furnitureMakerPhone === 'string') changes.furnitureMakerPhone = formatRussianPhone(changes.furnitureMakerPhone)
  if (changes.items !== undefined) changes.items = cleanItems(changes.items)
  delete changes.completedAt // ставит только сервер — при переходе в «Завершён»
  if (changes.installationDates !== undefined && changes.installationDates !== null) {
    // Даты монтажа: только ГГГГ-ММ-ДД, без повторов, по порядку.
    changes.installationDates = [...new Set((Array.isArray(changes.installationDates) ? changes.installationDates : []).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
  }
  const client = await pool.connect()
  const fail = async (status, body) => { await client.query('ROLLBACK').catch(() => {}); return res.status(status).json(body) }
  try {
    await client.query('BEGIN')
    const { rows: found } = await client.query('SELECT process_number, data, version, created_at, updated_at FROM processes WHERE process_number = $1 FOR UPDATE', [id])
    if (!found.length) return fail(404, { error: `Процесс #${id} не найден.` })
    const current = found[0]
    const previous = current.data
    const changedFields = Object.keys(changes).filter((key) => !sameValue(previous[key], changes[key]))
    if (!changedFields.length) { await client.query('COMMIT'); return res.json(processRow(current)) }

    // Кто-то сохранил процесс после того, как сотрудник его открыл: конфликт, только если правили те же поля.
    if (baseVersion && current.version > baseVersion) {
      const { rows: later } = await client.query(
        "SELECT actor, details->'changedFields' AS fields FROM process_history WHERE process_number = $1 AND action = 'updated' AND version > $2",
        [id, baseVersion],
      )
      const touched = new Map()
      for (const row of later) for (const key of row.fields || []) touched.set(key, row.actor)
      const conflicts = changedFields.filter((key) => touched.has(key))
      if (conflicts.length) {
        const who = [...new Set(conflicts.map((key) => touched.get(key)))].join(', ')
        return fail(409, {
          error: `Пока вы редактировали, ${who} изменил(а): ${conflicts.map(fieldName).join(', ')}. Проверьте актуальные данные и сохраните ещё раз.`,
          conflicts, process: processRow(current),
        })
      }
    }

    const data = { ...previous }
    for (const key of changedFields) {
      if (changes[key] === null || changes[key] === undefined) delete data[key]
      else data[key] = changes[key]
    }

    // Этап и статус: только разрешённые переходы; «Готов» на монтаже — с фотоотчётом.
    let allowedExtra = []
    const stageChanged = changedFields.includes('stage') || changedFields.includes('stageStatus')
    if (stageChanged) {
      if (!STATUS_STAGES.includes(data.stage)) data.stageStatus = null
      else if (data.stageStatus !== READY) data.stageStatus = 'Не готов'
      const { rows: photos } = await client.query('SELECT count(*)::int AS n FROM process_attachments WHERE process_number = $1 AND field_key = $2', [id, INSTALLATION_PHOTOS])
      const ctx = { photoCount: photos[0].n }
      const stageError = stageChangeError(req.user.roles, req.user.name, previous, data, ctx)
      if (stageError) return fail(stageError.startsWith('Чтобы') ? 400 : 403, { error: stageError })
      const action = availableActions(req.user.roles, req.user.name, previous, ctx).find((item) => item.to.stage === data.stage && (item.to.stageStatus ?? null) === (data.stageStatus ?? null))
      if (action?.assign) allowedExtra = [action.assign.field]
      // Замер готов, а дату замера не указали — ставим сегодняшнюю.
      if (previous.stage === 'Замер' && data.stageStatus === READY && data.stage === 'Замер' && !data.surveyDate) { data.surveyDate = new Date().toLocaleDateString('sv-SE'); changedFields.push('surveyDate') }
      data.stageChangedAt = new Date().toISOString()
      // Дата завершения — для статистики: ставим при переходе в «Завершён», убираем, если процесс вернули в работу.
      if (data.stage === 'Завершён' && previous.stage !== 'Завершён') data.completedAt = data.stageChangedAt
      else if (data.stage !== 'Завершён') delete data.completedAt
      for (const key of ['stageStatus', 'stageChangedAt', 'completedAt']) if (!changedFields.includes(key) && !sameValue(previous[key], data[key])) changedFields.push(key)
    }
    const forbidden = forbiddenFields(req.user.roles, changedFields, allowedExtra, { previous, next: data })
    if (forbidden.length) return fail(403, { error: `У вашей роли нет прав менять: ${forbidden.map(fieldName).join(', ')}.` })
    const todayKey = new Date().toLocaleDateString('sv-SE')
    if (changedFields.includes('surveyDate') && data.surveyDate && String(data.surveyDate).slice(0, 10) > todayKey) {
      return fail(400, { error: 'Дата замера не может быть в будущем — укажите день, когда замер провели.' })
    }
    for (const [field, expectedRole] of Object.entries(assignmentFields)) {
      if (!changedFields.includes(field) || !data[field]) continue
      if (LIST_FIELDS.includes(field)) data[field] = [...new Set((Array.isArray(data[field]) ? data[field] : [data[field]]).map(String).filter(Boolean))]
      for (const person of (Array.isArray(data[field]) ? data[field] : [data[field]])) {
        const { rows: matches } = await client.query('SELECT 1 FROM employees WHERE name = $1 AND $2 = ANY(roles) AND active = TRUE', [person, expectedRole])
        if (!matches.length) return fail(400, { error: `На роль «${expectedRole}» можно назначить только сотрудника, у которого эта роль отмечена в справочнике.` })
      }
    }

    const { rows } = await client.query(
      'UPDATE processes SET data = $2::jsonb, version = version + 1, updated_at = NOW() WHERE process_number = $1 RETURNING process_number, data, version, created_at, updated_at',
      [id, JSON.stringify(data)],
    )
    await writeHistory(client, id, 'updated', req.user, { changedFields, changes: describeChanges(previous, data, changedFields) }, rows[0].version)
    await client.query('COMMIT')
    res.json(processRow(rows[0]))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/processes/:id/history', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, action, actor, actor_id, details, created_at FROM process_history WHERE process_number = $1 ORDER BY created_at DESC, id DESC',
      [req.params.id],
    )
    res.json(rows.map((row) => ({ id: row.id, action: row.action, actor: row.actor, actorId: row.actor_id, details: row.details, createdAt: row.created_at })))
  } catch (error) { next(error) }
})

// ---------- Файлы процесса ----------
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

app.get('/api/processes/:id/attachments', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, field_key, original_name, mime_type, file_size, created_at FROM process_attachments WHERE process_number = $1 ORDER BY created_at',
      [req.params.id],
    )
    res.json(rows.map((row) => ({ ...row, url: `/api/processes/${encodeURIComponent(req.params.id)}/attachments/${row.id}` })))
  } catch (error) { next(error) }
})

app.post('/api/processes/:id/attachments', ...authed, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'Select a file to upload.' })
  try {
    const fieldKey = String(req.body.fieldKey || 'documents').slice(0, 80)
    if (!canEditAttachment(req.user.roles, fieldKey)) {
      await rm(req.file.path, { force: true })
      return res.status(403).json({ error: 'У вашей роли нет прав добавлять файлы на этот этап.' })
    }
    const requiredExtension = fieldExtensions[fieldKey]
    if (requiredExtension && !requiredExtension.includes(path.extname(req.file.originalname).toLowerCase())) {
      await rm(req.file.path, { force: true })
      return res.status(400).json({ error: `Для этого поля нужен файл ${requiredExtension.join(', ').toUpperCase()}.` })
    }
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
    await writeHistory(pool, req.params.id, 'file_added', req.user, { fieldKey, fileName: req.file.originalname })
    res.status(201).json({ ...rows[0], url: `/api/processes/${encodeURIComponent(req.params.id)}/attachments/${rows[0].id}` })
  } catch (error) {
    await rm(req.file.path, { force: true }).catch(() => {})
    next(error)
  }
})

app.get('/api/processes/:id/attachments/:attachmentId', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT original_name, storage_name, mime_type FROM process_attachments WHERE process_number = $1 AND id = $2',
      [req.params.id, req.params.attachmentId],
    )
    if (!rows.length) return res.status(404).json({ error: 'File was not found.' })
    res.type(rows[0].mime_type).download(path.join(uploadsPath, rows[0].storage_name), rows[0].original_name)
  } catch (error) { next(error) }
})

app.delete('/api/processes/:id/attachments/:attachmentId', ...authed, async (req, res, next) => {
  try {
    const { rows: found } = await pool.query('SELECT field_key FROM process_attachments WHERE process_number = $1 AND id = $2', [req.params.id, req.params.attachmentId])
    if (!found.length) return res.status(404).json({ error: 'Файл не найден.' })
    if (!canEditAttachment(req.user.roles, found[0].field_key)) return res.status(403).json({ error: 'У вашей роли нет прав удалять файлы этого этапа.' })
    if (found[0].field_key === INSTALLATION_PHOTOS) {
      // Монтаж уже отмечен «Готов» — последнее фото фотоотчёта удалить нельзя.
      const { rows: state } = await pool.query(
        `SELECT p.data->>'stage' AS stage, p.data->>'stageStatus' AS status, (SELECT count(*)::int FROM process_attachments a WHERE a.process_number = p.process_number AND a.field_key = $2) AS n
         FROM processes p WHERE p.process_number = $1`, [req.params.id, INSTALLATION_PHOTOS])
      if (state[0] && state[0].stage === 'Монтаж' && state[0].status === READY && state[0].n <= 1) return res.status(409).json({ error: 'Это последнее фото фотоотчёта, а монтаж уже отмечен «Готов». Сначала добавьте другое фото или верните статус «Не готов».' })
    }
    const { rows } = await pool.query(
      'DELETE FROM process_attachments WHERE process_number = $1 AND id = $2 RETURNING storage_name, original_name, field_key',
      [req.params.id, req.params.attachmentId],
    )
    if (!rows.length) return res.status(404).json({ error: 'Файл не найден.' })
    await rm(path.join(uploadsPath, rows[0].storage_name), { force: true })
    await writeHistory(pool, req.params.id, 'file_removed', req.user, { fieldKey: rows[0].field_key, fileName: rows[0].original_name })
    res.status(204).end()
  } catch (error) { next(error) }
})

// ---------- Комментарии к процессу ----------
const commentRow = (row) => ({ id: row.id, authorId: row.author_id, author: row.author, body: row.body, createdAt: row.created_at })

app.get('/api/processes/:id/comments', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, author_id, author, body, created_at FROM process_comments WHERE process_number = $1 ORDER BY created_at, id', [req.params.id])
    res.json(rows.map(commentRow))
  } catch (error) { next(error) }
})

app.post('/api/processes/:id/comments', ...authed, async (req, res, next) => {
  const body = String(req.body?.body || '').replace(/\r\n/g, '\n').trim()
  if (!body) return res.status(400).json({ error: 'Напишите текст комментария.' })
  if (body.length > 4000) return res.status(400).json({ error: 'Комментарий — не длиннее 4000 символов.' })
  try {
    const { rows } = await pool.query(
      `INSERT INTO process_comments (process_number, author_id, author, body)
       SELECT process_number, $2, $3, $4 FROM processes WHERE process_number = $1
       RETURNING id, author_id, author, body, created_at`,
      [req.params.id, req.user.id, req.user.name, body],
    )
    if (!rows.length) return res.status(404).json({ error: `Процесс #${req.params.id} не найден.` })
    res.status(201).json(commentRow(rows[0]))
  } catch (error) { next(error) }
})

/** Удалить комментарий может его автор или директор. */
app.delete('/api/processes/:id/comments/:commentId', ...authed, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT author_id FROM process_comments WHERE process_number = $1 AND id = $2', [req.params.id, req.params.commentId])
    if (!rows.length) return res.status(404).json({ error: 'Комментарий не найден.' })
    if (String(rows[0].author_id) !== String(req.user.id) && !req.user.roles.includes('Директор')) return res.status(403).json({ error: 'Удалить комментарий может только его автор или директор.' })
    await pool.query('DELETE FROM process_comments WHERE id = $1', [req.params.commentId])
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
