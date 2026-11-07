import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownUp, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, Clock3, Download, FileText, Hammer, LayoutDashboard, MapPin,
  MoreHorizontal, PenTool, Plus, Search, Settings2, Sparkles, Users, X, Copy, Phone, Printer,
  CircleAlert, Inbox,
} from 'lucide-react'
import SketchEditor from './sketch/SketchEditor.jsx'
import { SketchPreview } from './sketch/SketchShapes.jsx'
import DxfPreview from './dxf/DxfPreview.jsx'
import SearchSelect from './components/SearchSelect.jsx'
import InstallationDates from './components/InstallationDates.jsx'
import UserSwitcher, { UserPicker, initialsOf, rolesText } from './components/UserSwitcher.jsx'
import EmployeesView from './components/EmployeesView.jsx'
import LoginPage from './components/LoginPage.jsx'
import AccountView from './components/AccountView.jsx'
import HistoryLines from './components/HistoryLines.jsx'
import { describeEvent, isVisibleEvent } from './historyFields.js'
import CalendarView from './components/CalendarView.jsx'
import CommentsCard from './components/CommentsCard.jsx'
import DecorGlues from './components/DecorGlues.jsx'
import FurnitureDirectory from './components/FurnitureDirectory.jsx'
import { CompanyField, MakerField, MakerPhoneField } from './components/FurnitureFields.jsx'
import Notifications from './components/Notifications.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import RequestsView from './components/RequestsView.jsx'
import MonthStats from './components/MonthStats.jsx'
import { ItemsEditor, ItemsList } from './components/ProcessItems.jsx'
import { LEGACY_ITEM_FIELDS, cleanItems, emptyItem, itemsSearchText, materialsOf, processItems, productsLabel } from './processItems.js'
import { DECOR_GLUE_SEEDS } from './decorGlues.js'
import { Link, useLocation, useNavigate } from 'react-router'
import { CONSTRUCTOR_MATERIALS } from './requests.js'
import Popover, { MenuItem } from './components/Popover.jsx'
import { ColumnsButton, DEFAULT_COLUMNS, EMPTY_FILTERS, FiltersButton, HowItWorks, ListMenu, SelectionBar, activeFilterCount, applyFilters, createdKeyOf, nextDateOf } from './components/ListControls.jsx'
import { ASSIGNMENT_FIELDS as ASSIGNMENT_ROLE, INSTALLATION_PHOTOS, NOT_READY, READY, ROLES, STAGES, STAGE_OWNERS, STATUS_STAGES, TAKE_STEPS, assignedNames, availableActions, canEditTab as canEditTabFor, canEditTeamField, isManager, stageLabel, stageTone, statusOf } from './permissions.js'
import { downloadProcessesCsv } from './exportCsv.js'
import { formatRussianPhone, handleRussianPhoneKeyDown } from './phone.js'
import './workflow.css'

