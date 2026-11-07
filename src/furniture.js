// Справочник «Мебельщики»: мебельная компания и её мебельщики с телефонами.
// Общий для сервера (проверка) и интерфейса (подсказки в процессе).
import { formatRussianPhone } from './phone.js'

const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
export const sameText = (a, b) => clean(a).toLocaleLowerCase('ru').replace(/ё/g, 'е') === clean(b).toLocaleLowerCase('ru').replace(/ё/g, 'е')
const phoneDigits = (value) => String(value || '').replace(/\D/g, '')

/** Проверка компании: { value: { name, makers } } или { error }. Пустые строки мебельщиков отбрасываются. */
export function normalizeCompany(input = {}) {
  const name = clean(input.name)
  if (!name) return { error: 'Укажите название мебельной компании.' }
  const makers = []
  for (const raw of Array.isArray(input.makers) ? input.makers : []) {
    const makerName = clean(raw?.name)
    const phone = phoneDigits(raw?.phone) ? formatRussianPhone(raw.phone) : ''
    if (!makerName && !phone) continue
    if (!makerName) return { error: `Укажите ФИО мебельщика для телефона ${phone}.` }
    if (phone && phoneDigits(phone).length !== 11) return { error: `Телефон мебельщика «${makerName}» указан не полностью.` }
    if (makers.some((m) => sameText(m.name, makerName) && phoneDigits(m.phone) === phoneDigits(phone))) continue
    makers.push({ name: makerName, phone })
  }
  return { value: { name, makers } }
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })
export const sortCompanies = (list) => [...list].sort((a, b) => collator.compare(a.name, b.name))

/** Компания из справочника по названию (без учёта регистра и «ё»). */
export const findCompany = (companies = [], name) => (clean(name) ? companies.find((company) => sameText(company.name, name)) : undefined)
/** Мебельщики выбранной компании. */
export const makersOf = (companies, companyName) => findCompany(companies, companyName)?.makers || []
