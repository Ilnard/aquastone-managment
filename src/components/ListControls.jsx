import { CircleHelp, Download, Filter, MoreHorizontal, RefreshCw, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import Popover, { MenuItem } from './Popover.jsx'
import { FLOW, PRODUCTION_STAGES, isAssignedTo } from '../permissions.js'
import { materialsOf } from '../processItems.js'
import './ListControls.css'

// ---------- Колонки таблицы процессов ----------
const COLUMNS = [
  { key: 'material', title: 'Материал и декор' },
  { key: 'stage', title: 'Этап' },
  { key: 'manager', title: 'У кого сейчас' },
  { key: 'nextDate', title: 'Следующая дата' },
  { key: 'created', title: 'Дата создания' },
]
export const DEFAULT_COLUMNS = COLUMNS.map((column) => column.key)

export function ColumnsButton({ visible, onChange }) {
  const toggle = (key) => onChange(visible.includes(key) ? visible.filter((k) => k !== key) : DEFAULT_COLUMNS.filter((k) => k === key || visible.includes(k)))
  return <Popover trigger={(open, toggleOpen) => <button type="button" className={'square-button' + (open ? ' active' : '')} onClick={toggleOpen} title="Настройка колонок" aria-label="Настройка колонок"><SlidersHorizontal size={17} /></button>}>
    {() => <div className="aq-panel-form">
      <div className="aq-menu-title" style={{ padding: '2px 0 0' }}>Колонки таблицы</div>
      <label className="aq-check"><input type="checkbox" checked disabled />Процесс</label>
      {COLUMNS.map((column) => <label className="aq-check" key={column.key}><input type="checkbox" checked={visible.includes(column.key)} onChange={() => toggle(column.key)} />{column.title}</label>)}
      <div className="aq-panel-actions"><button type="button" className="aq-link-button" disabled={visible.length === DEFAULT_COLUMNS.length} onClick={() => onChange(DEFAULT_COLUMNS)}>Показать все</button></div>
    </div>}
  </Popover>
}

// ---------- Фильтры ----------
export const EMPTY_FILTERS = { manager: '', material: '', mine: false, hideDone: false, createdFrom: '', createdTo: '' }
// Период «с — по» считается одним фильтром.
export const activeFilterCount = (filters) => Object.entries(filters).filter(([key, value]) => key !== 'createdTo' && key in EMPTY_FILTERS && value !== EMPTY_FILTERS[key]).length
  + (!filters.createdFrom && filters.createdTo ? 1 : 0)

const dayKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
/** Дата создания процесса (ГГГГ-ММ-ДД): «Дата создания процесса» из «Сроков», иначе — когда процесс завели в системе (по местному времени). */
export function createdKeyOf(order) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(order.processCreatedDate || '')) return order.processCreatedDate
  const date = order.createdAt ? new Date(order.createdAt) : null
  return date && !Number.isNaN(date.getTime()) ? dayKey(date) : ''
}
/** Быстрые периоды для фильтра по дате создания. */
function quickRanges(today = new Date()) {
  const y = today.getFullYear(), m = today.getMonth()
  return [
    ['Этот месяц', dayKey(new Date(y, m, 1)), dayKey(today)],
    ['Прошлый месяц', dayKey(new Date(y, m - 1, 1)), dayKey(new Date(y, m, 0))],
    ['30 дней', dayKey(new Date(y, m, today.getDate() - 29)), dayKey(today)],
    ['Этот год', dayKey(new Date(y, 0, 1)), dayKey(today)],
  ]
}

export function applyFilters(orders, filters, userName) {
  return orders.filter((order) => (!filters.manager || order.manager === filters.manager)
    && (!filters.material || materialsOf(order).includes(filters.material)) // любое из изделий процесса
    && (!filters.hideDone || order.stage !== 'Завершён')
    && (!filters.mine || isAssignedTo(order, userName))
    && (!(filters.createdFrom || filters.createdTo) || inRange(createdKeyOf(order), filters.createdFrom, filters.createdTo)))
}
// Границы включительно; если «с» позже «по», меняем их местами.
function inRange(key, from, to) {
  if (!key) return false
  const [a, b] = from && to && from > to ? [to, from] : [from, to]
  return (!a || key >= a) && (!b || key <= b)
}

