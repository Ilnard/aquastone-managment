import { ArrowRight } from 'lucide-react'
import './HistoryLines.css'

/** Строки изменений события: «Клей: A-White → N-White». Старые записи без значений — просто названия полей. */
export default function HistoryLines({ lines }) {
  if (!lines.length) return null
  const withValues = lines.some((line) => line.from !== undefined || line.text)
  if (!withValues) return <p className="history-fields">Изменены поля: {lines.map((line) => line.field).join(', ')}</p>
  return <ul className="history-changes">
    {lines.map((line, i) => <li key={i}>
      <span className="history-change-field">{line.field}</span>
      {line.from !== undefined
        ? <span className="history-change-value"><s>{line.from}</s><ArrowRight size={11} /><b>{line.to}</b></span>
        : <span className="history-change-value">{line.text || 'изменено'}</span>}
    </li>)}
  </ul>
}
