import { useState } from 'react'
import { CalendarDays, Plus, X } from 'lucide-react'
import './InstallationDates.css'

const todayKey = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') }
const formatDay = (value) => {
  const date = new Date(value + 'T00:00:00')
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'short' })
}
const dayWord = (n) => { const m10 = n % 10, m100 = n % 100; return m100 >= 11 && m100 <= 14 ? 'дней' : m10 === 1 ? 'день' : m10 >= 2 && m10 <= 4 ? 'дня' : 'дней' }

/** Список дат, в которые выезжали на монтаж (монтаж может идти в несколько заходов). */
function normalizeInstallationDates(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort()
}

export default function InstallationDates({ dates, canEdit, onChange, onDuplicate }) {
  const list = normalizeInstallationDates(dates)
  const [draft, setDraft] = useState(todayKey)
  const add = () => {
    if (!draft) return
    if (list.includes(draft)) { onDuplicate?.('Эта дата уже есть в списке'); return }
    onChange(normalizeInstallationDates([...list, draft]))
  }
  return <div className="install-dates">
    {list.length > 0 ? <div className="install-dates-list">
      {list.map((date, index) => <div className="install-date" key={date}>
        <CalendarDays size={15} />
        <span><b>{formatDay(date)}</b><small>{index === 0 ? 'Первый выезд' : `${index + 1}-й выезд`}</small></span>
        {canEdit && <button type="button" onClick={() => onChange(list.filter((item) => item !== date))} aria-label={`Удалить дату ${formatDay(date)}`} title="Удалить дату"><X size={14} /></button>}
      </div>)}
    </div> : <p className="install-dates-empty">{canEdit ? 'Даты ещё не отмечены.' : 'Не заполнено'}</p>}
    {list.length > 1 && <small className="install-dates-total">Монтаж в {list.length} {dayWord(list.length)}</small>}
    {canEdit && <div className="install-dates-add">
      <input className="inline-edit" type="date" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Дата монтажа" />
      <button type="button" className="secondary-button" onClick={add}><Plus size={14} />Добавить дату</button>
    </div>}
  </div>
}
