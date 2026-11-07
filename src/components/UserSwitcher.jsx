import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, LogOut, UserRound } from 'lucide-react'
import './UserSwitcher.css'

export { ROLES as ROLE_ORDER } from '../permissions.js'
import { ROLES as ROLE_ORDER } from '../permissions.js'
export const initialsOf = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '—'

export const rolesText = (roles = []) => ROLE_ORDER.filter((role) => roles.includes(role)).join(', ')

function EmployeeList({ employees, currentId, onSelect }) {
  const people = [...employees].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return <div className="user-list">
    {people.map((employee) => <button type="button" key={employee.id} className={'user-option' + (String(employee.id) === String(currentId) ? ' current' : '')} onClick={() => onSelect(employee)}>
      <span className="avatar avatar-user">{initialsOf(employee.name)}</span>
      <span className="user-option-text"><span>{employee.name}</span><small>{rolesText(employee.roles)}</small></span>
      {String(employee.id) === String(currentId) && <Check size={15} />}
    </button>)}
  </div>
}

/** Окно «Кто работает?» — при первом входе на устройстве или если сотрудника убрали из справочника. */
export function UserPicker({ employees, onSelect }) {
  return <div className="modal-backdrop user-picker-backdrop">
    <div className="new-modal user-picker" role="dialog" aria-modal="true" aria-label="Выберите себя">
      <div className="modal-header"><div><span className="modal-kicker">ВХОД</span><h2>Кто работает?</h2><p>Выберите себя в списке. От вашего имени будут записываться изменения в истории процессов, а роль определит, что вы можете редактировать.</p></div></div>
      <div className="modal-content"><EmployeeList employees={employees} onSelect={onSelect} /></div>
    </div>
  </div>
}

/** Карточка пользователя внизу боковой панели: показывает имя и роль, по нажатию — смена сотрудника. */
export default function UserSwitcher({ user, employees, onSelect, onOpenAccount, onLogout, authMode = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return <div className="user-switcher" ref={rootRef}>
    <button type="button" className="user-profile" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={authMode ? 'Личный кабинет и выход' : 'Сменить пользователя'}>
      <div className="avatar avatar-user">{initialsOf(user.name)}</div>
      <div className="user-data"><b>{user.name}</b><small>{rolesText(user.roles) || user.role}</small></div>
      <ChevronsUpDown size={17} />
    </button>
    {open && authMode && <div className="user-popover">
      <button type="button" className="user-option" onClick={() => { setOpen(false); onOpenAccount() }}><UserRound size={16} /><span className="user-option-text"><span>Личный кабинет</span><small>логин и пароль</small></span></button>
      <button type="button" className="user-option" onClick={() => { setOpen(false); onLogout() }}><LogOut size={16} /><span className="user-option-text"><span>Выйти</span></span></button>
    </div>}
    {open && !authMode && <div className="user-popover">
      <div className="user-popover-head"><UserRound size={15} /><b>Сменить пользователя</b></div>
      {employees.length
        ? <EmployeeList employees={employees} currentId={user.id} onSelect={(employee) => { onSelect(employee); setOpen(false) }} />
        : <p className="user-popover-empty">В справочнике пока нет сотрудников. Добавьте себя в разделе «Сотрудники».</p>}
    </div>}
  </div>
}
