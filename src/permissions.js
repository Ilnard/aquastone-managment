// Этапы, статусы и права — общие для интерфейса и сервера, чтобы правила не расходились.
// Сервер проверяет каждое сохранение по этим правилам, интерфейс показывает только доступные действия.

import { onlyGlueChanged } from './processItems.js'

// ---------- Роли и назначения ----------
export const ROLES = ['Директор', 'Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Обработчик', 'Бригадир монтажников', 'Монтажник']
/** Поля «Команды процесса» и роль, которая в них назначается. installers — список, остальные — одно имя. */
export const ASSIGNMENT_FIELDS = { manager: 'Менеджер', surveyor: 'Замерщик', technologist: 'Технолог', cncOperator: 'ЧПУ', finisher: 'Обработчик', installationForeman: 'Бригадир монтажников', installers: 'Монтажник' }
export const LIST_FIELDS = ['installers']
/** Имена, назначенные в поле (для installers — список, для остальных — одно имя). */
export const assignedNames = (order = {}, field) => {
  const value = order[field]
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  return value ? [String(value)] : []
}
export const isAssignedTo = (order, name) => Boolean(name) && Object.keys(ASSIGNMENT_FIELDS).some((field) => assignedNames(order, field).includes(name))

/** Директор может всё, что может менеджер. */
export const isManager = (roles = []) => roles.includes('Менеджер') || roles.includes('Директор')

// ---------- Этапы и статусы ----------
export const STAGES = ['Новый заказ', 'Замер', 'Проектирование', 'Фрезеровка/Распил', 'Шлифовка/Полировка/Монтаж мойки', 'Произведено', 'Монтаж', 'Завершён']
export const FLOW = STAGES
export const READY = 'Готов'
export const NOT_READY = 'Не готов'
/** Этапы, у которых есть статус «Не готов» / «Готов». */
export const STATUS_STAGES = ['Замер', 'Проектирование', 'Фрезеровка/Распил', 'Шлифовка/Полировка/Монтаж мойки', 'Монтаж']
/** Этапы до «Произведено» — для них важен срок производства. */
export const PRODUCTION_STAGES = ['Новый заказ', 'Замер', 'Проектирование', 'Фрезеровка/Распил', 'Шлифовка/Полировка/Монтаж мойки']
/** Кто ведёт этап: поле команды и роль. */
export const STAGE_OWNERS = {
  'Замер': { field: 'surveyor', role: 'Замерщик' },
  'Проектирование': { field: 'technologist', role: 'Технолог' },
  'Фрезеровка/Распил': { field: 'cncOperator', role: 'ЧПУ' },
  'Шлифовка/Полировка/Монтаж мойки': { field: 'finisher', role: 'Обработчик' },
  'Монтаж': { field: 'installationForeman', role: 'Бригадир монтажников' },
}
/** Этап и статус, после которых следующий исполнитель «забирает» процесс к себе. */
export const TAKE_STEPS = [
  { from: ['Замер', READY], to: 'Проектирование' },
  { from: ['Проектирование', READY], to: 'Фрезеровка/Распил' },
  { from: ['Фрезеровка/Распил', READY], to: 'Шлифовка/Полировка/Монтаж мойки' },
  { from: ['Произведено', null], to: 'Монтаж' },
]
export const INSTALLATION_PHOTOS = 'installationPhotos'

export const statusOf = (order = {}) => (STATUS_STAGES.includes(order.stage) ? (order.stageStatus === READY ? READY : NOT_READY) : null)
export const stageLabel = (order = {}) => { const status = statusOf(order); return status ? `${order.stage} · ${status}` : order.stage || '' }
export const stageTone = (stage) => ({ 'Новый заказ': 'gray', 'Замер': 'blue', 'Проектирование': 'violet', 'Фрезеровка/Распил': 'orange', 'Шлифовка/Полировка/Монтаж мойки': 'amber', 'Произведено': 'green', 'Монтаж': 'teal', 'Завершён': 'green' }[stage] || 'gray')

/** Может ли сотрудник вести текущий этап (менять его статус). */
function canWorkOnStage(roles = [], name, order = {}) {
  if (isManager(roles)) return true
  const owner = STAGE_OWNERS[order.stage]
  if (!owner) return false
  const assigned = assignedNames(order, owner.field)
  if (roles.includes(owner.role) && (!assigned.length || assigned.includes(name))) return true
  // На монтаже «Готов» может поставить и назначенный монтажник.
  return order.stage === 'Монтаж' && assignedNames(order, 'installers').includes(name)
}

/**
 * Действия с этапом, доступные сотруднику: [{ id, label, to: { stage, stageStatus }, assign?, needsPhoto?, confirm? }].
 * photoCount — сколько фото в «Фотоотчёте» (нужно для «Готов» на монтаже).
 */
