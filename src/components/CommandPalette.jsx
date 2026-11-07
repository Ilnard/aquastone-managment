import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, ClipboardList, FileText, LayoutDashboard, Search, Settings2, UserRound, Users } from 'lucide-react'
import { stageLabel } from '../permissions.js'
import { itemsSearchText, productsLabel } from '../processItems.js'
import './CommandPalette.css'

const PAGES = [
  { view: 'Процессы', icon: ClipboardList, words: 'процессы заказы список' },
  { view: 'Обзор', icon: LayoutDashboard, words: 'обзор сводка' },
  { view: 'Календарь', icon: CalendarDays, words: 'календарь монтаж замер даты' },
  { view: 'Сотрудники', icon: Users, words: 'сотрудники команда люди' },
  { view: 'Справочники', icon: Settings2, words: 'справочники клей шлифовка декор' },
  { view: 'Кабинет', label: 'Личный кабинет', icon: UserRound, words: 'кабинет пароль логин выйти' },
]
const normalize = (value) => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const digits = (value) => String(value || '').replace(/\D/g, '')
const phonesOf = (order) => [order.furnitureMakerPhone, ...(Array.isArray(order.phoneContacts) ? order.phoneContacts.map((c) => c.phone) : [])].filter(Boolean)
const addressOf = (order) => [order.addressCity, order.addressStreet, order.addressHouse].filter(Boolean).join(', ')

/** Окно быстрого поиска: процессы (номер, клиент, телефон, адрес, декор) и разделы сайта. */
export default function CommandPalette({ orders, onClose, onOpenProcess, onNavigate }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = normalize(query)
    const qDigits = digits(query)
    const processes = (q
      ? orders.filter((order) => {
        if (String(order.id).toLowerCase().includes(q)) return true
        if (qDigits.length >= 3 && phonesOf(order).some((phone) => digits(phone).includes(qDigits))) return true
        return normalize(`${order.client} ${order.furnitureCompany || ''} ${order.furnitureMaker || ''} ${addressOf(order)} ${itemsSearchText(order)}`).includes(q)
      })
      : [...orders].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    ).slice(0, 8).map((order) => ({ type: 'process', key: 'p' + order.id, order }))
    const pages = PAGES.filter((page) => !q || normalize(`${page.label || page.view} ${page.words}`).includes(q)).map((page) => ({ type: 'page', key: 'v' + page.view, page }))
    return [...processes, ...pages]
  }, [orders, query])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const choose = (row) => {
    if (!row) return
    onClose()
    if (row.type === 'process') onOpenProcess(row.order.id)
    else onNavigate(row.page.view)
  }
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[active]) }
    else if (event.key === 'Escape') { event.preventDefault(); onClose() }
  }

  const processCount = results.filter((row) => row.type === 'process').length
  return <div className="palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="palette" role="dialog" aria-label="Быстрый поиск">
      <div className="palette-search"><Search size={17} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Номер, клиент, телефон, адрес или раздел…" aria-label="Быстрый поиск" autoComplete="off" /><kbd>Esc</kbd></div>
      <div className="palette-list" ref={listRef} role="listbox">
        {results.map((row, index) => {
          const props = { type: 'button', role: 'option', 'data-active': index === active, 'aria-selected': index === active, className: 'palette-item', onPointerMove: () => setActive(index), onClick: () => choose(row) }
          const heading = index === 0 && row.type === 'process' ? <div className="palette-title" key="tp">{query ? 'Процессы' : 'Недавно изменённые'}</div>
            : index === processCount && row.type === 'page' ? <div className="palette-title" key="tv">Разделы</div> : null
          const item = row.type === 'process'
            ? <button key={row.key} {...props}><span className="palette-icon"><FileText size={15} /></span><span className="palette-text"><b>#{row.order.id} · {row.order.client || 'Без имени'}</b><small>{[stageLabel(row.order), productsLabel(row.order), addressOf(row.order)].filter(Boolean).join(' · ')}</small></span><ArrowRight size={14} className="palette-go" /></button>
            : <button key={row.key} {...props}><span className="palette-icon"><row.page.icon size={15} /></span><span className="palette-text"><b>{row.page.label || row.page.view}</b></span><ArrowRight size={14} className="palette-go" /></button>
          return heading ? [heading, item] : item
        })}
        {!results.length && <p className="palette-empty">Ничего не найдено. Попробуйте номер процесса, фамилию клиента или последние цифры телефона.</p>}
      </div>
      <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> из любого места</span></div>
    </div>
  </div>
}
