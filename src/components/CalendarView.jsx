import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert, Flag } from 'lucide-react'
import { STAGES, isAssignedTo, stageTone } from '../permissions.js'
import './CalendarView.css'

// Календарь сроков: каждый процесс — полоса от даты создания до крайнего срока «Дата окончания процесса».

const DAY = 86400000
const parseKey = (value) => { const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null }
const dayIndex = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
const fromIndex = (i) => { const d = new Date(i * DAY); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const short = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many }
const days = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`

// Производство считается выполненным, когда процесс дошёл до «Произведено».
const READY_STAGES = ['Произведено', 'Монтаж']
const DONE_STAGE = 'Завершён'
const GROUPS = [
  { id: 'active', label: 'В работе' },
  { id: 'ready', label: 'Произведены' },
  { id: 'done', label: 'Завершённые' },
]
const GROUP_ORDER = ['active', 'ready', 'done']
const groupOf = (order) => (order.stage === DONE_STAGE ? 'done' : READY_STAGES.includes(order.stage) ? 'ready' : 'active')
const STAGE_CLASS = Object.fromEntries(STAGES.map((stage) => [stage, stageTone(stage)]))

const readPrefs = () => { try { return JSON.parse(localStorage.getItem('aquastone-calendar-v2')) || {} } catch { return {} } }
const writePrefs = (prefs) => { try { localStorage.setItem('aquastone-calendar-v2', JSON.stringify(prefs)) } catch { /* без хранилища */ } }

/** Полоса процесса: начало, крайний срок, просрочка. */
function spanOf(order, todayIdx) {
  const created = parseKey(order.processCreatedDate) || parseKey(order.createdAt)
  const deadline = parseKey(order.productionDate)
  if (!created || !deadline) return null
  const deadlineIdx = dayIndex(deadline)
  const startIdx = Math.min(dayIndex(created), deadlineIdx)
  const group = groupOf(order)
  const overdue = group === 'active' && deadlineIdx < todayIdx
  return { order, group, startIdx, deadlineIdx, endIdx: overdue ? todayIdx : deadlineIdx, overdue, left: deadlineIdx - todayIdx }
}

export default function CalendarView({ orders, user, onSelect }) {
  const prefs = useMemo(readPrefs, [])
  const now = new Date()
  const todayIdx = dayIndex(now)
  const [scale, setScaleState] = useState(prefs.scale === 'quarter' ? 'quarter' : 'month')
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [groups, setGroupsState] = useState(() => new Set(Array.isArray(prefs.groups) && prefs.groups.length ? prefs.groups : ['active', 'ready']))
  const [onlyMine, setOnlyMineState] = useState(Boolean(prefs.onlyMine))
  const save = (next) => writePrefs({ scale, groups: [...groups], onlyMine, ...next })
  const setScale = (value) => { setScaleState(value); save({ scale: value }) }
  const toggleGroup = (id) => { const next = new Set(groups); if (next.has(id)) next.delete(id); else next.add(id); if (!next.size) return; setGroupsState(next); save({ groups: [...next] }) }
  const setOnlyMine = (value) => { setOnlyMineState(value); save({ onlyMine: value }) }

  const isMine = (order) => isAssignedTo(order, user?.name)
  const pool = orders.filter((order) => !onlyMine || isMine(order))

  // Диапазон: месяц или три месяца, начиная с выбранного.
  const rangeStart = dayIndex(cursor)
  const rangeEnd = dayIndex(new Date(cursor.getFullYear(), cursor.getMonth() + (scale === 'quarter' ? 3 : 1), 0))
  const total = rangeEnd - rangeStart + 1
  const columns = Array.from({ length: total }, (_, i) => fromIndex(rangeStart + i))
  const months = []
  for (const d of columns) { const last = months[months.length - 1]; if (last && last.month === d.getMonth()) last.count += 1; else months.push({ month: d.getMonth(), year: d.getFullYear(), count: 1, label: capitalize(d.toLocaleDateString('ru-RU', { month: 'long' })) }) }
  const title = scale === 'month'
    ? capitalize(cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, ''))
    : `${months[0].label} — ${months[months.length - 1].label.toLowerCase()} ${months[months.length - 1].year}`
  const shift = (dir) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1))
  const goToday = () => setCursor(new Date(now.getFullYear(), now.getMonth() - (scale === 'quarter' ? 1 : 0), 1))

  const spans = pool.map((order) => spanOf(order, todayIdx)).filter(Boolean)
  const counts = Object.fromEntries(GROUPS.map((g) => [g.id, spans.filter((s) => s.group === g.id).length]))
  const rows = spans
    .filter((s) => groups.has(s.group) && s.startIdx <= rangeEnd && s.endIdx >= rangeStart)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.deadlineIdx - b.deadlineIdx || a.startIdx - b.startIdx)
  const hiddenOutside = spans.filter((s) => groups.has(s.group)).length - rows.length
  const noDeadline = pool.filter((order) => order.stage !== DONE_STAGE && !READY_STAGES.includes(order.stage) && !parseKey(order.productionDate))
  const overdueCount = spans.filter((s) => s.overdue).length
  const weekCount = spans.filter((s) => s.group === 'active' && s.left >= 0 && s.left <= 7).length

  const pct = (idx) => ((idx - rangeStart) / total) * 100
  const todayInRange = todayIdx >= rangeStart && todayIdx <= rangeEnd

  // Если диаграмма шире экрана (телефон, планшет), прокручиваем её к сегодняшнему дню.
  const scrollRef = useRef(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const label = el.querySelector('.gantt-corner')?.offsetWidth || 0
    const track = el.scrollWidth - label
    el.scrollLeft = todayInRange ? Math.max(0, label + track * (todayIdx - rangeStart + 0.5) / total - label - (el.clientWidth - label) / 3) : 0
  }, [scale, rangeStart, total])

  return <div className="other-view calendar-view">
    <div className="page-heading cal-heading">
      <div><div className="eyebrow"><span className="eyebrow-dot" />ПЛАНИРУЙТЕ РАБОТУ</div><h1>Календарь сроков</h1><p>Полоса процесса — от даты создания до крайнего срока «Дата окончания процесса».</p></div>
      <div className="cal-mode" role="tablist" aria-label="Масштаб">
        <button type="button" className={scale === 'month' ? 'on' : ''} onClick={() => setScale('month')} role="tab" aria-selected={scale === 'month'}>Месяц</button>
        <button type="button" className={scale === 'quarter' ? 'on' : ''} onClick={() => setScale('quarter')} role="tab" aria-selected={scale === 'quarter'}>3 месяца</button>
      </div>
    </div>

    <div className="cal-summary">
      <div className={'cal-stat' + (overdueCount ? ' danger' : '')}><b>{overdueCount}</b><span>{plural(overdueCount, 'процесс просрочен', 'процесса просрочено', 'процессов просрочено')}</span></div>
      <div className="cal-stat"><b>{weekCount}</b><span>срок в ближайшие 7 дней</span></div>
      <div className={'cal-stat' + (noDeadline.length ? ' warn' : '')}><b>{noDeadline.length}</b><span>без даты окончания</span></div>
    </div>

    <div className="cal-toolbar">
      <div className="cal-nav">
        <button type="button" className="cal-icon" onClick={() => shift(-1)} aria-label="Назад"><ChevronLeft size={17} /></button>
        <button type="button" className="cal-today" onClick={goToday}>Сегодня</button>
        <button type="button" className="cal-icon" onClick={() => shift(1)} aria-label="Вперёд"><ChevronRight size={17} /></button>
        <h2>{title}</h2>
      </div>
      <div className="cal-filters">
        {GROUPS.map((g) => <button type="button" key={g.id} className={`cal-filter g-${g.id}` + (groups.has(g.id) ? ' on' : '')} onClick={() => toggleGroup(g.id)} aria-pressed={groups.has(g.id)}><i />{g.label}<span>{counts[g.id]}</span></button>)}
        <label className="cal-mine"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />Только мои</label>
      </div>
    </div>

    <section className={`gantt ${scale}`}>
      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-inner" style={{ '--days': total }}>
          <div className="gantt-head">
            <div className="gantt-corner">Процесс</div>
            <div className="gantt-axis">
              {scale === 'quarter' && <div className="gantt-months">{months.map((m) => <div key={m.year + '-' + m.month} style={{ flexGrow: m.count }}>{m.label}</div>)}</div>}
              <div className="gantt-days">{columns.map((d) => { const idx = dayIndex(d); const wd = d.getDay(); return <div key={idx} className={(wd === 0 || wd === 6 ? 'weekend' : '') + (idx === todayIdx ? ' today' : '') + (d.getDate() === 1 ? ' first' : '')}><b>{d.getDate()}</b>{scale === 'month' && <small>{['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][wd]}</small>}</div> })}</div>
            </div>
          </div>

          <div className="gantt-body">
            <div className="gantt-grid" aria-hidden="true">{columns.map((d) => { const idx = dayIndex(d); const wd = d.getDay(); return <i key={idx} className={(wd === 0 || wd === 6 ? 'weekend' : '') + (d.getDate() === 1 ? ' first' : '')} /> })}{todayInRange && <span className="gantt-today" style={{ left: `${pct(todayIdx + 0.5)}%` }} />}</div>
            {rows.map((s) => {
              const from = Math.max(s.startIdx, rangeStart)
              const to = Math.min(s.deadlineIdx, rangeEnd)
              const showMain = s.deadlineIdx >= rangeStart
              const tailFrom = Math.max(s.deadlineIdx + 1, rangeStart)
              const tailTo = Math.min(s.endIdx, rangeEnd)
              const order = s.order
              const tone = STAGE_CLASS[order.stage] || 'gray'
              const status = s.group === 'done' ? 'Завершён' : s.group === 'ready' ? 'Произведено' : s.overdue ? `Просрочено на ${days(-s.left)}` : s.left === 0 ? 'Срок сегодня' : `Осталось ${days(s.left)}`
              const tip = `#${order.id} ${order.client}\nСоздан: ${short(fromIndex(s.startIdx))}\nКрайний срок: ${short(fromIndex(s.deadlineIdx))}\n${order.stage} · ${status}`
              return <button type="button" key={order.id} className={`gantt-row g-${s.group}` + (s.overdue ? ' overdue' : '')} onClick={() => onSelect(order)} title={tip}>
                <span className="gantt-label">
                  <span className="gantt-label-top"><b>#{order.id}</b> {order.client}</span>
                  <span className="gantt-label-sub"><i className={`stage-dot s-${tone}`} />{order.stage}<em className={s.overdue ? 'late' : s.left >= 0 && s.left <= 3 && s.group === 'active' ? 'soon' : ''}>{status}</em></span>
                </span>
                <span className="gantt-track">
                  {showMain && <span className={`gantt-bar s-${tone}` + (s.startIdx < rangeStart ? ' cut-left' : '') + (s.deadlineIdx > rangeEnd ? ' cut-right' : '')} style={{ left: `${pct(from)}%`, width: `${((to - from + 1) / total) * 100}%` }}>
                    <span className="gantt-bar-text">{s.deadlineIdx <= rangeEnd ? `до ${short(fromIndex(s.deadlineIdx))}` : ''}</span>
                    {s.deadlineIdx <= rangeEnd && <Flag size={11} className="gantt-flag" />}
                  </span>}
                  {s.overdue && tailTo >= tailFrom && <span className="gantt-tail" style={{ left: `${pct(tailFrom)}%`, width: `${((tailTo - tailFrom + 1) / total) * 100}%` }} />}
                </span>
              </button>
            })}
            {!rows.length && <div className="gantt-empty">В этом периоде нет процессов со сроками{hiddenOutside > 0 ? ` (вне периода: ${hiddenOutside})` : ''}.</div>}
          </div>
        </div>
      </div>
      <div className="gantt-legend">
        <span><i className="lg-bar" />от создания процесса до крайнего срока</span>
        <span><Flag size={11} />дата окончания процесса</span>
        <span><i className="lg-tail" />просрочка до сегодня</span>
        <span><i className="lg-today" />сегодня</span>
      </div>
    </section>

    {noDeadline.length > 0 && <section className="info-card cal-missing">
      <div className="cal-agenda-head"><CircleAlert size={16} /><div><h3>Без даты окончания</h3><p>Укажите «Дату окончания процесса» в карточке «Сроки», и процесс появится в календаре.</p></div></div>
      <div className="cal-missing-list">{noDeadline.map((order) => <button type="button" key={order.id} onClick={() => onSelect(order)}><b>#{order.id} {order.client}</b><small>{order.stage} · создан {short(parseKey(order.processCreatedDate) || parseKey(order.createdAt) || now)}</small></button>)}</div>
    </section>}
  </div>
}
