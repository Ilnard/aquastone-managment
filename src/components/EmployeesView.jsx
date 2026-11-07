import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Copy, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { ROLE_ORDER, initialsOf, rolesText } from './UserSwitcher.jsx'
import { describeEvent, isVisibleEvent } from '../historyFields.js'
import HistoryLines from './HistoryLines.jsx'
import { ASSIGNMENT_FIELDS, assignedNames } from '../permissions.js'
import './EmployeesView.css'

// Поля команды процесса — из общей схемы (installers — список).
const ROLE_HINTS = {
  'Директор': 'регистрирует и удаляет сотрудников, может всё, что менеджер',
  'Менеджер': 'ведёт заказы, назначает команду',
  'Замерщик': 'заполняет «Замер»',
  'Технолог': 'берёт процесс после замера, ведёт «Проектирование»',
  'ЧПУ': 'берёт после проектирования, ведёт «Фрезеровку/Распил»',
  'Обработчик': 'берёт после фрезеровки, ведёт «Шлифовку/Полировку/Монтаж мойки»',
  'Бригадир монтажников': 'переводит произведённые заказы в «Монтаж», назначает монтажников',
  'Монтажник': 'заполняет «Монтаж», добавляет фотоотчёт',
}
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many }
const dateTime = (value) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const dayTitle = (value) => { const d = new Date(value); const s = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1) }

function RoleToggles({ roles, onToggle, disabled }) {
  return <div className="people-roles">
    {ROLE_ORDER.map((role) => <button type="button" key={role} className={'people-role' + (roles.includes(role) ? ' on' : '') + (role === 'Директор' ? ' director' : '')} onClick={() => onToggle(role)} disabled={disabled} aria-pressed={roles.includes(role)} title={ROLE_HINTS[role]}>
      {roles.includes(role) && <Check size={12} />}{role}
    </button>)}
  </div>
}
const RoleChips = ({ roles }) => <div className="people-roles readonly">{ROLE_ORDER.filter((r) => roles.includes(r)).map((role) => <span key={role} className={'people-role on' + (role === 'Директор' ? ' director' : '')}>{role}</span>)}</div>

