import { useEffect, useMemo, useState } from 'react'
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import SearchSelect from './SearchSelect.jsx'
import { DECOR_GLUE_SEEDS, DECOR_MATERIALS, normalizeDecorGlue, sortDecorGlues } from '../decorGlues.js'
import './DecorGlues.css'

const DEMO_KEY = 'aquastone-decor-glues-v1'
const EMPTY = { material: 'Кварц', brand: '', decor: '', mainGlue: '', altGlue: '', note: '' }
const normalize = (value) => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const groupOf = (item) => `${item.material} ${item.brand}`

const readDemo = () => {
  try { const stored = JSON.parse(localStorage.getItem(DEMO_KEY)); if (Array.isArray(stored)) return stored } catch { /* хранилище недоступно */ }
  return DECOR_GLUE_SEEDS.map((item, index) => ({ ...item, note: '', id: `demo-${index + 1}` }))
}
const writeDemo = (items) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(items)) } catch { /* хранилище недоступно */ } }

async function request(method, url, body) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const result = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error || 'Не удалось сохранить.')
  return result
}

/**
 * Справочник «Клей по декорам»: основной и альтернативный клей для каждого декора.
 * Смотрят все сотрудники, меняют менеджер и директор.
 */
export default function DecorGlues({ canManage, demo, glueOptions = [], onAddGlue, flash }) {
  const [items, setItems] = useState(() => (demo ? readDemo() : []))
  const [loaded, setLoaded] = useState(demo)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [editing, setEditing] = useState(null) // null | 'new' | id позиции
  const [draft, setDraft] = useState(EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (demo) return undefined
    let active = true
    request('GET', '/api/decor-glues')
      .then((list) => { if (active) { setItems(list); setLoaded(true) } })
      .catch((err) => { if (active) { setLoaded(true); flash(err.message) } })
    return () => { active = false }
  }, [demo])

  const sorted = useMemo(() => sortDecorGlues(items), [items])
  const groups = useMemo(() => {
    const counts = new Map()
    for (const item of sorted) counts.set(groupOf(item), (counts.get(groupOf(item)) || 0) + 1)
    return [...counts]
  }, [sorted])
  const brands = useMemo(() => [...new Set(items.map((item) => item.brand))].sort((a, b) => a.localeCompare(b, 'ru')), [items])
  const materials = useMemo(() => [...new Set([...DECOR_MATERIALS, ...items.map((item) => item.material)])], [items])
  const allGlues = useMemo(() => [...new Set([...glueOptions, ...items.flatMap((item) => [item.mainGlue, item.altGlue]).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })), [glueOptions, items])

  const q = normalize(query)
  const visible = sorted.filter((item) => (group === 'all' || groupOf(item) === group)
    && (!q || normalize(`${item.decor} ${item.brand} ${item.material} ${item.mainGlue} ${item.altGlue} ${item.note}`).includes(q)))

  const startAdd = () => {
    const [material, brand] = group === 'all' ? [EMPTY.material, ''] : [sorted.find((item) => groupOf(item) === group)?.material || EMPTY.material, sorted.find((item) => groupOf(item) === group)?.brand || '']
    setDraft({ ...EMPTY, material, brand }); setError(''); setEditing('new')
  }
  const startEdit = (item) => { setDraft({ ...EMPTY, ...item }); setError(''); setEditing(item.id) }
  const cancel = () => { setEditing(null); setError('') }
  const set = (key) => (value) => { setError(''); setDraft((current) => ({ ...current, [key]: value })) }

  const save = async (event) => {
    event?.preventDefault()
    const { value, error: invalid } = normalizeDecorGlue(draft)
    if (invalid) { setError(invalid); return }
    const duplicate = items.find((item) => item.id !== editing && normalize(item.material) === normalize(value.material) && normalize(item.brand) === normalize(value.brand) && normalize(item.decor) === normalize(value.decor))
    if (duplicate) { setError(`Декор «${value.decor}» (${value.material} ${value.brand}) уже есть в списке.`); return }
    setSaving(true)
    try {
      let saved
      if (demo) saved = { ...value, id: editing === 'new' ? `demo-${Date.now()}` : editing }
      else saved = editing === 'new' ? await request('POST', '/api/decor-glues', value) : await request('PUT', `/api/decor-glues/${editing}`, value)
      const next = editing === 'new' ? [...items, saved] : items.map((item) => (item.id === editing ? saved : item))
      setItems(next)
      if (demo) writeDemo(next)
      flash(editing === 'new' ? `Декор «${saved.decor}» добавлен` : 'Изменения сохранены')
      setEditing(null)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const remove = async (item) => {
    if (!window.confirm(`Удалить декор «${item.decor}» (${groupOf(item)}) из списка?`)) return
    try {
      if (!demo) await request('DELETE', `/api/decor-glues/${item.id}`)
      const next = items.filter((entry) => entry.id !== item.id)
      setItems(next)
      if (demo) writeDemo(next)
      if (editing === item.id) setEditing(null)
      flash(`Декор «${item.decor}» удалён`)
    } catch (err) { flash(err.message) }
  }

  const glueSelect = (key, placeholder) => <SearchSelect
    value={draft[key]}
    options={allGlues}
    onChange={set(key)}
    onAdd={onAddGlue}
    placeholder={placeholder}
    searchPlaceholder="Найти клей…"
    ariaLabel={key === 'mainGlue' ? 'Основной клей' : 'Альтернативный клей'}
  />

  const form = <form className="decor-row decor-form" onSubmit={save}>
    <label data-label="Материал"><select className="inline-edit" value={draft.material} onChange={(e) => set('material')(e.target.value)} aria-label="Материал">{materials.map((m) => <option key={m}>{m}</option>)}</select></label>
    <label data-label="Бренд"><input className="inline-edit" list="decor-glue-brands" value={draft.brand} onChange={(e) => set('brand')(e.target.value)} placeholder="Avant" aria-label="Бренд" autoFocus={editing === 'new'} /></label>
    <label data-label="Декор"><input className="inline-edit" value={draft.decor} onChange={(e) => set('decor')(e.target.value)} placeholder="Артикул и название" aria-label="Декор" /></label>
    <div data-label="Основной клей">{glueSelect('mainGlue', 'Выберите клей')}</div>
    <div data-label="Альтернатива">{glueSelect('altGlue', 'Нет')}</div>
    <label data-label="Комментарий"><input className="inline-edit" value={draft.note} onChange={(e) => set('note')(e.target.value)} placeholder="—" aria-label="Комментарий" /></label>
    <div className="decor-actions">
      <button type="submit" className="decor-icon-button save" disabled={saving} title="Сохранить" aria-label="Сохранить"><Check size={15} /></button>
      <button type="button" className="decor-icon-button" onClick={cancel} title="Отмена" aria-label="Отмена"><X size={15} /></button>
    </div>
    {error && <p className="decor-error" role="alert">{error}</p>}
  </form>

  return <section className="info-card decor-glues">
    <div className="info-card-head">
      <div><h3>Клей по декорам <span className="heading-count">{items.length}</span></h3><p>Какой клей основной для декора и чем его можно заменить.{canManage ? '' : ' Изменять список может менеджер.'}</p></div>
      {canManage && editing !== 'new' && <button type="button" className="primary-button" onClick={startAdd}><Plus size={15} />Добавить декор</button>}
    </div>

    <div className="decor-toolbar">
      <div className="decor-groups" role="tablist" aria-label="Материал и бренд">
        {[['all', items.length], ...groups].map(([name, count]) => <button key={name} type="button" role="tab" aria-selected={group === name} className={'decor-group' + (group === name ? ' active' : '')} onClick={() => setGroup(name)}>{name === 'all' ? 'Все' : name}<span>{count}</span></button>)}
      </div>
      <label className="catalog-search decor-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Декор или клей…" aria-label="Поиск по декорам" /></label>
    </div>

    <datalist id="decor-glue-brands">{brands.map((brand) => <option key={brand} value={brand} />)}</datalist>
    <div className="decor-table" role="table" aria-label="Клей по декорам">
      <div className="decor-row decor-head" role="row"><span>Материал</span><span>Бренд</span><span>Декор</span><span>Основной клей</span><span>Альтернатива</span><span>Комментарий</span><span /></div>
      {editing === 'new' && form}
      {visible.map((item) => editing === item.id ? <div key={item.id}>{form}</div> : <div className="decor-row" role="row" key={item.id}>
        <span data-label="Материал">{item.material}</span>
        <span data-label="Бренд">{item.brand}</span>
        <b className="decor-name" data-label="Декор">{item.decor}<small className="decor-meta">{groupOf(item)}</small></b>
        <span data-label="Основной клей"><i className="glue-chip main">{item.mainGlue}</i></span>
        <span data-label="Альтернатива" className={item.altGlue ? '' : 'decor-empty'}>{item.altGlue ? <i className="glue-chip">{item.altGlue}</i> : <em>—</em>}</span>
        <span data-label="Комментарий" className={'decor-note' + (item.note ? '' : ' decor-empty')}>{item.note || <em>—</em>}</span>
        <span className="decor-actions">{canManage && <>
          <button type="button" className="decor-icon-button" onClick={() => startEdit(item)} title="Изменить" aria-label={`Изменить ${item.decor}`}><Pencil size={14} /></button>
          <button type="button" className="decor-icon-button danger" onClick={() => remove(item)} title="Удалить" aria-label={`Удалить ${item.decor}`}><Trash2 size={14} /></button>
        </>}</span>
      </div>)}
      {loaded && !visible.length && editing !== 'new' && <div className="catalog-empty">{items.length ? 'Ничего не найдено — измените поиск или группу.' : 'Список пуст.'}</div>}
    </div>
  </section>
}
