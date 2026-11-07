// Выгрузка списка процессов в CSV, который Excel открывает без настройки:
// разделитель «;», кодировка UTF-8 с BOM, переводы строк Windows.

import { processItems } from './processItems.js'

const formatDate = (value) => {
  if (!value) return ''
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match) return `${match[3]}.${match[2]}.${match[1]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU')
}
const phones = (order) => (Array.isArray(order.phoneContacts) ? order.phoneContacts : []).map((c) => [c.label, c.phone].filter(Boolean).join(': ')).join('; ')
const address = (order) => [order.addressCity, order.addressStreet, order.addressHouse && `д. ${order.addressHouse}`, order.addressApartment && `кв. ${order.addressApartment}`].filter(Boolean).join(', ')

const COLUMNS = [
  ['Номер', (o) => o.id],
  ['Заказчик', (o) => o.client],
  ['Телефоны', phones],
  ['Адрес', address],
  ['Мебельная компания', (o) => o.furnitureCompany],
  ['Мебельщик', (o) => o.furnitureMaker],
  ['Телефон мебельщика', (o) => o.furnitureMakerPhone],
  // Несколько изделий — через «; » в том же порядке во всех четырёх колонках.
  ['Изделие', (o) => processItems(o).map((i) => i.product).join('; ')],
  ['Материал', (o) => processItems(o).map((i) => i.material || '—').join('; ')],
  ['Декор', (o) => processItems(o).map((i) => i.decor || '—').join('; ')],
  ['Этап', (o) => o.stage],
  ['Статус этапа', (o) => o.stageStatus || ''],
  ['Нужны данные', (o) => (o.needsData ? `Да${o.needsDataNote ? ': ' + o.needsDataNote : ''}` : '')],
  ['Менеджер', (o) => o.manager],
  ['Замерщик', (o) => o.surveyor],
  ['Технолог', (o) => o.technologist],
  ['Оператор ЧПУ', (o) => o.cncOperator],
  ['Обработчик', (o) => o.finisher],
  ['Бригадир монтажников', (o) => o.installationForeman],
  ['Монтажники', (o) => (Array.isArray(o.installers) ? o.installers.join(', ') : o.installers)],
  ['Дата создания', (o) => formatDate(o.processCreatedDate || o.createdAt)],
  ['Дата завершения', (o) => formatDate(o.completedAt)],
  ['Дата замера', (o) => formatDate(o.surveyDate)],
  ['Срок производства', (o) => formatDate(o.productionDate)],
  ['Дата монтажа', (o) => (Array.isArray(o.installationDates) && o.installationDates.length ? o.installationDates.map(formatDate).join(', ') : formatDate(o.installationDate))],
  ['Клей', (o) => processItems(o).map((i) => i.glue || '—').join('; ')],
  ['Финальная шлифовка', (o) => o.finalSanding],
  ['Обновлён', (o) => formatDate(o.updatedAt)],
]

const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function processesToCsv(orders) {
  const lines = [COLUMNS.map(([title]) => cell(title)).join(';')]
  for (const order of orders) lines.push(COLUMNS.map(([, get]) => cell(get(order))).join(';'))
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function downloadProcessesCsv(orders, fileName = `aquastone-processy-${new Date().toLocaleDateString('sv-SE')}`) {
  const blob = new Blob([processesToCsv(orders)], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${fileName}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
