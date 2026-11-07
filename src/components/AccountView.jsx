import { useState } from 'react'
import { Check, KeyRound, LogOut, UserRound } from 'lucide-react'
import { initialsOf, rolesText } from './UserSwitcher.jsx'
import './AccountView.css'

const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/

async function send(url, body) {
  const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Не удалось сохранить.')
  return result
}

/** Личный кабинет: смена логина и пароля, выход. */
export default function AccountView({ user, demo, onUserChange, onLogout, flash }) {
  const [login, setLogin] = useState(user.login || '')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [busy, setBusy] = useState('')

  const saveLogin = async (event) => {
    event.preventDefault()
    const clean = login.trim().toLowerCase()
    if (!LOGIN_PATTERN.test(clean)) { setLoginError('Логин: от 3 до 32 символов — латинские буквы, цифры, точка, дефис или подчёркивание.'); return }
    if (clean === user.login) { setLoginError('Это ваш текущий логин.'); return }
    setBusy('login'); setLoginError('')
    try { const me = await send('/api/auth/login', { login: clean, currentPassword: loginPassword }); onUserChange(me); setLoginPassword(''); flash('Логин изменён') }
    catch (error) { setLoginError(error.message) } finally { setBusy('') }
  }
  const savePassword = async (event) => {
    event.preventDefault()
    if (next.length < 8) { setPasswordError('Новый пароль — не короче 8 символов.'); return }
    if (next !== repeat) { setPasswordError('Пароли не совпадают.'); return }
    setBusy('password'); setPasswordError('')
    try { await send('/api/auth/password', { currentPassword: current, newPassword: next }); setCurrent(''); setNext(''); setRepeat(''); flash('Пароль изменён. На других устройствах нужно войти заново.') }
    catch (error) { setPasswordError(error.message) } finally { setBusy('') }
  }

  return <div className="other-view account-view">
    <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" />ЛИЧНЫЙ КАБИНЕТ</div><h1>{user.name}</h1><p>{rolesText(user.roles)}</p></div>
      {!demo && <button className="secondary-button" onClick={onLogout}><LogOut size={16} />Выйти</button>}</div>
    {demo ? <section className="info-card account-card"><p className="account-note">В демо-версии на GitHub Pages входа по паролю нет. Логин и пароль работают в серверной версии сайта.</p></section> : <div className="account-grid">
      <section className="info-card account-card">
        <div className="account-head"><div className="avatar avatar-user">{initialsOf(user.name)}</div><div><h3>Логин</h3><p>Сейчас: <b>{user.login}</b></p></div><UserRound size={16} /></div>
        <form onSubmit={saveLogin} className="account-form">
          <label className="form-field"><span>Новый логин</span><input value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" spellCheck="false" autoComplete="username" /></label>
          <label className="form-field"><span>Текущий пароль</span><input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" /></label>
          {loginError && <div className="account-error" role="alert">{loginError}</div>}
          <button className="primary-button" type="submit" disabled={busy === 'login' || !loginPassword}><Check size={15} />{busy === 'login' ? 'Сохраняем…' : 'Сменить логин'}</button>
        </form>
      </section>
      <section className="info-card account-card">
        <div className="account-head"><div className="account-icon"><KeyRound size={16} /></div><div><h3>Пароль</h3><p>Не короче 8 символов. После смены другие устройства выйдут из системы.</p></div></div>
        <form onSubmit={savePassword} className="account-form">
          <label className="form-field"><span>Текущий пароль</span><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
          <label className="form-field"><span>Новый пароль</span><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
          <label className="form-field"><span>Повторите новый пароль</span><input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" /></label>
          {passwordError && <div className="account-error" role="alert">{passwordError}</div>}
          <button className="primary-button" type="submit" disabled={busy === 'password' || !current || !next}><Check size={15} />{busy === 'password' ? 'Сохраняем…' : 'Сменить пароль'}</button>
        </form>
      </section>
    </div>}
  </div>
}