export function availableActions(roles = [], name, order = {}, { photoCount = 0 } = {}) {
  const actions = []
  const manager = isManager(roles)
  const status = statusOf(order)
  if (order.stage === 'Новый заказ' && manager) {
    actions.push({ id: 'toSurvey', label: 'Передать на замер', to: { stage: 'Замер', stageStatus: NOT_READY }, confirm: 'Все данные собраны и получена предоплата или оплата? Процесс перейдёт в этап «Замер».' })
  }
  if (status === NOT_READY && canWorkOnStage(roles, name, order)) {
    const last = order.stage === 'Шлифовка/Полировка/Монтаж мойки'
    actions.push({
      id: 'ready', label: last ? 'Готово — в «Произведено»' : 'Отметить «Готов»',
      to: last ? { stage: 'Произведено', stageStatus: null } : { stage: order.stage, stageStatus: READY },
      needsPhoto: order.stage === 'Монтаж' && photoCount < 1,
    })
  }
  if (status === READY && canWorkOnStage(roles, name, order) && order.stage !== 'Монтаж') {
    actions.push({ id: 'unready', label: 'Вернуть «Не готов»', to: { stage: order.stage, stageStatus: NOT_READY }, secondary: true })
  }
  const take = TAKE_STEPS.find((step) => step.from[0] === order.stage && step.from[1] === status)
  if (take) {
    const owner = STAGE_OWNERS[take.to]
    if (roles.includes(owner.role) || manager) {
      actions.push({
        id: 'take', label: take.to === 'Монтаж' ? 'Перевести в монтаж' : 'Взять в работу',
        to: { stage: take.to, stageStatus: NOT_READY },
        // Исполнитель забирает процесс к себе. Менеджер без этой роли переводит, не меняя исполнителя.
        assign: roles.includes(owner.role) ? { field: owner.field, value: name } : null,
      })
    }
  }
  if (order.stage === 'Монтаж' && status === READY) {
    if (canWorkOnStage(roles, name, order)) actions.push({ id: 'unready', label: 'Вернуть «Не готов»', to: { stage: 'Монтаж', stageStatus: NOT_READY }, secondary: true })
    if (manager) actions.push({ id: 'close', label: 'Закрыть процесс', to: { stage: 'Завершён', stageStatus: null }, confirm: 'Монтаж выполнен, фотоотчёт проверен? Процесс перейдёт в «Завершён».' })
  }
  return actions
}

/**
 * Проверка смены этапа/статуса на сервере. Возвращает текст ошибки или null.
 * Менеджер и директор могут поставить любой этап (ручная правка), остальные — только доступные действия.
 */
export function stageChangeError(roles, name, previous, next, { photoCount = 0 } = {}) {
  if (!STAGES.includes(next.stage)) return `Неизвестный этап «${next.stage}».`
  const nextStatus = STATUS_STAGES.includes(next.stage) ? (next.stageStatus === READY ? READY : NOT_READY) : null
  if (next.stage === 'Монтаж' && nextStatus === READY && statusOf(previous) !== READY && photoCount < 1) return 'Чтобы поставить статус «Готов», добавьте минимум одно фото в «Фотоотчёт».'
  if (isManager(roles)) return null
  const action = availableActions(roles, name, previous, { photoCount }).find((item) => item.to.stage === next.stage && (item.to.stageStatus ?? null) === nextStatus)
  if (!action) return 'У вашей роли нет прав на этот переход этапа.'
  return null
}

// ---------- Поля по вкладкам ----------
const TAB_FIELDS = {
  'Замер': [
    'surveyDate', 'addressCity', 'addressStreet', 'addressHouse', 'houseType', 'addressApartment', 'floor', 'entrance',
    'hasElevator', 'elevatorTypes', 'measurements', 'sinkType', 'sinkColor',
    'mixerPosition', 'dispenserPosition', 'grinderPosition', 'surveySketch',
  ],
  'Проектирование': [],
  // Клей теперь у каждого изделия (items[].glue) — см. forbiddenFields.
  'Производство': ['finalSanding'],
  'Монтаж': ['installationDates'],
}
/** Поля, которые может менять любой сотрудник: сроки и отметка «Нужны данные». */
const ANYONE_FIELDS = ['processCreatedDate', 'productionDate', 'installationDate', 'needsData', 'needsDataNote']
/** Служебное поле: когда сменился этап или статус (ставит сервер). */
const SERVER_FIELDS = ['stageChangedAt', 'completedAt']

/** К какой вкладке относится файл: права на загрузку и удаление — как на вкладку. */
const ATTACHMENT_TABS = {
  surveyPhotos: 'Замер', drawingPhotos: 'Замер',
  cadDrawing: 'Проектирование', dxfDrawing: 'Проектирование',
  [INSTALLATION_PHOTOS]: 'Монтаж',
}

export function canEditTab(roles = [], tab) {
  if (isManager(roles)) return true
  if (tab === 'Замер') return roles.includes('Замерщик') || roles.includes('Технолог')
  if (tab === 'Проектирование') return roles.includes('Технолог')
  if (tab === 'Производство') return roles.includes('ЧПУ') || roles.includes('Обработчик')
  if (tab === 'Монтаж') return roles.includes('Монтажник') || roles.includes('Бригадир монтажников')
  return false
}
export const canEditAttachment = (roles, fieldKey) => Boolean(ATTACHMENT_TABS[fieldKey]) && canEditTab(roles, ATTACHMENT_TABS[fieldKey])
/** Кто может менять состав команды: менеджер — всё, бригадир — монтажников. */
export const canEditTeamField = (roles = [], field) => isManager(roles) || (field === 'installers' && roles.includes('Бригадир монтажников'))

/**
 * Какие из изменённых полей сотруднику менять нельзя (кроме этапа и статуса — их проверяет stageChangeError).
 * allowedExtra — поля, разрешённые выбранным действием (например, назначение себя при «Взять в работу»).
 */
export function forbiddenFields(roles = [], changedKeys = [], allowedExtra = [], { previous = {}, next = {} } = {}) {
  if (isManager(roles)) return []
  return changedKeys.filter((key) => {
    if (['stage', 'stageStatus', ...ANYONE_FIELDS, ...SERVER_FIELDS, ...allowedExtra].includes(key)) return false
    // Изделия меняет менеджер; на «Производстве» можно подобрать только клей к уже заданным изделиям.
    if (key === 'items') return !(canEditTab(roles, 'Производство') && onlyGlueChanged(previous.items, next.items))
    if (key in ASSIGNMENT_FIELDS) return !canEditTeamField(roles, key)
    const tab = Object.keys(TAB_FIELDS).find((name) => TAB_FIELDS[name].includes(key))
    return !(tab && canEditTab(roles, tab))
  })
}
