// Демо-данные: удаляет ВСЕ процессы и создаёт новые случайные — на всех этапах новой схемы.
//   npm run seed                 — спросит подтверждение, удалит все процессы и создаст 36 новых
//   npm run seed -- --yes        — без вопроса
//   npm run seed -- --count 50   — сколько процессов создать (от 1 до 300)
// Вместе с процессами удаляются их история, комментарии и файлы (папка uploads).
// Сотрудники и справочники не удаляются: если для какой-то роли нет сотрудника или справочник
// мебельщиков пуст — скрипт добавит демо-записи. Перед первым запуском хотя бы раз запустите сайт
// (npm run dev), чтобы сервер создал таблицы.
import pg from 'pg'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { INSTALLATION_PHOTOS, NOT_READY, READY, STAGE_OWNERS } from '../src/permissions.js'
import { formatRussianPhone } from '../src/phone.js'

const uploadsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'aquastone',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  connectionTimeoutMillis: 5000,
})

const argv = process.argv.slice(2)
const countArg = argv.indexOf('--count')
const COUNT = Math.min(Math.max(Number(countArg >= 0 ? argv[countArg + 1] : 36) || 36, 1), 300)
const YES = argv.includes('--yes') || argv.includes('-y')

// На рабочем сервере (NODE_ENV=production) демо-данные не создаём: скрипт стирает все процессы.
// Отключить защиту можно только явно: ALLOW_SEED=1 npm run seed (например, на тестовом сервере).
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
  console.error('Отказ: это рабочий сервер (NODE_ENV=production). Демо-данные удалили бы все процессы.')
  console.error('Если это тестовый сервер — запустите с ALLOW_SEED=1.')
  process.exit(1)
}

// ---------- Случайности ----------
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1))
const pick = (list) => list[Math.floor(Math.random() * list.length)]
const chance = (p) => Math.random() < p
const pickSome = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, Math.min(n, list.length))
const DAY = 86400000
const dayKey = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
const atHour = (d, hourMin = 9, hourMax = 18) => { const x = new Date(d); x.setHours(rand(hourMin, hourMax), rand(0, 59), 0, 0); return x }
const phone = () => formatRussianPhone('9' + String(rand(10, 99)) + String(rand(1000000, 9999999)))

// ---------- Справочные данные ----------
const FIRST = { m: ['Алексей', 'Дмитрий', 'Сергей', 'Андрей', 'Михаил', 'Игорь', 'Павел', 'Роман', 'Артур', 'Виталий', 'Константин', 'Григорий', 'Евгений', 'Николай'], f: ['Анна', 'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Юлия', 'Марина', 'Светлана', 'Людмила', 'Ирина', 'Екатерина', 'Дарья', 'Ксения'] }
const LAST = ['Смирнов', 'Волков', 'Кузнецов', 'Павлов', 'Морозов', 'Иванов', 'Белов', 'Зайцев', 'Ким', 'Никитин', 'Попов', 'Орлов', 'Галиев', 'Фёдоров', 'Андреев', 'Сергеев', 'Лавров', 'Яковлев', 'Соколов', 'Медведев', 'Егоров', 'Козлов', 'Степанов', 'Николаев']
const fullName = () => { const sex = chance(0.5) ? 'm' : 'f'; const last = pick(LAST); return `${pick(FIRST[sex])} ${sex === 'f' && /(ов|ев|ин)$/.test(last) ? last + 'а' : last}` }
const CITIES = [['Екатеринбург', 0.75], ['Берёзовский', 0.07], ['Верхняя Пышма', 0.07], ['Арамиль', 0.05], ['Среднеуральск', 0.06]]
const STREETS = ['Белинского', 'Ленина', 'Малышева', 'Академика Шварца', 'Сурикова', 'Таганская', 'Шейнкмана', 'Мира', 'Викулова', 'Радищева', 'Фрунзе', 'Гурзуфская', 'Луначарского', 'Крестинского', 'Чкалова', 'Сакко и Ванцетти', '8 Марта', 'Куйбышева', 'Репина', 'Восточная']
const city = () => { let r = Math.random(); for (const [name, p] of CITIES) { if ((r -= p) < 0) return name } return CITIES[0][0] }
const PRODUCTS = ['Столешница для кухни', 'Столешница для кухни', 'Столешница + остров', 'Столешница + фартук', 'Столешница для ванной', 'Подоконник']
const HPL_DECORS = ['Slate Grey', 'Black Core', 'Natural Oak', 'Concrete', 'White Stone']
const CONTACT_ROLES = ['Прораб', 'Дизайнер', 'Супруг(а)']
const NEEDS_DATA = ['Нет телефона клиента', 'Не согласован декор', 'Ждём размеры ниши под мойку', 'Клиент не выходит на связь', 'Нет модели смесителя']
const COMMENTS = ['Клиент просил позвонить за час до приезда', 'Подъезд с домофоном, код скажут по телефону', 'Проверить уровень тумб перед монтажом', 'Мойка у клиента, забрать при замере', 'Согласовали срок с мебельщиком', 'Нужен пропуск на парковку', 'Вырез под варочную по шаблону производителя', 'Фото объекта отправлю в мессенджер']

