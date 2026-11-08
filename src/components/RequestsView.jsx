import { useEffect, useState } from 'react'
import { ArrowRight, Check, FileText, Phone, Plus, RotateCcw, X } from 'lucide-react'
import { REQUEST_STATUSES, SHAPE_TYPES } from '../requests.js'
import './RequestsView.css'

const money = (n) => new Intl.NumberFormat('ru-RU').format(n || 0) + ' ₽'
const area = (n) => String(n ?? 0).replace('.', ',') + ' м²'
const dateTime = (value) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const STATUS_TONE = { 'Новая': 'new', 'В работе': 'work', 'Создан процесс': 'done', 'Отклонена': 'rejected' }
const telHref = (phone) => 'tel:' + String(phone).replace(/[^\d+]/g, '')
const projectLine = (p) => [p.formTitle, p.materialTitle, p.thickness ? `${p.thickness} мм` : null, p.decor].filter(Boolean).join(' · ')

/** Эскиз из конструктора: детали столешницы, мойки, варочные панели и вырезы (размеры в мм). */
export function RequestSketch({ shapes = [], seams = [] }) {
  if (!shapes.length) return null
  const pad = 80
  const minX = Math.min(...shapes.map((s) => s.x)) - pad, minY = Math.min(...shapes.map((s) => s.y)) - pad
  const maxX = Math.max(...shapes.map((s) => s.x + s.w)) + pad, maxY = Math.max(...shapes.map((s) => s.y + s.h)) + pad
  const surfaces = shapes.filter((s) => s.type === 'rect')
  return <svg className="request-sketch" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Эскиз столешницы">
    {surfaces.map((s, i) => <g key={'r' + i}>
      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="12" className="sketch-surface" />
      <text x={s.x + s.w / 2} y={s.y + s.h / 2 + 30} className="sketch-size">{s.w} × {s.h}</text>
    </g>)}
    {shapes.filter((s) => s.type !== 'rect').map((s, i) => s.type === 'circle'
      ? <circle key={'c' + i} cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={Math.min(s.w, s.h) / 2} className="sketch-cut" />
      : <rect key={'c' + i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.type === 'sink' ? 60 : 16} className={'sketch-cut ' + s.type} />)}
    {seams.map((seam, i) => <line key={'s' + i} x1={seam.x1} y1={seam.y1} x2={seam.x2} y2={seam.y2} className="sketch-seam" />)}
  </svg>
}

/**
 * Раздел «Заявки» (только менеджер и директор): заявки из конструктора столешниц.
 * Новая → В работе → «Создать процесс» (откроется форма нового процесса с данными заявки) или «Отклонить».
 */
// Открытая заявка — из адреса /requests/:id (openId), открыть/закрыть — onOpenChange.
export default function RequestsView({ requests, openId, onOpenChange, onUpdate, onCreateProcess, onOpenProcess }) {
  const [filter, setFilter] = useState(() => (openId ? 'Все' : 'Новая'))
  const setOpenId = onOpenChange
  // Открыли заявку по ссылке, а её статус скрыт текущей вкладкой — показываем все.
  useEffect(() => { const r = requests.find((item) => item.id === openId); if (r && filter !== 'Все' && r.status !== filter) setFilter('Все') }, [openId, requests.length])
  const shown = requests.filter((r) => filter === 'Все' || r.status === filter)
  const current = requests.find((r) => r.id === openId)
  return <div className="other-view requests-view">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />КОНСТРУКТОР СТОЛЕШНИЦ</div><h1>Заявки <span className="heading-count">{requests.length}</span></h1><p>Расчёты, отправленные из конструктора клиентами и менеджерами. Раздел видят только менеджеры и директор.</p></div></div>
    <section className="process-panel">
      <div className="stage-tabs">{['Все', ...REQUEST_STATUSES].map((name) => <button key={name} className={`stage-tab ${filter === name ? 'selected' : ''}`} onClick={() => setFilter(name)}>{name}<span>{name === 'Все' ? requests.length : requests.filter((r) => r.status === name).length}</span></button>)}</div>
      <div className="requests-list">
        {shown.map((r) => <button type="button" key={r.id} className={'request-row' + (r.id === openId ? ' open' : '')} onClick={() => setOpenId(r.id === openId ? null : r.id)}>
          <span className="request-num"><b>№{r.id}</b><small>{dateTime(r.createdAt)}</small></span>
          <span className="request-who">{r.source === 'client' ? <><b>{r.clientName}</b><small>{r.clientPhone}</small></> : <><b>От менеджера</b><small>{r.author}</small></>}</span>
          <span className="request-project"><b>{r.project.title ? `«${r.project.title}» · ` : ''}{projectLine(r.project)}</b><small>{area(r.project.summary.area)} · {r.project.shapes.filter((s) => s.type === 'rect').length} дет. · {r.project.shapes.filter((s) => s.type !== 'rect').length} выр.</small></span>
          <span className="request-price">{money(r.estimate)}</span>
          <span className={'request-status ' + STATUS_TONE[r.status]}>{r.status}</span>
        </button>)}
        {!shown.length && <div className="empty-state"><FileText size={24} /><b>{requests.length ? 'Нет заявок с этим статусом' : 'Заявок пока нет'}</b><span>Заявки появятся, когда клиент или менеджер нажмёт «Отправить заявку на рассмотрение» в конструкторе.</span></div>}
      </div>
    </section>
    {current && <RequestCard key={current.id} request={current} onClose={() => setOpenId(null)} onUpdate={onUpdate} onCreateProcess={onCreateProcess} onOpenProcess={onOpenProcess} />}
  </div>
}