// Демо-процессы для статической версии (GitHub Pages).
const initialOrders = [
  { id: '1656', client: 'Анна Смирнова', items: [{ product: 'Столешница для кухни', material: 'Кварцевый агломерат', decor: 'Calacatta Gold', glue: 'A-White' }, { product: 'Столешница для ванной', material: 'Акрил', decor: 'Pure White', glue: 'S-White' }], stage: 'Замер', stageStatus: 'Готов', manager: 'Мария К.', surveyor: 'Андрей С.', phoneContacts: [{ label: 'Клиент', phone: '+7 (912) 345-67-89' }], addressCity: 'Екатеринбург', addressStreet: 'Белинского', addressHouse: '86' },
  { id: '1655', client: 'Дмитрий Волков', items: [{ product: 'Столешница + остров', material: 'Акрил', decor: 'Pure White', glue: '' }], stage: 'Проектирование', stageStatus: 'Не готов', manager: 'Мария К.', technologist: 'Игорь Т.', phoneContacts: [{ label: 'Клиент', phone: '+7 (912) 420-18-35' }], addressCity: 'Екатеринбург', addressStreet: 'Малышева', addressHouse: '51' },
  { id: '1654', client: 'Елена Кузнецова', items: [{ product: 'Подоконник', material: 'HPL (Компакт)', decor: 'Slate Grey', glue: '' }], stage: 'Фрезеровка/Распил', stageStatus: 'Не готов', manager: 'Алексей Р.', cncOperator: 'Пётр Ч.', phoneContacts: [{ label: 'Клиент', phone: '+7 (912) 634-09-20' }], addressCity: 'Берёзовский', addressStreet: 'Гагарина', addressHouse: '12' },
  { id: '1653', client: 'Игорь Павлов', items: [{ product: 'Столешница для кухни', material: 'Кварцевый агломерат', decor: 'Noble Grey', glue: '' }], stage: 'Произведено', stageStatus: null, manager: 'Мария К.', phoneContacts: [{ label: 'Клиент', phone: '+7 (912) 988-31-05' }], addressCity: 'Екатеринбург', addressStreet: 'Шейнкмана', addressHouse: '111' },
  { id: '1652', client: 'Ольга Морозова', items: [{ product: 'Столешница + фартук', material: 'Акрил', decor: 'Nordic White', glue: '' }], stage: 'Монтаж', stageStatus: 'Не готов', manager: 'Алексей Р.', installationForeman: 'Дмитрий О.', installers: ['Сергей М.'], phoneContacts: [{ label: 'Клиент', phone: '+7 (912) 550-21-63' }], addressCity: 'Екатеринбург', addressStreet: 'Луначарского', addressHouse: '33' },
  { id: '1651', client: 'Сергей Иванов', items: [{ product: 'Столешница для ванной', material: 'Кварцевый агломерат', decor: 'Concrete Light', glue: '' }], stage: 'Новый заказ', stageStatus: null, needsData: true, needsDataNote: 'Нет телефона клиента', manager: 'Мария К.', phoneContacts: [], addressCity: 'Екатеринбург', addressStreet: 'Сакко и Ванцетти', addressHouse: '44' },
]
const STORAGE_KEY = 'aquastone-processes-v2'
const EMPLOYEE_STORAGE_KEY = 'aquastone-employees-v2'
const CATALOG_STORAGE_KEY = 'aquastone-catalogs-v1'
const CATALOGS = [
  { kind: 'glue', title: 'Клеи', hint: 'Список для поля «Клей» в процессе.', placeholder: 'Например, A-White' },
  { kind: 'sanding', title: 'Финальная шлифовка', hint: 'Список для поля «Финальная шлифовка».', placeholder: 'Например, Шкурка 400' },
]
const initialCatalogs = {
  glue: ['A-White', 'N-White', 'S-White', 'L-Peanut', 'C-Onyx'].map((name, i) => ({ id: 'demo-glue-' + i, name })),
  sanding: ['Шкурка 220', 'Шкурка 320', 'Шкурка 400', 'Черепашка 100', 'Черепашка 200'].map((name, i) => ({ id: 'demo-sanding-' + i, name })),
}
/** Названия из справочника, отсортированные «по-человечески»: Шкурка 220 < Шкурка 1000. */
const catalogNames = (items = []) => items.map((item) => item.name).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' }))
const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
const initialEmployees = [
  { id: 'demo-director', name: 'Директор', roles: ['Директор'], active: true },
  { id: 'demo-manager-maria', name: 'Мария К.', roles: ['Менеджер'], active: true },
  { id: 'demo-manager-alexey', name: 'Алексей Р.', roles: ['Менеджер'], active: true },
  { id: 'demo-surveyor-andrey', name: 'Андрей С.', roles: ['Замерщик'], active: true },
  { id: 'demo-technologist-igor', name: 'Игорь Т.', roles: ['Технолог', 'Монтажник'], active: true },
  { id: 'demo-cnc-petr', name: 'Пётр Ч.', roles: ['ЧПУ'], active: true },
  { id: 'demo-finisher-oleg', name: 'Олег З.', roles: ['Обработчик'], active: true },
  { id: 'demo-installer-sergey', name: 'Сергей М.', roles: ['Монтажник'], active: true },
  { id: 'demo-foreman-dmitry', name: 'Дмитрий О.', roles: ['Бригадир монтажников', 'Монтажник'], active: true },
]
const USER_STORAGE_KEY = 'aquastone-user-v1'
// Если сессия закончилась, любой запрос к API вернёт 401 — тогда показываем страницу входа.
if (typeof window !== 'undefined' && !window.__aquastoneFetchPatched) {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    const url = String(args[0]?.url || args[0] || '')
    if (response.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('aquastone-unauthorized'))
    return response
  }
  window.__aquastoneFetchPatched = true
}
/** Директор может всё, что может менеджер. */
const withDirectorRights = (roles) => (roles.includes('Директор') && !roles.includes('Менеджер') ? [...roles, 'Менеджер'] : roles)
/** Сотрудник — человек со списком ролей. */
const hasRole = (employee, role) => Boolean(employee?.roles?.includes(role))
/** Активные сотрудники с ролями в привычном порядке, по алфавиту. */
const normalizeEmployees = (list) => (Array.isArray(list) ? list : [])
  .filter((item) => item.active !== false && String(item.name || '').trim())
  .map((item) => ({ ...item, roles: ROLES.filter((role) => (item.roles || []).includes(role)) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
/** Цвет аватарки — по имени, чтобы у человека он был всегда один. */
const AVATAR_TONES = ['blue', 'violet', 'orange', 'green', 'teal', 'red']
const avatarTone = (name = '') => AVATAR_TONES[[...String(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_TONES.length]
/** Дата ГГГГ-ММ-ДД по-русски: «12 октября 2026 г.». */
const formatDay = (key) => (key ? new Date(String(key).slice(0, 10) + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
/** Заполненность замера — по настоящим полям вкладки «Замер». */
function surveyProgress(order) {
  const checks = [
    ['дата замера', Boolean(order.surveyDate)],
    ['адрес', Boolean(order.addressCity && order.addressStreet && order.addressHouse)],
    ['тип дома', Boolean(order.houseType)],
    ['этаж и лифт', order.houseType === 'Частный' || (String(order.floor ?? '') !== '' && typeof order.hasElevator === 'boolean')],
    ['размеры или чертёж', Boolean(order.measurements || order.surveySketch?.elements?.length)],
    ['раковина', Boolean(order.sinkType)],
    ['смеситель', Boolean(order.mixerPosition && order.mixerPosition !== 'н/д')],
  ]
  const missing = checks.filter(([, done]) => !done).map(([label]) => label)
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing }
}
/** Дата создания процесса для таблицы (см. createdKeyOf). */
const createdDateOf = (order) => {
  const key = createdKeyOf(order)
  if (!key) return null
  const date = new Date(key + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return null
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return {
    label: date.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }),
    full: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}
// ---------- Адреса разделов (React Router) ----------
// Раздел и открытый процесс живут в адресе страницы (/calendar, /processes/1702), поэтому обновление страницы,
// кнопки «назад/вперёд» браузера и скопированная ссылка ведут на тот же экран.
export const VIEW_PATHS = { 'Процессы': '/processes', 'Обзор': '/overview', 'Календарь': '/calendar', 'Заявки': '/requests', 'Сотрудники': '/employees', 'Справочники': '/catalogs', 'Кабинет': '/account' }
const materialsLabel = (order) => materialsOf(order).join(', ')
const PATH_VIEWS = Object.fromEntries(Object.entries(VIEW_PATHS).map(([view, path]) => [path.slice(1), view]))
const decodePart = (part) => { try { return decodeURIComponent(part) } catch { return part } }
/** /processes/1702 → { view: 'Процессы', processId: '1702' }; /requests/5 → { view: 'Заявки', requestId: 5 }; known: false — такого адреса нет. */
function parsePath(pathname) {
  const [slug = '', id = '', extra] = pathname.replace(/^\/+|\/+$/g, '').split('/').map(decodePart)
  const view = PATH_VIEWS[slug]
  if (!view || extra !== undefined) return { view: 'Процессы', known: false }
  if (view === 'Процессы') return { view, processId: id || null, known: true }
  if (view === 'Заявки') return { view, requestId: /^\d+$/.test(id) ? Number(id) : null, known: !id || /^\d+$/.test(id) }
  return { view, known: !id }
}
/** Базовый путь сайта: «/» локально, «/имя-репозитория» на GitHub Pages. */
export const basePath = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
const processPath = (id) => `/processes/${encodeURIComponent(id)}`
/** Старые ссылки с решёткой (#/process/1702, #/calendar) → новые адреса. */
function legacyHashPath(hash) {
  const [slug, id] = hash.replace(/^#\/?/, '').split('/')
  if (slug === 'process' && id) return processPath(decodePart(id))
  const legacy = { processes: '/processes', overview: '/overview', calendar: '/calendar', requests: '/requests', employees: '/employees', catalogs: '/catalogs', account: '/account' }[slug]
  return legacy ? legacy + (slug === 'requests' && id ? `/${id}` : '') : null
}

const readStored = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function localDateKey(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') }

/** Скопировать текст в буфер обмена (со старым способом для браузеров без Clipboard API). */
async function copyText(text, message, flash) {
  try { await navigator.clipboard.writeText(text) } catch {
    const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'
    document.body.appendChild(area); area.select(); try { document.execCommand('copy') } finally { area.remove() }
  }
  flash(message)
}

// Служебные поля процесса: их не сравниваем и не отправляем при сохранении.
const SERVICE_FIELDS = new Set(['id', 'version', 'createdAt', 'updatedAt', 'completedAt'])
/** Поля, которыми next отличается от base (удалённое поле — null). */
function changedProcessFields(base = {}, next = {}) {
  const changes = {}
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (SERVICE_FIELDS.has(key)) continue
    if (JSON.stringify(base[key] ?? null) !== JSON.stringify(next[key] ?? null)) changes[key] = next[key] ?? null
  }
  return changes
}
/**
 * Версия процесса, с которой началось редактирование. Пока редактирования нет — следует за свежими данными,
 * во время редактирования — замирает. После конфликта вызовите reset(process), чтобы сохранить поверх.
 */
function useEditBase(order, editing) {
  const ref = useRef(order)
  if (!editing) ref.current = order
  return { get: () => ref.current, reset: (process) => { if (process) ref.current = process } }
}

// Вкладки списка: все процессы, этапы по порядку и отметка «Нужны данные».
const stages = ['Все процессы', ...STAGES, 'Нужны данные']
const stageTabMatches = (order, tab) => tab === 'Все процессы' || (tab === 'Нужны данные' ? Boolean(order.needsData) : order.stage === tab)
const getPhoneContacts = (order = {}) => (Array.isArray(order.phoneContacts) ? order.phoneContacts : [])
function PhoneContactsEditor({ contacts, onChange }) {
  const update = (index, patch) => onChange(contacts.map((contact, itemIndex) => itemIndex === index ? { ...contact, ...patch } : contact))
  return <span className="phone-contacts-editor">{contacts.map((contact, index) => <span className="phone-contact-row" key={index}><input aria-label="Кто контакт" value={contact.label} onChange={(event) => update(index, { label: event.target.value })} placeholder="Клиент, прораб, дизайнер…" /><input aria-label="Телефон контакта" type="tel" inputMode="tel" placeholder="+7 (999) 888-77-66" value={formatRussianPhone(contact.phone)} onChange={(event) => update(index, { phone: formatRussianPhone(event.target.value) })} onKeyDown={(event) => handleRussianPhoneKeyDown(event, contact.phone, (phone) => update(index, { phone }))} /><button type="button" className="contact-remove" aria-label="Удалить телефон" onClick={() => onChange(contacts.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></span>)}<button type="button" className="contact-add" onClick={() => onChange([...contacts, { label: '', phone: '' }])}><Plus size={14} />Добавить телефон</button></span>
}
function PhoneContactsList({ contacts }) {
  return contacts.length ? <span className="phone-contacts-list">{contacts.map((contact, index) => <span className="phone-contact-value" key={index}><small>{contact.label || 'Контакт'}</small>{contact.phone ? <a className="phone-link" href={'tel:' + formatRussianPhone(contact.phone).replace(/[^\d+]/g, '')}>{formatRussianPhone(contact.phone)}</a> : 'Не указан'}</span>)}</span> : 'Не указаны'
}
function formatProcessAddress(order) {
  const parts = [
    order.addressCity,
    order.addressStreet && 'ул. ' + order.addressStreet,
    order.addressHouse && 'д. ' + order.addressHouse,
  ]
  if (order.houseType !== 'Частный') {
    parts.push(order.entrance && 'п. ' + order.entrance)
    parts.push(order.floor && 'эт. ' + order.floor)
    parts.push(order.addressApartment && 'кв. ' + order.addressApartment)
  }
  return parts.filter(Boolean).join(', ') || 'Адрес не указан'
}
// stageTone — из permissions.js (общая схема этапов).

function App() {
  const [orders, setOrders] = useState(() => { const stored = readStored(STORAGE_KEY, initialOrders); return Array.isArray(stored) ? stored : [] })
  const [employees, setEmployees] = useState(() => staticDemo ? normalizeEmployees(readStored(EMPLOYEE_STORAGE_KEY, initialEmployees)) : [])
  const [storedUser, setStoredUser] = useState(() => readStored(USER_STORAGE_KEY, null))
  const [activeStage, setActiveStage] = useState('Все процессы')
  const [query, setQuery] = useState('')
  // Раздел и открытый процесс определяет адрес страницы.
  const location = useLocation()
  const navigate = useNavigate()
  const route = useMemo(() => parsePath(location.pathname), [location.pathname])
  const currentPath = useRef(location.pathname)
  currentPath.current = location.pathname
  const view = route.view
  // Несколько переходов в одном действии (например, «закрыть процесс» и «открыть раздел») сливаются в один —
  // в истории браузера остаётся только последний адрес.
  const pendingNav = useRef(null)
  const go = (path, { replace = false } = {}) => {
    const first = !pendingNav.current
    pendingNav.current = { path, replace: replace || Boolean(pendingNav.current?.replace) }
    if (first) queueMicrotask(() => { const next = pendingNav.current; pendingNav.current = null; if (next && next.path !== currentPath.current) navigate(next.path, { replace: next.replace }) })
  }
  const setView = (next) => go(VIEW_PATHS[next] || '/processes')
  const [showNew, setShowNew] = useState(false)
  // Заявки из конструктора (только менеджер и директор); newPrefill — данные заявки для формы нового процесса.
  const [requests, setRequests] = useState([])
  const [newPrefill, setNewPrefill] = useState(null)
  const [toast, setToast] = useState('')
  const [sortNewest, setSortNewest] = useState(true)
  // Настройки списка процессов: фильтры и колонки запоминаются в этом браузере.
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...readStored('aquastone-list-filters-v1', {}) }))
  // v2: добавлена колонка «Дата создания». Сохранённые раньше настройки (v1) переносим и включаем новую колонку.
  const [columns, setColumns] = useState(() => { const stored = readStored('aquastone-list-columns-v2', null) ?? (Array.isArray(readStored('aquastone-list-columns-v1', null)) ? [...readStored('aquastone-list-columns-v1', []), 'created'] : DEFAULT_COLUMNS); return Array.isArray(stored) ? DEFAULT_COLUMNS.filter((key) => stored.includes(key)) : DEFAULT_COLUMNS })
  const [checked, setChecked] = useState(() => new Set())
  const [page, setPage] = useState(1)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dbStatus, setDbStatus] = useState(staticDemo ? 'demo' : 'connecting')
  // Вход: в серверной версии — по логину и паролю; в демо-версии (GitHub Pages) — выбор сотрудника.
  const [auth, setAuth] = useState(() => (staticDemo ? { status: 'demo', user: null } : { status: 'checking', user: null }))
  const [catalogs, setCatalogs] = useState(() => staticDemo ? readStored(CATALOG_STORAGE_KEY, initialCatalogs) : { glue: [], sanding: [] })
  // Справочник «Мебельщики»: компании и их мебельщики (для полей процесса и раздела «Справочники»).
  const [furniture, setFurniture] = useState(() => (staticDemo ? readStored('aquastone-furniture-v1', []) : []))
  // «Клей по декорам» — подсказки декоров и клея в изделиях процесса.
  const [decorGlues, setDecorGlues] = useState(() => (staticDemo ? DECOR_GLUE_SEEDS : []))
  useEffect(() => { if (staticDemo) { try { localStorage.setItem('aquastone-furniture-v1', JSON.stringify(furniture)) } catch { /* браузер без хранилища */ } } }, [furniture])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)) }, [orders])
  useEffect(() => { try { localStorage.setItem('aquastone-list-filters-v1', JSON.stringify(filters)) } catch { /* браузер без хранилища */ } }, [filters])
  useEffect(() => { try { localStorage.setItem('aquastone-list-columns-v2', JSON.stringify(columns)) } catch { /* браузер без хранилища */ } }, [columns])
  // Ctrl+K / ⌘K — быстрый поиск из любого места.
  useEffect(() => {
    const onKey = (event) => { if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K' || event.code === 'KeyK')) { event.preventDefault(); setPaletteOpen((open) => !open) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (staticDemo) localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employees)) }, [employees])
  useEffect(() => { if (staticDemo) localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalogs)) }, [catalogs])
  useEffect(() => { try { if (storedUser) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(storedUser)) } catch { /* браузер без хранилища */ } }, [storedUser])
  useEffect(() => {
    if (staticDemo) return undefined
    let active = true
    let timer
    const check = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!active) return
        if (response.ok) { setAuth({ status: 'authed', user: await response.json() }); return }
        setAuth({ status: response.status === 401 ? 'anon' : 'offline', user: null })
        if (response.status !== 401) timer = window.setTimeout(check, 5000)
      } catch { if (active) { setAuth({ status: 'offline', user: null }); timer = window.setTimeout(check, 5000) } }
    }
    check()
    const onUnauthorized = () => setAuth({ status: 'anon', user: null })
    window.addEventListener('aquastone-unauthorized', onUnauthorized)
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('aquastone-unauthorized', onUnauthorized) }
  }, [])
  useEffect(() => {
    if (staticDemo) { setDbStatus('demo'); return }
    if (auth.status !== 'authed') return undefined
    let active = true
    let timer
    const syncWithDatabase = async () => {
      try {
        const health = await fetch('/api/health')
        if (!health.ok) throw new Error('PostgreSQL недоступен')
        // Процессы, сотрудники и справочники загружаем параллельно.
        const [response, employeeResponse, catalogResponse, furnitureResponse, decorGlueResponse] = await Promise.all(['/api/processes', '/api/employees', '/api/catalogs', '/api/furniture', '/api/decor-glues'].map((url) => fetch(url)))
        if (response.status === 401) { window.dispatchEvent(new Event('aquastone-unauthorized')); return }
        if (!response.ok || !employeeResponse.ok || !catalogResponse.ok) throw new Error('Не удалось загрузить данные')
        const [remoteOrders, remoteEmployees, remoteCatalogs] = await Promise.all([response.json(), employeeResponse.json(), catalogResponse.json()])
        const remoteFurniture = furnitureResponse.ok ? await furnitureResponse.json() : null
        if (decorGlueResponse.ok && active) setDecorGlues(await decorGlueResponse.json())
        // Раздел «Заявки» доступен только менеджеру и директору — остальным запрос не отправляем.
        if (isManager(withDirectorRights(auth.user?.roles || []))) {
          const requestResponse = await fetch('/api/requests')
          if (requestResponse.ok && active) setRequests(await requestResponse.json())
        }
        if (active) {
          // Ответ мог прийти позже, чем сохранение процесса на этой вкладке: более свежую версию не перетираем.
          const fresher = (remote, local) => (local && Number(local.version) > Number(remote.version) ? local : remote)
          setOrders((current) => { const byId = new Map(current.map((order) => [order.id, order])); return remoteOrders.map((order) => fresher(order, byId.get(order.id))) })
          setEmployees(normalizeEmployees(remoteEmployees)); setCatalogs(remoteCatalogs); if (remoteFurniture) setFurniture(remoteFurniture); setDbStatus('connected')
          setSelected((item) => { if (!item) return item; const remote = remoteOrders.find((order) => order.id === item.id); return remote ? fresher(remote, item) : item })
        }
      } catch {
        if (active) setDbStatus('offline')
      }
    }
    syncWithDatabase()
    // Изменения коллег подтягиваем сами: раз в 20 секунд, пока вкладка открыта, и сразу при возврате на неё.
    let lastSync = Date.now()
    const refresh = () => { if (active && !document.hidden) { lastSync = Date.now(); syncWithDatabase() } }
    timer = window.setInterval(() => {
      if (!active) return
      if (dbStatus !== 'connected') syncWithDatabase()
      else if (Date.now() - lastSync >= 20000) refresh()
    }, 5000)
    const onVisible = () => { if (dbStatus === 'connected' && Date.now() - lastSync > 3000) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [dbStatus, auth.status, refreshKey])

  // Кто сейчас работает. Серверная версия: тот, кто вошёл (роли — свежие из справочника).
  // Демо-версия: сотрудник, выбранный на этом устройстве.
  const employeesLoaded = staticDemo || dbStatus === 'connected'
  const activeUser = staticDemo
    ? (storedUser ? (employees.find((employee) => String(employee.id) === String(storedUser.id)) || employees.find((employee) => employee.name === storedUser.name) || null) : null)
    : (auth.user ? { ...auth.user, ...(employees.find((employee) => String(employee.id) === String(auth.user.id)) || {}) } : null)
  const needsUserPick = staticDemo && employeesLoaded && employees.length > 0 && !activeUser
  const currentUser = activeUser
    ? { id: activeUser.id, name: activeUser.name, roles: activeUser.roles || [], login: activeUser.login || auth.user?.login }
    : staticDemo && employeesLoaded && !employees.length ? { id: null, name: 'Без имени', roles: ['Директор'] } : { id: storedUser?.id ?? null, name: storedUser?.name || '—', roles: storedUser?.roles || ['Менеджер'] }
  // Права складываются из всех ролей человека; директор может всё, что менеджер.
  const roles = withDirectorRights(currentUser.roles?.length ? currentUser.roles : ['Менеджер'])
  const selectUser = (employee) => setStoredUser({ id: employee.id, name: employee.name, roles: employee.roles })
  const openAccount = () => { setView('Кабинет'); setSelected(null) }
  const logout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* сеть недоступна — всё равно выходим */ }
    setAuth({ status: 'anon', user: null }); setOrders([]); setEmployees([]); setRequests([]); setSelected(null); setView('Процессы'); setDbStatus('connecting')
  }
  // После входа остаёмся на разделе из адреса (например, по присланной ссылке на процесс).
  const onLoggedIn = (user) => { setAuth({ status: 'authed', user }); setDbStatus('connecting') }

  const todayKey = localDateKey()
  const newRequests = requests.filter((request) => request.status === 'Новая').length
  // Чужая роль сюда не попадёт: если раздел недоступен (сменили роли), возвращаем к процессам.
  useEffect(() => { if (view === 'Заявки' && (staticDemo || (auth.status === 'authed' && !isManager(roles)))) go('/processes', { replace: true }) }, [view, roles.join(), auth.status])
  const installationsToday = orders.filter((order) => order.stage !== 'Завершён' && [...(Array.isArray(order.installationDates) ? order.installationDates : []), order.installationDate].some((d) => d && String(d).slice(0, 10) === todayKey)).length
  const filtered = useMemo(() => applyFilters(orders, filters, currentUser.name)
    .filter((item) => stageTabMatches(item, activeStage))
    .filter((item) => `${item.id} ${item.client} ${item.furnitureCompany || ''} ${item.furnitureMaker || ''} ${item.furnitureMakerPhone || ''} ${getPhoneContacts(item).map((contact) => `${contact.label} ${contact.phone}`).join(' ')} ${itemsSearchText(item)} ${formatProcessAddress(item)}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sortNewest ? Number(b.id) - Number(a.id) : Number(a.id) - Number(b.id)), [orders, activeStage, query, sortNewest, filters, currentUser.name])
  // Постраничный вывод: 25 процессов на странице; при смене фильтров — на первую.
  const PAGE_SIZE = 25
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [activeStage, query, filters, sortNewest])
  // Отмеченные галочками — только среди видимых по фильтру.
  const checkedVisible = filtered.filter((order) => checked.has(order.id))
  const pageAllChecked = pageItems.length > 0 && pageItems.every((order) => checked.has(order.id))
  const pageSomeChecked = pageItems.some((order) => checked.has(order.id))
  const toggleChecked = (id) => setChecked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const togglePage = () => setChecked((current) => { const next = new Set(current); for (const order of pageItems) { if (pageAllChecked) next.delete(order.id); else next.add(order.id) } return next })
  const exportOrders = (list) => { if (!list.length) { flash('Нет процессов для выгрузки — измените фильтр или поиск'); return } downloadProcessesCsv(list); flash(`Выгружено процессов: ${list.length}`) }
  const resetListFilters = () => { setFilters(EMPTY_FILTERS); setQuery(''); setActiveStage('Все процессы') }
  const canResetList = activeFilterCount(filters) > 0 || Boolean(query) || activeStage !== 'Все процессы'

  // Открытый процесс — из адреса /processes/:id. Пока процессы грузятся, страница процесса появится после загрузки.
  const selected = route.processId ? orders.find((item) => String(item.id) === route.processId) || null : null
  // Обновлённые данные процесса приходят через orders, поэтому функциональная форма ничего не делает.
  const setSelected = (value) => {
    if (typeof value === 'function') return
    if (value) go(processPath(value.id))
    else if (route.processId && !pendingNav.current) go('/processes') // если в том же действии выбран другой раздел — он важнее
  }
  const openProcessById = (id) => go(processPath(id))
  useEffect(() => {
    // Старые ссылки вида …/#/process/1702 и …/#/calendar.
    const legacy = location.hash.startsWith('#/') ? legacyHashPath(location.hash) : null
    if (legacy) { navigate(legacy, { replace: true }); return }
    // «/» и неизвестные адреса — на список процессов.
    if (!route.known) navigate('/processes', { replace: true })
  }, [location.pathname, location.hash])
  useEffect(() => {
    // Процессы загружены, а такого номера нет (удалён или ссылка с ошибкой) — показываем список.
    if (route.processId && !selected && (dbStatus === 'connected' || dbStatus === 'demo')) {
      navigate('/processes', { replace: true })
      flash(`Процесс #${route.processId} не найден`)
    }
  }, [route.processId, Boolean(selected), dbStatus])

  const toastTimer = useRef(0)
  const flash = (message, duration = 2600) => { setToast(message); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), duration) }
  /**
   * Сохранить процесс. На сервер уходят только поля, которые отличаются от base —
   * версии процесса, с которой сотрудник начал редактирование. Если те же поля успели изменить другие,
   * сервер отвечает конфликтом: показываем актуальные данные, а черновик остаётся открытым.
   */
  const updateOrder = async (order, base = orders.find((item) => item.id === order.id) || order) => {
    const applySaved = (saved) => {
      setOrders((items) => items.map((item) => item.id === saved.id ? saved : item))
      setSelected((item) => item?.id === saved.id ? saved : item)
    }
    try {
      let saved = order
      if (!staticDemo) {
        // Пока идёт первая загрузка, сохранять можно: сервер сам проверит версию. Не даём сохранять только без связи.
        if (dbStatus === 'offline') throw new Error('PostgreSQL недоступен. Изменения не сохранены.')
        const changes = changedProcessFields(base, order)
        if (!Object.keys(changes).length) return base
        const response = await fetch(`/api/processes/${encodeURIComponent(order.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes, baseVersion: base.version }),
        })
        const result = await response.json()
        if (!response.ok) {
          if (response.status === 503) setDbStatus('offline')
          if (response.status === 401) window.dispatchEvent(new Event('aquastone-unauthorized'))
          if (response.status === 409 && result.process) applySaved(result.process)
          const error = new Error(result.error || 'Не удалось сохранить процесс.')
          error.process = result.process
          throw error
        }
        saved = result
      }
      applySaved(saved)
      return saved
    } catch (error) {
      flash(error.message || 'Не удалось сохранить изменения.', error.process ? 6000 : undefined)
      throw error
    }
  }
  const createOrder = async (order) => {
    if (staticDemo) {
      setOrders((items) => [order, ...items])
      setShowNew(false)
      setSelected(order)
      flash(`Процесс #${order.id} сохранён в этом браузере`)
      return
    }
    if (dbStatus !== 'connected') { flash('PostgreSQL пока недоступен — проверьте сервер и пароль в .env'); return }
    try {
      const response = await fetch('/api/processes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) })
      const saved = await response.json()
      if (!response.ok) throw new Error(saved.error || 'Не удалось создать процесс')
      setOrders((items) => [saved, ...items])
      setShowNew(false)
      setSelected(saved)
      flash(`Процесс #${saved.id} создан и сохранён в PostgreSQL`)
      return saved
    } catch (error) { flash(error.message) }
  }
  /** Заявка: сменить статус / комментарий / привязать созданный процесс. */
  const updateRequest = async (request, patch) => {
    try {
      const response = await fetch(`/api/requests/${request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const saved = await response.json()
      if (!response.ok) throw new Error(saved.error || 'Не удалось обновить заявку')
      setRequests((items) => items.map((item) => (item.id === saved.id ? saved : item)))
      return saved
    } catch (error) { flash(error.message); throw error }
  }
  /** «Создать процесс» из заявки: форма нового процесса с клиентом, телефоном, материалом и декором. */
  const createFromRequest = (request) => {
    const material = CONSTRUCTOR_MATERIALS[request.project.material] || ''
    setNewPrefill({ requestId: request.id, client: request.source === 'client' ? request.clientName : '', phone: request.clientPhone || '', items: [{ product: String(request.project.form || '').startsWith('island') ? 'Столешница + остров' : 'Столешница для кухни', material, decor: request.project.decor || '', glue: '' }] })
    setShowNew(true)
  }
  const createProcess = async (order) => {
    const saved = await createOrder(order)
    if (saved && newPrefill?.requestId) {
      try { await updateRequest({ id: newPrefill.requestId }, { processNumber: saved.id }); flash(`Процесс #${saved.id} создан по заявке №${newPrefill.requestId}`) } catch { /* сообщение уже показано */ }
    }
    if (saved) setNewPrefill(null)
  }
  const openRequest = (id) => go(`/requests/${Number(id)}`)

  const reloadEmployees = async () => {
    try { const response = await fetch('/api/employees'); if (response.ok) setEmployees(normalizeEmployees(await response.json())) } catch { /* обновится при следующей синхронизации */ }
  }
  /** Регистрация сотрудника. В серверной версии возвращает { employee, credentials } — логин и пароль для передачи. */
  const addEmployee = async ({ name, roles: employeeRolesList }) => {
    if (staticDemo) {
      if (employees.some((employee) => employee.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) { flash('Сотрудник с таким именем уже есть — добавьте ему роль на его странице'); return false }
      const employee = { id: `demo-${Date.now()}`, name, roles: employeeRolesList, active: true }
      setEmployees((items) => normalizeEmployees([...items, employee]))
      flash('Сотрудник добавлен')
      return { employee }
    }
    try {
      const response = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, roles: employeeRolesList }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось зарегистрировать сотрудника')
      setEmployees((items) => normalizeEmployees([...items.filter((employee) => employee.id !== result.employee.id), result.employee]))
      return result
    } catch (error) { flash(error.message); return false }
  }
  /** Новый пароль (и логин, если его не было) — директор передаёт их сотруднику. */
  const issueCredentials = async (employee) => {
    try {
      const response = await fetch(`/api/employees/${employee.id}/credentials`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось выдать пароль')
      await reloadEmployees()
      return result.credentials
    } catch (error) { flash(error.message); return null }
  }

  /** Изменить роли или имя. При переименовании назначения в процессах переходят на новое имя. */
  const updateEmployee = async (employee, patch) => {
    const applyRename = (oldName, newName) => {
      if (!newName || oldName === newName) return
      const fields = ['manager', 'surveyor', 'technologist', 'cncOperator', 'finisher', 'installationForeman', 'installers']
      const rename = (order) => fields.reduce((next, field) => (Array.isArray(next[field]) ? (next[field].includes(oldName) ? { ...next, [field]: next[field].map((n) => (n === oldName ? newName : n)) } : next) : next[field] === oldName ? { ...next, [field]: newName } : next), order)
      setOrders((items) => items.map(rename))
      setSelected((item) => (item ? rename(item) : item))
      setStoredUser((user) => (user && String(user.id) === String(employee.id) ? { ...user, name: newName } : user))
    }
    if (staticDemo) {
      const updated = { ...employee, ...patch }
      setEmployees((items) => normalizeEmployees(items.map((item) => (item.id === employee.id ? updated : item))))
      applyRename(employee.name, patch.name)
      return true
    }
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить сотрудника')
      setEmployees((items) => normalizeEmployees(items.map((item) => (item.id === result.id ? result : item))))
      applyRename(employee.name, result.name)
      return true
    } catch (error) { flash(error.message); return false }
  }

  /** Добавить позицию в справочник; возвращает сохранённое название или false. */
  const addCatalogItem = async (kind, rawName) => {
    const name = String(rawName || '').replace(/\s+/g, ' ').trim()
    if (!name) return false
    const existing = (catalogs[kind] || []).find((item) => item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))
    if (existing) return existing.name
    if (staticDemo) {
      const item = { id: `demo-${kind}-${Date.now()}`, name }
      setCatalogs((current) => ({ ...current, [kind]: [...(current[kind] || []), item] }))
      flash(`«${name}» добавлен в справочник`)
      return name
    }
    try {
      const response = await fetch(`/api/catalogs/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось добавить позицию')
      setCatalogs((current) => ({ ...current, [kind]: [...(current[kind] || []).filter((item) => item.id !== result.id), result] }))
      flash(`«${result.name}» добавлен в справочник`)
      return result.name
    } catch (error) { flash(error.message); return false }
  }
  const removeCatalogItem = async (kind, item) => {
    try {
      if (!staticDemo) {
        const response = await fetch(`/api/catalogs/${kind}/${item.id}`, { method: 'DELETE' })
        if (!response.ok) throw new Error('Не удалось убрать позицию')
      }
      setCatalogs((current) => ({ ...current, [kind]: (current[kind] || []).filter((entry) => entry.id !== item.id) }))
    } catch (error) { flash(error.message) }
  }

  const deactivateEmployee = async (employee) => {
    if (staticDemo) {
      setEmployees((items) => items.filter((item) => item.id !== employee.id))
      flash('Сотрудник удалён')
      return true
    }
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' })
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не удалось удалить сотрудника') }
      setEmployees((items) => items.filter((item) => item.id !== employee.id))
      flash('Сотрудник удалён')
      return true
    } catch (error) { flash(error.message); return false }
  }


  if (!staticDemo && auth.status !== 'authed') {
    return auth.status === 'checking' ? <div className="login-screen" /> : <LoginPage onLoggedIn={onLoggedIn} databaseDown={auth.status === 'offline'} />
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" to="/processes">
        <span className="brand-mark"><span /></span><span className="brand-copy"><b>aqua<span>stone</span></b><small>WORKSPACE</small></span>
      </Link>
      <div className="workspace-switch"><div className="workspace-icon">A</div><div><b>Aquastone</b><small>Производство</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="main-nav">
        {[['Процессы', ClipboardList], ['Обзор', LayoutDashboard], ['Календарь', CalendarDays]].map(([label, Icon]) => <Link key={label} to={VIEW_PATHS[label]} className={`nav-item ${view === label ? 'active' : ''}`} aria-current={view === label ? 'page' : undefined}><Icon size={18} /><span>{label}</span>{label === 'Процессы' && <span className="nav-count">{orders.length}</span>}</Link>)}
        {isManager(roles) && !staticDemo && <Link to="/requests" className={`nav-item ${view === 'Заявки' ? 'active' : ''}`} aria-current={view === 'Заявки' ? 'page' : undefined}><Inbox size={18} /><span>Заявки</span>{newRequests > 0 && <span className="nav-count nav-badge-new" title="Новые заявки">{newRequests}</span>}</Link>}
        <Link to="/employees" className={`nav-item mobile-nav-item ${view === 'Сотрудники' ? 'active' : ''}`} aria-current={view === 'Сотрудники' ? 'page' : undefined}><Users size={18} /><span>Сотрудники</span></Link>
        <Link to="/catalogs" className={`nav-item mobile-nav-item ${view === 'Справочники' ? 'active' : ''}`} aria-current={view === 'Справочники' ? 'page' : undefined}><Settings2 size={18} /><span>Справочники</span></Link>
      </nav>
      <div className="nav-label nav-label-spaced">КОМАНДА</div>
      <nav className="secondary-nav" aria-label="Команда">
        <Link to="/employees" className={`nav-item ${view === 'Сотрудники' ? 'active' : ''}`} aria-current={view === 'Сотрудники' ? 'page' : undefined}><Users size={18} /><span>Сотрудники</span></Link>
        <Link to="/catalogs" className={`nav-item ${view === 'Справочники' ? 'active' : ''}`} aria-current={view === 'Справочники' ? 'page' : undefined}><Settings2 size={18} /><span>Справочники</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <UserSwitcher user={currentUser} employees={employees} onSelect={selectUser} authMode={!staticDemo} onOpenAccount={openAccount} onLogout={logout} />
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Рабочее пространство</span><ChevronRight size={14} /><b>{selected ? `Процесс ${selected.id}` : view}</b></div><div className={`db-status db-${dbStatus}`}><i />{dbStatus === 'connected' ? 'PostgreSQL подключён' : dbStatus === 'connecting' ? 'Подключение к БД…' : dbStatus === 'demo' ? 'Демо: хранение в браузере' : 'PostgreSQL недоступен'}</div><div className="top-actions"><button type="button" className="quick-search" onClick={() => setPaletteOpen(true)} aria-label="Быстрый поиск (Ctrl+K)"><Search size={15} /><span>Быстрый поиск</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd></button><Notifications user={currentUser} demo={staticDemo} onOpenProcess={openProcessById} onOpenRequest={openRequest} /><div className="top-divider" /><button type="button" className="top-user" onClick={openAccount} title={`${currentUser.name} · ${rolesText(currentUser.roles)} — личный кабинет`}><div className="avatar avatar-user">{initialsOf(currentUser.name)}</div><ChevronDown size={14} /></button></div></header>
      {selected ? <DetailPage furniture={furniture} decorGlues={decorGlues} order={selected} roles={roles} user={currentUser} employees={employees} catalogs={catalogs} onAddCatalogItem={addCatalogItem} onBack={() => setSelected(null)} onUpdate={updateOrder} flash={flash} /> : view === 'Процессы' ? <>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ПРОИЗВОДСТВО, В ОДНОМ МЕСТЕ</div><h1>Процессы <span className="heading-count">{orders.length}</span></h1><p>Все заказы на изготовление и монтаж в одном пространстве.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => exportOrders(filtered)}><ArrowDownUp size={16} />Экспорт отчёта</button>{roles.includes('Менеджер') && <button className="primary-button" onClick={() => { setNewPrefill(null); setShowNew(true) }}><Plus size={17} />Новый процесс</button>}</div></div>
        <div className="stat-grid"><StatCard label="Всего процессов" value={orders.length} detail="за всё время" icon={ClipboardList} tone="purple" /><StatCard label="В работе" value={orders.filter((o) => o.stage !== 'Завершён').length} detail="активных заказов" icon={Activity} tone="blue" /><StatCard label="Требуют внимания" value={orders.filter((o) => o.needsData).length} detail="нужно уточнить" icon={Clock3} tone="amber" /><StatCard label="Монтаж сегодня" value={installationsToday} detail="запланировано" icon={CalendarDays} tone="green" /></div>
        <section className="process-panel"><div className="panel-title-row"><div><h2>Все процессы</h2><p>Управляйте заказами на каждом этапе производства</p></div><ListMenu onRefresh={() => { setRefreshKey((k) => k + 1); flash('Список обновлён') }} onExport={() => exportOrders(filtered)} onReset={resetListFilters} canReset={canResetList} onHelp={() => setHelpOpen(true)} /></div>
          <div className="stage-tabs">{stages.map((stage) => <button key={stage} className={`stage-tab ${activeStage === stage ? 'selected' : ''}`} onClick={() => setActiveStage(stage)}>{stage}<span>{orders.filter((o) => stageTabMatches(o, stage)).length}</span></button>)}</div>
          <div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по процессу, заказчику или телефону..." /></div><div className="toolbar-actions"><button className="filter-button" onClick={() => setSortNewest((v) => !v)}><ArrowDownUp size={15} />{sortNewest ? 'Сначала новые' : 'Сначала старые'}</button><FiltersButton filters={filters} onChange={setFilters} orders={orders} /><ColumnsButton visible={columns} onChange={setColumns} /></div></div>
          {checkedVisible.length > 0 && <SelectionBar count={checkedVisible.length} onExport={() => exportOrders(checkedVisible)} onClear={() => setChecked(new Set())} />}
          <div className="table-wrap"><table><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Выбрать все на странице" checked={pageAllChecked} ref={(el) => { if (el) el.indeterminate = !pageAllChecked && pageSomeChecked }} onChange={togglePage} /></th><th>ПРОЦЕСС</th>{columns.includes('material') && <th>МАТЕРИАЛ И ДЕКОР</th>}{columns.includes('stage') && <th>ЭТАП</th>}{columns.includes('manager') && <th>У КОГО СЕЙЧАС</th>}{columns.includes('nextDate') && <th>СЛЕДУЮЩАЯ ДАТА</th>}{columns.includes('created') && <th>ДАТА СОЗДАНИЯ</th>}<th></th></tr></thead><tbody>{pageItems.map((order) => { const next = nextDateOf(order, todayKey); return <tr key={order.id} className={checked.has(order.id) ? 'row-checked' : ''} onClick={() => setSelected(order)}><td className="check-cell" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Выбрать процесс ${order.id}`} checked={checked.has(order.id)} onChange={() => toggleChecked(order.id)} /></td><td><div className="process-cell"><div className={`order-mark mark-${stageTone(order.stage)}`}><FileText size={17} /></div><div><b>#{order.id}</b><span>{order.client}</span><small>{productsLabel(order)}</small></div></div></td>{columns.includes('material') && <td>{(() => { const items = processItems(order); return <div className="material-cell">{items.slice(0, 2).map((item, i) => <div className="material-line" key={i}><b>{item.material || 'Не выбран'}</b><span><i className="decor-dot" />{item.decor || 'Декор не выбран'}</span></div>)}{items.length > 2 && <span className="more-items">+ ещё {items.length - 2}</span>}{!items.length && <span>Не указано</span>}</div> })()}</td>}{columns.includes('stage') && <td><StagePill order={order} compact /></td>}{columns.includes('manager') && <td>{(() => { const who = currentResponsible(order); return <div className="manager-cell"><div className={`avatar avatar-${avatarTone(who.names.join())}`}>{who.names.length > 1 ? who.names.length : initialsOf(who.names[0])}</div><span className="responsible-text"><span>{who.names.join(', ') || '—'}</span><small>{who.role}</small></span></div> })()}</td>}{columns.includes('nextDate') && <td><div className={'date-cell' + (next?.tone ? ' ' + next.tone : '')}><CalendarDays size={15} /><span className={next ? '' : 'muted'}>{next ? next.label : '—'}</span></div></td>}{columns.includes('created') && <td>{(() => { const created = createdDateOf(order); return <div className="date-cell created-cell" title={created ? created.full : ''}><span className={created ? '' : 'muted'}>{created ? created.label : '—'}</span></div> })()}</td>}<td><button className="row-more" onClick={(e) => { e.stopPropagation(); setSelected(order) }} aria-label={`Открыть процесс ${order.id}`}><MoreHorizontal size={19} /></button></td></tr> })}</tbody></table>
          {filtered.length === 0 && <div className="empty-state">{orders.length === 0 ? <FileText size={24} /> : <Search size={24} />}<b>{orders.length === 0 ? 'Пока нет процессов' : 'Ничего не найдено'}</b><span>{orders.length === 0 ? 'Создайте первый процесс и назначьте ему внутренний номер.' : 'Попробуйте изменить запрос или выбрать другой этап.'}</span></div>}</div>
          <div className="table-footer"><span>Показано <b>{filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{(currentPage - 1) * PAGE_SIZE + pageItems.length}</b> из <b>{filtered.length}</b> процессов</span><div><button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>← Предыдущая</button><button className="page-number" aria-current="page">{currentPage}{pageCount > 1 ? ` / ${pageCount}` : ''}</button><button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Следующая →</button></div></div>
        </section>
        <div className="bottom-note"><Sparkles size={15} /><span>Каждый заказ проходит все этапы — от первого замера до установки.</span><button onClick={() => setHelpOpen(true)}>Как это работает <ArrowRight size={14} /></button></div>
      </> : view === 'Заявки' && isManager(roles) ? <RequestsView requests={requests} openId={route.requestId} onOpenChange={(id) => go(id ? `/requests/${id}` : '/requests')} onUpdate={updateRequest} onCreateProcess={createFromRequest} onOpenProcess={openProcessById} /> : <OtherView furniture={furniture} onFurnitureChange={setFurniture} view={view} orders={orders} employees={employees} roles={roles} user={currentUser} onUserChange={(user) => setAuth((current) => ({ ...current, user: { ...current.user, ...user } }))} onLogout={logout} onIssueCredentials={issueCredentials} flash={flash} catalogs={catalogs} onAddCatalogItem={addCatalogItem} onRemoveCatalogItem={removeCatalogItem} onSelect={setSelected} onAddEmployee={addEmployee} onUpdateEmployee={updateEmployee} onDeactivateEmployee={deactivateEmployee} />}
    </main>
    {showNew && <NewProcessModal furniture={furniture} decorGlues={decorGlues} prefill={newPrefill} onClose={() => { setShowNew(false); setNewPrefill(null) }} onCreate={createProcess} onDuplicate={flash} orders={orders} employees={employees} glueOptions={catalogNames(catalogs.glue)} onAddGlue={(name) => addCatalogItem('glue', name)} />}
    {paletteOpen && <CommandPalette orders={orders} onClose={() => setPaletteOpen(false)} onOpenProcess={openProcessById} onNavigate={(next) => { setSelected(null); setView(next) }} />}
    {helpOpen && <HowItWorks onClose={() => setHelpOpen(false)} />}
    {needsUserPick && <UserPicker employees={employees} onSelect={selectUser} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function StatCard({ label, value, detail, icon: Icon, tone }) { return <div className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-number">{value}</div><div className="stat-detail">{detail}</div><div className={`stat-spark spark-${tone}`}><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></div> }

function toLocalDayNumber(value) {
  if (!value) return null
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
}
function dateInputValue(value) { if (!value) return ''; const match = String(value).match(/^(\d{4}-\d{2}-\d{2})$/); if (match) return match[1]; /* метка времени (createdAt) — по местному времени, а не по UTC */ const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : localDateKey(date) }
function formatDayCount(value) {
  const number = Math.abs(value)
  const mod100 = number % 100
  const mod10 = number % 10
  const unit = mod100 >= 11 && mod100 <= 14 ? 'дней' : mod10 === 1 ? 'день' : mod10 >= 2 && mod10 <= 4 ? 'дня' : 'дней'
  return number + ' ' + unit
}
function ProductionScheduleCard({ order, onUpdate, flash }) {
  const [editing, setEditing] = useState(false)
  const [dateDraft, setDateDraft] = useState('')
  const [creationDraft, setCreationDraft] = useState('')
  const [installationDraft, setInstallationDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const base = useEditBase(order, editing)
  const processCreatedDate = editing ? creationDraft : (order.processCreatedDate || dateInputValue(order.createdAt) || '')
  const productionDate = editing ? dateDraft : (order.productionDate || '')
  const installationDate = editing ? installationDraft : (order.installationDate || '')
  const targetDay = toLocalDayNumber(productionDate)
  const createdDay = toLocalDayNumber(processCreatedDate)
  const todayDay = toLocalDayNumber(localDateKey())
  const productionTerm = targetDay !== null && createdDay !== null ? targetDay - createdDay : null
  const remainingDays = targetDay !== null && todayDay !== null ? targetDay - todayDay : null
  const formatDate = (value) => value ? new Date(value + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не запланирован'
  const save = async () => {
    setSaving(true)
    try {
      const start = base.get()
      // Отправляем только те даты, которые сотрудник действительно поменял.
      const startValues = { processCreatedDate: start.processCreatedDate || dateInputValue(start.createdAt) || localDateKey(), productionDate: start.productionDate || '', installationDate: start.installationDate || '' }
      const drafts = { processCreatedDate: creationDraft, productionDate: dateDraft, installationDate: installationDraft }
      const changed = Object.fromEntries(Object.entries(drafts).filter(([key, value]) => value !== startValues[key]))
      await onUpdate({ ...start, ...changed }, start)
      setEditing(false)
      flash('Сроки сохранены')
    } catch (error) { base.reset(error?.process) /* Keep the editor open so changes can be retried. */ }
    finally { setSaving(false) }
  }
  return <section className="info-card side-card"><div className="side-head"><h3>Сроки</h3>{editing ? <div className="edit-actions"><button onClick={() => setEditing(false)}>Отмена</button><button onClick={save} disabled={saving}><Check size={13} />Сохранить</button></div> : <button onClick={() => { setCreationDraft(order.processCreatedDate || dateInputValue(order.createdAt) || localDateKey()); setDateDraft(order.productionDate || ''); setInstallationDraft(order.installationDate || ''); setEditing(true) }}>Изменить</button>}</div><div className="deadline-row"><div className="deadline-icon"><CalendarDays size={17} /></div><div><small>Дата создания процесса</small>{editing ? <input className="inline-edit production-date-input" type="date" value={creationDraft} onChange={(event) => setCreationDraft(event.target.value)} /> : <b>{processCreatedDate ? new Date(processCreatedDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</b>}</div></div><div className="deadline-row"><div className="deadline-icon"><CalendarDays size={17} /></div><div><small>Дата окончания процесса</small>{editing ? <input className="inline-edit production-date-input" type="date" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} /> : <b>{formatDate(productionDate)}</b>}</div></div><div className="deadline-row"><div className="deadline-icon"><Clock3 size={17} /></div><div><small>Срок процесса</small><b>{productionTerm === null ? '—' : productionTerm < 0 ? 'Дата раньше создания процесса' : formatDayCount(productionTerm)}</b></div></div><div className="deadline-row"><div className="deadline-icon"><Clock3 size={17} /></div><div><small>Остаток дней</small><b>{remainingDays === null ? '—' : remainingDays < 0 ? 'Просрочено на ' + formatDayCount(remainingDays) : remainingDays === 0 ? 'Сегодня' : formatDayCount(remainingDays)}</b></div></div><div className="deadline-row"><div className="deadline-icon"><Hammer size={17} /></div><div><small>Плановый монтаж</small>{editing ? <input className="inline-edit production-date-input" type="date" value={installationDraft} onChange={(event) => setInstallationDraft(event.target.value)} /> : <b>{formatDate(installationDate)}</b>}</div></div></section>
}
/** Кто сейчас ведёт процесс: исполнитель этапа, на монтаже — бригадир и монтажники, иначе менеджер. */
function currentResponsible(order) {
  const owner = STAGE_OWNERS[order.stage]
  if (owner) {
    const names = [...assignedNames(order, owner.field), ...(order.stage === 'Монтаж' ? assignedNames(order, 'installers') : [])]
    if (names.length) return { names: [...new Set(names)], role: order.stage === 'Монтаж' ? 'монтаж' : owner.role.toLocaleLowerCase('ru') }
    return { names: [], role: `ждёт: ${owner.role.toLocaleLowerCase('ru')}` }
  }
  if (order.stage === 'Произведено') return { names: assignedNames(order, 'installationForeman'), role: 'ждёт бригадира монтажников' }
  return { names: assignedNames(order, 'manager'), role: 'менеджер' }
}

/** Этап процесса со статусом и отметкой «Нужны данные». */
function StagePill({ order, compact = false }) {
  const status = statusOf(order)
  return <span className="stage-pill-group"><span className={`status-pill status-${stageTone(order.stage)}`}><i />{order.stage}</span>{status && <span className={'stage-status ' + (status === READY ? 'ready' : 'not-ready')}>{status}</span>}{order.needsData && <span className="needs-data-chip" title={order.needsDataNote || 'Нужны данные'}>{compact ? '!' : 'Нужны данные'}</span>}</span>
}

/** Ручная смена этапа — для менеджера и директора (исправить ошибку, вернуть назад). */
function StageDialog({ order, onClose, onSave }) {
  const [stage, setStage] = useState(order.stage)
  const [stageStatus, setStageStatus] = useState(statusOf(order) || NOT_READY)
  const [saving, setSaving] = useState(false)
  const hasStatus = STATUS_STAGES.includes(stage)
  const submit = async (event) => { event.preventDefault(); setSaving(true); try { await onSave({ stage, stageStatus: hasStatus ? stageStatus : null }) } catch { /* ошибка показана */ } finally { setSaving(false) } }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="aq-modal stage-dialog" onSubmit={submit}>
    <div className="modal-header"><div><span className="modal-kicker">ПРОЦЕСС #{order.id}</span><h2>Изменить этап вручную</h2><p>Для исправления ошибок. Обычно этап меняют кнопки на странице процесса.</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
    <div className="modal-content stage-dialog-body">
      <label className="form-field"><span>Этап</span><select value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
      {hasStatus && <label className="form-field"><span>Статус</span><select value={stageStatus} onChange={(e) => setStageStatus(e.target.value)}><option>{NOT_READY}</option><option>{READY}</option></select></label>}
    </div>
    <div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit" disabled={saving}><Check size={15} />Сохранить</button></div>
  </form></div>
}

function DetailPage({ furniture = [], decorGlues = [], order, roles, user, employees, catalogs, onAddCatalogItem, onBack, onUpdate, flash }) {
  const [tab, setTab] = useState('Обзор')
  const [sketchOpen, setSketchOpen] = useState(false)
  const [editingOverview, setEditingOverview] = useState(false)
  const [overviewDraft, setOverviewDraft] = useState({})
  const overviewBase = useEditBase(order, editingOverview)
  const sketchBase = useEditBase(order, sketchOpen)
  const startOverviewEdit = () => { setOverviewDraft({ ...order, items: processItems(order) }); setEditingOverview(true) }
  const cancelOverviewEdit = () => { setOverviewDraft({}); setEditingOverview(false) }
  const saveOverviewEdit = async () => {
    const changed = Object.keys(overviewDraft).some((key) => JSON.stringify(overviewDraft[key] ?? null) !== JSON.stringify((key === 'items' ? processItems(order) : order[key]) ?? null))
    if (!changed) {
      setEditingOverview(false)
      setOverviewDraft({})
      flash('Изменений нет')
      return
    }
    try {
      const start = overviewBase.get()
      // Черновик — копия процесса на момент «Изменить»: берём из него только то, что сотрудник поменял.
      const edited = Object.fromEntries(Object.entries(overviewDraft).filter(([key, value]) => JSON.stringify(value ?? null) !== JSON.stringify(start[key] ?? null)))
      // Изделия: сохраняем очищенный список, а старые поля «изделие / материал / декор / клей» стираем.
      if (edited.items) Object.assign(edited, { items: cleanItems(edited.items) }, Object.fromEntries(LEGACY_ITEM_FIELDS.map((key) => [key, null])))
      await onUpdate({ ...start, ...edited }, start)
      setEditingOverview(false)
      setOverviewDraft({})
      flash('Основные данные сохранены')
    } catch (error) { overviewBase.reset(error?.process) /* Keep the draft open so the employee can retry or cancel. */ }
  }
  // Права и переходы этапов — общие с сервером (src/permissions.js).
  const canEditTab = (name) => canEditTabFor(roles, name)
  const flow = STAGES
  const current = flow.indexOf(order.stage)
  const status = statusOf(order)
  // Сколько фото в «Фотоотчёте» — без него на монтаже нельзя поставить «Готов».
  const [photoCount, setPhotoCount] = useState(0)
  useEffect(() => {
    if (staticDemo || !['Монтаж', 'Произведено'].includes(order.stage)) return undefined
    let active = true
    const load = () => fetch(`/api/processes/${encodeURIComponent(order.id)}/attachments`).then((r) => (r.ok ? r.json() : [])).then((files) => { if (active) setPhotoCount(files.filter((f) => f.field_key === INSTALLATION_PHOTOS).length) }).catch(() => {})
    load()
    window.addEventListener('aquastone-attachments-changed', load)
    return () => { active = false; window.removeEventListener('aquastone-attachments-changed', load) }
  }, [order.id, order.stage])
  const actions = availableActions(roles, user?.name, order, { photoCount: staticDemo ? 1 : photoCount })
  const [busy, setBusy] = useState(false)
  const runAction = async (action) => {
    if (action.needsPhoto) { flash('Чтобы поставить «Готов», добавьте минимум одно фото в «Фотоотчёт».'); setTab('Монтаж'); return }
    if (action.confirm && !window.confirm(action.confirm)) return
    const patch = { stage: action.to.stage, stageStatus: action.to.stageStatus ?? null }
    if (action.assign) patch[action.assign.field] = action.assign.value
    setBusy(true)
    try { const saved = await onUpdate({ ...order, ...patch }); flash(`Этап: ${stageLabel(saved || { ...order, ...patch })}`) } catch { /* ошибку уже показали */ } finally { setBusy(false) }
  }
  const survey = surveyProgress(order)
  const owner = STAGE_OWNERS[order.stage]
  const take = TAKE_STEPS.find((step) => step.from[0] === order.stage && step.from[1] === status)
  const waitingFor = order.stage === 'Новый заказ' ? 'Менеджер собирает данные и предоплату, затем передаёт на замер'
    : order.stage === 'Завершён' ? 'Процесс закрыт'
    : order.stage === 'Монтаж' && status === READY ? 'Монтаж выполнен — ждёт закрытия менеджером'
    : take ? `Ждёт, когда ${STAGE_OWNERS[take.to].role.toLocaleLowerCase('ru')} возьмёт в работу`
    : owner ? `В работе: ${[...assignedNames(order, owner.field), ...(order.stage === 'Монтаж' ? assignedNames(order, 'installers') : [])].join(', ') || owner.role.toLocaleLowerCase('ru')}` : ''
  const [stageDialog, setStageDialog] = useState(false)
  const toggleNeedsData = async () => {
    if (order.needsData) { try { await onUpdate({ ...order, needsData: false, needsDataNote: '' }); flash('Отметка «Нужны данные» снята') } catch { /* показано */ } return }
    const note = window.prompt('Чего не хватает? (необязательно)', '')
    if (note === null) return
    try { await onUpdate({ ...order, needsData: true, needsDataNote: note.trim().slice(0, 300) }); flash('Процесс отмечен «Нужны данные»') } catch { /* показано */ }
  }
  const canEditSketch = canEditTab('Замер')
  const saveSketch = async (surveySketch) => {
    const start = sketchBase.get()
    try { await onUpdate({ ...start, surveySketch }, start); flash('Чертёж замера сохранён') } catch (error) { sketchBase.reset(error?.process); throw error }
  }
  return <div className="detail-page">{sketchOpen && <SketchEditor initialSketch={order.surveySketch} title={`Чертёж замера · процесс #${order.id}`} subtitle={[order.client, formatProcessAddress(order)].filter(Boolean).join(' · ')} readOnly={!canEditSketch} exportName={`process-${order.id}-chertezh`} onSave={saveSketch} onClose={() => setSketchOpen(false)} />}<button className="back-link" onClick={onBack}><ArrowLeft size={16} />К списку процессов</button><div className="detail-heading"><div><div className="detail-overline">ПРОЦЕСС #{order.id}{(order.processCreatedDate || order.createdAt) && <> <span>·</span> Создан {new Date(order.processCreatedDate ? order.processCreatedDate + 'T00:00:00' : order.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</>}</div><h1>{order.client}</h1><div className="detail-subtitle">{productsLabel(order)}{materialsLabel(order) && <> <span>·</span> {materialsLabel(order)}</>}</div></div><div className="heading-actions"><Popover className="detail-actions" trigger={(open, toggle) => <button type="button" className="secondary-button" onClick={toggle} aria-expanded={open}><MoreHorizontal size={17} />Действия</button>}>{(close) => <div>
      <MenuItem icon={Copy} onClick={() => { close(); copyText(`${window.location.origin}${basePath}${processPath(order.id)}`, 'Ссылка на процесс скопирована', flash) }}>Скопировать ссылку</MenuItem>
      <MenuItem icon={MapPin} disabled={!formatProcessAddress(order)} onClick={() => { close(); copyText(formatProcessAddress(order), 'Адрес скопирован', flash) }}>Скопировать адрес</MenuItem>
      <MenuItem icon={Phone} disabled={!getPhoneContacts(order).length} onClick={() => { close(); copyText(getPhoneContacts(order).map((c) => [c.label, c.phone].filter(Boolean).join(': ')).join('\n'), 'Телефоны скопированы', flash) }}>Скопировать телефоны</MenuItem>
      <div className="aq-menu-sep" />
      <MenuItem icon={Clock3} onClick={() => { close(); setTab('История') }}>История изменений</MenuItem>
      <MenuItem icon={Printer} onClick={() => { close(); window.print() }}>Печать карточки</MenuItem>
      <div className="aq-menu-sep" />
      <MenuItem icon={CircleAlert} onClick={() => { close(); toggleNeedsData() }}>{order.needsData ? 'Снять отметку «Нужны данные»' : 'Отметить «Нужны данные»'}</MenuItem>
      {isManager(roles) && <MenuItem icon={Settings2} onClick={() => { close(); setStageDialog(true) }}>Изменить этап вручную</MenuItem>}
    </div>}</Popover><button className="secondary-button" onClick={() => setSketchOpen(true)}><PenTool size={16} />Чертёж замера</button>{actions.map((action) => <button key={action.id + action.to.stage} type="button" className={(action.secondary ? 'secondary-button' : 'primary-button') + (action.needsPhoto ? ' is-blocked' : '')} onClick={() => runAction(action)} disabled={busy} title={action.needsPhoto ? 'Сначала добавьте фото в «Фотоотчёт» на вкладке «Монтаж»' : undefined}>{action.label}{!action.secondary && <ArrowRight size={16} />}</button>)}</div></div>
    {stageDialog && <StageDialog order={order} onClose={() => setStageDialog(false)} onSave={async (patch) => { await onUpdate({ ...order, ...patch }); flash(`Этап: ${stageLabel({ ...order, ...patch })}`); setStageDialog(false) }} />}
    {order.needsData && <div className="needs-data-banner" role="status"><CircleAlert size={16} /><span><b>Нужны данные.</b> {order.needsDataNote || 'Не хватает данных для работы по процессу.'}</span><button type="button" onClick={toggleNeedsData}>Снять отметку</button></div>}
    <div className="detail-meta"><StagePill order={order} /><div className="meta-divider" /><div className="meta-person"><div className={`avatar avatar-${avatarTone(order.manager)}`}>{initialsOf(order.manager)}</div><span>{order.manager}</span><small>менеджер</small></div><div className="meta-divider" /><div className="meta-location"><MapPin size={16} />{formatProcessAddress(order)}</div></div>
    <div className="workflow-card"><div className="workflow-title"><div><h3>Путь заказа</h3><p>{waitingFor || 'Процесс проходит 8 этапов до завершения'}</p></div><span>{Math.max(current + 1, 1)} <i>/ {flow.length}</i></span></div><div className="workflow-line">{flow.map((step, i) => <div key={step} className={`workflow-step ${i < current || order.stage === 'Завершён' ? 'done' : i === current ? 'current' : ''}${i === current && status === READY ? ' ready' : ''}`}><div className="workflow-dot">{i < current || (i === current && (status === READY || order.stage === 'Завершён')) ? <Check size={12} /> : null}</div><span>{step}</span>{i === current && status && <small className={'workflow-status ' + (status === READY ? 'ready' : 'not-ready')}>{status}</small>}</div>)}</div></div>
    <div className="detail-tabs">{['Обзор', 'Замер', 'Проектирование', 'Производство', 'Монтаж', 'История'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === 'Замер' && surveyProgress(order).percent === 100 && <span className="tab-check"><Check size={10} /></span>}</button>)}</div>
    {tab === 'Обзор' && <div className="detail-content"><div className="detail-main-column"><section className="info-card"><div className="info-card-head"><div><h3>Информация о заказе</h3><p>Основные данные процесса</p></div>{roles.includes('Менеджер') && (editingOverview ? <div className="edit-actions"><button onClick={cancelOverviewEdit}><X size={15} />Отмена</button><button onClick={saveOverviewEdit}><Check size={15} />Сохранить</button></div> : <button onClick={startOverviewEdit}><Settings2 size={16} />Изменить</button>)}</div><div className="info-grid">{[['Номер процесса', 'id'], ['Клиент', 'client'], ['Мебельная компания', 'furnitureCompany'], ['Мебельщик', 'furnitureMaker'], ['Номер телефона мебельщика', 'furnitureMakerPhone'], ['Телефоны', 'phoneContacts'], ['Адрес объекта', 'address'], ['Виды лифта', 'elevatorTypes'], ['Раковина', 'sinkType'], ['Цвет раковины', 'sinkColor'], ['Менеджер', 'manager']].map(([label, key]) => <Info key={key} className={key === 'address' ? 'address-info-field' : ''} label={label} value={editingOverview && key === 'manager' ? <select className="inline-edit" value={overviewDraft.manager || ''} onChange={(e) => setOverviewDraft((current) => ({ ...current, manager: e.target.value }))}><option value="">Выберите менеджера</option>{employees.filter((employee) => employee.roles.includes('Менеджер')).map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select> : editingOverview && key === 'address' ? <b>{formatProcessAddress({ ...order, ...overviewDraft })}</b> : editingOverview && key === 'houseType' ? <div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name={'overview-house-type-' + order.id} checked={overviewDraft.houseType === 'Многоквартирный'} onChange={() => setOverviewDraft((current) => ({ ...current, houseType: 'Многоквартирный' }))} />Многоквартирный</label><label><input type="radio" name={'overview-house-type-' + order.id} checked={overviewDraft.houseType === 'Частный'} onChange={() => setOverviewDraft((current) => ({ ...current, houseType: 'Частный' }))} />Частный</label></div> : editingOverview && key === 'phoneContacts' ? <PhoneContactsEditor contacts={overviewDraft.phoneContacts ?? getPhoneContacts(order)} onChange={(phoneContacts) => setOverviewDraft((current) => ({ ...current, phoneContacts }))} /> : editingOverview && key === 'glue' ? <SearchSelect value={overviewDraft.glue ?? ''} options={catalogNames(catalogs?.glue)} onChange={(next) => setOverviewDraft((current) => ({ ...current, glue: next }))} onAdd={(name) => onAddCatalogItem('glue', name)} placeholder="Выберите клей" searchPlaceholder="Найти клей…" ariaLabel="Клей" /> : editingOverview && key === 'furnitureCompany' ? <CompanyField value={{ ...order, ...overviewDraft }} companies={furniture} onChange={(patch) => setOverviewDraft((current) => ({ ...current, ...patch }))} inputClassName="inline-edit" /> : editingOverview && key === 'furnitureMaker' ? <MakerField value={{ ...order, ...overviewDraft }} companies={furniture} onChange={(patch) => setOverviewDraft((current) => ({ ...current, ...patch }))} inputClassName="inline-edit" /> : editingOverview && key === 'furnitureMakerPhone' ? <MakerPhoneField className="inline-edit" value={{ ...order, ...overviewDraft }} onChange={(patch) => setOverviewDraft((current) => ({ ...current, ...patch }))} /> : editingOverview && key !== 'id' && key !== 'elevatorTypes' ? <input className="inline-edit" value={overviewDraft[key] ?? ''} onChange={(e) => setOverviewDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'id' ? `#${order.id}` : key === 'address' ? <span className="address-value">{formatProcessAddress(order)}{formatProcessAddress(order) !== 'Адрес не указан' && <span className="address-actions"><a href={'https://2gis.ru/search/' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/2gis.png"} alt="" />Открыть в 2ГИС</a><a href={'https://yandex.ru/maps/?text=' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/yandex-maps.png"} alt="" />Открыть в Яндекс Картах</a><a href={'yandexnavi://map_search?text=' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/yandex-navigator.png"} alt="" />Открыть в Яндекс Навигаторе</a></span>}</span> : key === 'furnitureMakerPhone' ? (order.furnitureMakerPhone ? <a className="phone-link" href={'tel:' + formatRussianPhone(order.furnitureMakerPhone).replace(/[^\d+]/g, '')}>{formatRussianPhone(order.furnitureMakerPhone)}</a> : 'Не указан') : key === 'phoneContacts' ? <span className="phone-contacts-list">{getPhoneContacts(order).length ? getPhoneContacts(order).map((contact, index) => <span className="phone-contact-value" key={index}><small>{contact.label || 'Контакт'}</small>{contact.phone ? <a className="phone-link" href={'tel:' + formatRussianPhone(contact.phone).replace(/[^\d+]/g, '')}>{formatRussianPhone(contact.phone)}</a> : 'Не указан'}</span>) : 'Не указаны'}</span> : key === 'elevatorTypes' ? (order.elevatorTypes || []).map((type) => ({ square: 'Квадратный', vertical: 'Длинный прямой', horizontal: 'Длинный боковой' }[type])).filter(Boolean).join(', ') || 'Не указаны' : (order[key] || 'Не указан')} />)}</div><div className="items-section"><div className="items-section-head"><h4>Изделия</h4><small>{editingOverview ? 'Можно добавить несколько изделий из разных материалов' : `${processItems(order).length} шт.`}</small></div>{editingOverview ? <ItemsEditor items={overviewDraft.items ?? processItems(order)} onChange={(items) => setOverviewDraft((current) => ({ ...current, items }))} decorGlues={decorGlues} glueOptions={catalogNames(catalogs?.glue)} onAddGlue={(name) => onAddCatalogItem('glue', name)} /> : <ItemsList items={processItems(order)} />}</div></section>
      <section className="info-card stage-info"><div className="info-card-head"><div><div className="stage-card-title"><div className="stage-card-icon blue-icon"><MapPin size={17} /></div><div><h3>Замер объекта</h3><p>Данные от замерщика</p></div></div></div><span className="completion">{survey.percent}% заполнено</span></div><div className="completion-track"><span style={{ width: `${survey.percent}%` }} /></div>{survey.missing.length ? <div className="missing-note"><CircleHelp size={16} /><span>Не заполнено: {survey.missing.join(', ')}.</span><button onClick={() => setTab('Замер')}>Заполнить <ArrowRight size={14} /></button></div> : <div className="info-grid"><Info label="Дата замера" value={formatDay(order.surveyDate)} /><Info label="Этаж и лифт" value={order.houseType === 'Частный' ? 'Частный дом' : `${order.floor} этаж · ${order.hasElevator ? 'есть лифт' : 'без лифта'}`} /><Info label="Чертёж и размеры" value={order.surveySketch?.elements?.length ? 'Чертёж нарисован' : order.measurements} /><Info label="Раковина" value={[order.sinkType, order.sinkColor].filter(Boolean).join(' · ')} /></div>}</section>
      <CommentsCard processId={order.id} user={user} demo={staticDemo} flash={flash} /></div>
      <aside className="detail-side"><TeamCard order={order} roles={roles} employees={employees} onUpdate={onUpdate} flash={flash} /><ProductionScheduleCard order={order} onUpdate={onUpdate} flash={flash} /><section className="tip-card"><Sparkles size={16} /><b>Подсказка</b><p>Заполните все данные замера, чтобы технолог смог подготовить точный чертёж.</p></section></aside></div>}
    {tab !== 'Обзор' && <StageTab tab={tab} order={order} flash={flash} canEdit={canEditTab(tab)} onUpdate={onUpdate} onOpenSketch={() => setSketchOpen(true)} catalogs={catalogs} onAddCatalogItem={onAddCatalogItem} />}</div>
}

function TeamCard({ order, roles, employees, onUpdate, flash }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const base = useEditBase(order, editing)
  const slots = [
    { label: 'Менеджер', field: 'manager', tone: 'purple' },
    { label: 'Замерщик', field: 'surveyor', tone: 'blue' },
    { label: 'Технолог', field: 'technologist', tone: 'violet' },
    { label: 'Оператор ЧПУ', field: 'cncOperator', tone: 'orange' },
    { label: 'Обработчик', field: 'finisher', tone: 'teal' },
    { label: 'Бригадир монтажников', field: 'installationForeman', tone: 'green' },
    { label: 'Монтажники', field: 'installers', tone: 'green', multiple: true },
  ]
  // Менеджер меняет всю команду, бригадир — только монтажников.
  const editable = slots.filter(({ field }) => canEditTeamField(roles, field))
  const value = (field) => (field === 'installers' ? assignedNames(editing ? draft : order, field) : (editing ? draft : order)[field] || '')
  const save = async () => {
    try {
      const start = base.get()
      // Черновик — копия процесса на момент «Изменить»: отправляем только изменённые назначения.
      const edited = Object.fromEntries(editable.map(({ field }) => [field, field === 'installers' ? assignedNames(draft, field) : draft[field] || ''])
        .filter(([field, next]) => JSON.stringify(next) !== JSON.stringify(field === 'installers' ? assignedNames(start, field) : start[field] || '')))
      await onUpdate({ ...start, ...edited }, start)
      setEditing(false)
      setDraft({})
      flash('Состав команды сохранён')
    } catch (error) { base.reset(error?.process) /* Leave the form open so changes can be retried. */ }
  }
  const candidates = (field) => employees.filter((employee) => hasRole(employee, ASSIGNMENT_ROLE[field]))
  const toggleInstaller = (name) => setDraft((current) => { const list = assignedNames(current, 'installers'); return { ...current, installers: list.includes(name) ? list.filter((n) => n !== name) : [...list, name] } })
  return <section className="info-card side-card"><div className="side-head"><div><h3>Команда процесса</h3><p>Ответственные участники</p></div>{editable.length > 0 && (editing ? <div className="edit-actions"><button onClick={() => { setDraft({}); setEditing(false) }}>Отмена</button><button onClick={save}><Check size={14} />Сохранить</button></div> : <button onClick={() => { setDraft({ ...order }); setEditing(true) }}>{isManager(roles) ? 'Изменить' : 'Назначить монтажников'}</button>)}</div>{slots.map(({ label, field, tone, multiple }) => {
    const names = multiple ? value(field) : [value(field)].filter(Boolean)
    const shown = names.join(', ')
    const initials = names.length > 1 ? String(names.length) : shown.trim() ? shown.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() : '—'
    const canEdit = editing && canEditTeamField(roles, field)
    return <div className="team-row" key={field}><div className={'avatar avatar-' + tone}>{initials}</div><div><small>{label}</small>{canEdit ? (multiple
      ? <div className="team-multi" role="group" aria-label={label}>{candidates(field).map((employee) => <label key={employee.id} className="aq-check"><input type="checkbox" checked={names.includes(employee.name)} onChange={() => toggleInstaller(employee.name)} />{employee.name}</label>)}{!candidates(field).length && <span className="muted-name">Нет сотрудников с ролью «Монтажник»</span>}</div>
      : <select className="team-edit" aria-label={label} value={draft[field] || ''} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}><option value="">Не назначен</option>{candidates(field).map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select>)
      : <b className={!shown ? 'muted-name' : ''}>{shown || 'Не назначен'}</b>}</div></div>
  })}</section>
}

function ElevatorSketch({ type }) {
  const box = type === 'square' ? <rect x="34" y="5" width="56" height="52" /> : type === 'vertical' ? <rect x="42" y="3" width="40" height="64" /> : <rect x="9" y="19" width="106" height="47" />
  const entrance = type === 'horizontal' ? <path d="M35 75 21 89h9v12h10V89h9L35 75Z" /> : <path d="M62 75 48 89h9v12h10V89h9L62 75Z" />
  return <svg className={'elevator-sketch ' + type} viewBox="0 0 124 104" aria-hidden="true">{box}{entrance}</svg>
}

function Info({ label, value, className = '' }) { return <div className={'info-field ' + className}><span>{label}</span><b>{value}</b></div> }
function SketchSection({ order, canEdit, onOpen }) {
  const elements = order.surveySketch?.elements || []
  const updated = order.surveySketch?.updatedAt ? new Date(order.surveySketch.updatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }) : ''
  return <div className="sketch-section"><div className="sketch-section-head"><div><h4>Чертёж замера</h4><p>{elements.length ? `Обновлён ${updated}` : canEdit ? 'Нарисуйте базы, стыки, размеры, вырезы и фаски — технолог перенесёт чертёж в AutoCAD.' : 'Замерщик ещё не нарисовал чертёж.'}</p></div>{(elements.length > 0 || canEdit) && <button className="secondary-button" onClick={onOpen}><PenTool size={15} />{elements.length ? (canEdit ? 'Открыть и дорисовать' : 'Открыть чертёж') : 'Нарисовать чертёж'}</button>}</div>{elements.length > 0 && <button className="sketch-thumb" onClick={onOpen} aria-label="Открыть чертёж замера"><SketchPreview elements={elements} /></button>}</div>
}

const DESIGN_FIELDS = [
  { key: 'cadDrawing', title: 'Чертёж AutoCAD', hint: 'Файл DWG для производства.', accept: '.dwg', extensions: ['.dwg'] },
  { key: 'dxfDrawing', title: 'Чертёж DXF', hint: 'Файл DXF — его можно посмотреть прямо здесь.', accept: '.dxf', extensions: ['.dxf'] },
]
const formatFileSize = (bytes) => { const size = Number(bytes) || 0; return size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(size / 1024)) + ' КБ' }

function DesignFiles({ attachments, canEdit, uploading, onUpload, onDelete }) {
  const dxfFiles = attachments.filter((file) => file.field_key === 'dxfDrawing')
  const [previewId, setPreviewId] = useState(null)
  const preview = dxfFiles.find((file) => file.id === previewId) || dxfFiles[dxfFiles.length - 1]
  const fileRow = (file, { selectable = false } = {}) => <div className={'design-file' + (selectable && preview?.id === file.id ? ' selected' : '')} key={file.id}>
    <FileText size={15} />
    {selectable
      ? <button type="button" className="design-file-name" onClick={() => setPreviewId(file.id)} title="Показать в предпросмотре">{file.original_name}</button>
      : <a href={file.url} download={file.original_name}>{file.original_name}</a>}
    <small>{formatFileSize(file.file_size)}</small>
    {selectable && <a className="design-file-download" href={file.url} download={file.original_name} title="Скачать" aria-label={`Скачать ${file.original_name}`}><Download size={14} /></a>}
    {canEdit && <button type="button" className="design-file-remove" onClick={() => onDelete(file)} title="Удалить файл" aria-label={`Удалить ${file.original_name}`}><X size={14} /></button>}
  </div>
  return <div className="design-files">
    {DESIGN_FIELDS.map((field) => {
      const files = attachments.filter((file) => file.field_key === field.key)
      const isDxf = field.key === 'dxfDrawing'
      return <section className="design-field" key={field.key}>
        <div className="design-field-head">
          <div><h4>{field.title}</h4><p>{field.hint}</p></div>
          {canEdit && <label className="add-file-button"><input type="file" multiple accept={field.accept} onChange={(event) => onUpload(event, field.key, field.extensions)} /><Plus size={15} />{uploading === field.key ? 'Загружаем…' : 'Добавить файл'}</label>}
        </div>
        {files.length ? <div className="design-file-list">{files.map((file) => fileRow(file, { selectable: isDxf }))}</div> : <p className="design-empty">{canEdit ? 'Файл ещё не загружен.' : 'Технолог ещё не загрузил файл.'}</p>}
        {isDxf && preview && <DxfPreview key={preview.id} url={preview.url} name={preview.original_name} />}
      </section>
    })}
  </div>
}

function StageTab({ tab, order, flash, canEdit, onUpdate, onOpenSketch, catalogs, onAddCatalogItem }) {
  const [draft, setDraft] = useState({})
  const [attachments, setAttachments] = useState([])
  const [history, setHistory] = useState([])
  const [uploading, setUploading] = useState(false)
  const base = useEditBase(order, Object.keys(draft).length > 0)
  useEffect(() => setDraft({}), [tab, order.id])
  useEffect(() => {
    let active = true
    fetch(`/api/processes/${encodeURIComponent(order.id)}/attachments`)
      .then((response) => response.ok ? response.json() : [])
      .then((files) => { if (active) setAttachments(files) })
      .catch(() => { if (active) setAttachments([]) })
    return () => { active = false }
  }, [order.id])
  useEffect(() => {
    if (tab !== 'История') return
    let active = true
    fetch(`/api/processes/${encodeURIComponent(order.id)}/history`)
      .then((response) => response.ok ? response.json() : [])
      .then((items) => { if (active) setHistory(items) })
      .catch(() => { if (active) setHistory([]) })
    return () => { active = false }
  }, [tab, order.id])
  const definitions = {
    'Замер': [['Дата замера', 'surveyDate'], ['Город', 'addressCity'], ['Улица', 'addressStreet'], ['Дом', 'addressHouse'], ['Тип дома', 'houseType'], ['Квартира', 'addressApartment'], ['Этаж', 'floor'], ['Подъезд', 'entrance'], ['Есть лифт', 'hasElevator'], ['Визуальный тип лифта', 'elevatorTypes'], ['Размеры и эскиз', 'measurements'], ['Тип раковины', 'sinkType'], ['Цвет раковины', 'sinkColor'], ['Смеситель, дозатор, мех. измельчитель', 'fixturePositions'], ['Фото объекта', 'surveyPhotos'], ['Фото чертежа', 'drawingPhotos'], ['Доп. комментарии', 'surveyNotes']],
    'Проектирование': [],
    'Производство': [['Клей по изделиям', 'items'], ['Финальная шлифовка', 'finalSanding']],
    'Монтаж': [['Даты монтажа', 'installationDates'], ['Фотоотчёт', INSTALLATION_PHOTOS]],
  }
  const floorValue = draft.floor ?? order.floor ?? ''
  const elevatorValue = draft.hasElevator ?? order.hasElevator ?? null
  const fixtureFields = [['Смеситель', 'mixerPosition'], ['Дозатор', 'dispenserPosition'], ['Мех. измельчитель', 'grinderPosition']]
  const fixturePositions = Object.fromEntries(fixtureFields.map(([, key]) => { const value = draft[key] ?? order[key] ?? 'н/д'; return [key, value === 'Нет' ? 'н/д' : value] }))
  const duplicateFixturePositions = ['Слева', 'По центру', 'Справа'].filter((position) => fixtureFields.filter(([, key]) => fixturePositions[key] === position).length > 1)
  const fields = definitions[tab] || []
  const save = async () => {
    if (duplicateFixturePositions.length) { flash(`Расположение «${duplicateFixturePositions.join('», «')}» указано для нескольких приборов. Выберите разные места.`); return }
    if (!Object.keys(draft).length) { flash('Нет изменений для сохранения'); return }
    // Дата замера — фактическая: будущий день поставить нельзя.
    if (draft.surveyDate && draft.surveyDate > localDateKey()) { flash('Дата замера не может быть в будущем — укажите день, когда замер провели.'); return }
    try {
      const start = base.get()
      // Клей подбирается у изделий: сохраняем очищенный список, старые поля стираем.
      const patch = draft.items ? { ...draft, items: cleanItems(draft.items), ...Object.fromEntries(LEGACY_ITEM_FIELDS.map((key) => [key, null])) } : draft
      await onUpdate({ ...start, ...patch }, start)
      setDraft({})
      flash('Изменения сохранены')
    } catch (error) { base.reset(error?.process) /* Keep the draft open so the employee can retry or cancel. */ }
  }
  const longTextKeys = ['measurements']
  const visibleHistory = history.filter(isVisibleEvent)
  const uploadFile = async (event, fieldKey, extensions = null) => {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    if (staticDemo) { flash('GitHub Pages показывает демо-интерфейс; загрузка файлов доступна на серверной версии.'); event.target.value = ''; return }
    const wrong = extensions ? files.find((file) => !extensions.some((ext) => file.name.toLowerCase().endsWith(ext))) : null
    if (wrong) { flash(`Файл «${wrong.name}» не подходит: нужен формат ${extensions.join(', ').toUpperCase()}.`); event.target.value = ''; return }
    setUploading(fieldKey)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        form.append('fieldKey', fieldKey)
        const response = await fetch(`/api/processes/${encodeURIComponent(order.id)}/attachments`, { method: 'POST', body: form })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось загрузить файл.')
        setAttachments((current) => [...current, result])
      }
      flash('Файлы загружены')
      window.dispatchEvent(new Event('aquastone-attachments-changed'))
    } catch (error) { flash(error.message) }
    finally { setUploading(false); event.target.value = '' }
  }
  const deleteAttachment = async (file) => {
    try {
      const response = await fetch(`/api/processes/${encodeURIComponent(order.id)}/attachments/${file.id}`, { method: 'DELETE' })
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не удалось удалить файл.') }
      setAttachments((current) => current.filter((item) => item.id !== file.id))
      window.dispatchEvent(new Event('aquastone-attachments-changed'))
      flash('Файл удалён')
    } catch (error) { flash(error.message) }
  }
  const objectPhotos = attachments.filter((file) => file.field_key === 'surveyPhotos')
  const drawingPhotos = attachments.filter((file) => file.field_key === 'drawingPhotos')
  const reportPhotos = attachments.filter((file) => file.field_key === INSTALLATION_PHOTOS)
  const photosOf = (key) => (key === 'surveyPhotos' ? objectPhotos : key === 'drawingPhotos' ? drawingPhotos : reportPhotos)
  return <section className="info-card tab-content-card"><div className="info-card-head"><div><h3>{tab === 'История' ? 'История процесса' : `${tab} процесса`}</h3><p>{tab === 'История' ? 'События и изменения по процессу' : canEdit ? (tab === 'Проектирование' ? 'Загрузите чертежи — они сохраняются сразу.' : 'Вы можете заполнять поля этого этапа.') : 'У этой роли нет прав редактирования этого этапа.'}</p></div>{tab !== 'История' && canEdit && fields.length > 0 && <button onClick={save}><Check size={15} />Сохранить</button>}</div>{tab === 'История' ? visibleHistory.length ? <div className="history-list">{visibleHistory.map((event) => <article className="history-event" key={event.id}>{(() => { const { title, lines } = describeEvent(event); return <><span className="history-marker"><i /></span><div><div className="history-event-head"><b>{title}</b><time>{new Date(event.createdAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>{event.action === 'created' ? <p>Процесс #{order.id} создан</p> : <HistoryLines lines={lines} />}<small>{event.details?.actorRole ? `${event.actor} · ${event.details.actorRole}` : event.actor}</small></div></> })()}</article>)}</div> : <div className="history-empty">История пока пуста. Новые изменения будут отображаться здесь.</div> : fields.length > 0 && <div className="info-grid">{fields.map(([label, key]) => <div className={'info-field' + (key === 'elevatorTypes' ? ' elevator-field' : '') + (key === 'items' ? ' items-field' : '')} key={key}><span>{label}</span>{key === 'items' ? (canEdit ? <ItemsEditor mode="glue" items={draft.items ?? processItems(order)} onChange={(items) => setDraft((current) => ({ ...current, items }))} glueOptions={catalogNames(catalogs?.glue)} onAddGlue={(name) => onAddCatalogItem('glue', name)} /> : <ItemsList items={processItems(order)} />) : key === 'phoneContacts' ? <PhoneContactsList contacts={getPhoneContacts(order)} /> : canEdit ? key === 'floor' || key === 'entrance' ? <input className="inline-edit" type="number" min={key === 'floor' ? 0 : 1} step="1" value={key === 'floor' ? floorValue : (draft.entrance ?? order.entrance ?? '')} placeholder={key === 'floor' ? 'Этаж' : 'Подъезд'} onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'houseType' ? <div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name={'house-type-' + order.id} checked={(draft.houseType ?? order.houseType) === 'Многоквартирный'} onChange={() => setDraft((current) => ({ ...current, houseType: 'Многоквартирный' }))} />Многоквартирный</label><label><input type="radio" name={'house-type-' + order.id} checked={(draft.houseType ?? order.houseType) === 'Частный'} onChange={() => setDraft((current) => ({ ...current, houseType: 'Частный' }))} />Частный</label></div> : key === 'hasElevator' ? <div className="radio-group" role="radiogroup" aria-label="Есть лифт"><label><input type="radio" name={'elevator-' + order.id} checked={elevatorValue === true} onChange={() => setDraft((current) => ({ ...current, hasElevator: true }))} />Да</label><label><input type="radio" name={'elevator-' + order.id} checked={elevatorValue === false} onChange={() => setDraft((current) => ({ ...current, hasElevator: false, elevatorTypes: [] }))} />Нет</label></div> : key === 'elevatorTypes' ? <div className="elevator-options" role="group" aria-label="Типы лифтов">{[['square', 'Квадратный'], ['vertical', 'Длинный прямой'], ['horizontal', 'Длинный боковой']].map(([type]) => { const selectedTypes = draft.elevatorTypes ?? order.elevatorTypes ?? []; const checked = selectedTypes.includes(type); return <label className={'elevator-option' + (checked ? ' selected' : '')} key={type}><input type="checkbox" disabled={elevatorValue === false} checked={checked} onChange={(event) => setDraft((current) => { const currentTypes = current.elevatorTypes ?? order.elevatorTypes ?? []; return { ...current, hasElevator: event.target.checked ? true : (current.hasElevator ?? order.hasElevator), elevatorTypes: event.target.checked ? [...currentTypes, type] : currentTypes.filter((item) => item !== type) } })} /><ElevatorSketch type={type} /></label>})}</div> : key === 'fixturePositions' ? canEdit ? <div className="fixture-position-fields">{fixtureFields.map(([title, fixtureKey]) => <label className="fixture-position-field" key={fixtureKey}><span>{title}</span><select className="inline-edit" value={fixturePositions[fixtureKey]} onChange={(event) => setDraft((current) => ({ ...current, [fixtureKey]: event.target.value }))}><option value="н/д">н/д</option><option value="Не нужен">Не нужен</option>{['Слева', 'По центру', 'Справа'].map((position) => { const usedElsewhere = fixtureFields.some(([, otherKey]) => otherKey !== fixtureKey && fixturePositions[otherKey] === position); return <option key={position} value={position} disabled={usedElsewhere && fixturePositions[fixtureKey] !== position}>{position}</option> })}</select></label>)}{duplicateFixturePositions.length > 0 && <p className="fixture-position-warning" role="alert">Одинаковое расположение выбрано у нескольких приборов. Исправьте выбор перед сохранением.</p>}</div> : <div className="fixture-position-summary">{fixtureFields.map(([title, fixtureKey]) => <span key={fixtureKey}><b>{title}:</b> {fixturePositions[fixtureKey]}</span>)}</div> : (key === 'surveyPhotos' || key === 'drawingPhotos' || key === INSTALLATION_PHOTOS) ? <div className="photo-upload-field"><label className="add-file-button"><input type="file" accept="image/*" multiple onChange={(event) => uploadFile(event, key, key === INSTALLATION_PHOTOS ? ['.jpg', '.jpeg', '.png', '.webp', '.heic'] : null)} /><Plus size={15} />{uploading === key ? 'Загружаем…' : 'Добавить фото'}</label>{key === INSTALLATION_PHOTOS && <small className="photo-report-hint">{reportPhotos.length ? `Фото: ${reportPhotos.length}` : 'Для статуса «Готов» нужно минимум одно фото'}</small>}{photosOf(key).length > 0 && <div className="attachments-list">{photosOf(key).map((file) => <div className="attachment-row" key={file.id}><FileText size={15} /><a href={file.url} target="_blank" rel="noreferrer">{file.original_name}</a><span>{Math.max(1, Math.round(Number(file.file_size) / 1024))} КБ</span>{canEdit && <button onClick={() => deleteAttachment(file)} aria-label={`Удалить ${file.original_name}`}><X size={15} /></button>}</div>)}</div>}</div> : key === 'installationDates' ? <InstallationDates dates={draft.installationDates ?? order.installationDates} canEdit onChange={(installationDates) => setDraft((current) => ({ ...current, installationDates }))} onDuplicate={flash} /> : key === 'glue' || key === 'finalSanding' ? <SearchSelect value={draft[key] ?? order[key] ?? ''} options={catalogNames(catalogs?.[key === 'glue' ? 'glue' : 'sanding'])} onChange={(next) => setDraft((current) => ({ ...current, [key]: next }))} onAdd={(name) => onAddCatalogItem(key === 'glue' ? 'glue' : 'sanding', name)} placeholder={key === 'glue' ? 'Выберите клей' : 'Выберите шлифовку'} searchPlaceholder={key === 'glue' ? 'Найти клей…' : 'Найти шлифовку…'} ariaLabel={label} /> : key === 'sinkType' ? <select className="inline-edit" value={draft[key] ?? order[key] ?? ''} onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select> : longTextKeys.includes(key) ? <textarea className="inline-edit" rows="2" value={draft[key] ?? order[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : <input className="inline-edit" type={['installationDate', 'surveyDate'].includes(key) ? 'date' : 'text'} max={key === 'surveyDate' ? localDateKey() : undefined} value={draft[key] ?? order[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'installationDates' ? <InstallationDates dates={order.installationDates} canEdit={false} /> : key === 'floor' ? <b>{floorValue ? floorValue + ' этаж' : 'Не заполнено'}</b> : key === 'entrance' ? <b>{order.entrance ? order.entrance + ' подъезд' : 'Не заполнено'}</b> : key === 'hasElevator' ? <b>{elevatorValue === true ? 'Да' : elevatorValue === false ? 'Нет' : 'Не указано'}</b> : key === 'elevatorTypes' ? <b>{(order.elevatorTypes || []).map((type) => ({ square: 'Квадратный', vertical: 'Длинный прямой', horizontal: 'Длинный боковой' }[type])).filter(Boolean).join(', ') || 'Не указан'}</b> : <b>{order[key] || 'Не заполнено'}</b>}</div>)}</div>}{tab === 'Замер' && <SketchSection order={order} canEdit={canEdit} onOpen={onOpenSketch} />}{tab === 'Проектирование' && <DesignFiles attachments={attachments} canEdit={canEdit} uploading={uploading} onUpload={uploadFile} onDelete={deleteAttachment} />}</section>
}

function NewProcessModal({ furniture = [], decorGlues = [], prefill = null, onClose, onCreate, onDuplicate, orders, employees, glueOptions = [], onAddGlue }) {
  const [id, setId] = useState(() => {
    const numericIds = orders.map((item) => Number(item.id)).filter((value) => Number.isSafeInteger(value) && value >= 0)
    const maximum = numericIds.length ? Math.max(...numericIds) : null
    return maximum === null ? '' : String(maximum + 1)
  })
  const [client, setClient] = useState(prefill?.client || '')
  const [furnitureFields, setFurnitureFields] = useState({ furnitureCompany: '', furnitureMaker: '', furnitureMakerPhone: '' })
  const updateFurniture = (patch) => setFurnitureFields((current) => ({ ...current, ...patch }))
  const [phoneContacts, setPhoneContacts] = useState([{ label: 'Клиент', phone: prefill?.phone || '' }])
  // Изделия процесса: одно по умолчанию, можно добавить ещё (например, кухня из кварца и санузел из акрила).
  const [items, setItems] = useState(() => prefill?.items?.length ? prefill.items : [emptyItem()])
  const [sinkType, setSinkType] = useState('')
  const [sinkColor, setSinkColor] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressHouse, setAddressHouse] = useState('')
  const [addressApartment, setAddressApartment] = useState('')
  const [houseType, setHouseType] = useState('')
  const managers = employees.filter((employee) => employee.roles.includes('Менеджер'))
  const [manager, setManager] = useState('')
  useEffect(() => { if (!manager && managers.length) setManager(managers[0].name) }, [manager, managers])
  const submit = (e) => { e.preventDefault(); if (!id.trim()) return; if (!manager) { onDuplicate('Сначала добавьте менеджера в справочник сотрудников.'); return } if (orders.some((order) => String(order.id) === id.trim())) { onDuplicate(`Процесс №${id.trim()} уже существует.`); return } const savedContacts = phoneContacts.filter((contact) => contact.label.trim() || contact.phone).map((contact) => ({ label: contact.label.trim(), phone: contact.phone })); onCreate({ id: id.trim(), client: client.trim() || 'Новый клиент', furnitureCompany: furnitureFields.furnitureCompany.trim(), furnitureMaker: furnitureFields.furnitureMaker.trim(), furnitureMakerPhone: furnitureFields.furnitureMakerPhone, phoneContacts: savedContacts, items: cleanItems(items), sinkType, sinkColor, stage: 'Новый заказ', manager, processCreatedDate: localDateKey(), addressCity, addressStreet, addressHouse, addressApartment, houseType }) }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="new-modal" onSubmit={submit}><div className="modal-header"><div><span className="modal-kicker">{prefill?.requestId ? `НОВЫЙ ЗАКАЗ · ИЗ ЗАЯВКИ №${prefill.requestId}` : 'НОВЫЙ ЗАКАЗ'}</span><h2>Создать процесс</h2><p>Добавьте заказ в рабочее пространство. Остальные данные можно заполнить позже.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={19} /></button></div><div className="modal-content"><label className="form-field"><span>Номер процесса <i>*</i></span><div className="id-input"><span>#</span><input autoFocus value={id} onChange={(e) => setId(e.target.value)} required /></div><small>Номер обязателен и назначается при создании.</small></label>{!managers.length && <div className="form-note"><Users size={15} /><span>Сначала добавьте в справочник сотрудника с ролью «Менеджер».</span></div>}<div className="form-grid"><label className="form-field"><span>Ответственный менеджер <i>*</i></span><select value={manager} onChange={(e) => setManager(e.target.value)} required><option value="">Выберите менеджера</option>{managers.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select></label><label className="form-field"><span>Клиент</span><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Например, Анна Смирнова" /></label><div className="form-field"><span>Мебельная компания</span><CompanyField value={furnitureFields} companies={furniture} onChange={updateFurniture} /></div><div className="form-field"><span>Мебельщик</span><MakerField value={furnitureFields} companies={furniture} onChange={updateFurniture} /></div><label className="form-field"><span>Номер телефона мебельщика</span><MakerPhoneField value={furnitureFields} onChange={updateFurniture} /></label><div className="form-field"><span>Телефоны контактов</span><PhoneContactsEditor contacts={phoneContacts} onChange={setPhoneContacts} /></div><div className="form-field form-field-wide"><span>Изделия</span><ItemsEditor items={items} onChange={setItems} decorGlues={decorGlues} glueOptions={glueOptions} onAddGlue={onAddGlue} /></div><label className="form-field"><span>Тип раковины</span><select value={sinkType} onChange={(e) => setSinkType(e.target.value)}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select></label><label className="form-field"><span>Цвет раковины</span><input value={sinkColor} onChange={(e) => setSinkColor(e.target.value)} placeholder="Например, белый или графит" /></label><label className="form-field"><span>Город</span><input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Город" /></label><label className="form-field"><span>Улица</span><input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Улица" /></label><label className="form-field"><span>Дом</span><input value={addressHouse} onChange={(e) => setAddressHouse(e.target.value)} placeholder="Номер дома" /></label><div className="form-field"><span>Тип дома</span><div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name="new-house-type" checked={houseType === "Многоквартирный"} onChange={() => setHouseType("Многоквартирный")} />Многоквартирный</label><label><input type="radio" name="new-house-type" checked={houseType === "Частный"} onChange={() => setHouseType("Частный")} />Частный</label></div></div><label className="form-field"><span>Квартира</span><input value={addressApartment} onChange={(e) => setAddressApartment(e.target.value)} placeholder="Номер квартиры" /></label></div><div className="form-note"><Sparkles size={15} /><span>Можно создать заказ без заполнения остальных полей и вернуться к ним позже.</span></div></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit"><Plus size={16} />Создать процесс</button></div></form></div>
}


function CatalogCard({ catalog, items, canManage, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const names = catalogNames(items)
  const byName = new Map(items.map((item) => [item.name, item]))
  const visible = query.trim() ? names.filter((item) => item.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))) : names
  const submit = async (event) => { event.preventDefault(); if (!name.trim()) return; if (await onAdd(catalog.kind, name) !== false) setName('') }
  return <section className="info-card catalog-card">
    <div className="info-card-head"><div><h3>{catalog.title} <span className="heading-count">{items.length}</span></h3><p>{catalog.hint}</p></div></div>
    {canManage && <form className="catalog-add" onSubmit={submit}><input value={name} onChange={(event) => setName(event.target.value)} placeholder={catalog.placeholder} aria-label={`Новая позиция: ${catalog.title}`} /><button className="primary-button" type="submit"><Plus size={15} />Добавить</button></form>}
    {items.length > 8 && <label className="catalog-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск…" /></label>}
    <div className="catalog-list">{visible.map((itemName) => <div className="catalog-item" key={byName.get(itemName).id}><span>{itemName}</span>{canManage && <button type="button" onClick={() => onRemove(catalog.kind, byName.get(itemName))} title="Убрать из списка" aria-label={`Убрать ${itemName}`}><X size={14} /></button>}</div>)}{!visible.length && <div className="catalog-empty">{items.length ? 'Ничего не найдено' : 'Список пуст'}</div>}</div>
  </section>
}

function CatalogsView({ catalogs, roles, onAdd, onRemove, flash, furniture, onFurnitureChange }) {
  return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />СПРАВОЧНИКИ</div><h1>Справочники</h1><p>Подсказки для работы и списки для выпадающих полей процесса. {roles.includes('Менеджер') ? 'Убранная позиция останется в старых процессах.' : 'Изменять списки может менеджер.'}</p></div></div>
    <DecorGlues canManage={roles.includes('Менеджер')} demo={staticDemo} glueOptions={catalogNames(catalogs.glue)} onAddGlue={(name) => onAdd('glue', name)} flash={flash} />
    <FurnitureDirectory items={furniture} onItemsChange={onFurnitureChange} canManage={roles.includes('Менеджер')} demo={staticDemo} flash={flash} />
    <div className="catalog-grid">{CATALOGS.map((catalog) => <CatalogCard key={catalog.kind} catalog={catalog} items={catalogs[catalog.kind] || []} canManage={roles.includes('Менеджер')} onAdd={onAdd} onRemove={onRemove} />)}</div>
  </div>
}

function OtherView({ furniture, onFurnitureChange, view, orders, employees, roles, user, onUserChange, onLogout, onIssueCredentials, flash, catalogs, onAddCatalogItem, onRemoveCatalogItem, onSelect, onAddEmployee, onUpdateEmployee, onDeactivateEmployee }) { if (view === 'Кабинет') return <AccountView user={user} demo={staticDemo} onUserChange={onUserChange} onLogout={onLogout} flash={flash} />; if (view === 'Справочники') return <CatalogsView catalogs={catalogs} roles={roles} onAdd={onAddCatalogItem} onRemove={onRemoveCatalogItem} flash={flash} furniture={furniture} onFurnitureChange={onFurnitureChange} />; if (view === 'Сотрудники') return <EmployeesView employees={employees} orders={orders} roles={roles} demo={staticDemo} currentUserId={user?.id} onAddEmployee={onAddEmployee} onUpdateEmployee={onUpdateEmployee} onDeactivateEmployee={onDeactivateEmployee} onIssueCredentials={onIssueCredentials} onOpenProcess={onSelect} flash={flash} />; if (view === 'Календарь') return <CalendarView orders={orders} user={user} onSelect={onSelect} />;
const todayKey = localDateKey()
const installationsToday = orders.filter((order) => order.stage !== 'Завершён' && [...(Array.isArray(order.installationDates) ? order.installationDates : []), order.installationDate].some((d) => d && String(d).slice(0, 10) === todayKey)).length
return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />КОМАНДА AQUASTONE</div><h1>Обзор</h1><p>Сводка производства и текущей загрузки команды.</p></div></div><div className="stat-grid"><StatCard label="Всего процессов" value={orders.length} detail="за всё время" icon={ClipboardList} tone="purple" /><StatCard label="В работе" value={orders.filter((o) => o.stage !== 'Завершён').length} detail="активных заказов" icon={Activity} tone="blue" /><StatCard label="Требуют внимания" value={orders.filter((o) => o.needsData).length} detail="нужно уточнить" icon={Clock3} tone="amber" /><StatCard label="Монтаж сегодня" value={installationsToday} detail="запланировано" icon={CalendarDays} tone="green" /></div><div className="overview-lower"><section className="info-card"><div className="info-card-head"><div><h3>Этапы производства</h3><p>Текущая загрузка процессов</p></div></div>{stages.slice(1, 8).map((s) => <button className="stage-overview" key={s} onClick={() => { const item = orders.find((o) => o.stage === s); if (item) onSelect(item) }}><span className={`status-pill status-${stageTone(s)}`}><i />{s}</span><span className="overview-count">{orders.filter((o) => o.stage === s).length}</span><ChevronRight size={16} /></button>)}</section><section className="info-card"><div className="info-card-head"><div><h3>Последние процессы</h3><p>Недавно обновлённые заказы</p></div></div>{orders.slice(0, 4).map((o) => <button className="recent-process" key={o.id} onClick={() => onSelect(o)}><div className={`order-mark mark-${stageTone(o.stage)}`}><FileText size={16} /></div><div><b>#{o.id} · {o.client}</b><small>{o.stage}</small></div><ChevronRight size={16} /></button>)}</section></div><MonthStats orders={orders} onOpenProcess={onSelect} /></div>
}

export default App
