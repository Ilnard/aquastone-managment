// Изделия процесса. Один процесс может включать несколько изделий из разных материалов,
// например столешницу для кухни из кварца и столешницу в санузел из акрила.
// Изделие: { product, material, decor, glue }. Общие правила для сервера и интерфейса.

export const PRODUCTS = ['Столешница для кухни', 'Столешница + остров', 'Столешница + фартук', 'Столешница для ванной', 'Подоконник', 'Другое']
export const MATERIALS = ['Кварцевый агломерат', 'Акрил', 'HPL (Компакт)']
export const MAX_ITEMS = 10
/** Клей подбирают только для кварца и акрила. */
export const needsGlue = (material) => material === 'Акрил' || material === 'Кварцевый агломерат'
/** Материал в справочнике «Клей по декорам» → материал изделия. */
export const GLUE_DIRECTORY_MATERIALS = { 'Кварц': 'Кварцевый агломерат', 'Акрил': 'Акрил' }

const EMPTY = ['не выбран', 'не выбрана', '—']
const clean = (value, max = 120) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return EMPTY.includes(text.toLocaleLowerCase('ru')) ? '' : text
}
export const emptyItem = (product = PRODUCTS[0]) => ({ product, material: '', decor: '', glue: '' })

/** Одно изделие: только известные поля, клей — только там, где он нужен. */
export function cleanItem(input = {}) {
  const material = clean(input.material, 60)
  return { product: clean(input.product, 80), material, decor: clean(input.decor), glue: needsGlue(material) ? clean(input.glue, 60) : '' }
}
/** Список изделий для сохранения: без пустых строк, не больше MAX_ITEMS. */
export function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS).map(cleanItem).filter((item) => item.product || item.material || item.decor)
}

/** Изделия процесса. Процессы, сохранённые до появления списка, читаются из старых полей product/material/decor/glue. */
export function processItems(order = {}) {
  if (Array.isArray(order.items)) return order.items.map(cleanItem)
  const legacy = cleanItem(order)
  return legacy.product || legacy.material || legacy.decor ? [legacy] : []
}
/** Старые поля, которые заменил список изделий: при сохранении изделий их стираем. */
export const LEGACY_ITEM_FIELDS = ['product', 'material', 'decor', 'glue']

/** Коротко для списков и заголовков: «Столешница для кухни + Столешница для ванной». */
export function productsLabel(order) {
  const names = processItems(order).map((item) => item.product).filter(Boolean)
  return names.length ? names.join(' + ') : 'Изделие не указано'
}
/** Материалы процесса без повторов: «Кварцевый агломерат, Акрил». */
export const materialsOf = (order) => [...new Set(processItems(order).map((item) => item.material).filter(Boolean))]
/** Текст для поиска по изделиям. */
export const itemsSearchText = (order) => processItems(order).map((item) => `${item.product} ${item.material} ${item.decor} ${item.glue}`).join(' ')
/** Одной строкой: «Столешница для кухни — Кварцевый агломерат, Avant 1111 (клей A-White)». */
export const itemLine = (item) => `${item.product || 'Изделие'} — ${[item.material || 'материал не выбран', item.decor].filter(Boolean).join(', ')}${item.glue ? ` (клей ${item.glue})` : ''}`

/**
 * Изменились ли в изделиях только клеи (состав, материалы и декоры те же).
 * Так работает вкладка «Производство»: обработчик подбирает клей, но не меняет изделия.
 */
export function onlyGlueChanged(previous, next) {
  const a = processItems({ items: previous }), b = processItems({ items: next })
  return a.length === b.length && a.every((item, i) => item.product === b[i].product && item.material === b[i].material && item.decor === b[i].decor)
}
