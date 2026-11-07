// Пароли, логины и сессии. Только встроенный модуль crypto — без внешних зависимостей.
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT = { N: 16384, r: 8, p: 1 }

/** Хэш пароля в формате scrypt$N$r$p$соль$ключ (сам пароль нигде не хранится). */
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(String(password), salt, 64, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password, stored) {
  if (!stored) return false
  const [algorithm, N, r, p, salt, key] = String(stored).split('$')
  if (algorithm !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(String(password), Buffer.from(salt, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Случайный пароль без похожих символов (0/o, 1/l): например «k7m2-pq9x-4rtb». */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let result = ''
  for (let i = 0; i < 12; i += 1) {
    result += alphabet[randomInt(alphabet.length)]
    if (i === 3 || i === 7) result += '-'
  }
  return result
}

export const PASSWORD_MIN = 8
export const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/
export const normalizeLogin = (value) => String(value || '').trim().toLowerCase()

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }

/** Основа логина из имени: «Игорь Тихонов» → «igor.tikhonov». */
function loginFromName(name) {
  const latin = String(name || '').toLowerCase().split('').map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('')
  const base = latin.replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 28)
  return base.length >= 3 ? base : `user${base ? '.' + base : ''}`.slice(0, 28)
}

/** Свободный логин: igor.tikhonov, igor.tikhonov2, … */
export async function uniqueLogin(db, base, exceptId = null) {
  for (let n = 1; n < 1000; n += 1) {
    const login = n === 1 ? base : `${base}${n}`
    const { rows } = await db.query('SELECT 1 FROM employees WHERE lower(login) = $1 AND ($2::bigint IS NULL OR id <> $2)', [login, exceptId])
    if (!rows.length) return login
  }
  throw new Error('Не удалось подобрать свободный логин.')
}

/** Новый логин (если его ещё нет) и новый пароль для сотрудника. Возвращает пароль в открытом виде — показать один раз. */
export async function issueCredentials(db, employee) {
  const login = employee.login || await uniqueLogin(db, loginFromName(employee.name), employee.id)
  const password = generatePassword()
  await db.query('UPDATE employees SET login = $2, password_hash = $3, password_changed_at = NOW() WHERE id = $1', [employee.id, login, await hashPassword(password)])
  await db.query('DELETE FROM sessions WHERE employee_id = $1', [employee.id])
  return { login, password }
}

export const newSessionToken = () => randomBytes(32).toString('hex')
export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex')

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}