// Демо-сотрудники — добавляются, только если для роли нет ни одного активного сотрудника.
const DEMO_STAFF = {
  'Менеджер': ['Мария Ковалёва', 'Алексей Романов'],
  'Замерщик': ['Андрей Соколов', 'Виктор Лебедев'],
  'Технолог': ['Игорь Тихонов'],
  'ЧПУ': ['Пётр Чернов', 'Роман Гусев'],
  'Обработчик': ['Олег Захаров'],
  'Бригадир монтажников': ['Дмитрий Орлов'],
  'Монтажник': ['Сергей Мельников', 'Дмитрий Орлов', 'Илья Попов'],
}
const DEMO_FURNITURE = [
  { name: 'Кухни Урала', makers: [['Олег Сидоров'], ['Ринат Хасанов']] },
  { name: 'Мебель-Профи', makers: [['Николай Ершов']] },
  { name: 'ДомМебель', makers: [['Артём Власов'], ['Кирилл Шарипов']] },
  { name: 'Studio Kitchen', makers: [['Евгений Комаров']] },
]

// Этапы: [этап, статус, вес]. Вес — доля процессов на этом шаге.
const STEPS = [
  ['Новый заказ', null, 5], ['Замер', NOT_READY, 4], ['Замер', READY, 3],
  ['Проектирование', NOT_READY, 3], ['Проектирование', READY, 2],
  ['Фрезеровка/Распил', NOT_READY, 3], ['Фрезеровка/Распил', READY, 2],
  ['Шлифовка/Полировка/Монтаж мойки', NOT_READY, 3], ['Произведено', null, 3],
  ['Монтаж', NOT_READY, 4], ['Монтаж', READY, 2], ['Завершён', null, 8],
]
const ORDER = ['Новый заказ', 'Замер', 'Проектирование', 'Фрезеровка/Распил', 'Шлифовка/Полировка/Монтаж мойки', 'Произведено', 'Монтаж', 'Завершён']
const reached = (stage, target) => ORDER.indexOf(stage) >= ORDER.indexOf(target)
/** COUNT процессов, распределённых по шагам пропорционально весам (каждый шаг — хотя бы раз, если хватает). */
function distribute(count) {
  const total = STEPS.reduce((sum, [, , w]) => sum + w, 0)
  const list = STEPS.flatMap(([stage, status, w]) => Array(Math.floor((w / total) * count)).fill([stage, status]))
  while (list.length < count) list.push(pick(STEPS).slice(0, 2))
  return list.sort(() => Math.random() - 0.5)
}

