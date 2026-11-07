import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { Boxes, ChevronLeft, ChevronRight, Download, FileText, Gem, Layers, Square } from 'lucide-react'
import { processItems } from '../processItems.js'
import { createdKeyOf } from './ListControls.jsx'
import { downloadProcessesCsv } from '../exportCsv.js'
import './MonthStats.css'

const DONE = 'Завершён'
const pad = (n) => String(n).padStart(2, '0')
const monthKeyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
const parseMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1) }
const shiftMonth = (key, delta) => { const d = parseMonth(key); d.setMonth(d.getMonth() + delta); return monthKeyOf(d) }
const monthTitle = (key) => { const text = parseMonth(key).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', ''); return text[0].toUpperCase() + text.slice(1) }
const day = (value) => (value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—')
const dayFromKey = (key) => (key ? new Date(key + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
/** Склонение: 1 изделие, 2 изделия, 5 изделий. */
const plural = (n, one, few, many) => { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many }

// Плитки показателей: материал изделия → плитка.
const TILES = [
  { key: 'Акрил', label: 'Изделия из акрила', icon: Layers, tone: 'violet' },
  { key: 'Кварцевый агломерат', label: 'Изделия из кварца', icon: Gem, tone: 'blue' },
  { key: 'HPL (Компакт)', label: 'Изделия из HPL компакта', icon: Square, tone: 'amber' },
]

/**
 * Статистика «Произведено за месяц»: процессы, завершённые в выбранном месяце (по дате завершения,
 * дата создания не важна), и сколько в них изделий из акрила, кварца, HPL и всего.
 * Выбранный месяц хранится в адресе: /overview?month=2026-11.
 */
export default function MonthStats({ orders, onOpenProcess }) {
  const [params, setParams] = useSearchParams()
  const currentMonth = monthKeyOf(new Date())
  const done = useMemo(() => orders.filter((order) => order.stage === DONE && order.completedAt && !Number.isNaN(new Date(order.completedAt).getTime())), [orders])
  // Самый ранний месяц с завершёнными процессами — дальше листать назад незачем.
  const firstMonth = useMemo(() => done.reduce((min, order) => { const key = monthKeyOf(new Date(order.completedAt)); return key < min ? key : min }, currentMonth), [done, currentMonth])
  const requested = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : currentMonth
  const month = requested > currentMonth ? currentMonth : requested < firstMonth ? firstMonth : requested
  const setMonth = (key) => setParams((p) => { const next = new URLSearchParams(p); if (key === currentMonth) next.delete('month'); else next.set('month', key); return next }, { replace: true })

  const inMonth = useMemo(() => done
    .filter((order) => monthKeyOf(new Date(order.completedAt)) === month)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)), [done, month])
  const items = inMonth.flatMap((order) => processItems(order))
  const count = (material) => items.filter((item) => item.material === material).length
  const other = items.filter((item) => !TILES.some((tile) => tile.key === item.material)).length
  const months = useMemo(() => { const list = []; for (let key = currentMonth; key >= firstMonth; key = shiftMonth(key, -1)) list.push(key); return list }, [currentMonth, firstMonth])

  return <section className="info-card month-stats" aria-labelledby="month-stats-title">
    <div className="month-stats-head">
      <div><h3 id="month-stats-title">Произведено за месяц</h3><p>Процессы, завершённые в выбранном месяце — по дате завершения</p></div>
      <div className="month-switch">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= firstMonth} aria-label="Предыдущий месяц"><ChevronLeft size={16} /></button>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Месяц">{months.map((key) => <option key={key} value={key}>{monthTitle(key)}</option>)}</select>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth} aria-label="Следующий месяц"><ChevronRight size={16} /></button>
      </div>
    </div>

    <div className="stat-grid month-tiles">
      {TILES.map((tile) => <div className="stat-card month-tile" key={tile.key}>
        <div className={`stat-icon stat-${tile.tone === 'violet' ? 'purple' : tile.tone}`}><tile.icon size={18} /></div>
        <div className="stat-label">{tile.label}</div>
        <div className="stat-number">{count(tile.key)}</div>
        <div className="stat-detail">{plural(count(tile.key), 'изделие', 'изделия', 'изделий')}</div>
      </div>)}
      <div className="stat-card month-tile month-total">
        <div className="stat-icon stat-green"><Boxes size={18} /></div>
        <div className="stat-label">Всего изделий</div>
        <div className="stat-number">{items.length}</div>
        <div className="stat-detail">в {inMonth.length} {plural(inMonth.length, 'процессе', 'процессах', 'процессах')}{other ? ` · ${other} без материала` : ''}</div>
      </div>
    </div>

    <div className="month-list-head">
      <b>{monthTitle(month)}: {inMonth.length} {plural(inMonth.length, 'процесс завершён', 'процесса завершено', 'процессов завершено')}</b>
      {inMonth.length > 0 && <button type="button" className="aq-link-button" onClick={() => downloadProcessesCsv(inMonth, `aquastone-proizvedeno-${month}`)}><Download size={14} />Скачать CSV</button>}
    </div>
    {inMonth.length ? <div className="table-wrap"><table className="month-table">
      <thead><tr><th>ПРОЦЕСС</th><th>ИЗДЕЛИЯ</th><th>ЗАВЕРШЁН</th><th>СОЗДАН</th><th>МЕНЕДЖЕР</th></tr></thead>
      <tbody>{inMonth.map((order) => <tr key={order.id} onClick={() => onOpenProcess(order)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpenProcess(order) }}>
        <td><div className="process-cell"><div className="order-mark mark-green"><FileText size={16} /></div><div><b>#{order.id}</b><span>{order.client || 'Без имени'}</span></div></div></td>
        <td><ul className="month-items">{processItems(order).map((item, i) => <li key={i}><b>{item.product || 'Изделие'}</b><span>{[item.material || 'материал не указан', item.decor].filter(Boolean).join(' · ')}</span></li>)}{!processItems(order).length && <li className="muted">Изделия не указаны</li>}</ul></td>
        <td className="month-date">{day(order.completedAt)}</td>
        <td className="month-date muted">{dayFromKey(createdKeyOf(order))}</td>
        <td>{order.manager || '—'}</td>
      </tr>)}</tbody>
    </table></div> : <div className="empty-state month-empty"><Boxes size={22} /><b>В этом месяце завершённых процессов нет</b><span>Процесс попадает сюда, когда его этап меняют на «Завершён».</span></div>}
  </section>
}
