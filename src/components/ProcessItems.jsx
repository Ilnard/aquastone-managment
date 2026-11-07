import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import SearchSelect from './SearchSelect.jsx'
import { GLUE_DIRECTORY_MATERIALS, MATERIALS, MAX_ITEMS, PRODUCTS, emptyItem, needsGlue } from '../processItems.js'
import './ProcessItems.css'

// Декоры HPL в справочнике клеев не ведутся — подсказки для них.
const HPL_DECORS = ['Slate Grey', 'Black Core', 'Natural Oak', 'Concrete', 'White Snow']

/** Подсказки декоров для материала: из справочника «Клей по декорам» («Avant 1111») и HPL-декоры. */
function decorOptions(material, decorGlues) {
  if (material === 'HPL (Компакт)') return HPL_DECORS.map((name) => ({ name, glue: '' }))
  return decorGlues.filter((row) => GLUE_DIRECTORY_MATERIALS[row.material] === material).map((row) => ({ name: `${row.brand} ${row.decor}`, glue: row.mainGlue }))
}

/** Только просмотр: таблица изделий процесса. */
export function ItemsList({ items, showGlue = true }) {
  if (!items.length) return <p className="items-empty">Изделия не указаны</p>
  return <div className="items-list" role="table" aria-label="Изделия процесса">
    <div className="items-row items-head" role="row"><span role="columnheader">№</span><span role="columnheader">Изделие</span><span role="columnheader">Материал</span><span role="columnheader">Декор</span>{showGlue && <span role="columnheader">Клей</span>}</div>
    {items.map((item, i) => <div className="items-row" role="row" key={i}>
      <span className="items-num" role="cell">{i + 1}</span>
      <b role="cell">{item.product || 'Не указано'}</b>
      <span role="cell" className={item.material ? '' : 'muted'}>{item.material || 'Не выбран'}</span>
      <span role="cell" className={item.decor ? '' : 'muted'}>{item.decor || 'Не выбран'}</span>
      {showGlue && <span role="cell" className={item.glue ? '' : 'muted'}>{needsGlue(item.material) ? item.glue || 'Не выбран' : '—'}</span>}
    </div>)}
  </div>
}

/**
 * Редактор изделий.
 * mode="full" — менеджер: состав изделий, материал, декор, клей.
 * mode="glue" — вкладка «Производство»: изделия только для чтения, подбирается клей.
 */
export function ItemsEditor({ items, onChange, mode = 'full', decorGlues = [], glueOptions = [], onAddGlue }) {
  const listId = useId()
  const set = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const chooseDecor = (index, item, value) => {
    // Декор из справочника — сразу подставляем основной клей, если клей ещё не выбран.
    const known = decorOptions(item.material, decorGlues).find((option) => option.name === value)
    set(index, { decor: value, ...(known?.glue && !item.glue && needsGlue(item.material) ? { glue: known.glue } : {}) })
  }
  if (mode === 'glue') {
    const withGlue = items.map((item, index) => ({ item, index })).filter(({ item }) => needsGlue(item.material))
    if (!withGlue.length) return <p className="items-empty">Клей не нужен: в процессе нет изделий из кварца или акрила.</p>
    return <div className="items-glue">{withGlue.map(({ item, index }) => <div className="items-glue-row" key={index}>
      <div><b>{index + 1}. {item.product || 'Изделие'}</b><small>{[item.material, item.decor].filter(Boolean).join(' · ')}</small></div>
      <SearchSelect value={item.glue || ''} options={glueOptions} onChange={(glue) => set(index, { glue })} onAdd={onAddGlue} placeholder="Выберите клей" searchPlaceholder="Найти клей…" ariaLabel={`Клей для изделия ${index + 1}`} />
    </div>)}</div>
  }
  return <div className="items-editor">
    {items.map((item, index) => <fieldset className="item-card" key={index}>
      <legend>Изделие {index + 1}</legend>
      {items.length > 1 && <button type="button" className="item-remove" onClick={() => onChange(items.filter((_, i) => i !== index))} title="Убрать изделие" aria-label={`Убрать изделие ${index + 1}`}><Trash2 size={14} /></button>}
      <label className="form-field"><span>Изделие</span><select value={PRODUCTS.includes(item.product) || !item.product ? item.product : '__custom'} onChange={(e) => set(index, { product: e.target.value === '__custom' ? item.product : e.target.value })} aria-label={`Изделие ${index + 1}`}>
        {!item.product && <option value="">Выберите изделие</option>}
        {PRODUCTS.map((name) => <option key={name}>{name}</option>)}
        {item.product && !PRODUCTS.includes(item.product) && <option value="__custom">{item.product}</option>}
      </select></label>
      <label className="form-field"><span>Материал</span><select value={item.material} onChange={(e) => set(index, { material: e.target.value, decor: '', glue: '' })} aria-label={`Материал изделия ${index + 1}`}>
        <option value="">Выберите материал</option>
        {MATERIALS.map((name) => <option key={name}>{name}</option>)}
        {item.material && !MATERIALS.includes(item.material) && <option>{item.material}</option>}
      </select></label>
      <label className="form-field"><span>Декор</span><input list={`${listId}-decor-${index}`} value={item.decor} disabled={!item.material} onChange={(e) => chooseDecor(index, item, e.target.value)} placeholder={item.material ? 'Начните вводить или выберите' : 'Сначала выберите материал'} aria-label={`Декор изделия ${index + 1}`} />
        <datalist id={`${listId}-decor-${index}`}>{decorOptions(item.material, decorGlues).map((option) => <option key={option.name} value={option.name} />)}</datalist>
      </label>
      {needsGlue(item.material) && <div className="form-field"><span>Клей</span><SearchSelect value={item.glue || ''} options={glueOptions} onChange={(glue) => set(index, { glue })} onAdd={onAddGlue} placeholder="Выберите клей" searchPlaceholder="Найти клей…" ariaLabel={`Клей для изделия ${index + 1}`} /></div>}
    </fieldset>)}
    {items.length < MAX_ITEMS && <button type="button" className="item-add" onClick={() => onChange([...items, emptyItem('')])}><Plus size={15} />Добавить изделие</button>}
  </div>
}
