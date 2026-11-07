// Новый пароль для сотрудника — на случай, если директор (или кто-то ещё) его потерял.
//   npm run reset-password -- director
//   npm run reset-password -- "Игорь Тихонов"
// Ищет по логину или по имени, печатает новый логин и пароль. Все сессии сотрудника закрываются.
import pg from 'pg'
import { issueCredentials } from '../server/auth.js'

const query = process.argv.slice(2).join(' ').trim()
const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'aquastone',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  connectionTimeoutMillis: 5000,
})

try {
  const { rows: cols } = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'password_hash'")
  if (!cols.length) throw new Error('В базе ещё нет входа по паролю. Сначала запустите сайт (npm run dev) — сервер обновит таблицы.')
  if (!query) {
    const { rows } = await pool.query("SELECT name, login, array_to_string(roles, ', ') AS roles FROM employees WHERE active ORDER BY name")
    console.log('Укажите логин или имя: npm run reset-password -- <логин>\n')
    for (const row of rows) console.log(`  ${(row.login || '(нет логина)').padEnd(22)} ${row.name} — ${row.roles}`)
  } else {
    const { rows } = await pool.query('SELECT id, name, login FROM employees WHERE active AND (lower(login) = lower($1) OR lower(name) = lower($1))', [query])
    if (!rows.length) throw new Error(`Сотрудник «${query}» не найден. Запустите без параметров, чтобы увидеть список.`)
    const credentials = await issueCredentials(pool, rows[0])
    console.log(`\nНовые данные для входа — ${rows[0].name}:\n  логин:  ${credentials.login}\n  пароль: ${credentials.password}\nСменить пароль можно в «Личном кабинете».\n`)
  }
} catch (error) {
  console.error('Ошибка:', error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