// ---------- Чертёж замера (формат рисовальщика) ----------
let elementSeq = 0
const el = (data) => ({ id: 'seed' + (++elementSeq).toString(36), color: '#1f2a24', width: 4, ...data })
const round = (e) => Object.fromEntries(Object.entries(e).map(([key, v]) => [key, typeof v === 'number' ? Math.round(v * 10) / 10 : v]))
function makeSketch(length, depth, updatedAt) {
  const k = 0.2, L = length * k, D = depth * k
  const elements = [
    el({ type: 'rect', x: 0, y: 0, w: L, h: D, radius: 30, corners: { tl: false, tr: false, br: true, bl: false } }),
    el({ type: 'dim', x1: 0, y1: 0, x2: L, y2: 0, offset: -50, dash: true, labelSize: 26, label: String(length) }),
    el({ type: 'dim', x1: L, y1: 0, x2: L, y2: D, offset: -50, dash: true, labelSize: 26, label: String(depth) }),
    el({ type: 'rect', x: L * 0.3, y: D * 0.22, w: Math.min(160, L * 0.25), h: D * 0.56, radius: 14, corners: { tl: true, tr: true, br: true, bl: true } }),
    el({ type: 'dim', x1: 0, y1: D, x2: L * 0.3, y2: D, offset: 40, dash: true, labelSize: 20, label: String(Math.round(length * 0.3 / 10) * 10) }),
    el({ type: 'cross', cx: L * 0.3 + Math.min(160, L * 0.25) / 2, cy: D * 0.12, size: 20 }),
    el({ type: 'line', x1: 0, y1: D + 6, x2: L, y2: D + 6, color: '#c2412d', width: 4, dash: false, label: '' }),
    el({ type: 'text', x: 0, y: D + 60, text: 'Фаска спереди (красная)', size: 22, color: '#c2412d' }),
  ]
  return { version: 1, elements: elements.map(round), updatedAt: updatedAt.toISOString() }
}

