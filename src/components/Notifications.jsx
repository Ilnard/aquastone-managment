import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, CalendarDays, CircleAlert, FileText, Inbox, MessageSquare, UserRound } from 'lucide-react'
import { describeEvent, isVisibleEvent } from '../historyFields.js'
import Popover from './Popover.jsx'
import './Notifications.css'

const ROLE_FIELDS = { manager: 'менеджером', surveyor: 'замерщиком', technologist: 'технологом', cncOperator: 'оператором ЧПУ', finisher: 'обработчиком', installationForeman: 'бригадиром монтажников', installers: 'монтажником' }
const formatDay = (value) => new Date(value + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** Заголовок и строка пояснения для события ленты. */
function describe(item, userName) {
  if (item.kind === 'request') return { icon: Inbox, title: `Новая заявка №${item.requestId} из конструктора`, text: item.estimate ? `Ориентир ${new Intl.NumberFormat('ru-RU').format(item.estimate)} ₽` : '' }
  if (item.kind === 'comment') return { icon: MessageSquare, title: 'Новый комментарий', text: item.body }
  if (item.action === 'created') return { icon: FileText, title: 'Создан процесс', text: '' }
  const changes = item.details?.changes || {}
  const assigned = Object.keys(ROLE_FIELDS).find((field) => changes[field] && !changes[field].complex && String(changes[field].to || '').split(', ').includes(userName) && !String(changes[field].from || '').split(', ').includes(userName))
  if (assigned) return { icon: UserRound, title: `Вас назначили ${ROLE_FIELDS[assigned]}`, text: '' }
  const { title, lines } = describeEvent(item)
  const text = lines.slice(0, 2).map((line) => (line.from !== undefined ? `${line.field}: ${line.from} → ${line.to}` : `${line.field}${line.text ? ': ' + line.text : ''}`)).join(' · ')
  return { icon: FileText, title, text }
}

const REMINDERS = {
  install_today: () => ({ title: 'Монтаж сегодня', text: '' }),
  install_tomorrow: (r) => ({ title: 'Монтаж завтра', text: formatDay(r.date) }),
  overdue: (r) => ({ title: 'Срок производства прошёл', text: `${formatDay(r.date)} · этап «${r.stage}»` }),
  queue: (r) => ({ title: r.next === 'Монтаж' ? 'Можно перевести в монтаж' : 'Можно взять в работу', text: `${r.status ? `${r.stage} · ${r.status}` : r.stage} → ${r.next}` }),
  to_close: () => ({ title: 'Монтаж готов — закройте процесс', text: 'Проверьте фотоотчёт' }),
}

/**
 * Колокольчик в шапке: изменения коллег по моим процессам, комментарии и напоминания на сегодня.
 * Обновляется раз в 30 секунд; открытие панели отмечает всё прочитанным.
 */
export default function Notifications({ user, demo, onOpenProcess, onOpenRequest }) {
  const [data, setData] = useState({ items: [], reminders: [], unread: 0, readAt: null })
  const [seenBefore, setSeenBefore] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const active = useRef(true)

  const load = async () => {
    if (demo || document.hidden) return
    try {
      const response = await fetch('/api/notifications')
      if (response.ok && active.current) { setData(await response.json()); setLoaded(true) }
    } catch { /* сеть недоступна — попробуем позже */ }
  }
  useEffect(() => {
    active.current = true
    load()
    const timer = window.setInterval(load, 30000)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active.current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [demo, user?.id])

  const onOpenChange = async (open) => {
    if (!open || demo) return
    setSeenBefore(data.readAt)
    await load()
    try {
      const response = await fetch('/api/notifications/read', { method: 'POST' })
      if (response.ok) { const { readAt } = await response.json(); setData((current) => ({ ...current, readAt, unread: 0 })) }
    } catch { /* отметим в следующий раз */ }
  }

  const items = data.items.filter((item) => item.kind === 'comment' || item.kind === 'request' || isVisibleEvent(item))
  const badge = data.unread > 0 ? (data.unread > 9 ? '9+' : String(data.unread)) : ''
  const isNew = (item) => !seenBefore || new Date(item.createdAt) > new Date(seenBefore)

  return <Popover className="notifications" onOpenChange={onOpenChange} trigger={(open, toggle) => <button type="button" className={'icon-button notification-button' + (open ? ' open' : '')} onClick={toggle} aria-label={badge ? `Уведомления: ${badge} новых` : 'Уведомления'} aria-expanded={open}>
    <Bell size={18} />
    {badge ? <b className="notification-count">{badge}</b> : data.reminders.length > 0 && <i className="notification-dot" />}
  </button>}>
    {(close) => <div className="notifications-panel">
      <div className="notifications-head"><b>Уведомления</b><small>{demo ? 'демо-версия' : 'за последние 2 недели'}</small></div>
      {demo && <p className="notifications-empty">Уведомления работают в серверной версии.</p>}
      {!demo && data.reminders.length > 0 && <div className="notifications-group">
        <div className="aq-menu-title">Сегодня и ваша очередь</div>
        {data.reminders.map((r) => { const { title, text } = REMINDERS[r.kind](r); return <button type="button" key={r.kind + r.processNumber} className={'notification-item reminder ' + r.kind} onClick={() => { close(); onOpenProcess(r.processNumber) }}>
          <span className="notification-icon">{r.kind === 'overdue' ? <CircleAlert size={15} /> : r.kind === 'queue' || r.kind === 'to_close' ? <ArrowRight size={15} /> : <CalendarDays size={15} />}</span>
          <span className="notification-body"><b>{title}</b><span>#{r.processNumber}{r.client ? ` · ${r.client}` : ''}</span>{text && <small>{text}</small>}</span>
        </button> })}
      </div>}
      {!demo && <div className="notifications-group">
        {data.reminders.length > 0 && items.length > 0 && <div className="aq-menu-title">Изменения</div>}
        {items.map((item) => { const { icon: Icon, title, text } = describe(item, user?.name); return <button type="button" key={item.id} className={'notification-item' + (isNew(item) ? ' unread' : '')} onClick={() => { close(); if (item.kind === 'request') onOpenRequest?.(item.requestId); else onOpenProcess(item.processNumber) }}>
          <span className="notification-icon"><Icon size={15} /></span>
          <span className="notification-body">
            <b>{title}</b>
            <span>{item.kind === 'request' ? item.client || 'Расчёт менеджера' : `#${item.processNumber}${item.client ? ` · ${item.client}` : ''}`}</span>
            {text && <small className="notification-text">{text}</small>}
            <small>{item.actor} · {timeAgo(item.createdAt)}</small>
          </span>
        </button> })}
        {loaded && !items.length && !data.reminders.length && <p className="notifications-empty">Новых уведомлений нет. Здесь появятся изменения и комментарии коллег по вашим процессам.</p>}
      </div>}
    </div>}
  </Popover>
}