function RequestCard({ request: r, onClose, onUpdate, onCreateProcess, onOpenProcess }) {
  const [note, setNote] = useState(r.note || '')
  const [busy, setBusy] = useState(false)
  const run = async (patch) => { setBusy(true); try { await onUpdate(r, patch) } finally { setBusy(false) } }
  const p = r.project
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="aq-modal request-card" role="dialog" aria-label={`Заявка №${r.id}`}>
      <div className="modal-header"><div><span className="modal-kicker">ЗАЯВКА №{r.id} · {dateTime(r.createdAt)}</span><h2>{r.source === 'client' ? r.clientName : `От менеджера: ${r.author}`}</h2><p>{p.title ? `«${p.title}» · ` : ''}{projectLine(p)}{p.decorCode ? ` (${p.decorCode})` : ''}</p></div><button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
      <div className="modal-content request-body">
        <div className="request-top">
          <span className={'request-status ' + STATUS_TONE[r.status]}>{r.status}</span>
          {r.source === 'client' && <a className="phone-link request-phone" href={telHref(r.clientPhone)}><Phone size={14} />{r.clientPhone}</a>}
          {r.processNumber && <button type="button" className="aq-link-button" onClick={() => onOpenProcess(r.processNumber)}>Процесс #{r.processNumber} <ArrowRight size={13} /></button>}
        </div>
        <RequestSketch shapes={p.shapes} seams={p.seams} />
        <dl className="request-facts">
          <div><dt>Площадь деталей</dt><dd>{area(p.summary.area)}</dd></div>
          <div><dt>Комплект листов</dt><dd>{p.summary.order || '—'}{p.summary.orderDescription ? <small>{p.summary.orderDescription}</small> : null}</dd></div>
          <div><dt>Выход материала</dt><dd>{p.summary.efficiency}%</dd></div>
          <div><dt>Стыки</dt><dd>{p.summary.seams ? `${p.summary.seams} · ${p.summary.seamLength} мм` : 'без стыков'}</dd></div>
          <div className="wide"><dt>Ориентир по стоимости</dt><dd className="request-estimate">{money(r.estimate)}</dd></div>
          {p.price && <div className="wide"><dt>Как посчитано (на сервере)</dt><dd className="request-price-lines">
            <small>Материал: {area(p.summary.purchasedArea)} × {money(p.price.pricePerM2)}{p.price.thicknessCoefficient !== 1 ? ` × ${p.price.thicknessCoefficient} (толщина)` : ''} = {money(p.price.materialCost)}</small>
            {p.price.cutoutsCost > 0 && <small>Вырезы: {money(p.price.cutoutsCost)}</small>}
            {p.price.formCoefficient !== 1 && <small>Коэффициент формы × {p.price.formCoefficient}</small>}
          </dd></div>}
        </dl>
        <ul className="request-parts">{p.shapes.map((s, i) => <li key={i}><span>{s.type === 'rect' ? s.name : SHAPE_TYPES[s.type]}</span><b>{s.w} × {s.h} мм</b></li>)}</ul>
        <label className="form-field"><span>Комментарий менеджера</span><textarea className="inline-edit" rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: перезвонить в пятницу, уточнить мойку" /></label>
      </div>
      <div className="modal-footer request-actions">
        {note !== (r.note || '') && <button type="button" className="secondary-button" disabled={busy} onClick={() => run({ note })}><Check size={15} />Сохранить комментарий</button>}
        {r.status === 'Отклонена' && <button type="button" className="secondary-button" disabled={busy} onClick={() => run({ status: 'В работе' })}><RotateCcw size={15} />Вернуть в работу</button>}
        {['Новая', 'В работе'].includes(r.status) && <button type="button" className="secondary-button danger-text" disabled={busy} onClick={() => run({ status: 'Отклонена', note })}><X size={15} />Отклонить</button>}
        {r.status === 'Новая' && <button type="button" className="secondary-button" disabled={busy} onClick={() => run({ status: 'В работе', note })}>Взять в работу</button>}
        {!r.processNumber && r.status !== 'Отклонена' && <button type="button" className="primary-button" disabled={busy} onClick={() => onCreateProcess(r)}><Plus size={15} />Создать процесс</button>}
      </div>
    </div>
  </div>
}
