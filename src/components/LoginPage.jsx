import { useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import './LoginPage.css'

/** Вход по логину и паролю. Сессия хранится в cookie на 30 дней. */
export default function LoginPage({ onLoggedIn, databaseDown }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!login.trim() || !password) { setError('Введите логин и пароль.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: login.trim(), password }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(response.status === 503 ? 'Сервер не видит базу данных PostgreSQL. Проверьте, что она запущена.' : result.error || 'Не удалось войти.')
      onLoggedIn(result)
    } catch (err) { setError(err.message === 'Failed to fetch' ? 'Сервер недоступен. Запущен ли npm run dev?' : err.message) }
    finally { setBusy(false) }
  }

  return <div className="login-screen">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><span className="brand-mark"><span /></span><span className="brand-copy"><b>aqua<span>stone</span></b><small>WORKSPACE</small></span></div>
      <h1>Вход</h1>
      <p>Логин и пароль выдаёт директор. Сменить их можно в личном кабинете.</p>
      {databaseDown && <div className="login-warning">PostgreSQL недоступен — вход заработает, когда база запустится.</div>}
      <label className="form-field"><span>Логин</span><input autoFocus autoComplete="username" autoCapitalize="none" spellCheck="false" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="например, igor.tikhonov" /></label>
      <label className="form-field"><span>Пароль</span>
        <span className="login-password"><input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button className="primary-button login-submit" type="submit" disabled={busy}><LogIn size={16} />{busy ? 'Входим…' : 'Войти'}</button>
    </form>
  </div>
}
