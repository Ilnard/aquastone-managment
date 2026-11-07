import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import './SearchSelect.css'

const normalize = (value) => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/**
 * Выпадающий список с поиском.
 * options — массив строк; onAdd(name) — если передан, из списка можно добавить новую позицию в справочник.
 */
export default function SearchSelect({ value, options, onChange, onAdd, placeholder = 'Выберите', searchPlaceholder = 'Поиск…', ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const filtered = useMemo(() => {
    const q = normalize(query)
    return q ? options.filter((option) => normalize(option).includes(q)) : options
  }, [options, query])
  const trimmed = query.trim()
  const canAdd = Boolean(onAdd && trimmed && !options.some((option) => normalize(option) === normalize(trimmed)))
  // Строки списка: «Не выбрано», варианты и «Добавить…».
  const rows = [...(value ? [{ kind: 'clear' }] : []), ...filtered.map((option) => ({ kind: 'option', option })), ...(canAdd ? [{ kind: 'add' }] : [])]

  const close = () => { setOpen(false); setQuery(''); setActive(0) }
  const openList = () => {
    // Рисуем список сразу и ставим фокус в том же касании — так на планшете открывается клавиатура
    // и не теряются первые набранные буквы.
    flushSync(() => {
      setOpen(true)
      setQuery('')
      setActive(Math.max(0, options.indexOf(value)) + (value ? 1 : 0))
    })
    inputRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])
  useEffect(() => { setActive((current) => Math.min(current, Math.max(rows.length - 1, 0))) }, [rows.length])
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  const choose = async (row) => {
    if (!row) return
    if (row.kind === 'clear') { onChange(''); close(); return }
    if (row.kind === 'option') { onChange(row.option); close(); return }
    if (row.kind === 'add' && !adding) {
      setAdding(true)
      try {
        const added = await onAdd(trimmed)
        if (added !== false) { onChange(typeof added === 'string' ? added : trimmed); close() }
      } finally { setAdding(false) }
    }
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter') { event.preventDefault(); choose(rows[active]) }
    else if (event.key === 'Escape') { event.preventDefault(); close() }
    else if (event.key === 'Tab') close()
  }

  return <div className={'search-select' + (open ? ' open' : '')} ref={rootRef}>
    <button type="button" className={'search-select-trigger' + (value ? '' : ' empty')} onClick={() => (open ? close() : openList())} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
      <span>{value || placeholder}</span>
      <ChevronDown size={15} />
    </button>
    {open && <div className="search-select-popover">
      <div className="search-select-search">
        <Search size={15} />
        <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0) }} onKeyDown={onKeyDown} placeholder={searchPlaceholder} aria-label={searchPlaceholder} autoComplete="off" />
        {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Очистить поиск"><X size={14} /></button>}
      </div>
      <div className="search-select-list" role="listbox" ref={listRef}>
        {rows.map((row, index) => {
          const key = row.kind + (row.option || '')
          const props = { 'data-active': index === active, onPointerEnter: () => setActive(index), onClick: () => choose(row) }
          if (row.kind === 'clear') return <button type="button" key={key} className="search-select-option muted" {...props}><X size={14} />Не выбрано</button>
          if (row.kind === 'add') return <button type="button" key={key} className="search-select-option add" {...props}><Plus size={14} />{adding ? 'Добавляем…' : <>Добавить «{trimmed}» в справочник</>}</button>
          return <button key={key} type="button" role="option" aria-selected={row.option === value} className={'search-select-option' + (row.option === value ? ' selected' : '')} {...props}><span>{row.option}</span>{row.option === value && <Check size={14} />}</button>
        })}
        {!filtered.length && !canAdd && <div className="search-select-empty">Ничего не найдено</div>}
      </div>
    </div>}
  </div>
}
