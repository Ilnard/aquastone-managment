import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, Trash2 } from 'lucide-react'
import { initialsOf } from './UserSwitcher.jsx'
import './CommentsCard.css'

const formatTime = (value) => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Комментарии команды к процессу. Новые сообщения коллег подгружаются раз в 20 секунд. */
export default function CommentsCard({ processId, user, demo, flash }) {
  const [comments, setComments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const url = `/api/processes/${encodeURIComponent(processId)}/comments`

  useEffect(() => {
    if (demo) return undefined
    let active = true
    const load = async () => {
      if (document.hidden) return
      try {
        const response = await fetch(url)
        if (response.ok && active) { setComments(await response.json()); setLoaded(true) }
      } catch { /* сеть недоступна — попробуем при следующем обновлении */ }
    }
    setComments([]); setLoaded(false); load()
    const timer = window.setInterval(load, 20000)
    return () => { active = false; window.clearInterval(timer) }
  }, [url, demo])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [comments.length])

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Не удалось отправить комментарий.')
      setComments((items) => [...items.filter((item) => item.id !== result.id), result])
      setText('')
    } catch (error) { flash(error.message) }
    finally { setSending(false) }
  }

  const remove = async (comment) => {
    if (!window.confirm('Удалить комментарий?')) return
    try {
      const response = await fetch(`${url}/${comment.id}`, { method: 'DELETE' })
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Не удалось удалить комментарий.') }
      setComments((items) => items.filter((item) => item.id !== comment.id))
    } catch (error) { flash(error.message) }
  }

  if (demo) {
    return <section className="comment-card"><div className="comment-icon"><MessageSquare size={17} /></div><div className="comment-input"><span>Комментарии работают в серверной версии.</span></div></section>
  }

  const canDelete = (comment) => String(comment.authorId) === String(user?.id) || user?.roles?.includes('Директор')
  return <section className="info-card comments-card">
    <div className="info-card-head"><div><h3>Комментарии</h3><p>Обсуждение процесса командой</p></div>{comments.length > 0 && <span className="comments-count">{comments.length}</span>}</div>
    {comments.length > 0
      ? <div className="comments-list" ref={listRef}>{comments.map((comment) => <article className="comment" key={comment.id}>
          <div className="avatar">{initialsOf(comment.author)}</div>
          <div className="comment-body">
            <div className="comment-head"><b>{comment.author}</b><time>{formatTime(comment.createdAt)}</time>
              {canDelete(comment) && <button type="button" className="comment-delete" onClick={() => remove(comment)} title="Удалить" aria-label="Удалить комментарий"><Trash2 size={12} /></button>}
            </div>
            <p>{comment.body}</p>
          </div>
        </article>)}</div>
      : loaded && <p className="comments-empty">Пока нет комментариев. Напишите первым — коллеги увидят его на странице процесса.</p>}
    <div className="comment-compose">
      <textarea
        value={text}
        rows={2}
        maxLength={4000}
        placeholder="Оставьте комментарий для команды…"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send() } }}
      />
      <button type="button" onClick={send} disabled={!text.trim() || sending} title="Отправить (Ctrl + Enter)"><Send size={14} />Отправить</button>
    </div>
  </section>
}