/** Логин и пароль показываются директору один раз — чтобы передать сотруднику. */
function CredentialsDialog({ name, credentials, onClose, title = 'Сотрудник зарегистрирован' }) {
  const [copied, setCopied] = useState(false)
  const text = `Сайт Aquastone\nЛогин: ${credentials.login}\nПароль: ${credentials.password}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { window.prompt?.('Скопируйте данные для входа:', text) }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="new-modal credentials-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-header"><div><span className="modal-kicker">ДАННЫЕ ДЛЯ ВХОДА</span><h2>{title}</h2><p>{name}. Передайте логин и пароль сотруднику — пароль больше не будет показан. Сменить его сотрудник сможет в личном кабинете.</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={19} /></button></div>
      <div className="modal-content credentials-body">
        <div className="credential"><span>Логин</span><code>{credentials.login}</code></div>
        <div className="credential"><span>Пароль</span><code>{credentials.password}</code></div>
      </div>
      <div className="modal-footer"><button type="button" className="secondary-button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Скопировано' : 'Скопировать'}</button><button type="button" className="primary-button" onClick={onClose}>Готово</button></div>
    </div>
  </div>
}

// ---------- Страница сотрудника ----------
function EmployeePage({ person, orders, rights, demo, onBack, onUpdateEmployee, onDeactivateEmployee, onIssueCredentials, onOpenProcess, flash, isSelf }) {
  const isDirector = rights.includes('Директор')
  const canSeeActivity = isDirector || rights.includes('Менеджер')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(person.name)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [activity, setActivity] = useState({ status: 'idle', items: [] })
  const [period, setPeriod] = useState('30')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!canSeeActivity || demo) return undefined
    let active = true
    setActivity({ status: 'loading', items: [] })
    fetch(`/api/employees/${person.id}/activity?limit=500`)
      .then(async (r) => { const body = await r.json().catch(() => []); if (!r.ok) throw new Error(body.error || 'Не удалось загрузить активность'); return body })
      .then((items) => { if (active) setActivity({ status: 'ready', items }) })
      .catch((error) => { if (active) setActivity({ status: 'error', items: [], error: error.message }) })
    return () => { active = false }
  }, [person.id, canSeeActivity, demo])

  const toggleRole = async (role) => {
    const next = person.roles.includes(role) ? person.roles.filter((r) => r !== role) : [...person.roles, role]
    if (!next.length) { flash('У сотрудника должна остаться хотя бы одна роль'); return }
    setBusy(true); await onUpdateEmployee(person, { roles: next }); setBusy(false)
  }
  const saveName = async (event) => {
    event.preventDefault()
    const clean = nameDraft.trim()
    if (!clean || clean === person.name) { setEditingName(false); return }
    setBusy(true); if (await onUpdateEmployee(person, { name: clean })) setEditingName(false); setBusy(false)
  }
  const issue = async () => { setBusy(true); const result = await onIssueCredentials(person); setBusy(false); if (result) setCredentials(result) }

  const load = useMemo(() => {
    const list = []
    for (const order of orders) {
      if (order.stage === 'Завершён') continue
      const as = Object.entries(ASSIGNMENT_FIELDS).filter(([field]) => assignedNames(order, field).includes(person.name)).map(([, role]) => role)
      if (as.length) list.push({ order, as })
    }
    return list
  }, [orders, person.name])

  const visible = activity.items.filter(isVisibleEvent).filter((e) => {
    if (period !== 'all' && Date.now() - new Date(e.createdAt).getTime() > Number(period) * 86400000) return false
    const q = query.trim().toLocaleLowerCase('ru')
    return !q || `${e.processNumber} ${e.client || ''}`.toLocaleLowerCase('ru').includes(q)
  })
  const groups = []
  for (const e of visible) {
    const key = new Date(e.createdAt).toDateString()
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, title: dayTitle(e.createdAt), items: [] })
    groups[groups.length - 1].items.push(e)
  }
  const processesTouched = new Set(visible.map((e) => e.processNumber)).size

  return <div className="other-view person-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} />К списку сотрудников</button>
    <div className="person-head">
      <div className="avatar avatar-user person-avatar">{initialsOf(person.name)}</div>
      <div className="person-title">
        {editingName
          ? <form className="people-rename" onSubmit={saveName}><input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false) }} aria-label="Имя сотрудника" /><button type="submit" className="people-icon" aria-label="Сохранить имя" disabled={busy}><Check size={15} /></button><button type="button" className="people-icon" onClick={() => setEditingName(false)} aria-label="Отмена"><X size={15} /></button></form>
          : <h1>{person.name}{isDirector && <button type="button" className="people-icon subtle" onClick={() => { setNameDraft(person.name); setEditingName(true) }} title="Переименовать" aria-label="Переименовать"><Pencil size={14} /></button>}</h1>}
        <p>{rolesText(person.roles)}{isSelf ? ' · это вы' : ''}</p>
      </div>
    </div>

    <div className="person-grid">
      <div className="person-side">
        <section className="info-card">
          <div className="info-card-head"><div><h3>Роли</h3><p>{isDirector ? 'Нажмите, чтобы включить или выключить роль.' : 'Изменять роли может директор.'}</p></div></div>
          <div className="person-roles">{isDirector ? <RoleToggles roles={person.roles} onToggle={toggleRole} disabled={busy} /> : <RoleChips roles={person.roles} />}</div>
        </section>

        {isDirector && !demo && <section className="info-card">
          <div className="info-card-head"><div><h3>Доступ на сайт</h3><p>{person.hasAccess ? 'Сотрудник входит по своему логину и паролю.' : 'Логина и пароля ещё нет.'}</p></div><ShieldCheck size={16} className={person.hasAccess ? 'access-on' : 'access-off'} /></div>
          <dl className="person-access">
            <div><dt>Логин</dt><dd>{person.login || '—'}</dd></div>
            <div><dt>Пароль изменён</dt><dd>{person.passwordChangedAt ? dateTime(person.passwordChangedAt) : '—'}</dd></div>
            <div><dt>Последний визит</dt><dd>{person.lastSeenAt ? dateTime(person.lastSeenAt) : 'ещё не входил(а)'}</dd></div>
          </dl>
          <button className="secondary-button person-wide" onClick={issue} disabled={busy}><KeyRound size={15} />{person.hasAccess ? 'Сбросить пароль' : 'Выдать логин и пароль'}</button>
          {person.hasAccess && <small className="person-hint">Старый пароль перестанет работать, сотрудник выйдет на всех устройствах.</small>}
        </section>}

        <section className="info-card">
          <div className="info-card-head"><div><h3>Сейчас в работе</h3><p>{load.length ? `Процессов: ${load.length}` : 'Нет активных процессов'}</p></div></div>
          <div className="person-load">{load.map(({ order, as }) => <button type="button" key={order.id} onClick={() => onOpenProcess(order)}><b>#{order.id} {order.client}</b><small>{order.stage} · {as.join(', ').toLowerCase()}</small><ChevronRight size={14} /></button>)}</div>
        </section>

        {isDirector && !isSelf && <section className="info-card person-danger">
          {confirmDelete
            ? <><p>Удалить {person.name}? Сотрудник пропадёт из списков назначения и больше не сможет войти. История его изменений сохранится.</p><div className="person-danger-actions"><button className="secondary-button" onClick={() => setConfirmDelete(false)}>Отмена</button><button className="danger-button" onClick={() => onDeactivateEmployee(person)}><Trash2 size={15} />Удалить</button></div></>
            : <button className="danger-link" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Удалить сотрудника</button>}
        </section>}
      </div>

      <section className="info-card person-activity">
        <div className="info-card-head"><div><h3>Активность</h3><p>{canSeeActivity ? 'Изменения полей процессов, которые внёс сотрудник.' : 'Активность сотрудников видят директор и менеджер.'}</p></div></div>
        {canSeeActivity && (demo ? <p className="activity-empty">В демо-версии активность не записывается — она есть в серверной версии сайта.</p> : <>
          <div className="activity-toolbar">
            <div className="people-filter">{[['7', '7 дней'], ['30', '30 дней'], ['all', 'Всё время']].map(([value, label]) => <button type="button" key={value} className={period === value ? 'on' : ''} onClick={() => setPeriod(value)}>{label}</button>)}</div>
            <label className="people-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Номер процесса или клиент" /></label>
          </div>
          {activity.status === 'ready' && <div className="activity-summary"><span><b>{visible.length}</b> {plural(visible.length, 'изменение', 'изменения', 'изменений')}</span><span><b>{processesTouched}</b> {plural(processesTouched, 'процесс', 'процесса', 'процессов')}</span>{visible[0] && <span>последнее — {dateTime(visible[0].createdAt)}</span>}</div>}
          {activity.status === 'loading' && <p className="activity-empty">Загружаем…</p>}
          {activity.status === 'error' && <p className="activity-empty">{activity.error}</p>}
          {activity.status === 'ready' && !visible.length && <p className="activity-empty">За этот период изменений нет.</p>}
          <div className="activity-days">{groups.map((group) => <div className="activity-day" key={group.key}>
            <h4>{group.title}</h4>
            {group.items.map((event) => {
              const { title, lines } = describeEvent(event)
              const order = orders.find((o) => String(o.id) === String(event.processNumber))
              return <article className="activity-event" key={event.id}>
                <time>{new Date(event.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>
                <div>
                  <div className="activity-event-head"><button type="button" className="activity-process" onClick={() => order && onOpenProcess(order)} disabled={!order}>#{event.processNumber}{event.client ? ` ${event.client}` : ''}</button><span>{title}</span></div>
                  <HistoryLines lines={lines} />
                </div>
              </article>
            })}
          </div>)}</div>
        </>)}
      </section>
    </div>
    {credentials && <CredentialsDialog name={person.name} credentials={credentials} title={person.hasAccess ? 'Новый пароль' : 'Доступ выдан'} onClose={() => setCredentials(null)} />}
  </div>
}

// ---------- Список сотрудников ----------
export default function EmployeesView({ employees, orders, roles: rights, demo, currentUserId, onAddEmployee, onUpdateEmployee, onDeactivateEmployee, onIssueCredentials, onOpenProcess, flash }) {
  const isDirector = rights.includes('Директор')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [newRoles, setNewRoles] = useState([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [openId, setOpenId] = useState(null)
  const [created, setCreated] = useState(null)
  const [saving, setSaving] = useState(false)

  const person = employees.find((e) => String(e.id) === String(openId))
  if (person) return <EmployeePage person={person} orders={orders} rights={rights} demo={demo} isSelf={String(person.id) === String(currentUserId)} onBack={() => setOpenId(null)} onUpdateEmployee={onUpdateEmployee} onDeactivateEmployee={async (p) => { if (await onDeactivateEmployee(p)) setOpenId(null) }} onIssueCredentials={onIssueCredentials} onOpenProcess={onOpenProcess} flash={flash} />

  const toggleNew = (role) => setNewRoles((list) => (list.includes(role) ? list.filter((r) => r !== role) : [...list, role]))
  const submit = async (event) => {
    event.preventDefault()
    if (!name.trim() || !newRoles.length) return
    setSaving(true)
    const result = await onAddEmployee({ name: name.trim(), roles: newRoles })
    setSaving(false)
    if (result) { setName(''); setNewRoles([]); setAdding(false); if (result.credentials) setCreated(result) }
  }
  const counts = Object.fromEntries(ROLE_ORDER.map((role) => [role, employees.filter((e) => e.roles.includes(role)).length]))
  const q = query.trim().toLocaleLowerCase('ru')
  const visible = employees
    .filter((e) => (!roleFilter || e.roles.includes(roleFilter)) && (!q || e.name.toLocaleLowerCase('ru').includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const activeCount = (p) => orders.filter((o) => o.stage !== 'Завершён' && Object.keys(ASSIGNMENT_FIELDS).some((f) => assignedNames(o, f).includes(p.name))).length

  return <div className="other-view people-view">
    <div className="page-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />СПРАВОЧНИК КОМАНДЫ</div><h1>Сотрудники <span className="heading-count">{employees.length}</span></h1><p>Нажмите на сотрудника, чтобы открыть его страницу: роли, доступ и активность.{isDirector ? '' : ' Регистрировать и удалять сотрудников может директор.'}</p></div>
      {isDirector && <button className="primary-button" onClick={() => setAdding((v) => !v)}><Plus size={16} />Добавить сотрудника</button>}
    </div>

    {adding && <form className="info-card people-add" onSubmit={submit}>
      <div><h3>Регистрация сотрудника</h3><p className="people-add-hint">{demo ? 'В демо-версии логин и пароль не создаются.' : 'Логин и пароль сгенерируются автоматически — вы увидите их один раз, чтобы передать сотруднику.'}</p></div>
      <label className="form-field"><span>Имя и фамилия</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Иван Петров" required /></label>
      <div className="form-field"><span>Роли</span><RoleToggles roles={newRoles} onToggle={toggleNew} /></div>
      <div className="people-add-actions">
        <button className="secondary-button" type="button" onClick={() => setAdding(false)}>Отмена</button>
        <button className="primary-button" type="submit" disabled={saving || !name.trim() || !newRoles.length}><Check size={15} />{saving ? 'Регистрируем…' : 'Зарегистрировать'}</button>
      </div>
    </form>}

    <div className="people-toolbar">
      <div className="people-filter">
        <button type="button" className={!roleFilter ? 'on' : ''} onClick={() => setRoleFilter('')}>Все<span>{employees.length}</span></button>
        {ROLE_ORDER.map((role) => <button type="button" key={role} className={roleFilter === role ? 'on' : ''} onClick={() => setRoleFilter(roleFilter === role ? '' : role)}>{role}<span>{counts[role]}</span></button>)}
      </div>
      <label className="people-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени" /></label>
    </div>

    <section className="info-card people-list">
      {visible.map((p) => {
        const n = activeCount(p)
        return <button type="button" className="people-row" key={p.id} onClick={() => setOpenId(p.id)}>
          <div className="avatar avatar-user">{initialsOf(p.name)}</div>
          <div className="people-main"><b>{p.name}{String(p.id) === String(currentUserId) && <em>вы</em>}</b><small>{n ? `Активных процессов: ${n}` : 'Нет активных процессов'}{isDirector && !demo ? (p.hasAccess ? ` · логин ${p.login}` : ' · нет доступа на сайт') : ''}</small></div>
          <RoleChips roles={p.roles} />
          <ChevronRight size={16} className="people-chevron" />
        </button>
      })}
      {!visible.length && <div className="people-empty">{employees.length ? 'Никого не нашлось.' : 'Сотрудников пока нет.'}</div>}
    </section>
    {created && <CredentialsDialog name={created.employee.name} credentials={created.credentials} onClose={() => setCreated(null)} />}
  </div>
}
