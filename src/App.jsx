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
const staticDemo = import.meta.env.VITE_STATIC_DEMO === 'true'
const readStored = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback } catch { return fallback }
}

const stages = ['Все процессы', 'Новый заказ', 'Ожидает замера', 'Замер проведён', 'Проектирование', 'Производство', 'Готов к монтажу', 'Монтаж', 'Завершён', 'Нужны данные']
const stageTone = (stage) => ({ 'Новый заказ': 'gray', 'Ожидает замера': 'amber', 'Замер проведён': 'blue', 'Проектирование': 'violet', 'Производство': 'orange', 'Готов к монтажу': 'green', 'Монтаж': 'teal', 'Завершён': 'green', 'Нужны данные': 'red' }[stage] || 'gray')

function App() {
  const [orders, setOrders] = useState(() => readStored(STORAGE_KEY, initialOrders))
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
        if (active) { setOrders(remoteOrders); setDbStatus('connected') }
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
  const updateOrder = (order) => {
    setOrders((items) => items.map((item) => item.id === order.id ? order : item))
    setSelected((item) => item?.id === order.id ? order : item)
    if (staticDemo) return
    if (dbStatus === 'connected') fetch(`/api/processes/${encodeURIComponent(order.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) })
      .then((response) => { if (!response.ok) throw new Error('Ошибка сохранения') })
      .catch(() => { setDbStatus('offline'); flash('Не удалось сохранить в PostgreSQL. Проверьте подключение.') })
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

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(e) => { e.preventDefault(); setSelected(null); setView('Процессы') }}>
        <span className="brand-mark"><span /></span><span className="brand-copy"><b>aqua<span>stone</span></b><small>WORKSPACE</small></span>
      </a>
      <div className="workspace-switch"><div className="workspace-icon">A</div><div><b>Aquastone</b><small>Производство</small></div><ChevronDown size={15} /></div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav className="main-nav">
        {[['Процессы', ClipboardList], ['Обзор', LayoutDashboard], ['Календарь', CalendarDays]].map(([label, Icon]) => <button key={label} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); setSelected(null) }}><Icon size={18} /><span>{label}</span>{label === 'Процессы' && <span className="nav-count">{orders.length}</span>}</button>)}
      </nav>
      <div className="nav-label nav-label-spaced">КОМАНДА</div>
      <nav className="secondary-nav" aria-label="Команда">
        <button className="nav-item" onClick={() => flash('Раздел команды появится в следующей версии')}><Users size={18} /><span>Сотрудники</span></button>
        <button className="nav-item" onClick={() => flash('Справочники будут доступны здесь')}><Settings2 size={18} /><span>Справочники</span></button>
      </nav>
      <div className="sidebar-bottom">
        <button className="user-profile" onClick={() => { const roles = ['Менеджер', 'Замерщик', 'Технолог', 'ЧПУ', 'Монтажник']; setRole(roles[(roles.indexOf(role) + 1) % roles.length]) }} title="Нажмите, чтобы переключить роль в прототипе"><div className="avatar avatar-user">МК</div><div className="user-data"><b>Мария К.</b><small>{role}</small></div><MoreHorizontal size={19} /></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Рабочее пространство</span><ChevronRight size={14} /><b>{selected ? `Процесс ${selected.id}` : view}</b></div><div className={`db-status db-${dbStatus}`}><i />{dbStatus === 'connected' ? 'PostgreSQL подключён' : dbStatus === 'connecting' ? 'Подключение к БД…' : dbStatus === 'demo' ? 'Демо: хранение в браузере' : 'PostgreSQL недоступен'}</div><div className="top-actions"><div className="quick-search"><Search size={15} /><span>Быстрый поиск</span><kbd>⌘ K</kbd></div><button className="icon-button notification" onClick={() => flash('Новых уведомлений нет')} aria-label="Уведомления"><Bell size={18} /><i /></button><div className="top-divider" /><div className="top-user"><div className="avatar avatar-user">МК</div><ChevronDown size={14} /></div></div></header>
      {selected ? <DetailPage order={selected} role={role} onBack={() => setSelected(null)} onUpdate={updateOrder} flash={flash} /> : view === 'Процессы' ? <>
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
      </> : <OtherView view={view} orders={orders} onSelect={setSelected} />}
    </main>
    {showNew && <NewProcessModal onClose={() => setShowNew(false)} onCreate={createOrder} onDuplicate={flash} orders={orders} />}
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function StatCard({ label, value, detail, icon: Icon, tone }) { return <div className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-number">{value}</div><div className="stat-detail">{detail}</div><div className={`stat-spark spark-${tone}`}><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></div> }

function DetailPage({ order, role, onBack, onUpdate, flash }) {
  const [tab, setTab] = useState('Обзор')
  const [editingOverview, setEditingOverview] = useState(false)
  const canEditTab = (name) => role === 'Менеджер' || (role === 'Замерщик' && name === 'Замер') || (role === 'Технолог' && ['Замер', 'Проектирование'].includes(name)) || (role === 'ЧПУ' && name === 'Производство') || (role === 'Монтажник' && name === 'Монтаж')
  const canProgress = role === 'Менеджер' || (role === 'Замерщик' && order.stage === 'Ожидает замера') || (role === 'Технолог' && order.stage === 'Проектирование') || (role === 'ЧПУ' && order.stage === 'Производство') || (role === 'Монтажник' && ['Готов к монтажу', 'Монтаж'].includes(order.stage))
  const flow = ['Новый заказ', 'Ожидает замера', 'Замер проведён', 'Проектирование', 'Производство', 'Готов к монтажу', 'Монтаж', 'Завершён']
  const current = flow.indexOf(order.stage)
  const advance = () => { const next = flow[Math.min((current < 0 ? 0 : current) + 1, flow.length - 1)]; onUpdate({ ...order, stage: next, completeness: 100 }); flash(`Этап изменён: ${next}`) }
  return <div className="detail-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} />К списку процессов</button><div className="detail-heading"><div><div className="detail-overline">ПРОЦЕСС #{order.id} <span>·</span> Создан 12 октября, 2026</div><h1>{order.client}</h1><div className="detail-subtitle">{order.product} <span>·</span> {order.material}</div></div><div className="heading-actions"><button className="secondary-button" onClick={() => flash('Ссылка скопирована')}><MoreHorizontal size={17} />Действия</button>{canProgress && <button className="primary-button" onClick={advance}>Передать дальше <ArrowRight size={16} /></button>}</div></div>
    <div className="detail-meta"><span className={`status-pill status-${stageTone(order.stage)}`}><i />{order.stage}</span><div className="meta-divider" /><div className="meta-person"><div className={`avatar avatar-${order.color}`}>{order.manager.split(' ').map((s) => s[0]).join('')}</div><span>{order.manager}</span><small>менеджер</small></div><div className="meta-divider" /><div className="meta-location"><MapPin size={16} />{order.address}</div></div>
    <div className="workflow-card"><div className="workflow-title"><div><h3>Путь заказа</h3><p>Процесс проходит 8 этапов до завершения</p></div><span>{Math.max(current + 1, 1)} <i>/ 8</i></span></div><div className="workflow-line">{flow.map((step, i) => <div key={step} className={`workflow-step ${i < current ? 'done' : i === current ? 'current' : ''}`}><div className="workflow-dot">{i < current ? <Check size={12} /> : null}</div><span>{step}</span></div>)}</div></div>
    <div className="detail-tabs">{['Обзор', 'Замер', 'Проектирование', 'Производство', 'Монтаж', 'История'].map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}{name === 'Замер' && order.completeness > 70 && <span className="tab-check"><Check size={10} /></span>}</button>)}</div>
    {tab === 'Обзор' && <div className="detail-content"><div className="detail-main-column"><section className="info-card"><div className="info-card-head"><div><h3>Информация о заказе</h3><p>Основные данные процесса</p></div>{role === 'Менеджер' && <button onClick={() => { if (editingOverview) flash('Основные данные сохранены'); setEditingOverview(!editingOverview) }}><Settings2 size={16} />{editingOverview ? 'Сохранить' : 'Изменить'}</button>}</div><div className="info-grid">{[['Номер процесса', 'id'], ['Изделие', 'product'], ['Материал', 'material'], ['Декор', 'decor'], ['Заказчик', 'client'], ['Телефон заказчика', 'phone'], ['Адрес объекта', 'address'], ['Раковина', 'sinkType'], ['Цвет раковины', 'sinkColor'], ...(['Акрил', 'Кварцевый агломерат'].includes(order.material) ? [['Клей', 'glue']] : []), ['Менеджер', 'manager']].map(([label, key]) => <Info key={key} label={label} value={editingOverview && key !== 'id' ? <input className="inline-edit" value={order[key] || ''} onChange={(e) => onUpdate({ ...order, [key]: e.target.value })} /> : key === 'id' ? `#${order.id}` : (order[key] || 'Не указан')} />)}</div></section>
      <section className="info-card stage-info"><div className="info-card-head"><div><div className="stage-card-title"><div className="stage-card-icon blue-icon"><MapPin size={17} /></div><div><h3>Замер объекта</h3><p>Данные от замерщика</p></div></div></div><span className="completion">{order.completeness}% заполнено</span></div><div className="completion-track"><span style={{ width: `${order.completeness}%` }} /></div>{order.completeness < 100 ? <div className="missing-note"><CircleHelp size={16} /><span>Добавьте телефон заказчика и фото объекта перед передачей в монтаж.</span><button onClick={() => setTab('Замер')}>Заполнить <ArrowRight size={14} /></button></div> : <div className="info-grid"><Info label="Дата замера" value="12 октября, 2026" /><Info label="Этаж и лифт" value="8 этаж · пассажирский лифт" /><Info label="Чертёж и размеры" value="Файл приложен" /><Info label="Фото объекта" value="4 фотографии" /></div>}</section>
      <section className="comment-card"><div className="comment-icon"><MessageSquare size={17} /></div><div className="comment-input" onClick={() => flash('Комментарии доступны в полной версии')}><span>Оставьте комментарий для команды...</span><kbd>⌘ ↵</kbd></div></section></div>
      <aside className="detail-side"><section className="info-card side-card"><div className="side-head"><h3>Команда процесса</h3><button onClick={() => flash('Участники процесса')}>+ Добавить</button></div>{[['Менеджер', 'Мария К.', 'МК', 'purple'], ['Замерщик', 'Андрей С.', 'АС', 'blue'], ['Технолог', 'Пока не назначен', '—', 'gray'], ['ЧПУ и упаковка', 'Пока не назначен', '—', 'gray']].map(([label, name, initials, color]) => <div className="team-row" key={label}><div className={`avatar avatar-${color}`}>{initials}</div><div><small>{label}</small><b className={name.includes('не назначен') ? 'muted-name' : ''}>{name}</b></div><MoreHorizontal size={17} /></div>)}</section><section className="info-card side-card"><div className="side-head"><h3>Сроки</h3><button onClick={() => flash('Редактирование сроков')}>Изменить</button></div><div className="deadline-row"><div className="deadline-icon"><CalendarDays size={17} /></div><div><small>Следующее событие</small><b>{order.date}</b></div></div><div className="deadline-row"><div className="deadline-icon"><Hammer size={17} /></div><div><small>Плановый монтаж</small><b>Не запланирован</b></div></div></section><section className="tip-card"><Sparkles size={16} /><b>Подсказка</b><p>Заполните все данные замера, чтобы технолог смог подготовить точный чертёж.</p></section></aside></div>}
    {tab !== 'Обзор' && <StageTab tab={tab} order={order} flash={flash} canEdit={canEditTab(tab)} onUpdate={onUpdate} />}</div>
}

function Info({ label, value }) { return <div className="info-field"><span>{label}</span><b>{value}</b></div> }
function StageTab({ tab, order, flash, canEdit, onUpdate }) {
  const [draft, setDraft] = useState({})
  const [attachments, setAttachments] = useState([])
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
  const definitions = {
    'Замер': [['Адрес объекта', 'address'], ['Этаж и лифт', 'surveyAccess'], ['Размеры и эскиз', 'measurements'], ['Фаски и вырезы', 'cutouts'], ['Тип раковины', 'sinkType'], ['Цвет раковины', 'sinkColor'], ['Фото объекта', 'surveyPhotos'], ['Особые условия', 'surveyNotes']],
    'Проектирование': [['Технолог', 'technologist'], ['Название клея', 'glue'], ['Чертёж AutoCAD', 'cadFile'], ['Раскрой материала', 'cutPlan'], ['Передача на ЧПУ', 'cncTransfer']],
    'Производство': [['Оператор ЧПУ', 'cncOperator'], ['Раскрой', 'cncCutting'], ['Обработка фасок', 'edgeFinishing'], ['Упаковка', 'packaging'], ['Комментарий производства', 'productionNotes']],
    'Монтаж': [['Телефон заказчика', 'phone'], ['Дата монтажа', 'installationDate'], ['Бригада монтажников', 'installers'], ['Доступ на объект', 'installationAccess'], ['Результат монтажа', 'installationResult'], ['Комментарий монтажников', 'installationNotes']],
    'История': [['12 октября, 10:24', 'history1'], ['12 октября, 11:05', 'history2'], ['12 октября, 14:32', 'history3']],
  }
  const values = { history1: `Процесс #${order.id} создан менеджером ${order.manager}`, history2: 'Материал и декор добавлены', history3: 'Замер проведён, ожидается чертёж' }
  const fields = (definitions[tab] || []).filter(([, key]) => key !== 'glue' || ['Акрил', 'Кварцевый агломерат'].includes(order.material))
  const save = () => { if (Object.keys(draft).length) onUpdate({ ...order, ...draft }); setDraft({}); flash('Изменения сохранены') }
  const longTextKeys = ['measurements', 'cutouts', 'surveyPhotos', 'surveyNotes', 'cutPlan', 'productionNotes', 'installationNotes']
  const uploadFile = async (event) => {
    const files = [...(event.target.files || [])]
    if (!files.length) return
    if (staticDemo) { flash('GitHub Pages показывает демо-интерфейс; загрузка файлов доступна на серверной версии.'); event.target.value = ''; return }
    setUploading(true)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        form.append('fieldKey', tab === 'Замер' ? 'survey' : 'design')
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
  return <section className="info-card tab-content-card"><div className="info-card-head"><div><h3>{tab} процесса</h3><p>{canEdit ? 'Вы можете заполнять поля этого этапа.' : 'У этой роли нет прав редактирования этого этапа.'}</p></div>{canEdit && <button onClick={save}><Check size={15} />Сохранить</button>}</div><div className="info-grid">{fields.map(([label, key]) => <div className="info-field" key={key}><span>{label}</span>{canEdit ? key === 'sinkType' ? <select className="inline-edit" value={draft[key] ?? order[key] ?? ''} onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select> : longTextKeys.includes(key) ? <textarea className="inline-edit" rows="2" value={draft[key] ?? order[key] ?? values[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : <input className="inline-edit" type={key === 'installationDate' ? 'date' : 'text'} value={draft[key] ?? order[key] ?? values[key] ?? ''} placeholder="Заполните поле" onChange={(e) => setDraft((current) => ({ ...current, [key]: e.target.value }))} /> : <b>{order[key] || values[key] || 'Не заполнено'}</b>}</div>)}</div>{['Замер', 'Проектирование'].includes(tab) && <div className="attachments-section"><div className="attachments-header"><h4>Файлы процесса</h4>{canEdit && <label className="add-file-button"><input ref={fileInput} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,.dwg,.dxf" onChange={uploadFile} /><Plus size={16} />{uploading ? 'Загружаем…' : 'Добавить файлы'}</label>}</div>{relevantAttachments.length ? <div className="attachments-list">{relevantAttachments.map((file) => <div className="attachment-row" key={file.id}><FileText size={16} /><a href={file.url} target="_blank" rel="noreferrer">{file.original_name}</a><span>{Math.max(1, Math.round(Number(file.file_size) / 1024))} КБ</span>{canEdit && <button onClick={() => deleteAttachment(file)} aria-label={`Удалить ${file.original_name}`}><X size={15} /></button>}</div>)}</div> : <p className="attachments-empty">Фото замера, эскиз или файл раскроя можно приложить сюда.</p>}</div>}</section>
}

function NewProcessModal({ onClose, onCreate, onDuplicate, orders }) {
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
  const [address, setAddress] = useState('')
  const decors = { 'Кварцевый агломерат': ['Calacatta Gold', 'Noble Grey', 'Concrete Light'], Акрил: ['Pure White', 'Nordic White', 'Limestone'], 'HPL (Компакт)': ['Slate Grey', 'Black Core', 'Natural Oak'] }
  const submit = (e) => { e.preventDefault(); if (!id.trim()) return; if (orders.some((order) => String(order.id) === id.trim())) { onDuplicate(`Процесс №${id.trim()} уже существует.`); return } onCreate({ id: id.trim(), client: client.trim() || 'Новый заказчик', product, material: material || 'Не выбран', decor: decor || 'Не выбран', sinkType, sinkColor, glue, stage: 'Новый заказ', color: 'gray', date: 'Не назначена', initials: client.trim().split(' ').map((s) => s[0]).join('').slice(0, 2) || 'НЗ', manager: 'Мария К.', phone, address: address || 'Адрес не указан', completeness: 24 }) }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="new-modal" onSubmit={submit}><div className="modal-header"><div><span className="modal-kicker">НОВЫЙ ЗАКАЗ</span><h2>Создать процесс</h2><p>Добавьте заказ в рабочее пространство. Остальные данные можно заполнить позже.</p></div><button type="button" className="modal-close" onClick={onClose}><X size={19} /></button></div><div className="modal-content"><label className="form-field"><span>Номер процесса <i>*</i></span><div className="id-input"><span>#</span><input autoFocus value={id} onChange={(e) => setId(e.target.value)} required /></div><small>Номер обязателен и назначается при создании.</small></label><div className="form-grid"><label className="form-field"><span>Имя заказчика</span><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Например, Анна Смирнова" /></label><label className="form-field"><span>Телефон</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" /></label><label className="form-field"><span>Изделие</span><select value={product} onChange={(e) => setProduct(e.target.value)}><option>Столешница для кухни</option><option>Столешница + остров</option><option>Подоконник</option><option>Столешница для ванной</option><option>Другое</option></select></label><label className="form-field"><span>Материал</span><select value={material} onChange={(e) => { setMaterial(e.target.value); setDecor(''); setGlue('') }}><option value="">Выберите материал</option>{Object.keys(decors).map((m) => <option key={m}>{m}</option>)}</select></label><label className="form-field"><span>Декор</span><select value={decor} onChange={(e) => setDecor(e.target.value)} disabled={!material}><option value="">{material ? 'Выберите декор' : 'Сначала выберите материал'}</option>{(decors[material] || []).map((d) => <option key={d}>{d}</option>)}</select></label><label className="form-field"><span>Тип раковины</span><select value={sinkType} onChange={(e) => setSinkType(e.target.value)}><option value="">Не выбран</option><option>Нержавеющая сталь</option><option>Каменная</option></select></label><label className="form-field"><span>Цвет раковины</span><input value={sinkColor} onChange={(e) => setSinkColor(e.target.value)} placeholder="Например, белый или графит" /></label>{['Акрил', 'Кварцевый агломерат'].includes(material) && <label className="form-field"><span>Название клея</span><input value={glue} onChange={(e) => setGlue(e.target.value)} placeholder="A-White, N-White, L-Magic..." /></label>}<label className="form-field"><span>Адрес объекта</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Город, улица, дом" /></label></div><div className="form-note"><Sparkles size={15} /><span>Можно создать заказ без заполнения остальных полей и вернуться к ним позже.</span></div></div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" type="submit"><Plus size={16} />Создать процесс</button></div></form></div>
}

function OtherView({ view, orders, onSelect }) { if (view === 'Календарь') return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />ПЛАНИРУЙТЕ РАБОТУ</div><h1>Календарь</h1><p>Ближайшие события по замерам, производству и монтажам.</p></div><button className="secondary-button"><CalendarDays size={16} />Октябрь 2026 <ChevronDown size={14} /></button></div><div className="calendar-card"><div className="calendar-week">{['ПН 12','ВТ 13','СР 14','ЧТ 15','ПТ 16','СБ 17','ВС 18'].map((d) => <div key={d}>{d}</div>)}</div>{orders.filter((o) => o.date !== '—').slice(0, 5).map((order, i) => <button className="calendar-event" key={order.id} onClick={() => onSelect(order)} style={{ marginLeft: `${(i % 4) * 13}%` }}><i className={`event-dot ${stageTone(order.stage)}`} /><b>#{order.id}</b><span>{order.date}</span><small>{order.client} · {order.stage}</small></button>)}</div></div>;
return <div className="other-view"><div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />КОМАНДА AQUASTONE</div><h1>Обзор</h1><p>Сводка производства и текущей загрузки команды.</p></div></div><div className="stat-grid"><StatCard label="Всего процессов" value={orders.length} detail="за всё время" icon={ClipboardList} tone="purple" /><StatCard label="В работе" value={orders.filter((o) => !['Завершён', 'Нужны данные'].includes(o.stage)).length} detail="активных заказов" icon={Activity} tone="blue" /><StatCard label="Требуют внимания" value={orders.filter((o) => o.stage === 'Нужны данные').length} detail="нужно уточнить" icon={Clock3} tone="amber" /><StatCard label="Монтаж сегодня" value="2" detail="запланировано" icon={CalendarDays} tone="green" /></div><div className="overview-lower"><section className="info-card"><div className="info-card-head"><div><h3>Этапы производства</h3><p>Текущая загрузка процессов</p></div></div>{stages.slice(1, 8).map((s) => <button className="stage-overview" key={s} onClick={() => { const item = orders.find((o) => o.stage === s); if (item) onSelect(item) }}><span className={`status-pill status-${stageTone(s)}`}><i />{s}</span><span className="overview-count">{orders.filter((o) => o.stage === s).length}</span><ChevronRight size={16} /></button>)}</section><section className="info-card"><div className="info-card-head"><div><h3>Последние процессы</h3><p>Недавно обновлённые заказы</p></div></div>{orders.slice(0, 4).map((o) => <button className="recent-process" key={o.id} onClick={() => onSelect(o)}><div className={`order-mark mark-${stageTone(o.stage)}`}><FileText size={16} /></div><div><b>#{o.id} · {o.client}</b><small>{o.stage}</small></div><ChevronRight size={16} /></button>)}</section></div></div>
}

export default App
