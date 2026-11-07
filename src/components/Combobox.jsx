import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './Combobox.css'

const normalize = (value) => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/**
 * Поле с выпадающим списком и ручным вводом.
 * options — [{ value, label?, hint? }]; onInput(text) — ручной ввод; onSelect(option) — выбор из списка.
 */
export default function Combobox({ value, options, onInput, onSelect, placeholder, ariaLabel, emptyText = 'Нет вариантов — введите вручную', inputClassName = '' }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState(false) // фильтровать по введённому тексту, а не показывать всё
  const [active, setActive] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const q = normalize(value)
  const shown = filter && q ? options.filter((option) => normalize(`${option.value} ${option.hint || ''}`).includes(q)) : options
  const close = () => { setOpen(false); setFilter(false); setActive(-1) }

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const choose = (option) => { onSelect(option); close() }
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter' && open && active >= 0 && shown[active]) { event.preventDefault(); choose(shown[active]) }
    else if (event.key === 'Escape' && open) { event.preventDefault(); close() }
    else if (event.key === 'Tab') close()
  }

  return <div className={'combobox' + (open ? ' open' : '')} ref={rootRef}>
    <input
      ref={inputRef}
      className={'combobox-input ' + inputClassName}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      role="combobox"
      aria-expanded={open}
      aria-autocomplete="list"
      autoComplete="off"
      onFocus={() => setOpen(true)}
      onClick={() => setOpen(true)}
      onChange={(event) => { onInput(event.target.value); setFilter(true); setOpen(true); setActive(-1) }}
      onKeyDown={onKeyDown}
    />
    <button type="button" className="combobox-toggle" tabIndex={-1} aria-label={open ? 'Скрыть список' : 'Показать список'} onClick={() => { if (open) close(); else { setFilter(false); setOpen(true); inputRef.current?.focus() } }}><ChevronDown size={15} /></button>
    {open && <div className="combobox-popover" role="listbox" ref={listRef}>
      {shown.map((option, index) => {
        const selected = normalize(option.value) === q
        return <button type="button" role="option" aria-selected={selected} key={option.key || option.value} data-active={index === active} className={'combobox-option' + (selected ? ' selected' : '')} onPointerEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
          <span><b>{option.label || option.value}</b>{option.hint && <small>{option.hint}</small>}</span>{selected && <Check size={14} />}
        </button>
      })}
      {!shown.length && <div className="combobox-empty">{options.length ? 'Совпадений нет — значение сохранится как введено' : emptyText}</div>}
    </div>}
  </div>
}
