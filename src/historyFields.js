// Общие правила показа истории процессов: названия полей и описание события «было → стало».

const FIELD_NAMES = {
  stage: 'этап', items: 'изделия', product: 'изделие', material: 'материал', decor: 'декор', client: 'клиент', phoneContacts: 'телефоны контактов',
  furnitureCompany: 'мебельная компания', furnitureMaker: 'мебельщик', furnitureMakerPhone: 'телефон мебельщика', sinkType: 'тип раковины', sinkColor: 'цвет раковины', glue: 'клей',
  floor: 'этаж', entrance: 'подъезд', hasElevator: 'наличие лифта', elevatorTypes: 'варианты лифта', measurements: 'размеры и эскиз', cncOperator: 'оператор ЧПУ',
  finisher: 'обработчик', surveyDate: 'дата замера', processCreatedDate: 'дата создания процесса', productionDate: 'дата окончания процесса', installationDate: 'плановый монтаж', installers: 'монтажники',
  stageStatus: 'статус этапа', needsData: 'нужны данные', needsDataNote: 'чего не хватает', installationForeman: 'бригадир монтажников', surveySketch: 'чертёж замера', finalSanding: 'финальная шлифовка',
  installationDates: 'даты монтажа', manager: 'менеджер', surveyor: 'замерщик', technologist: 'технолог', addressCity: 'город', addressStreet: 'улица',
  addressHouse: 'дом', addressApartment: 'квартира', houseType: 'тип дома', mixerPosition: 'смеситель', dispenserPosition: 'дозатор', grinderPosition: 'измельчитель',
  id: 'номер процесса', fixturePositions: 'расположение смесителя и приборов',
}
const FILE_FIELDS = { cadDrawing: 'чертёж AutoCAD', dxfDrawing: 'чертёж DXF', surveyPhotos: 'фото объекта', drawingPhotos: 'фото чертежа', installationPhotos: 'фотоотчёт' }

// Служебные поля, которые не нужно показывать в истории.
const HIDDEN = new Set(['stageChangedAt', 'completedAt'])
const ELEVATORS = { square: 'Квадратный', vertical: 'Длинный прямой', horizontal: 'Длинный боковой' }

export const fieldName = (key) => FIELD_NAMES[key] || key

/** Значение для показа: даты по-русски, коды лифтов — словами. */
function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return '—'
  const text = String(value)
  if (key === 'elevatorTypes') return text.split(', ').map((v) => ELEVATORS[v] || v).join(', ')
  if (/^\d{4}-\d{2}-\d{2}(, \d{4}-\d{2}-\d{2})*$/.test(text)) {
    return text.split(', ').map((d) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })).join(', ')
  }
  return text
}

/** Видимые поля события (без служебных; телефон дублирует «телефоны контактов»). */
function visibleFields(event) {
  const keys = (event.details?.changedFields || []).filter((key) => !HIDDEN.has(key))
  return keys
}

/**
 * Описание события истории: заголовок и строки изменений.
 * Строка — { field, from, to } или { field, text } (для сложных полей и файлов).
 */
export function describeEvent(event) {
  const d = event.details || {}
  if (event.action === 'created') return { title: 'Процесс создан', lines: [] }
  if (event.action === 'file_added') return { title: 'Файл добавлен', lines: [{ field: FILE_FIELDS[d.fieldKey] || 'файл', text: d.fileName }] }
  if (event.action === 'file_removed') return { title: 'Файл удалён', lines: [{ field: FILE_FIELDS[d.fieldKey] || 'файл', text: d.fileName }] }
  const fields = visibleFields(event)
  const lines = fields.map((key) => {
    const change = d.changes?.[key]
    if (!change) return { field: fieldName(key), text: null }
    if (change.complex) return { field: fieldName(key), text: key === 'items' ? 'изменены' : 'изменён' }
    return { field: fieldName(key), from: formatValue(key, change.from), to: formatValue(key, change.to) }
  })
  const stageChange = d.changes?.stage
  const statusChange = d.changes?.stageStatus
  // Смена этапа или статуса — заголовком: «Этап: Замер · Готов» или «Статус: Готов».
  const stageOnly = fields.every((key) => ['stage', 'stageStatus', 'surveyDate', 'technologist', 'cncOperator', 'finisher', 'installationForeman'].includes(key))
  const title = stageChange && !stageChange.complex && stageOnly ? `Этап: ${[stageChange.to, statusChange && !statusChange.complex && statusChange.to !== '—' ? statusChange.to : null].filter(Boolean).join(' · ')}`
    : statusChange && !statusChange.complex && stageOnly ? `Статус: ${statusChange.to || '—'}` : 'Изменения сохранены'
  return { title, lines }
}

export const isVisibleEvent = (event) => ['created', 'file_added', 'file_removed'].includes(event.action) || visibleFields(event).length > 0
