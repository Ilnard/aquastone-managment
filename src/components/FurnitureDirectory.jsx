import { useState } from 'react'
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { normalizeCompany, sameText, sortCompanies } from '../furniture.js'
import { formatRussianPhone, handleRussianPhoneKeyDown } from '../phone.js'
import './DecorGlues.css'
import './FurnitureDirectory.css'

const normalize = (value) => String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const telHref = (phone) => 'tel:' + String(phone).replace(/[^\d+]/g, '')

async function request(method, url, body) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const result = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.error || 'Не удалось сохранить.')
  return result
}

/**
 * Справочник «Мебельщики»: мебельная компания → несколько мебельщиков, у каждого свой телефон.
 * Смотрят все сотрудники, меняют менеджер и директор. items и onItemsChange — список хранит App.
 */
export default function FurnitureDirectory({ items, onItemsChange, canManage, demo, flash }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | id компании
  const [draft, setDraft] = useState({ name: '', makers: [] })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const q = normalize(query)
  const qDigits = query.replace(/\D/g, '')
  const visible = items.filter((company) => !q
    || normalize(company.name).includes(q)
    || company.makers.some((maker) => normalize(maker.name).includes(q) || (qDigits.length >= 3 && maker.phone.replace(/\D/g, '').includes(qDigits))))
  const makerCount = items.reduce((sum, company) => sum + company.makers.length, 0)

  const startAdd = () => { setDraft({ name: '', makers: [{ name: '', phone: '' }] }); setError(''); setEditing('new') }
  const startEdit = (company) => { setDraft({ name: company.name, makers: company.makers.length ? company.makers.map((m) => ({ name: m.name, phone: m.phone })) : [{ name: '', phone: '' }] }); setError(''); setEditing(company.id) }
  const setMaker = (index, patch) => { setError(''); setDraft((current) => ({ ...current, makers: current.makers.map((maker, i) => (i === index ? { ...maker, ...patch } : maker)) })) }

  const save = async (event) => {
    event?.preventDefault()
    const { value, error: invalid } = normalizeCompany(draft)
    if (invalid) { setError(invalid); return }
    if (items.some((company) => company.id !== editing && sameText(company.name, value.name))) { setError(`Компания «${value.name}» уже есть в справочнике.`); return }
    setSaving(true)
    try {
      const saved = demo
        ? { ...value, id: editing === 'new' ? `demo-${Date.now()}` : editing, makers: value.makers.map((m, i) => ({ ...m, id: `demo-m-${Date.now()}-${i}` })) }
        : editing === 'new' ? await request('POST', '/api/furniture', value) : await request('PUT', `/api/furniture/${editing}`, value)
      onItemsChange(sortCompanies(editing === 'new' ? [...items, saved] : items.map((company) => (company.id === editing ? saved : company))))
      flash(editing === 'new' ? `Компания «${saved.name}» добавлена` : 'Изменения сохранены')
      setEditing(null)
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const remove = async (company) => {
    if (!window.confirm(`Удалить компанию «${company.name}» и её мебельщиков из справочника? В процессах название останется.`)) return
    try {
      if (!demo) await request('DELETE', `/api/furniture/${company.id}`)
      onItemsChange(items.filter((item) => item.id !== company.id))
      if (editing === company.id) setEditing(null)
      flash(`Компания «${company.name}» удалена`)
    } catch (err) { flash(err.message) }
  }

  const form = <form className="furniture-group furniture-form" onSubmit={save}>
    <div className="furniture-company" data-label="Мебельная компания">
      <input className="inline-edit" value={draft.name} onChange={(e) => { setError(''); setDraft((current) => ({ ...current, name: e.target.value })) }} placeholder="Название компании" aria-label="Мебельная компания" autoFocus />
    </div>
    <div className="furniture-makers">
      {draft.makers.map((maker, index) => <div className="furniture-maker furniture-maker-edit" key={index}>
        <input className="inline-edit" value={maker.name} onChange={(e) => setMaker(index, { name: e.target.value })} placeholder="ФИО мебельщика" aria-label={`ФИО мебельщика ${index + 1}`} />
        <input className="inline-edit" type="tel" inputMode="tel" value={formatRussianPhone(maker.phone)} onChange={(e) => setMaker(index, { phone: formatRussianPhone(e.target.value) })} onKeyDown={(e) => handleRussianPhoneKeyDown(e, maker.phone, (phone) => setMaker(index, { phone }))} placeholder="+7 (999) 888-77-66" aria-label={`Телефон мебельщика ${index + 1}`} />
        <button type="button" className="decor-icon-button danger" onClick={() => setDraft((current) => ({ ...current, makers: current.makers.filter((_, i) => i !== index) }))} title="Убрать мебельщика" aria-label={`Убрать мебельщика ${index + 1}`}><X size={14} /></button>
      </div>)}
      <button type="button" className="aq-link-button furniture-add-maker" onClick={() => setDraft((current) => ({ ...current, makers: [...current.makers, { name: '', phone: '' }] }))}><Plus size={13} /> Добавить мебельщика</button>
    </div>
    <div className="decor-actions furniture-actions">
      <button type="submit" className="decor-icon-button save" disabled={saving} title="Сохранить" aria-label="Сохранить компанию"><Check size={15} /></button>
      <button type="button" className="decor-icon-button" onClick={() => setEditing(null)} title="Отмена" aria-label="Отмена"><X size={15} /></button>
    </div>
    {error && <p className="decor-error" role="alert">{error}</p>}
  </form>

  return <section className="info-card furniture-directory">
    <div className="info-card-head">
      <div><h3>Мебельщики <span className="heading-count">{items.length}</span></h3><p>Мебельные компании, их мебельщики и телефоны: {makerCount} чел. Выбираются в процессе в полях «Мебельная компания» и «Мебельщик».{canManage ? '' : ' Изменять список может менеджер.'}</p></div>
      {canManage && editing !== 'new' && <button type="button" className="primary-button" onClick={startAdd}><Plus size={15} />Добавить компанию</button>}
    </div>
    {items.length > 5 && <label className="catalog-search furniture-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Компания, ФИО или телефон…" aria-label="Поиск мебельщиков" /></label>}
    <div className="furniture-table" role="table" aria-label="Мебельщики">
      <div className="furniture-group furniture-head" role="row"><span>Мебельная компания</span><div className="furniture-maker"><span>ФИО мебельщика</span><span>Номер телефона мебельщика</span></div><span /></div>
      {editing === 'new' && form}
      {visible.map((company) => editing === company.id ? <div key={company.id}>{form}</div> : <div className="furniture-group" role="row" key={company.id}>
        <b className="furniture-company">{company.name}</b>
        <div className="furniture-makers">
          {company.makers.length ? company.makers.map((maker) => <div className="furniture-maker" key={maker.id ?? maker.name + maker.phone}>
            <span className="furniture-maker-name">{maker.name}</span>
            {maker.phone ? <a className="phone-link" href={telHref(maker.phone)}>{maker.phone}</a> : <em>—</em>}
          </div>) : <div className="furniture-maker"><em>Мебельщики не указаны</em></div>}
        </div>
        <span className="decor-actions">{canManage && <>
          <button type="button" className="decor-icon-button" onClick={() => startEdit(company)} title="Изменить" aria-label={`Изменить ${company.name}`}><Pencil size={14} /></button>
          <button type="button" className="decor-icon-button danger" onClick={() => remove(company)} title="Удалить" aria-label={`Удалить ${company.name}`}><Trash2 size={14} /></button>
        </>}</span>
      </div>)}
      {!visible.length && editing !== 'new' && <div className="catalog-empty">{items.length ? 'Ничего не найдено.' : 'Справочник пуст. Добавьте первую мебельную компанию.'}</div>}
    </div>
  </section>
}