// ---------- Фото для фотоотчёта: PNG в полоску, без сторонних библиотек ----------
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]) }
function makePhoto() {
  const w = 320, h = 240, base = [rand(150, 220), rand(150, 210), rand(140, 200)]
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const shade = y > h * 0.55 ? -50 : ((x + y) >> 4) % 2 ? 12 : 0 // «столешница» внизу, полосы сверху
      for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.max(0, Math.min(255, base[c] + shade))
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---------- База ----------
async function ensureStaff(client) {
  const staff = {}
  const added = []
  for (const [role, names] of Object.entries(DEMO_STAFF)) {
    const { rows } = await client.query('SELECT name FROM employees WHERE active AND $1 = ANY(roles) ORDER BY name', [role])
    if (rows.length) { staff[role] = rows.map((r) => r.name); continue }
    for (const name of names) {
      const { rows: found } = await client.query('SELECT id FROM employees WHERE lower(name) = lower($1)', [name])
      if (found.length) await client.query('UPDATE employees SET active = TRUE, roles = CASE WHEN $2 = ANY(roles) THEN roles ELSE array_append(roles, $2) END WHERE id = $1', [found[0].id, role])
      else await client.query('INSERT INTO employees (name, roles) VALUES ($1, ARRAY[$2]::text[])', [name, role])
      added.push(`${name} (${role})`)
    }
    staff[role] = names
  }
  return { staff, added }
}

async function ensureFurniture(client) {
  const load = async () => (await client.query(`SELECT c.name, COALESCE(json_agg(json_build_object('name', m.name, 'phone', m.phone) ORDER BY m.position) FILTER (WHERE m.id IS NOT NULL), '[]') AS makers
    FROM furniture_companies c LEFT JOIN furniture_makers m ON m.company_id = c.id GROUP BY c.id`)).rows.filter((c) => c.makers.length)
  const companies = await load()
  if (companies.length) return { companies, added: 0 }
  // Справочник пуст (или в нём нет ни одного мебельщика) — добавляем демо-компании с мебельщиками.
  for (const company of DEMO_FURNITURE) {
    const { rows: found } = await client.query('SELECT id FROM furniture_companies WHERE lower(name) = lower($1)', [company.name])
    const id = found[0]?.id ?? (await client.query('INSERT INTO furniture_companies (name) VALUES ($1) RETURNING id', [company.name])).rows[0].id
    for (const [position, [name]] of company.makers.entries()) await client.query('INSERT INTO furniture_makers (company_id, name, phone, position) VALUES ($1, $2, $3, $4)', [id, name, phone(), position])
  }
  return { companies: await load(), added: DEMO_FURNITURE.length }
}

async function loadDecors(client) {
  const decors = { 'Кварцевый агломерат': [], 'Акрил': [] }
  const exists = (await client.query("SELECT to_regclass('public.decor_glues') AS t")).rows[0].t
  if (exists) {
    const { rows } = await client.query('SELECT material, brand, decor, main_glue FROM decor_glues')
    for (const row of rows) (row.material === 'Кварц' ? decors['Кварцевый агломерат'] : row.material === 'Акрил' ? decors['Акрил'] : []).push({ decor: `${row.brand} ${row.decor}`, glue: row.main_glue })
  }
  if (!decors['Кварцевый агломерат'].length) decors['Кварцевый агломерат'] = [{ decor: 'Calacatta Gold', glue: 'A-White' }, { decor: 'Noble Grey', glue: 'S-White' }]
  if (!decors['Акрил'].length) decors['Акрил'] = [{ decor: 'Pure White', glue: 'A-White' }, { decor: 'Limestone', glue: 'N-White' }]
  const { rows: sanding } = await client.query("SELECT name FROM catalog_items WHERE kind = 'sanding' AND active")
  return { decors, sanding: sanding.map((r) => r.name).length ? sanding.map((r) => r.name) : ['Шкурка 320', 'Шкурка 400'] }
}

// ---------- Один процесс ----------
/**
 * Процесс на заданном шаге: данные этапов до него заполнены, история — по шагам с реальными исполнителями.
 * Возвращает { data, history, comments, photos, createdAt, updatedAt }.
 */
function buildProcess(id, [stage, status], { staff, companies, decors, sanding }) {
  const now = new Date()
  // Завершённые — разнесены по нескольким прошлым месяцам, чтобы в «Обзоре» была статистика по месяцам.
  const created = new Date(now.getTime() - (rand(ORDER.indexOf(stage) * 3 + 1, ORDER.indexOf(stage) * 5 + 6) + (stage === 'Завершён' ? rand(0, 120) : 0)) * DAY)
  let clock = atHour(created, 9, 12)
  const history = []
  // Следующее событие — через несколько дней в рабочее время, но не позже «сейчас» и не раньше предыдущего.
  const tick = (minDays = 0, maxDays = 2) => {
    const next = atHour(new Date(clock.getTime() + rand(minDays, maxDays) * DAY))
    const latest = now.getTime() - rand(10, 90) * 60000
    clock = new Date(Math.max(clock.getTime() + 60000, Math.min(next.getTime(), latest)))
    return clock
  }
  const event = (actor, role, changedFields, changes = {}) => history.push({ action: 'updated', actor, role, at: tick(), changedFields, changes })
  // Изделия: обычно одно, примерно в каждом четвёртом процессе — второе из другого материала (кухня + санузел).
  const makeItem = (product, material) => {
    const decorItem = material === 'HPL (Компакт)' ? { decor: pick(HPL_DECORS), glue: '' } : pick(decors[material])
    return { item: { product, material, decor: decorItem.decor, glue: '' }, glue: decorItem.glue }
  }
  const firstMaterial = pick(['Кварцевый агломерат', 'Кварцевый агломерат', 'Акрил', 'Акрил', 'HPL (Компакт)'])
  const made = [makeItem(pick(PRODUCTS), firstMaterial)]
  if (chance(0.25)) made.push(makeItem(pick(['Столешница для ванной', 'Подоконник']), pick(['Кварцевый агломерат', 'Акрил', 'HPL (Компакт)'].filter((m) => m !== firstMaterial))))
  const items = made.map((entry) => entry.item)
  const isPrivate = chance(0.2)
  const client = fullName()
  const company = chance(0.65) && companies.length ? pick(companies) : null
  const maker = company ? pick(company.makers) : null
  const manager = pick(staff['Менеджер'])
  const data = {
    client, items, manager,
    phoneContacts: [{ label: 'Клиент', phone: phone() }, ...(chance(0.3) ? [{ label: pick(CONTACT_ROLES), phone: phone() }] : [])],
    addressCity: city(), addressStreet: pick(STREETS), addressHouse: String(rand(1, 160)), houseType: isPrivate ? 'Частный' : 'Многоквартирный',
    ...(isPrivate ? {} : { addressApartment: String(rand(1, 320)), floor: String(rand(1, 24)), entrance: String(rand(1, 6)) }),
    furnitureCompany: company?.name || '', furnitureMaker: maker?.name || '', furnitureMakerPhone: maker?.phone || '',
    sinkType: pick(['Каменная', 'Нержавеющая сталь']), sinkColor: pick(['Белый', 'Графит', 'Бежевый', 'Чёрный']),
    processCreatedDate: dayKey(created), productionDate: dayKey(new Date(created.getTime() + rand(14, 24) * DAY)),
    stage: 'Новый заказ', stageStatus: null,
  }
  history.push({ action: 'created', actor: manager, role: 'Менеджер', at: clock, changedFields: [], changes: {} })
  const set = (patch) => Object.assign(data, patch)

  if (reached(stage, 'Замер')) {
    set({ surveyor: pick(staff['Замерщик']), stage: 'Замер', stageStatus: NOT_READY })
    event(manager, 'Менеджер', ['stage', 'stageStatus', 'surveyor'], { stage: { from: 'Новый заказ', to: 'Замер' }, stageStatus: { from: null, to: NOT_READY } })
  }
  const surveyDone = reached(stage, 'Проектирование') || (stage === 'Замер' && status === READY)
  if (surveyDone) {
    const length = rand(16, 42) * 100, depth = pick([600, 600, 650, 700])
    tick(1, 3)
    set({
      surveyDate: dayKey(clock), measurements: `${length} × ${depth} мм, толщина 12 мм`,
      hasElevator: isPrivate ? false : Number(data.floor) > 4 || chance(0.5), elevatorTypes: [],
      mixerPosition: pick(['Слева', 'По центру', 'Справа']), dispenserPosition: 'Не нужен', grinderPosition: 'н/д',
      surveySketch: makeSketch(length, depth, clock), stageStatus: READY,
    })
    if (data.hasElevator) data.elevatorTypes = [pick(['square', 'vertical', 'horizontal'])]
    event(data.surveyor, 'Замерщик', ['surveyDate', 'measurements', 'surveySketch', 'stageStatus'], { stageStatus: { from: NOT_READY, to: READY } })
  }
  // «Взять в работу» и «Готов» для этапов производства.
  for (const next of ['Проектирование', 'Фрезеровка/Распил', 'Шлифовка/Полировка/Монтаж мойки']) {
    if (!reached(stage, next)) break
    const { field, role } = STAGE_OWNERS[next]
    const person = pick(staff[role])
    const prev = ORDER[ORDER.indexOf(next) - 1]
    set({ stage: next, stageStatus: NOT_READY, [field]: person })
    event(person, role, ['stage', 'stageStatus', field], { stage: { from: prev, to: next }, stageStatus: { from: READY, to: NOT_READY } })
    const done = reached(stage, ORDER[ORDER.indexOf(next) + 1]) || (stage === next && status === READY)
    // Клей — только для кварца и акрила (как в карточке «Производство»), основной клей из «Клея по декорам».
    if (next === 'Шлифовка/Полировка/Монтаж мойки') set({ items: made.map((entry) => ({ ...entry.item, glue: entry.glue || '' })), finalSanding: pick(sanding) })
    if (done) {
      tick(1, 3)
      if (next === 'Шлифовка/Полировка/Монтаж мойки') {
        set({ stage: 'Произведено', stageStatus: null })
        event(person, role, ['stage', 'stageStatus', 'finalSanding'], { stage: { from: next, to: 'Произведено' }, stageStatus: { from: NOT_READY, to: null } })
      } else {
        set({ stageStatus: READY })
        event(person, role, ['stageStatus'], { stageStatus: { from: NOT_READY, to: READY } })
      }
    }
  }
  const photos = []
  if (reached(stage, 'Монтаж')) {
    const foreman = pick(staff['Бригадир монтажников'])
    const installers = pickSome(staff['Монтажник'], rand(1, 2))
    set({ stage: 'Монтаж', stageStatus: NOT_READY, installationForeman: foreman, installers })
    event(foreman, 'Бригадир монтажников', ['stage', 'stageStatus', 'installationForeman', 'installers'], { stage: { from: 'Произведено', to: 'Монтаж' }, stageStatus: { from: null, to: NOT_READY } })
    const installDay = stage === 'Монтаж' && status === NOT_READY ? new Date(now.getTime() + rand(-1, 4) * DAY) : clock
    set({ installationDates: [dayKey(installDay)] })
    if (reached(stage, 'Завершён') || status === READY) {
      tick(0, 1)
      for (let i = 0; i < rand(1, 3); i++) photos.push({ name: `foto-montazh-${i + 1}.png`, at: clock, actor: installers[0] })
      set({ stageStatus: READY })
      event(installers[0], 'Монтажник', ['stageStatus'], { stageStatus: { from: NOT_READY, to: READY } })
    }
    if (reached(stage, 'Завершён')) {
      set({ stage: 'Завершён', stageStatus: null })
      event(manager, 'Менеджер', ['stage', 'stageStatus'], { stage: { from: 'Монтаж', to: 'Завершён' }, stageStatus: { from: READY, to: null } })
      data.completedAt = clock.toISOString() // дата завершения — для статистики в «Обзоре»
    }
  }
  if (stage !== 'Завершён' && chance(0.12)) {
    set({ needsData: true, needsDataNote: pick(NEEDS_DATA) })
    event(manager, 'Менеджер', ['needsData', 'needsDataNote'], { needsData: { from: null, to: 'Да' }, needsDataNote: { from: null, to: data.needsDataNote } })
  }
  data.stageChangedAt = clock.toISOString()
  const people = [manager, data.surveyor, data.technologist, data.cncOperator, data.finisher, data.installationForeman].filter(Boolean)
  const comments = Array.from({ length: chance(0.4) ? rand(1, 3) : 0 }, () => ({ author: pick(people), body: pick(COMMENTS), at: tick(0, 1) }))
  return { id, data, history, comments, photos, createdAt: created, updatedAt: clock }
}

// ---------- Запуск ----------
async function main() {
  const { rows: tables } = await pool.query("SELECT to_regclass('public.processes') AS p, to_regclass('public.furniture_companies') AS f")
  if (!tables[0].p || !tables[0].f) throw new Error('Таблиц ещё нет. Один раз запустите сайт (npm run dev) — сервер создаст их, затем повторите npm run seed.')
  const { rows: [{ n: existing }] } = await pool.query('SELECT count(*)::int AS n FROM processes')
  if (!YES) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question(`Будут удалены ВСЕ процессы (${existing}) вместе с историей, комментариями и файлами, и созданы ${COUNT} новых. Продолжить? (да/нет) `)
    rl.close()
    if (!/^(да|д|y|yes)$/i.test(answer.trim())) { console.log('Отменено — ничего не изменено.'); return }
  }

  const client = await pool.connect()
  const files = []
  try {
    await client.query('BEGIN')
    const { rows: oldFiles } = await client.query('SELECT storage_name FROM process_attachments')
    await client.query('DELETE FROM processes') // история, комментарии и вложения удаляются каскадом
    const { staff, added } = await ensureStaff(client)
    const { companies, added: addedCompanies } = await ensureFurniture(client)
    const refs = { staff, companies, ...(await loadDecors(client)) }
    const byStage = {}
    let number = 1001
    for (const step of distribute(COUNT)) {
      const p = buildProcess(String(number++), step, refs)
      let version = 1
      await client.query('INSERT INTO processes (process_number, data, created_at, updated_at, version) VALUES ($1, $2::jsonb, $3, $4, $5)', [p.id, JSON.stringify(p.data), p.createdAt, p.updatedAt, p.history.length])
      for (const h of p.history) {
        const details = h.action === 'created' ? { processNumber: p.id, actorRole: h.role } : { changedFields: h.changedFields, changes: h.changes, actorRole: h.role }
        await client.query(
          `INSERT INTO process_history (process_number, action, actor, actor_id, details, created_at, version)
           VALUES ($1, $2, $3, (SELECT id FROM employees WHERE name = $3 LIMIT 1), $4::jsonb, $5, $6)`,
          [p.id, h.action, h.actor, JSON.stringify(details), h.at, version++],
        )
      }
      for (const c of p.comments) await client.query('INSERT INTO process_comments (process_number, author_id, author, body, created_at) VALUES ($1, (SELECT id FROM employees WHERE name = $2 LIMIT 1), $2, $3, $4)', [p.id, c.author, c.body, c.at])
      for (const photo of p.photos) {
        const storage = `${randomUUID()}.png`
        const bytes = makePhoto()
        files.push([storage, bytes])
        await client.query('INSERT INTO process_attachments (id, process_number, field_key, original_name, storage_name, mime_type, file_size, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [randomUUID(), p.id, INSTALLATION_PHOTOS, photo.name, storage, 'image/png', bytes.length, photo.at])
        await client.query("INSERT INTO process_history (process_number, action, actor, actor_id, details, created_at) VALUES ($1, 'file_added', $2, (SELECT id FROM employees WHERE name = $2 LIMIT 1), $3::jsonb, $4)", [p.id, photo.actor, JSON.stringify({ fieldKey: INSTALLATION_PHOTOS, fileName: photo.name, actorRole: 'Монтажник' }), photo.at])
      }
      const label = p.data.stageStatus ? `${p.data.stage} · ${p.data.stageStatus}` : p.data.stage
      byStage[label] = (byStage[label] || 0) + 1
    }
    await mkdir(uploadsPath, { recursive: true })
    for (const [name, bytes] of files) await writeFile(path.join(uploadsPath, name), bytes)
    await client.query('COMMIT')
    // Файлы удалённых процессов убираем только после успешной записи в базу.
    for (const { storage_name: name } of oldFiles) await rm(path.join(uploadsPath, name), { force: true })

    console.log(`\nУдалено процессов: ${existing}. Создано: ${COUNT} (№ 1001–${1000 + COUNT}).`)
    for (const [label, n] of Object.entries(byStage).sort((a, b) => ORDER.indexOf(a[0].split(' · ')[0]) - ORDER.indexOf(b[0].split(' · ')[0]))) console.log(`  ${label}: ${n}`)
    if (added.length) console.log(`Добавлены демо-сотрудники (без доступа на сайт): ${added.join(', ')}.`)
    if (addedCompanies) console.log(`Справочник «Мебельщики» был пуст — добавлены демо-компании: ${addedCompanies}.`)
    console.log('Обновите страницу сайта.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    for (const [name] of files) await rm(path.join(uploadsPath, name), { force: true }).catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch((error) => { console.error('Ошибка:', error.message); process.exitCode = 1 })
  .finally(() => pool.end())
