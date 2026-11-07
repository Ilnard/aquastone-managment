import { useEffect, useRef, useState } from 'react'
import './Popover.css'

/**
 * Кнопка с выпадающей панелью. Закрывается кликом вне панели и клавишей Esc.
 * trigger(open, toggle) — рисует кнопку; children(close) — содержимое панели.
 */
export default function Popover({ trigger, children, className = '', onOpenChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const set = (value) => { setOpen(value); onOpenChange?.(value) }
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) set(false) }
    const onKey = (event) => { if (event.key === 'Escape') set(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return <div className={'aq-popover-root ' + className} ref={rootRef}>
    {trigger(open, () => set(!open))}
    {open && <div className="aq-popover" role="dialog">{children(() => set(false))}</div>}
  </div>
}

/** Пункт меню внутри Popover. */
export function MenuItem({ icon: Icon, children, onClick, disabled = false }) {
  return <button type="button" className="aq-menu-item" onClick={onClick} disabled={disabled}>
    {Icon && <Icon size={15} />}<span>{children}</span>
  </button>
}