export function FiltersButton({ filters, onChange, orders }) {
  const count = activeFilterCount(filters)
  const managers = [...new Set(orders.map((order) => order.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
  const materials = [...new Set(orders.flatMap(materialsOf))].sort((a, b) => a.localeCompare(b, 'ru'))
  const set = (key, value) => onChange({ ...filters, [key]: value })
  return <Popover trigger={(open, toggle) => <button type="button" className={'filter-button filter-icon' + (count ? ' has-filters' : '') + (open ? ' active' : '')} onClick={toggle} aria-label={count ? `Фильтры: ${count}` : 'Фильтры'}><Filter size={16} /><span>Фильтры</span>{count > 0 && <span className="filter-tiny">{count}</span>}</button>}>
    {(close) => <div className="aq-panel-form">
      <label>Менеджер<select value={filters.manager} onChange={(e) => set('manager', e.target.value)}><option value="">Все менеджеры</option>{managers.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>Материал<select value={filters.material} onChange={(e) => set('material', e.target.value)}><option value="">Все материалы</option>{materials.map((name) => <option key={name}>{name}</option>)}</select></label>
      <fieldset className="aq-date-range">
        <legend>Дата создания</legend>
        <div className="aq-date-inputs">
          <label><span>с</span><input type="date" value={filters.createdFrom || ''} max={filters.createdTo || undefined} onChange={(e) => set('createdFrom', e.target.value)} aria-label="Дата создания с" /></label>
          <label><span>по</span><input type="date" value={filters.createdTo || ''} min={filters.createdFrom || undefined} onChange={(e) => set('createdTo', e.target.value)} aria-label="Дата создания по" /></label>
        </div>
        <div className="aq-date-quick">
          {quickRanges().map(([label, from, to]) => <button key={label} type="button" className={filters.createdFrom === from && filters.createdTo === to ? 'active' : ''} onClick={() => onChange({ ...filters, createdFrom: from, createdTo: to })}>{label}</button>)}
          {(filters.createdFrom || filters.createdTo) && <button type="button" className="clear" onClick={() => onChange({ ...filters, createdFrom: '', createdTo: '' })}>Любая дата</button>}
        </div>
      </fieldset>
      <label className="aq-check"><input type="checkbox" checked={filters.mine} onChange={(e) => set('mine', e.target.checked)} />Только мои процессы</label>
      <label className="aq-check"><input type="checkbox" checked={filters.hideDone} onChange={(e) => set('hideDone', e.target.checked)} />Скрыть завершённые</label>
      <div className="aq-panel-actions"><button type="button" className="aq-link-button" disabled={!count} onClick={() => onChange(EMPTY_FILTERS)}>Сбросить</button><button type="button" className="aq-link-button" onClick={close}>Готово</button></div>
    </div>}
  </Popover>
}

// ---------- Меню «⋯» над списком ----------
export function ListMenu({ onRefresh, onExport, onReset, canReset, onHelp }) {
  return <Popover trigger={(open, toggle) => <button type="button" className={'panel-more' + (open ? ' active' : '')} onClick={toggle} aria-label="Действия со списком"><MoreHorizontal size={20} /></button>}>
    {(close) => <div>
      <MenuItem icon={RefreshCw} onClick={() => { close(); onRefresh() }}>Обновить список</MenuItem>
      <MenuItem icon={Download} onClick={() => { close(); onExport() }}>Экспорт в Excel (CSV)</MenuItem>
      <MenuItem icon={RotateCcw} disabled={!canReset} onClick={() => { close(); onReset() }}>Сбросить фильтры и поиск</MenuItem>
      <div className="aq-menu-sep" />
      <MenuItem icon={CircleHelp} onClick={() => { close(); onHelp() }}>Как это работает</MenuItem>
    </div>}
  </Popover>
}

// ---------- «Следующая дата» в таблице ----------
const shortDay = (key) => new Date(key + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
/** Ближайшая дата процесса: монтаж или срок производства. null — дат нет. */
export function nextDateOf(order, todayKey) {
  if (order.stage === 'Завершён') return null
  const installs = [...(Array.isArray(order.installationDates) ? order.installationDates : []), order.installationDate].filter(Boolean).map((d) => String(d).slice(0, 10)).filter((d) => d >= todayKey).sort()
  if (installs.length) return { label: installs[0] === todayKey ? 'Монтаж сегодня' : `Монтаж · ${shortDay(installs[0])}`, tone: installs[0] === todayKey ? 'today' : '' }
  if (order.productionDate && PRODUCTION_STAGES.includes(order.stage)) {
    const key = String(order.productionDate).slice(0, 10)
    return { label: `Срок · ${shortDay(key)}`, tone: key < todayKey ? 'overdue' : key === todayKey ? 'today' : '' }
  }
  return null
}

// ---------- Выбранные строки ----------
export function SelectionBar({ count, onExport, onClear }) {
  return <div className="selection-bar" role="status"><b>Выбрано: {count}</b><button type="button" className="secondary-button" onClick={onExport}><Download size={15} />Экспорт выбранных</button><button type="button" className="aq-link-button" onClick={onClear}><X size={13} /> Снять выделение</button></div>
}

// ---------- «Как это работает» ----------
const STEPS = {
  'Новый заказ': ['Менеджер', 'Собирает данные, получает предоплату или оплату и нажимает «Передать на замер».'],
  'Замер': ['Замерщик', 'Заполняет вкладку «Замер», рисует чертёж и ставит статус «Готов».'],
  'Проектирование': ['Технолог', 'Видит «Замер · Готов», нажимает «Взять в работу», загружает чертежи и ставит «Готов».'],
  'Фрезеровка/Распил': ['ЧПУ', 'Видит «Проектирование · Готов», берёт в работу, после резки ставит «Готов».'],
  'Шлифовка/Полировка/Монтаж мойки': ['Обработчик', 'Видит «Фрезеровка/Распил · Готов», берёт в работу; после работы «Готово» — процесс сам переходит в «Произведено».'],
  'Произведено': ['Бригадир монтажников', 'Видит произведённый заказ и нажимает «Перевести в монтаж», назначает монтажников.'],
  'Монтаж': ['Бригадир и монтажники', 'После монтажа добавляют фото в «Фотоотчёт» (минимум одно) и ставят «Готов».'],
  'Завершён': ['Менеджер', 'Проверяет монтаж и фотоотчёт и нажимает «Закрыть процесс».'],
}
export function HowItWorks({ onClose }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="aq-modal" role="dialog" aria-label="Как это работает">
      <div className="modal-header"><div><span className="modal-kicker">ПОДСКАЗКА</span><h2>Как это работает</h2><p>Каждый заказ проходит 8 этапов. У рабочих этапов есть статус «Не готов» / «Готов»: исполнитель ставит «Готов», следующий забирает процесс к себе кнопкой «Взять в работу».</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
      <div className="modal-content how-content">
        <ol className="how-steps">{FLOW.map((stage, index) => <li key={stage}><span className="how-num">{index + 1}</span><div><b>{stage}</b>{STEPS[stage][0] && <small>{STEPS[stage][0]}</small>}<p>{STEPS[stage][1]}</p></div></li>)}</ol>
        <div className="how-tips">
          <p><b>Права.</b> Кнопки на странице процесса показываются только тем, кто может сделать этот шаг. Менеджер и директор могут всё, в том числе поменять этап вручную («Действия»).</p>
          <p><b>Нужны данные.</b> Любой сотрудник может отметить процесс «Нужны данные» через «Действия» — на любом этапе.</p>
          <p><b>Совместная работа.</b> Изменения коллег появляются сами. Если двое правят одно поле, второй увидит, кто его изменил, и сможет сохранить заново.</p>
          <p><b>Быстрый поиск.</b> <kbd>Ctrl</kbd>+<kbd>K</kbd> — найти процесс по номеру, клиенту, телефону или адресу.</p>
          <p><b>Уведомления.</b> Колокольчик вверху: изменения и комментарии по вашим процессам, монтажи на сегодня и завтра, просроченные сроки.</p>
        </div>
      </div>
    </div>
  </div>
}
