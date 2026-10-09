import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownUp, ArrowLeft, ArrowRight, Bell, CalendarDays, Check,
  ChevronDown, ChevronRight, CircleHelp, ClipboardList, Clock3, Command,
  FileText, Filter, Hammer, LayoutDashboard, LogOut, MapPin, MessageSquare,
  MoreHorizontal, Plus, Search, Settings2, SlidersHorizontal, Sparkles,
  UserRound, Users, X,
} from 'lucide-react'

const initialOrders = [
  { id: '1656', client: 'Анна Смирнова', product: 'Столешница для кухни', material: 'Кварцевый агломерат', decor: 'Calacatta Gold', stage: 'Замер проведён', color: 'blue', date: 'Сегодня, 14:30', initials: 'АС', manager: 'Мария К.', phone: '+7 912 345-67-89', address: 'Екатеринбург, ул. Белинского, 86', completeness: 92 },
  { id: '1655', client: 'Дмитрий Волков', product: 'Столешница + остров', material: 'Акрил', decor: 'Pure White', stage: 'Проектирование', color: 'violet', date: 'Завтра', initials: 'ДВ', manager: 'Мария К.', phone: '+7 912 420-18-35', address: 'Екатеринбург, ул. Малышева, 51', completeness: 76 },
  { id: '1654', client: 'Елена Кузнецова', product: 'Подоконники · 3 шт.', material: 'HPL (Компакт)', decor: 'Slate Grey', stage: 'Производство', color: 'orange', date: '18 октября', initials: 'ЕК', manager: 'Алексей Р.', phone: '+7 912 634-09-20', address: 'Берёзовский, ул. Гагарина, 12', completeness: 100 },
  { id: '1653', client: 'Игорь Павлов', product: 'Столешница для кухни', material: 'Кварцевый агломерат', decor: 'Noble Grey', stage: 'Готов к монтажу', color: 'green', date: '18 октября', initials: 'ИП', manager: 'Мария К.', phone: '+7 912 988-31-05', address: 'Екатеринбург, ул. Шейнкмана, 111', completeness: 100 },
  { id: '1652', client: 'Ольга Морозова', product: 'Столешница + фартук', material: 'Акрил', decor: 'Nordic White', stage: 'Монтаж', color: 'teal', date: 'Сегодня, 11:00', initials: 'ОМ', manager: 'Алексей Р.', phone: '+7 912 550-21-63', address: 'Екатеринбург, ул. Луначарского, 33', completeness: 100 },
  { id: '1651', client: 'Сергей Иванов', product: 'Столешница для ванной', material: 'Кварцевый агломерат', decor: 'Concrete Light', stage: 'Нужны данные', color: 'red', date: '—', initials: 'СИ', manager: 'Мария К.', phone: '', address: 'Екатеринбург, ул. Сакко и Ванцетти, 44', completeness: 54 },
]
const STORAGE_KEY = 'aquastone-processes-v1'
const EMPLOYEE_STORAGE_KEY = 'aquastone-employees-v1'
const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
const employeeRoles = ['Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Монтажник']
const initialEmployees = [
  { id: 'demo-manager-maria', name: 'Мария К.', role: 'Менеджер', active: true },
  { id: 'demo-manager-alexey', name: 'Алексей Р.', role: 'Менеджер', active: true },
  { id: 'demo-surveyor-andrey', name: 'Андрей С.', role: 'Замерщик', active: true },
]
const readStored = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback }
}

const stages = ['Все процессы', 'Новый заказ', 'Ожидает замера', 'Замер проведён', 'Проектирование', 'Производство', 'Готов к монтажу', 'Монтаж', 'Завершён', 'Нужны данные']
function formatRussianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  const national = (digits[0] === '8' || digits[0] === '7' ? digits.slice(1) : digits).slice(0, 10)
  if (!national) return '+7'
  return '+7 (' + national.slice(0, 3) + (national.length >= 3 ? ')' : '') + (national.length > 3 ? ' ' + national.slice(3, 6) : '') + (national.length > 6 ? '-' + national.slice(6, 8) : '') + (national.length > 8 ? '-' + national.slice(8, 10) : '')
}
function handleRussianPhoneKeyDown(event, value, onChange) {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return
  const input = event.currentTarget
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? start
  const digits = String(value || '').replace(/\D/g, '')
  const positions = [...String(value || '')].reduce((list, char, index) => { if (/\d/.test(char)) list.push(index); return list }, [])
  let removeIndexes = []
  if (start !== end) {
    removeIndexes = positions.map((position, index) => ({ position, index })).filter(({ position, index }) => position >= start && position < end && (index > 0 || start === 0)).map(({ index }) => index)
  } else if (event.key === 'Backspace') {
    const index = positions.findLastIndex((position, digitIndex) => position < start && digitIndex > 0)
    if (index >= 0) removeIndexes = [index]
  } else {
    const index = positions.findIndex((position, digitIndex) => position >= start && digitIndex > 0)
    if (index >= 0) removeIndexes = [index]
  }
  if (!removeIndexes.length) return
  event.preventDefault()
  const removeSet = new Set(removeIndexes)
  const nextDigits = [...digits].filter((_, index) => !removeSet.has(index)).join('')
  const nextValue = formatRussianPhone(nextDigits)
  const deletedBeforeCaret = removeIndexes.filter((index) => positions[index] < start).length
  const keepDigitsBeforeCaret = Math.max(0, [...String(value || '').slice(0, start)].filter((char) => /\d/.test(char)).length - deletedBeforeCaret)
  onChange(nextValue)
  requestAnimationFrame(() => {
    const formattedPositions = [...nextValue].reduce((list, char, index) => { if (/\d/.test(char)) list.push(index); return list }, [])
    const caret = keepDigitsBeforeCaret > 0 ? (formattedPositions[keepDigitsBeforeCaret - 1] ?? -1) + 1 : 0
    input.setSelectionRange(caret, caret)
  })
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
  return parts.filter(Boolean).join(', ') || order.address || 'Адрес не указан'
}
const stageTone = (stage) => ({ 'Новый заказ': 'gray', 'Ожидает замера': 'amber', 'Замер проведён': 'blue', 'Проектирование': 'violet', 'Производство': 'orange', 'Готов к монтажу': 'green', 'Монтаж': 'teal', 'Завершён': 'green', 'Нужны данные': 'red' }[stage] || 'gray')

