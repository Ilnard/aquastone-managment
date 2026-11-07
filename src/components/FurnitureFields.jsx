import Combobox from './Combobox.jsx'
import { findCompany, makersOf, sameText } from '../furniture.js'
import { formatRussianPhone, handleRussianPhoneKeyDown } from '../phone.js'

// Поля процесса «Мебельная компания», «Мебельщик», «Телефон мебельщика».
// value — { furnitureCompany, furnitureMaker, furnitureMakerPhone }, onChange(patch) — изменения этих полей.

/** Компания: выбор из справочника или ручной ввод. При смене компании мебельщик другой компании сбрасывается. */
export function CompanyField({ value, companies, onChange, inputClassName }) {
  const options = companies.map((company) => ({ key: company.id, value: company.name, hint: company.makers.length ? company.makers.map((m) => m.name).join(', ') : 'мебельщики не указаны' }))
  const select = (option) => {
    const patch = { furnitureCompany: option.value }
    const nextMakers = makersOf(companies, option.value)
    const maker = value.furnitureMaker || ''
    const fitsNew = nextMakers.some((m) => sameText(m.name, maker))
    // Мебельщик из справочника другой компании к новой не относится — сбрасываем. Введённого вручную оставляем.
    const fromOtherCompany = companies.some((company) => !sameText(company.name, option.value) && company.makers.some((m) => sameText(m.name, maker)))
    if (maker && !fitsNew && fromOtherCompany) Object.assign(patch, { furnitureMaker: '', furnitureMakerPhone: '' })
    // У компании один мебельщик — подставляем его сразу.
    if ((!maker || patch.furnitureMaker === '') && nextMakers.length === 1) Object.assign(patch, { furnitureMaker: nextMakers[0].name, furnitureMakerPhone: nextMakers[0].phone })
    onChange(patch)
  }
  return <Combobox value={value.furnitureCompany || ''} options={options} onInput={(text) => onChange({ furnitureCompany: text })} onSelect={select} placeholder="Выберите или введите" ariaLabel="Мебельная компания" emptyText="Справочник пуст — введите название вручную" inputClassName={inputClassName} />
}

/** Мебельщик: выбор из мебельщиков компании (с телефоном) или ручной ввод ФИО. */
export function MakerField({ value, companies, onChange, inputClassName }) {
  const company = findCompany(companies, value.furnitureCompany)
  const makers = makersOf(companies, value.furnitureCompany)
  const options = makers.map((maker) => ({ key: maker.id ?? maker.name + maker.phone, value: maker.name, hint: maker.phone || 'телефон не указан' }))
  const emptyText = !value.furnitureCompany ? 'Сначала выберите компанию или введите ФИО вручную'
    : company ? 'У компании нет мебельщиков в справочнике — введите вручную' : 'Компании нет в справочнике — введите ФИО вручную'
  const onInput = (text) => {
    const match = makers.filter((maker) => sameText(maker.name, text))
    // Ввели ФИО мебельщика из справочника целиком — подставим и телефон, если он ещё не заполнен.
    onChange(match.length === 1 && !value.furnitureMakerPhone ? { furnitureMaker: text, furnitureMakerPhone: match[0].phone } : { furnitureMaker: text })
  }
  return <Combobox value={value.furnitureMaker || ''} options={options} onInput={onInput} onSelect={(option) => onChange({ furnitureMaker: option.value, furnitureMakerPhone: makers.find((m) => (m.id ?? m.name + m.phone) === option.key)?.phone || '' })} placeholder={makers.length ? 'Выберите или введите ФИО' : 'ФИО мебельщика'} ariaLabel="Мебельщик" emptyText={emptyText} inputClassName={inputClassName} />
}

/** Телефон мебельщика: подставляется при выборе, можно ввести вручную. */
export function MakerPhoneField({ value, onChange, className = '' }) {
  const phone = value.furnitureMakerPhone || ''
  return <input className={className} type="tel" inputMode="tel" aria-label="Номер телефона мебельщика" placeholder="+7 (999) 888-77-66" value={formatRussianPhone(phone)} onChange={(event) => onChange({ furnitureMakerPhone: formatRussianPhone(event.target.value) })} onKeyDown={(event) => handleRussianPhoneKeyDown(event, phone, (next) => onChange({ furnitureMakerPhone: next }))} />
}
