// Заявки из конструктора столешниц — общие правила для сервера и раздела «Заявки».
import { formatRussianPhone } from './phone.js'

export const REQUEST_STATUSES = ['Новая', 'В работе', 'Создан процесс', 'Отклонена']
/** Материал конструктора → материал процесса в менеджменте. */
export const CONSTRUCTOR_MATERIALS = { quartz: 'Кварцевый агломерат', acrylic: 'Акрил', compact: 'HPL (Компакт)' }
/** Форма столешницы из конструктора. */
export const CONSTRUCTOR_FORMS = { straight: 'Прямая', 'l-shaped': 'Г-образная', 'u-shaped': 'П-образная', island: 'Остров', 'island-1-leg': 'Остров с 1 ногой', 'island-2-legs': 'Остров с 2 ногами' }
export const SHAPE_TYPES = { rect: 'Столешница', sink: 'Мойка', hob: 'Варочная панель', circle: 'Круглый вырез', cutout: 'Прямой вырез' }

const text = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const num = (value, min = 0, max = 1e9) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0 }

/**
 * Проверка проекта из конструктора: только известные поля (название, форма, материал, декор, эскиз).
 * Площадь, раскрой и стоимость здесь не принимаются — их считает сервер (server/calc/estimate.js)
 * и подставляет в заявку сам. Возвращает { value } или { error }.
 */
export function normalizeProject(input = {}) {
  if (!input || typeof input !== 'object') return { error: 'Нет данных проекта.' }
  const material = Object.keys(CONSTRUCTOR_MATERIALS).includes(input.material) ? input.material : null
  if (!material) return { error: 'Неизвестный материал.' }
  const shapes = (Array.isArray(input.shapes) ? input.shapes : []).slice(0, 100)
    .filter((s) => s && SHAPE_TYPES[s.type])
    .map((s) => ({ type: s.type, name: text(s.name, 60) || SHAPE_TYPES[s.type], x: Math.round(num(s.x, 0, 20000)), y: Math.round(num(s.y, 0, 20000)), w: Math.round(num(s.w, 1, 20000)), h: Math.round(num(s.h, 1, 20000)) }))
  if (!shapes.some((s) => s.type === 'rect')) return { error: 'На эскизе нет ни одной детали столешницы.' }
  return {
    value: {
      title: text(input.title, 80),
      form: CONSTRUCTOR_FORMS[input.form] ? input.form : null,
      formTitle: CONSTRUCTOR_FORMS[input.form] || '',
      material,
      materialTitle: CONSTRUCTOR_MATERIALS[material],
      decor: text(input.decor, 60),
      decorCode: text(input.decorCode, 30),
      thickness: Math.round(num(input.thickness, 0, 100)) || null,
      shapes,
      // Заполняет сервер по своему расчёту.
      summary: { area: 0, purchasedArea: 0, order: '', orderDescription: '', efficiency: 0, variant: '', seams: 0, seamLength: 0 },
      estimate: 0,
    },
  }
}

/** Контакт клиента: ФИО и телефон обязательны. */
export function normalizeContact(input = {}) {
  const name = text(input.name, 120)
  const phone = formatRussianPhone(input.phone)
  if (name.length < 2) return { error: 'Укажите ФИО.' }
  if (phone.replace(/\D/g, '').length !== 11) return { error: 'Укажите телефон полностью: +7 (999) 888-77-66.' }
  return { value: { name, phone } }
}

const money = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'
/** Короткое описание заявки — для комментария в созданном процессе. */
export function requestSummary(request) {
  const p = request.project
  const parts = p.shapes.filter((s) => s.type === 'rect').map((s) => `${s.w}×${s.h}`)
  const cutouts = p.shapes.filter((s) => s.type !== 'rect').map((s) => SHAPE_TYPES[s.type].toLocaleLowerCase('ru'))
  return [
    `Из заявки №${request.id} (конструктор)${p.title ? ` «${p.title}»` : ''}.`,
    p.formTitle ? `Форма: ${p.formTitle}.` : '',
    `${p.materialTitle}${p.thickness ? `, ${p.thickness} мм` : ''}${p.decor ? `, декор ${p.decor}${p.decorCode ? ` (${p.decorCode})` : ''}` : ''}.`,
    `Детали: ${parts.join(', ')} мм; площадь ${String(p.summary.area).replace('.', ',')} м²${cutouts.length ? `; вырезы: ${cutouts.join(', ')}` : ''}.`,
    p.summary.order ? `Комплект: ${p.summary.order}${p.summary.orderDescription ? ` (${p.summary.orderDescription})` : ''}.` : '',
    `Ориентир по стоимости: ${money(request.estimate)}.`,
  ].filter(Boolean).join(' ')
}