function App() {
  const [orders, setOrders] = useState(() => readStored(STORAGE_KEY, initialOrders))
  const [employees, setEmployees] = useState(() => staticDemo ? readStored(EMPLOYEE_STORAGE_KEY, initialEmployees) : [])
  const [role, setRole] = useState(() => readStored('aquastone-role-v1', 'Менеджер'))
  const [activeStage, setActiveStage] = useState('Все процессы')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [toast, setToast] = useState('')
  const [view, setView] = useState('Процессы')
  const [sortNewest, setSortNewest] = useState(true)
  const [dbStatus, setDbStatus] = useState(staticDemo ? 'demo' : 'connecting')

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)) }, [orders])
  useEffect(() => { if (staticDemo) localStorage.setItem(EMPLOYEE_STORAGE_KEY, JSON.stringify(employees)) }, [employees])
  useEffect(() => { localStorage.setItem('aquastone-role-v1', JSON.stringify(role)) }, [role])
  useEffect(() => {
    if (staticDemo) { setDbStatus('demo'); return }
    let active = true
    let timer
    const syncWithDatabase = async () => {
      try {
        const health = await fetch('/api/health')
        if (!health.ok) throw new Error('PostgreSQL недоступен')
        const response = await fetch('/api/processes')
        if (!response.ok) throw new Error('Не удалось загрузить процессы')
        const remoteOrders = await response.json()
        const employeeResponse = await fetch('/api/employees')
        if (!employeeResponse.ok) throw new Error('Не удалось загрузить сотрудников')
        const remoteEmployees = await employeeResponse.json()
        if (active) { setOrders(remoteOrders); setEmployees(remoteEmployees); setDbStatus('connected') }
      } catch {
        if (active) setDbStatus('offline')
      }
    }
    syncWithDatabase()
    timer = window.setInterval(() => { if (active && dbStatus !== 'connected') syncWithDatabase() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [dbStatus])

  const filtered = useMemo(() => orders
    .filter((item) => activeStage === 'Все процессы' || item.stage === activeStage)
    .filter((item) => `${item.id} ${item.client} ${item.phone} ${item.material} ${item.address}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sortNewest ? Number(b.id) - Number(a.id) : Number(a.id) - Number(b.id)), [orders, activeStage, query, sortNewest])

  const flash = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600) }
  const updateOrder = async (order) => {
    try {
      let saved = order
      if (!staticDemo) {
        if (dbStatus !== 'connected') throw new Error('PostgreSQL недоступен. Изменения не сохранены.')
        const response = await fetch(`/api/processes/${encodeURIComponent(order.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...order, updatedBy: role }),
        })
        const result = await response.json()
        if (!response.ok) {
          if (response.status === 503) setDbStatus('offline')
          throw new Error(result.error || 'Не удалось сохранить процесс.')
        }
        saved = result
      }
      setOrders((items) => items.map((item) => item.id === saved.id ? saved : item))
      setSelected((item) => item?.id === saved.id ? saved : item)
      return saved
    } catch (error) {
      flash(error.message || 'Не удалось сохранить изменения.')
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
    } catch (error) { flash(error.message) }
  }

  const addEmployee = async ({ name, role: employeeRole }) => {
    if (staticDemo) {
      const duplicate = employees.some((employee) => employee.name.toLocaleLowerCase() === name.toLocaleLowerCase() && employee.role === employeeRole)
      if (duplicate) { flash('Сотрудник с такой ролью уже есть'); return false }
      setEmployees((items) => [...items, { id: `demo-${Date.now()}`, name, role: employeeRole, active: true }].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
      flash('Сотрудник добавлен')
      return true
    }
    try {
      const response = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, role: employeeRole }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось добавить сотрудника')
      setEmployees((items) => [...items.filter((employee) => employee.id !== result.id), result].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
      flash('Сотрудник добавлен')
      return true
    } catch (error) { flash(error.message); return false }
  }

  const deactivateEmployee = async (employee) => {
    if (staticDemo) {
      setEmployees((items) => items.filter((item) => item.id !== employee.id))
      return
    }
    try {
      const response = await fetch(`/api/employees/${employee.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Не удалось убрать сотрудника из списка')
      setEmployees((items) => items.filter((item) => item.id !== employee.id))
    } catch (error) { flash(error.message) }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setSelected(null); setView('Процессы') }}>
        <span className="brand-mark"><span /></span><span className="brand-copy"><b>aqua<span>stone</span></b><small>WORKSPACE</small></span>
      </a>
      <div className="workspace-switch"><div className="workspace-icon">A</div><div><b>Aquastone</b><small>Производство</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="main-nav">
        {[['Процессы', ClipboardList], ['Обзор', LayoutDashboard], ['Календарь', CalendarDays]].map(([label, Icon]) => <button key={label} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); setSelected(null) }}><Icon size={18} /><span>{label}</span>{label === 'Процессы' && <span className="nav-count">{orders.length}</span>}</button>)}
        <button className={`nav-item mobile-nav-item ${view === 'Сотрудники' ? 'active' : ''}`} onClick={() => { setView('Сотрудники'); setSelected(null) }}><Users size={18} /><span>Сотрудники</span></button>
      </nav>
      <div className="nav-label nav-label-spaced">КОМАНДА</div>
      <nav className="secondary-nav" aria-label="Команда">
        <button className={`nav-item ${view === 'Сотрудники' ? 'active' : ''}`} onClick={() => { setView('Сотрудники'); setSelected(null) }}><Users size={18} /><span>Сотрудники</span></button>
        <button className="nav-item" onClick={() => flash('Справочники будут доступны здесь')}><Settings2 size={18} /><span>Справочники</span></button>
      </nav>
      <div className="sidebar-bottom">
        <button className="user-profile" onClick={() => { const roles = ['Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Монтажник']; setRole(roles[(roles.indexOf(role) + 1) % roles.length]) }} title="Нажмите, чтобы переключить роль в прототипе"><div className="avatar avatar-user">МК</div><div className="user-data"><b>Мария К.</b><small>{role}</small></div><MoreHorizontal size={19} /></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Рабочее пространство</span><ChevronRight size={14} /><b>{selected ? `Процесс ${selected.id}` : view}</b></div><div className={`db-status db-${dbStatus}`}><i />{dbStatus === 'connected' ? 'PostgreSQL подключён' : dbStatus === 'connecting' ? 'Подключение к БД…' : dbStatus === 'demo' ? 'Демо: хранение в браузере' : 'PostgreSQL недоступен'}</div><div className="top-actions"><div className="quick-search"><Search size={15} /><span>Быстрый поиск</span><kbd>⌘ K</kbd></div><button className="icon-button notification" onClick={() => flash('Новых уведомлений нет')} aria-label="Уведомления"><Bell size={18} /><i /></button><div className="top-divider" /><div className="top-user"><div className="avatar avatar-user">МК</div><ChevronDown size={14} /></div></div></header>
      {selected ? <DetailPage order={selected} role={role} employees={employees} onBack={() => setSelected(null)} onUpdate={updateOrder} flash={flash} /> : view === 'Процессы' ? <>
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> ВАШЕ ПРОИЗВОДСТВО, В ОДНОМ МЕСТЕ</div><h1>Процессы <span className="heading-count">{orders.length}</span></h1><p>Все заказы на изготовление и монтаж в одном пространстве.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => flash('Отчёт подготовлен')}><ArrowDownUp size={16} />Экспорт отчёта</button>{role === 'Менеджер' && <button className="primary-button" onClick={() => setShowNew(true)}><Plus size={17} />Новый процесс</button>}</div></div>
        <div className="stat-grid"><StatCard label="Всего процессов" value={orders.length} detail="за всё время" icon={ClipboardList} tone="purple" /><StatCard label="В работе" value={orders.filter((o) => !['Завершён', 'Нужны данные'].includes(o.stage)).length} detail="активных заказов" icon={Activity} tone="blue" /><StatCard label="Требуют внимания" value={orders.filter((o) => o.stage === 'Нужны данные').length} detail="нужно уточнить" icon={Clock3} tone="amber" /><StatCard label="Монтаж сегодня" value="2" detail="запланировано" icon={CalendarDays} tone="green" /></div>
        <section className="process-panel"><div className="panel-title-row"><div><h2>Все процессы</h2><p>Управляйте заказами на каждом этапе производства</p></div><button className="panel-more" onClick={() => flash('Настройки списка')}><MoreHorizontal size={20} /></button></div>
          <div className="stage-tabs">{stages.map((stage) => <button key={stage} className={`stage-tab ${activeStage === stage ? 'selected' : ''}`} onClick={() => setActiveStage(stage)}>{stage}<span>{stage === 'Все процессы' ? orders.length : orders.filter((o) => o.stage === stage).length}</span></button>)}</div>
          <div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по процессу, заказчику или телефону..." /></div><div className="toolbar-actions"><button className="filter-button" onClick={() => setSortNewest((v) => !v)}><ArrowDownUp size={15} />{sortNewest ? 'Сначала новые' : 'Сначала старые'}</button><button className="filter-button filter-icon" onClick={() => setActiveStage('Все процессы')}><Filter size={16} /><span>Фильтры</span><span className="filter-tiny">0</span></button><button className="square-button" onClick={() => flash('Настройка колонок')}><SlidersHorizontal size={17} /></button></div></div>
          <div className="table-wrap"><table><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Выбрать все" /></th><th>ПРОЦЕСС</th><th>МАТЕРИАЛ И ДЕКОР</th><th>ЭТАП</th><th>ОТВЕТСТВЕННЫЙ</th><th>СЛЕДУЮЩАЯ ДАТА</th><th></th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} onClick={() => setSelected(order)}><td className="check-cell" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Выбрать процесс ${order.id}`} /></td><td><div className="process-cell"><div className={`order-mark mark-${stageTone(order.stage)}`}><FileText size={17} /></div><div><b>#{order.id}</b><span>{order.client}</span><small>{order.product}</small></div></div></td><td><div className="material-cell"><b>{order.material}</b><span><i className={`decor-dot decor-${order.color}`} />{order.decor}</span></div></td><td><span className={`status-pill status-${stageTone(order.stage)}`}><i />{order.stage}</span></td><td><div className="manager-cell"><div className={`avatar avatar-${order.color}`}>{order.manager.split(' ').map((s) => s[0]).join('')}</div><span>{order.manager}</span></div></td><td><div className="date-cell"><CalendarDays size={15} /><span>{order.date}</span></div></td><td><button className="row-more" onClick={(e) => { e.stopPropagation(); setSelected(order) }}><MoreHorizontal size={19} /></button></td></tr>)}</tbody></table>
          {filtered.length === 0 && <div className="empty-state">{orders.length === 0 ? <FileText size={24} /> : <Search size={24} />}<b>{orders.length === 0 ? 'Пока нет процессов' : 'Ничего не найдено'}</b><span>{orders.length === 0 ? 'Создайте первый процесс и назначьте ему внутренний номер.' : 'Попробуйте изменить запрос или выбрать другой этап.'}</span></div>}</div>
          <div className="table-footer"><span>Показано <b>{filtered.length ? 1 : 0}–{filtered.length}</b> из <b>{filtered.length}</b> процессов</span><div><button disabled>← Предыдущая</button><button className="page-number">1</button><button disabled>Следующая →</button></div></div>
        </section>
        <div className="bottom-note"><Sparkles size={15} /><span>Каждый заказ проходит все этапы — от первого замера до установки.</span><button onClick={() => flash('Скоро здесь появятся подсказки по процессам')}>Как это работает <ArrowRight size={14} /></button></div>
      </> : <OtherView view={view} orders={orders} employees={employees} role={role} onSelect={setSelected} onAddEmployee={addEmployee} onDeactivateEmployee={deactivateEmployee} />}
    </main>
    {showNew && <NewProcessModal onClose={() => setShowNew(false)} onCreate={createOrder} onDuplicate={flash} orders={orders} employees={employees} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function StatCard({ label, value, detail, icon: Icon, tone }) { return <div className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-number">{value}</div><div className="stat-detail">{detail}</div><div className={`stat-spark spark-${tone}`}><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></div> }

function DetailPage({ order, role, employees, onBack, onUpdate, flash }) {
  const [tab, setTab] = useState('Обзор')
  const [editingOverview, setEditingOverview] = useState(false)
  const [overviewDraft, setOverviewDraft] = useState({})
  const startOverviewEdit = () => { setOverviewDraft({ ...order }); setEditingOverview(true) }
  const cancelOverviewEdit = () => { setOverviewDraft({}); setEditingOverview(false) }
  const saveOverviewEdit = async () => {
    const changed = Object.keys(overviewDraft).some((key) => overviewDraft[key] !== order[key])
    if (!changed) {
      setEditingOverview(false)
      setOverviewDraft({})
      flash('Изменений нет')
      return
    }
    try {
      await onUpdate(overviewDraft)
      setEditingOverview(false)
      setOverviewDraft({})
      flash('Основные данные сохранены')
    } catch { /* Keep the draft open so the employee can retry or cancel. */ }
  }
  const canEditTab = (name) => role === 'Менеджер' || (role === 'Замерщик' && name === 'Замер') || (role === 'Технолог' && ['Замер', 'Проектирование'].includes(name)) || (role === 'ЧПУ' && name === 'Производство') || (role === 'Монтажник' && name === 'Монтаж')
  const canProgress = role === 'Менеджер' || (role === 'Замерщик' && order.stage === 'Ожидает замера') || (role === 'Технолог' && order.stage === 'Проектирование') || (role === 'ЧПУ' && order.stage === 'Производство') || (role === 'Монтажник' && ['Готов к монтажу', 'Монтаж'].includes(order.stage))
  const flow = ['Новый заказ', 'Ожидает замера', 'Замер проведён', 'Проектирование', 'Производство', 'Готов к монтажу', 'Монтаж', 'Завершён']
  const current = flow.indexOf(order.stage)
  const advance = async () => { const next = flow[Math.min((current < 0 ? 0 : current) + 1, flow.length - 1)]; try { await onUpdate({ ...order, stage: next, completeness: 100 }); flash(`Этап изменён: ${next}`) } catch {} }
  return <div className="detail-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} />К списку процессов</button><div className="detail-heading"><div><div className="detail-overline">ПРОЦЕСС #{order.id} <span>·</span> Создан 12 октября, 2026</div><h1>{order.client}</h1><div className="detail-subtitle">{order.product} <span>·</span> {order.material}</div></div><div className="heading-actions"><button className="secondary-button" onClick={() => flash('Ссылка скопирована')}><MoreHorizontal size={17} />Действия</button>{canProgress && <button className="primary-button" onClick={advance}>Передать дальше <ArrowRight size={16} /></button>}</div></div>
    <div className="detail-meta"><span className={`status-pill status-${stageTone(order.stage)}`}><i />{order.stage}</span><div className="meta-divider" /><div className="meta-person"><div className={`avatar avatar-${order.color}`}>{order.manager.split(' ').map((s) => s[0]).join('')}</div><span>{order.manager}</span><small>менеджер</small></div><div className="meta-divider" /><div className="meta-location"><MapPin size={16} />{formatProcessAddress(order)}</div></div>
    <div className="workflow-card"><div className="workflow-title"><div><h3>Путь заказа</h3><p>Процесс проходит 8 этапов до завершения</p></div><span>{Math.max(current + 1, 1)} <i>/ 8</i></span></div><div className="workflow-line">{flow.map((step, i) => <div key={step} className={`workflow-step ${i < current ? 'done' : i === current ? 'current' : ''}`}><div className="workflow-dot">{i < current ? <Check size={12} /> : null}</div><span>{step}</span></div>)}</div></div>
    <div className="detail-tabs">{['Обзор', 'Замер', 'Проектирование', 'Производство', 'Монтаж', 'История'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === 'Замер' && order.completeness > 70 && <span className="tab-check"><Check size={10} /></span>}</button>)}</div>
    {tab === 'Обзор' && <div className="detail-content"><div className="detail-main-column"><section className="info-card"><div className="info-card-head"><div><h3>Информация о заказе</h3><p>Основные данные процесса</p></div>{role === 'Менеджер' && (editingOverview ? <div className="edit-actions"><button onClick={cancelOverviewEdit}><X size={15} />Отмена</button><button onClick={saveOverviewEdit}><Check size={15} />Сохранить</button></div> : <button onClick={startOverviewEdit}><Settings2 size={16} />Изменить</button>)}</div><div className="info-grid">{[['Номер процесса', 'id'], ['Изделие', 'product'], ['Материал', 'material'], ['Декор', 'decor'], ['Заказчик', 'client'], ['Телефон заказчика', 'phone'], ['Адрес объекта', 'address'], ['Виды лифта', 'elevatorTypes'], ['Раковина', 'sinkType'], ['Цвет раковины', 'sinkColor'], ...(['Акрил', 'Кварцевый агломерат'].includes(editingOverview ? overviewDraft.material : order.material) ? [['Клей', 'glue']] : []), ['Менеджер', 'manager']].map(([label, key]) => <Info key={key} className={key === 'address' ? 'address-info-field' : ''} label={label} value={editingOverview && key === 'manager' ? <select className="inline-edit" value={overviewDraft.manager || ''} onChange={(e) => setOverviewDraft((current) => ({ ...current, manager: e.target.value }))}><option value="">Выберите менеджера</option>{employees.filter((employee) => employee.role === 'Менеджер').map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select> : editingOverview && key === 'address' ? <b>{formatProcessAddress({ ...order, ...overviewDraft })}</b> : editingOverview && key === 'houseType' ? <div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name={'overview-house-type-' + order.id} checked={overviewDraft.houseType === 'Многоквартирный'} onChange={() => setOverviewDraft((current) => ({ ...current, houseType: 'Многоквартирный' }))} />Многоквартирный</label><label><input type="radio" name={'overview-house-type-' + order.id} checked={overviewDraft.houseType === 'Частный'} onChange={() => setOverviewDraft((current) => ({ ...current, houseType: 'Частный' }))} />Частный</label></div> : editingOverview && key === 'phone' ? <input className="inline-edit" type="tel" inputMode="tel" placeholder="+7 (999) 888-77-66" value={formatRussianPhone(overviewDraft.phone ?? order.phone ?? '')} onChange={(e) => setOverviewDraft((current) => ({ ...current, phone: formatRussianPhone(e.target.value) }))} onKeyDown={(e) => handleRussianPhoneKeyDown(e, overviewDraft.phone ?? order.phone ?? '', (phone) => setOverviewDraft((current) => ({ ...current, phone })))} /> : editingOverview && key !== 'id' && key !== 'elevatorTypes' ? <input className="inline-edit" value={overviewDraft[key] ?? ''} onChange={(e) => setOverviewDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'id' ? `#${order.id}` : key === 'address' ? <span className="address-value">{formatProcessAddress(order)}{formatProcessAddress(order) !== 'Адрес не указан' && <span className="address-actions"><a href={'https://2gis.ru/search/' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/2gis.png"} alt="" />Открыть в 2ГИС</a><a href={'https://yandex.ru/maps/?text=' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/yandex-maps.png"} alt="" />Открыть в Яндекс Картах</a><a href={'yandexnavi://map_search?text=' + encodeURIComponent(formatProcessAddress(order))} target="_blank" rel="noreferrer"><img src={import.meta.env.BASE_URL + "icons/yandex-navigator.png"} alt="" />Открыть в Яндекс Навигаторе</a></span>}</span> : key === 'phone' ? (order.phone ? <a className="phone-link" href={'tel:' + formatRussianPhone(order.phone).replace(/[^\d+]/g, '')}>{formatRussianPhone(order.phone)}</a> : 'Не указан') : key === 'elevatorTypes' ? (order.elevatorTypes || (order.elevatorType ? [order.elevatorType] : [])).map((type) => ({ square: 'Квадратный', vertical: 'Длинный прямой', horizontal: 'Длинный боковой' }[type])).filter(Boolean).join(', ') || 'Не указаны' : (order[key] || 'Не указан')} />)}</div></section>
      <section className="info-card stage-info"><div className="info-card-head"><div><div className="stage-card-title"><div className="stage-card-icon blue-icon"><MapPin size={17} /></div><div><h3>Замер объекта</h3><p>Данные от замерщика</p></div></div></div><span className="completion">{order.completeness}% заполнено</span></div><div className="completion-track"><span style={{ width: `${order.completeness}%` }} /></div>{order.completeness < 100 ? <div className="missing-note"><CircleHelp size={16} /><span>Добавьте телефон заказчика и фото объекта перед передачей в монтаж.</span><button onClick={() => setTab('Замер')}>Заполнить <ArrowRight size={14} /></button></div> : <div className="info-grid"><Info label="Дата замера" value="12 октября, 2026" /><Info label="Этаж и лифт" value="8 этаж · пассажирский лифт" /><Info label="Чертёж и размеры" value="Файл приложен" /><Info label="Фото объекта" value="4 фотографии" /></div>}</section>
      <section className="comment-card"><div className="comment-icon"><MessageSquare size={17} /></div><div className="comment-input" onClick={() => flash('Комментарии доступны в полной версии')}><span>Оставьте комментарий для команды...</span><kbd>⌘ ↵</kbd></div></section></div>
      <aside className="detail-side"><TeamCard order={order} role={role} employees={employees} onUpdate={onUpdate} flash={flash} /><section className="info-card side-card"><div className="side-head"><h3>Сроки</h3><button onClick={() => flash('Редактирование сроков')}>Изменить</button></div><div className="deadline-row"><div className="deadline-icon"><CalendarDays size={17} /></div><div><small>Следующее событие</small><b>{order.date}</b></div></div><div className="deadline-row"><div className="deadline-icon"><Hammer size={17} /></div><div><small>Плановый монтаж</small><b>Не запланирован</b></div></div></section><section className="tip-card"><Sparkles size={16} /><b>Подсказка</b><p>Заполните все данные замера, чтобы технолог смог подготовить точный чертёж.</p></section></aside></div>}
    {tab !== 'Обзор' && <StageTab tab={tab} order={order} flash={flash} canEdit={canEditTab(tab)} onUpdate={onUpdate} />}</div>
}

function TeamCard({ order, role, employees, onUpdate, flash }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const slots = [
    { label: 'Менеджер', field: 'manager', tone: 'purple' },
    { label: 'Замерщик', field: 'surveyor', tone: 'blue' },
    { label: 'Технолог', field: 'technologist', tone: 'violet' },
    { label: 'Оператор ЧПУ', field: 'cncOperator', tone: 'orange' },
    { label: 'Монтажники', field: 'installers', tone: 'green' },
  ]
  const save = async () => {
    try {
      await onUpdate({ ...order, ...draft })
      setEditing(false)
      setDraft({})
      flash('Состав команды сохранён')
    } catch { /* Leave the form open so changes can be retried. */ }
  }
  return <section className="info-card side-card"><div className="side-head"><div><h3>Команда процесса</h3><p>Ответственные участники</p></div>{role === 'Менеджер' && (editing ? <div className="edit-actions"><button onClick={() => { setDraft({}); setEditing(false) }}>Отмена</button><button onClick={save}><Check size={14} />Сохранить</button></div> : <button onClick={() => { setDraft({ ...order }); setEditing(true) }}>Изменить</button>)}</div>{slots.map(({ label, field, tone }) => { const name = editing ? (draft[field] || '') : (order[field] || ''); const initials = name.trim() ? name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() : '—'; return <div className="team-row" key={field}><div className={'avatar avatar-' + tone}>{initials}</div><div><small>{label}</small>{editing && role === 'Менеджер' ? <select className="team-edit" value={draft[field] || ''} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}><option value="">Не назначен</option>{employees.filter((employee) => employee.role === ({ manager: 'Менеджер', surveyor: 'Замерщик', technologist: 'Технолог', cncOperator: 'ЧПУ', installers: 'Монтажник' }[field])).map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select> : <b className={!name ? 'muted-name' : ''}>{name || 'Не назначен'}</b>}</div></div>})}</section>
}

function ElevatorSketch({ type }) {
  const box = type === 'square' ? <rect x="34" y="5" width="56" height="52" /> : type === 'vertical' ? <rect x="42" y="3" width="40" height="64" /> : <rect x="9" y="19" width="106" height="47" />
  const entrance = type === 'horizontal' ? <path d="M35 75 21 89h9v12h10V89h9L35 75Z" /> : <path d="M62 75 48 89h9v12h10V89h9L62 75Z" />
  return <svg className={'elevator-sketch ' + type} viewBox="0 0 124 104" aria-hidden="true">{box}{entrance}</svg>
}

function Info({ label, value, className = '' }) { return <div className={'info-field ' + className}><span>{label}</span><b>{value}</b></div> }
function StageTab({ tab, order, flash, canEdit, onUpdate }) {
  const [draft, setDraft] = useState({})
  const [attachments, setAttachments] = useState([])
  const [history, setHistory] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)
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
    'Замер': [['Город', 'addressCity'], ['Улица', 'addressStreet'], ['Дом', 'addressHouse'], ['Тип дома', 'houseType'], ['Квартира', 'addressApartment'], ['Этаж', 'floor'], ['Подъезд', 'entrance'], ['Есть лифт', 'hasElevator'], ['Визуальный тип лифта', 'elevatorType'], ['Размеры и эскиз', 'measurements'], ['Тип раковины', 'sinkType'], ['Цвет раковины', 'sinkColor'], ['Смеситель, дозатор, мех. измельчитель', 'fixturePositions'], ['Фото объекта', 'surveyPhotos'], ['Фото чертежа', 'drawingPhotos'], ['Доп. комментарии', 'surveyNotes']],
    'Проектирование': [['Технолог', 'technologist'], ['Чертёж AutoCAD', 'cadFile'], ['Раскрой материала', 'cutPlan'], ['Передача на ЧПУ', 'cncTransfer']],
    'Производство': [['Клей', 'glue'], ['Оператор ЧПУ', 'cncOperator'], ['Раскрой', 'cncCutting'], ['Обработка фасок', 'edgeFinishing'], ['Упаковка', 'packaging'], ['Комментарий производства', 'productionNotes']],
    'Монтаж': [['Телефон заказчика', 'phone'], ['Дата монтажа', 'installationDate'], ['Бригада монтажников', 'installers'], ['Доступ на объект', 'installationAccess'], ['Результат монтажа', 'installationResult'], ['Комментарий монтажников', 'installationNotes']],
  }
  const values = {}
  const legacyAccess = String(order.surveyAccess || '')
  const floorValue = draft.floor ?? order.floor ?? legacyAccess.match(/-?\d+/)?.[0] ?? ''
  const inferredElevator = /лифт.*(?:есть|да|пассажир|груз)|(?:пассажир|груз).*лифт/i.test(legacyAccess) ? true : /без лифта|лифт(?:а)?\s*(?:нет|отсутствует)/i.test(legacyAccess) ? false : null
  const elevatorValue = draft.hasElevator ?? order.hasElevator ?? inferredElevator
  const fixtureFields = [['Смеситель', 'mixerPosition'], ['Дозатор', 'dispenserPosition'], ['Мех. измельчитель', 'grinderPosition']]
  const fixturePositions = Object.fromEntries(fixtureFields.map(([, key]) => { const value = draft[key] ?? order[key] ?? 'н/д'; return [key, value === 'Нет' ? 'н/д' : value] }))
  const duplicateFixturePositions = ['Слева', 'По центру', 'Справа'].filter((position) => fixtureFields.filter(([, key]) => fixturePositions[key] === position).length > 1)
  const fields = (definitions[tab] || []).filter(([, key]) => (key !== 'glue' || ['Акрил', 'Кварцевый агломерат'].includes(order.material)))
  const save = async () => {
    if (duplicateFixturePositions.length) { flash(`Расположение «${duplicateFixturePositions.join('», «')}» указано для нескольких приборов. Выберите разные места.`); return }
    if (!Object.keys(draft).length) { flash('Нет изменений для сохранения'); return }
    try {
      await onUpdate({ ...order, ...draft })
      setDraft({})
      flash('Изменения сохранены')
    } catch { /* Keep the draft open so the employee can retry or cancel. */ }
  }
  const longTextKeys = ['measurements', 'cutouts', 'surveyPhotos', 'surveyNotes', 'cutPlan', 'productionNotes', 'installationNotes']
  const historyFieldNames = { stage: 'этап', product: 'изделие', material: 'материал', decor: 'декор', client: 'заказчик', phone: 'телефон', address: 'адрес', sinkType: 'тип раковины', sinkColor: 'цвет раковины', glue: 'клей', surveyAccess: 'этаж и лифт', floor: 'этаж', entrance: 'подъезд', hasElevator: 'наличие лифта', elevatorType: 'тип лифта', elevatorTypes: 'варианты лифта', measurements: 'размеры и эскиз', cutouts: 'фаски и вырезы', surveyNotes: 'дополнительные комментарии', cadFile: 'чертёж AutoCAD', cutPlan: 'раскрой материала', cncTransfer: 'передача на ЧПУ', cncOperator: 'оператор ЧПУ', cncCutting: 'раскрой', edgeFinishing: 'обработка фасок', packaging: 'упаковка', productionNotes: 'комментарий производства', installationDate: 'дата монтажа', installers: 'бригада монтажников', installationAccess: 'доступ на объект', installationResult: 'результат монтажа', installationNotes: 'комментарий монтажников', completeness: 'заполнение процесса' }
  const uploadFile = async (event, fieldKey = (tab === 'Замер' ? 'survey' : 'design')) => {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    if (staticDemo) { flash('GitHub Pages показывает демо-интерфейс; загрузка файлов доступна на серверной версии.'); event.target.value = ''; return }
    setUploading(true)
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
    } catch (error) { flash(error.message) }
    finally { setUploading(false); event.target.value = '' }
  }
  const deleteAttachment = async (file) => {
    try {
      const response = await fetch(`/api/processes/${encodeURIComponent(order.id)}/attachments/${file.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Не удалось удалить файл.')
      setAttachments((current) => current.filter((item) => item.id !== file.id))
      flash('Файл удалён')
    } catch (error) { flash(error.message) }
  }
  const relevantAttachments = attachments.filter((file) => file.field_key === (tab === 'Замер' ? 'survey' : tab === 'Проектирование' ? 'design' : file.field_key))
  const objectPhotos = attachments.filter((file) => file.field_key === 'surveyPhotos')
  const drawingPhotos = attachments.filter((file) => file.field_key === 'drawingPhotos')
  return <section className="info-card tab-content-card"><div className="info-card-head"><div><h3>{tab === 'История' ? 'История процесса' : `${tab} процесса`}</h3><p>{tab === 'История' ? 'События и изменения по процессу' : canEdit ? 'Вы можете заполнять поля этого этапа.' : 'У этой роли нет прав редактирования этого этапа.'}</p></div>{tab !== 'История' && canEdit && <button onClick={save}><Check size={15} />Сохранить</button>}</div>{tab === 'История' ? history.length ? <div className="history-list">{history.map((event) => <article className="history-event" key={event.id}><span className="history-marker"><i /></span><div><div className="history-event-head"><b>{event.action === 'created' ? 'Процесс создан' : 'Изменения сохранены'}</b><time>{new Date(event.createdAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><p>{event.action === 'created' ? `Процесс #${order.id} создан` : `Изменены поля: ${(event.details?.changedFields || []).map((key) => historyFieldNames[key] || key).join(', ')}`}</p><small>{event.actor}</small></div></article>)}</div> : <div className="history-empty">История пока пуста. Новые изменения будут отображаться здесь.</div> : <div className="info-grid">{fields.map(([label, key]) => <div className={'info-field' + (key === 'elevatorType' ? ' elevator-field' : '')} key={key}><span>{label}</span>{canEdit ? key === 'floor' || key === 'entrance' ? <input className="inline-edit" type="number" min={key === 'floor' ? 0 : 1} step="1" value={key === 'floor' ? floorValue : (draft.entrance ?? order.entrance ?? '')} placeholder={key === 'floor' ? 'Этаж' : 'Подъезд'} onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'houseType' ? <div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name={'house-type-' + order.id} checked={(draft.houseType ?? order.houseType) === 'Многоквартирный'} onChange={() => setDraft((current) => ({ ...current, houseType: 'Многоквартирный' }))} />Многоквартирный</label><label><input type="radio" name={'house-type-' + order.id} checked={(draft.houseType ?? order.houseType) === 'Частный'} onChange={() => setDraft((current) => ({ ...current, houseType: 'Частный' }))} />Частный</label></div> : key === 'hasElevator' ? <div className="radio-group" role="radiogroup" aria-label="Есть лифт"><label><input type="radio" name={'elevator-' + order.id} checked={elevatorValue === true} onChange={() => setDraft((current) => ({ ...current, hasElevator: true }))} />Да</label><label><input type="radio" name={'elevator-' + order.id} checked={elevatorValue === false} onChange={() => setDraft((current) => ({ ...current, hasElevator: false, elevatorType: '', elevatorTypes: [] }))} />Нет</label></div> : key === 'elevatorType' ? <div className="elevator-options" role="group" aria-label="Типы лифтов">{[['square', 'Квадратный'], ['vertical', 'Длинный прямой'], ['horizontal', 'Длинный боковой']].map(([type, title]) => { const selectedTypes = draft.elevatorTypes ?? order.elevatorTypes ?? (order.elevatorType ? [order.elevatorType] : []); const checked = selectedTypes.includes(type); return <label className={'elevator-option' + (checked ? ' selected' : '')} key={type}><input type="checkbox" disabled={elevatorValue === false} checked={checked} onChange={(event) => setDraft((current) => { const currentTypes = current.elevatorTypes ?? order.elevatorTypes ?? (order.elevatorType ? [order.elevatorType] : []); return { ...current, hasElevator: event.target.checked ? true : (current.hasElevator ?? order.hasElevator), elevatorTypes: event.target.checked ? [...currentTypes, type] : currentTypes.filter((item) => item !== type) } })} /><ElevatorSketch type={type} /></label>})}</div> : key === 'fixturePositions' ? canEdit ? <div className="fixture-position-fields">{fixtureFields.map(([title, fixtureKey]) => <label className="fixture-position-field" key={fixtureKey}><span>{title}</span><select className="inline-edit" value={fixturePositions[fixtureKey]} onChange={(event) => setDraft((current) => ({ ...current, [fixtureKey]: event.target.value }))}><option value="н/д">н/д</option><option value="Не нужен">Не нужен</option>{['Слева', 'По центру', 'Справа'].map((position) => { const usedElsewhere = fixtureFields.some(([, otherKey]) => otherKey !== fixtureKey && fixturePositions[otherKey] === position); return <option key={position} value={position} disabled={usedElsewhere && fixturePositions[fixtureKey] !== position}>{position}</option> })}</select></label>)}{duplicateFixturePositions.length > 0 && <p className="fixture-position-warning" role="alert">Одинаковое расположение выбрано у нескольких приборов. Исправьте выбор перед сохранением.</p>}</div> : <div className="fixture-position-summary">{fixtureFields.map(([title, fixtureKey]) => <span key={fixtureKey}><b>{title}:</b> {fixturePositions[fixtureKey]}</span>)}</div> : (key === 'surveyPhotos' || key === 'drawingPhotos') ? <div className="photo-upload-field"><label className="add-file-button"><input type="file" accept="image/*" multiple onChange={(event) => uploadFile(event, key)} /><Plus size={15} />{uploading ? 'Загружаем…' : 'Добавить фото'}</label>{(key === 'surveyPhotos' ? objectPhotos : drawingPhotos).length > 0 && <div className="attachments-list">{(key === 'surveyPhotos' ? objectPhotos : drawingPhotos).map((file) => <div className="attachment-row" key={file.id}><FileText size={15} /><a href={file.url} target="_blank" rel="noreferrer">{file.original_name}</a><span>{Math.max(1, Math.round(Number(file.file_size) / 1024))} КБ</span>{canEdit && <button onClick={() => deleteAttachment(file)} aria-label={`Удалить ${file.original_name}`}><X size={15} /></button>}</div>)}</div>}</div> : key === 'phone' ? <input className="inline-edit" type="tel" inputMode="tel" placeholder="+7 (999) 888-77-66" value={formatRussianPhone(draft.phone ?? order.phone ?? '')} onChange={(e) => setDraft((current) => ({ ...current, phone: formatRussianPhone(e.target.value) }))} onKeyDown={(e) => handleRussianPhoneKeyDown(e, draft.phone ?? order.phone ?? '', (phone) => setDraft((current) => ({ ...current, phone })))} /> : key === 'sinkType' ? <select className="inline-edit" value={draft[key] ?? order[key] ?? ''} onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select> : longTextKeys.includes(key) ? <textarea className="inline-edit" rows="2" value={draft[key] ?? order[key] ?? values[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : <input className="inline-edit" type={key === 'installationDate' ? 'date' : 'text'} value={draft[key] ?? order[key] ?? values[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : key === 'floor' ? <b>{floorValue ? floorValue + ' этаж' : 'Не заполнено'}</b> : key === 'entrance' ? <b>{order.entrance ? order.entrance + ' подъезд' : 'Не заполнено'}</b> : key === 'hasElevator' ? <b>{elevatorValue === true ? 'Да' : elevatorValue === false ? 'Нет' : 'Не указано'}</b> : key === 'elevatorType' ? <b>{(order.elevatorTypes || (order.elevatorType ? [order.elevatorType] : [])).map((type) => ({ square: 'Квадратный', vertical: 'Длинный прямой', horizontal: 'Длинный боковой' }[type])).filter(Boolean).join(', ') || 'Не указан'}</b> : <b>{order[key] || values[key] || 'Не заполнено'}</b>}</div>)}</div>}{['Замер', 'Проектирование'].includes(tab) && <div className="attachments-section"><div className="attachments-header"><h4>Файлы процесса</h4>{canEdit && <label className="add-file-button"><input ref={fileInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.dwg,.dxf" onChange={uploadFile} /><Plus size={16} />{uploading ? 'Загружаем…' : 'Добавить файлы'}</label>}</div>{relevantAttachments.length ? <div className="attachments-list">{relevantAttachments.map((file) => <div className="attachment-row" key={file.id}><FileText size={16} /><a href={file.url} target="_blank" rel="noreferrer">{file.original_name}</a><span>{Math.max(1, Math.round(Number(file.file_size) / 1024))} КБ</span>{canEdit && <button onClick={() => deleteAttachment(file)} aria-label={`Удалить ${file.original_name}`}><X size={15} /></button>}</div>)}</div> : <p className="attachments-empty">Фото замера, эскиз или файл раскроя можно приложить сюда.</p>}</div>}</section>
}

function NewProcessModal({ onClose, onCreate, onDuplicate, orders, employees }) {
  const [id, setId] = useState(() => {
    const numericIds = orders.map((item) => Number(item.id)).filter((value) => Number.isSafeInteger(value) && value >= 0)
    const maximum = numericIds.length ? Math.max(...numericIds) : null
    return maximum === null ? '' : String(maximum + 1)
  })
  const [client, setClient] = useState('')
  const [phone, setPhone] = useState('')
  const [product, setProduct] = useState('Столешница для кухни')
  const [material, setMaterial] = useState('')
  const [decor, setDecor] = useState('')
  const [sinkType, setSinkType] = useState('')
  const [sinkColor, setSinkColor] = useState('')
  const [glue, setGlue] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressHouse, setAddressHouse] = useState('')
  const [addressApartment, setAddressApartment] = useState('')
  const [houseType, setHouseType] = useState('')
  const managers = employees.filter((employee) => employee.role === 'Менеджер')
  const [manager, setManager] = useState('')
  useEffect(() => { if (!manager && managers.length) setManager(managers[0].name) }, [manager, managers])
  const decors = { 'Кварцевый агломерат': ['Calacatta Gold', 'Noble Grey', 'Concrete Light'], Акрил: ['Pure White', 'Nordic White', 'Limestone'], 'HPL (Компакт)': ['Slate Grey', 'Black Core', 'Natural Oak'] }
  const submit = (e) => { e.preventDefault(); if (!id.trim()) return; if (!manager) { onDuplicate('Сначала добавьте менеджера в справочник сотрудников.'); return } if (orders.some((order) => String(order.id) === id.trim())) { onDuplicate(`Процесс №${id.trim()} уже существует.`); return } onCreate({ id: id.trim(), client: client.trim() || 'Новый заказчик', product, material: material || 'Не выбран', decor: decor || 'Не выбран', sinkType, sinkColor, glue, stage: 'Новый заказ', color: 'gray', date: 'Не назначена', initials: client.trim().split(' ').map((s) => s[0]).join('').slice(0, 2) || 'НЗ', manager, phone, addressCity, addressStreet, addressHouse, addressApartment, houseType, address: [addressCity, addressStreet, addressHouse && `д. ${addressHouse}`, addressApartment && `кв. ${addressApartment}`].filter(Boolean).join(', ') || 'Адрес не указан', completeness: 24 }) }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="new-modal" onSubmit={submit}><div className="modal-header"><div><span className="modal-kicker">НОВЫЙ ЗАКАЗ</span><h2>Создать процесс</h2><p>Добавьте заказ в рабочее пространство. Остальные данные можно заполнить позже.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={19} /></button></div><div className="modal-content"><label className="form-field"><span>Номер процесса <i>*</i></span><div className="id-input"><span>#</span><input autoFocus value={id} onChange={(e) => setId(e.target.value)} required /></div><small>Номер обязателен и назначается при создании.</small></label>{!managers.length && <div className="form-note"><Users size={15} /><span>Сначала добавьте в справочник сотрудника с ролью «Менеджер».</span></div>}<div className="form-grid"><label className="form-field"><span>Ответственный менеджер <i>*</i></span><select value={manager} onChange={(e) => setManager(e.target.value)} required><option value="">Выберите менеджера</option>{managers.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}</select></label><label className="form-field"><span>Имя заказчика</span><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Например, Анна Смирнова" /></label><label className="form-field"><span>Телефон</span><input type="tel" inputMode="tel" value={formatRussianPhone(phone)} onChange={(e) => setPhone(formatRussianPhone(e.target.value))} onKeyDown={(e) => handleRussianPhoneKeyDown(e, phone, setPhone)} placeholder="+7 (999) 888-77-66" /></label><label className="form-field"><span>Изделие</span><select value={product} onChange={(e) => setProduct(e.target.value)}><option>Столешница для кухни</option><option>Столешница + остров</option><option>Подоконник</option><option>Столешница для ванной</option><option>Другое</option></select></label><label className="form-field"><span>Материал</span><select value={material} onChange={(e) => { setMaterial(e.target.value); setDecor(''); setGlue('') }}><option value="">Выберите материал</option>{Object.keys(decors).map((m) => <option key={m}>{m}</option>)}</select></label><label className="form-field"><span>Декор</span><select value={decor} onChange={(e) => setDecor(e.target.value)} disabled={!material}><option value="">{material ? 'Выберите декор' : 'Сначала выберите материал'}</option>{(decors[material] || []).map((d) => <option key={d}>{d}</option>)}</select></label><label className="form-field"><span>Тип раковины</span><select value={sinkType} onChange={(e) => setSinkType(e.target.value)}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select></label><label className="form-field"><span>Цвет раковины</span><input value={sinkColor} onChange={(e) => setSinkColor(e.target.value)} placeholder="Например, белый или графит" /></label>{['Акрил', 'Кварцевый агломерат'].includes(material) && <label className="form-field"><span>Название клея</span><input value={glue} onChange={(e) => setGlue(e.target.value)} placeholder="A-White, N-White, L-Magic..." /></label>}<label className="form-field"><span>Город</span><input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Город" /></label><label className="form-field"><span>Улица</span><input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Улица" /></label><label className="form-field"><span>Дом</span><input value={addressHouse} onChange={(e) => setAddressHouse(e.target.value)} placeholder="Номер дома" /></label><div className="form-field"><span>Тип дома</span><div className="radio-group" role="radiogroup" aria-label="Тип дома"><label><input type="radio" name="new-house-type" checked={houseType === "Многоквартирный"} onChange={() => setHouseType("Многоквартирный")} />Многоквартирный</label><label><input type="radio" name="new-house-type" checked={houseType === "Частный"} onChange={() => setHouseType("Частный")} />Частный</label></div></div><label className="form-field"><span>Квартира</span><input value={addressApartment} onChange={(e) => setAddressApartment(e.target.value)} placeholder="Номер квартиры" /></label></div><div className="form-note"><Sparkles size={15} /><span>Можно создать заказ без заполнения остальных полей и вернуться к ним позже.</span></div></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit"><Plus size={16} />Создать процесс</button></div></form></div>
}

function EmployeesView({ employees, role, onAddEmployee, onDeactivateEmployee }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [employeeRole, setEmployeeRole] = useState('Замерщик')
  const submit = async (event) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return
    const added = await onAddEmployee({ name: cleanName, role: employeeRole })
    if (!added) return
    setName('')
    setAdding(false)
  }
  return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />СПРАВОЧНИК КОМАНДЫ</div><h1>Сотрудники <span className="heading-count">{employees.length}</span></h1><p>Роль сотрудника определяет, в каких списках назначения он доступен.</p></div>{role === 'Менеджер' && <button className="primary-button" onClick={() => setAdding((value) => !value)}><Plus size={16} />Добавить сотрудника</button>}</div>{adding && <form className="employee-form" onSubmit={submit}><label className="form-field"><span>Имя сотрудника</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Иван Петров" required /></label><label className="form-field"><span>Роль</span><select value={employeeRole} onChange={(event) => setEmployeeRole(event.target.value)}>{employeeRoles.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary-button" type="submit"><Check size={15} />Сохранить</button><button className="secondary-button" type="button" onClick={() => setAdding(false)}>Отмена</button></form>}<div className="employee-groups">{employeeRoles.map((itemRole) => { const people = employees.filter((employee) => employee.role === itemRole); return <section className="info-card employee-group" key={itemRole}><div className="info-card-head"><div><h3>{itemRole}</h3><p>{people.length ? people.length + ' сотрудника' : 'Пока никого нет'}</p></div></div>{people.map((employee) => <div className="employee-row" key={employee.id}><div className="avatar avatar-user">{employee.name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><b>{employee.name}</b>{role === 'Менеджер' && <button type="button" className="employee-remove" title="Убрать из списка назначений" onClick={() => onDeactivateEmployee(employee)}><X size={15} /></button>}</div>)}</section>})}</div></div>
}

function OtherView({ view, orders, employees, role, onSelect, onAddEmployee, onDeactivateEmployee }) { if (view === 'Сотрудники') return <EmployeesView employees={employees} role={role} onAddEmployee={onAddEmployee} onDeactivateEmployee={onDeactivateEmployee} />; if (view === 'Календарь') return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />ПЛАНИРУЙТЕ РАБОТУ</div><h1>Календарь</h1><p>Ближайшие события по замерам, производству и монтажам.</p></div><button className="secondary-button"><CalendarDays size={16} />Октябрь 2026 <ChevronDown size={14} /></button></div><div className="calendar-card"><div className="calendar-week">{['ПН 12','ВТ 13','СР 14','ЧТ 15','ПТ 16','СБ 17','ВС 18'].map((d) => <div key={d}>{d}</div>)}</div>{orders.filter((o) => o.date !== '—').slice(0, 5).map((order, i) => <button className="calendar-event" key={order.id} onClick={() => onSelect(order)} style={{ '--event-day': i % 7 }}><i className={`event-dot ${stageTone(order.stage)}`} /><b>#{order.id}</b><span>{order.date}</span><small>{order.client} · {order.stage}</small></button>)}</div></div>;
return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />КОМАНДА AQUASTONE</div><h1>Обзор</h1><p>Сводка производства и текущей загрузки команды.</p></div></div><div className="stat-grid"><StatCard label="Всего процессов" value={orders.length} detail="за всё время" icon={ClipboardList} tone="purple" /><StatCard label="В работе" value={orders.filter((o) => !['Завершён', 'Нужны данные'].includes(o.stage)).length} detail="активных заказов" icon={Activity} tone="blue" /><StatCard label="Требуют внимания" value={orders.filter((o) => o.stage === 'Нужны данные').length} detail="нужно уточнить" icon={Clock3} tone="amber" /><StatCard label="Монтаж сегодня" value="2" detail="запланировано" icon={CalendarDays} tone="green" /></div><div className="overview-lower"><section className="info-card"><div className="info-card-head"><div><h3>Этапы производства</h3><p>Текущая загрузка процессов</p></div></div>{stages.slice(1, 8).map((s) => <button className="stage-overview" key={s} onClick={() => { const item = orders.find((o) => o.stage === s); if (item) onSelect(item) }}><span className={`status-pill status-${stageTone(s)}`}><i />{s}</span><span className="overview-count">{orders.filter((o) => o.stage === s).length}</span><ChevronRight size={16} /></button>)}</section><section className="info-card"><div className="info-card-head"><div><h3>Последние процессы</h3><p>Недавно обновлённые заказы</p></div></div>{orders.slice(0, 4).map((o) => <button className="recent-process" key={o.id} onClick={() => onSelect(o)}><div className={`order-mark mark-${stageTone(o.stage)}`}><FileText size={16} /></div><div><b>#{o.id} · {o.client}</b><small>{o.stage}</small></div><ChevronRight size={16} /></button>)}</section></div></div>
}

export default App
