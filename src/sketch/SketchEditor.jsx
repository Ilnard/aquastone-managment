import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Check, Circle, Download, Eraser, Hand, Magnet, Maximize, MousePointer2, MoveHorizontal,
  Pencil, Redo2, Slash, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import {
  anchorPoints, clamp, dimGeometry, dist, findSnap, handlesOf, hitTest, keyPoints, mid, normRect, orthoSnap,
  pickElement, roundEl, simplifyPoints, sketchBounds, translate, uid,
} from './geometry.js'
import { SelectionOverlay, SketchPreview, SketchShape, SnapMark } from './SketchShapes.jsx'
import './SketchEditor.css'

const TOOLS = [
  { id: 'select', label: 'Выбор', icon: MousePointer2, key: 'v' },
  { id: 'pan', label: 'Рука', icon: Hand, key: 'h' },
  { id: 'line', label: 'Линия', icon: Slash, key: 'l' },
  { id: 'dim', label: 'Размер', icon: MoveHorizontal, key: 'd' },
  { id: 'rect', label: 'Прямоуг.', title: 'Прямоугольник', icon: Square, key: 'r' },
  { id: 'circle', label: 'Круг', icon: Circle, key: 'c' },
  { id: 'cross', label: 'Крестик', icon: X, key: 'x' },
  { id: 'text', label: 'Текст', icon: Type, key: 't' },
  { id: 'pen', label: 'Карандаш', icon: Pencil, key: 'p' },
  { id: 'eraser', label: 'Ластик', icon: Eraser, key: 'e' },
]
const DRAW_TOOLS = ['line', 'dim', 'rect', 'circle', 'cross', 'text', 'pen']
const SNAP_TOOLS = ['line', 'dim', 'rect', 'circle', 'cross']
const DEFAULT_DIM_OFFSET = 50
const COLORS = [
  { value: '#1f2a24', name: 'Чёрный' },
  { value: '#c2412d', name: 'Красный' },
  { value: '#2f63b8', name: 'Синий' },
  { value: '#2f7d4f', name: 'Зелёный' },
]
const WIDTHS = [{ value: 2, name: 'Тонкая' }, { value: 4, name: 'Средняя' }, { value: 7, name: 'Толстая' }]
const TEXT_SIZES = [{ value: 18, name: 'S' }, { value: 26, name: 'M' }, { value: 38, name: 'L' }]
const TYPE_NAMES = { line: 'Линия', dim: 'Размер', rect: 'Прямоугольник', circle: 'Круг', cross: 'Крестик', text: 'Текст', pen: 'Карандаш' }
const CORNER_NAMES = { tl: 'левый верхний', tr: 'правый верхний', bl: 'левый нижний', br: 'правый нижний' }
const HINTS = {
  select: 'Нажмите на фигуру, чтобы выбрать и перетащить. Двойное нажатие на текст — редактировать. Пустое место — двигать лист.',
  pan: 'Двигайте лист. Двумя пальцами — масштаб.',
  line: 'Проведите от точки до точки. Концы притягиваются к другим линиям и углам.',
  dim: 'Проведите от одного края детали до другого и впишите размер. Отступ меняется ручкой в середине размерной линии.',
  rect: 'Растяните прямоугольник. Скругления углов — в панели справа.',
  circle: 'Нажмите в центр и тяните — радиус. Короткое нажатие — маленький круг.',
  cross: 'Нажмите, чтобы поставить крестик.',
  text: 'Нажмите на лист и введите текст. Enter — готово, Shift+Enter — новая строка.',
  pen: 'Рисуйте от руки.',
  eraser: 'Нажмите или проведите по фигуре, чтобы удалить её.',
}
const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

export default function SketchEditor({ initialSketch, title, subtitle, readOnly = false, onSave, onClose, exportName = 'chertezh' }) {
  const [elements, setElementsState] = useState(() => (Array.isArray(initialSketch?.elements) ? initialSketch.elements : []))
  const elementsRef = useRef(elements)
  const setEls = (next) => { elementsRef.current = next; setElementsState(next) }

  const past = useRef([])
  const future = useRef([])
  const coalesce = useRef({ key: null, time: 0 })
  const [, setHistoryTick] = useState(0)
  const [dirty, setDirty] = useState(false)

  const [tool, setTool] = useState(readOnly ? 'pan' : 'line')
  const [style, setStyle] = useState({ color: COLORS[0].value, width: 4, dash: false, dimDash: true, labelSize: 26, textSize: 26, radius: 40, corners: { tl: false, tr: false, br: false, bl: false } })
  const [magnet, setMagnet] = useState(true)
  const [ortho, setOrtho] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraftState] = useState(null)
  const draftRef = useRef(null)
  const setDraft = (next) => { draftRef.current = next; setDraftState(next) }
  const [snapMark, setSnapMark] = useState(null)
  const [textEdit, setTextEditState] = useState(null)
  const textEditRef = useRef(null)
  const setTextEdit = (next) => { textEditRef.current = next; setTextEditState(next) }
  const [view, setViewState] = useState({ x: 40, y: 40, k: 1 })
  const viewRef = useRef(view)
  const setView = (next) => { viewRef.current = next; setViewState(next) }
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [confirmClose, setConfirmClose] = useState(false)
  const [saving, setSaving] = useState(false)

  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const textareaRef = useRef(null)
  const labelInputRef = useRef(null)
  const exportSvgRef = useRef(null)
  const drag = useRef(null)
  const pointers = useRef(new Map())
  const penSeen = useRef(false)
  const lastTap = useRef({ id: null, time: 0 })
  const fitted = useRef(false)

  const selected = elements.find((el) => el.id === selectedId) || null

  // ---------- История (отмена / повтор) ----------
  const pushHistory = (snapshot) => {
    past.current.push(snapshot)
    if (past.current.length > 150) past.current.shift()
    future.current = []
    setDirty(true)
    setHistoryTick((t) => t + 1)
  }
  /** Записать новое состояние; подряд идущие правки одного поля склеиваются в один шаг отмены. */
  const commit = (next, coalesceKey = null) => {
    const now = Date.now()
    const same = coalesceKey && coalesce.current.key === coalesceKey && now - coalesce.current.time < 1500
    if (!same) pushHistory(elementsRef.current)
    coalesce.current = { key: coalesceKey, time: now }
    setDirty(true)
    setEls(next)
  }
  const undo = () => {
    if (!past.current.length) return
    future.current.push(elementsRef.current)
    setEls(past.current.pop())
    coalesce.current = { key: null, time: 0 }
    setDirty(true)
    setHistoryTick((t) => t + 1)
  }
  const redo = () => {
    if (!future.current.length) return
    past.current.push(elementsRef.current)
    setEls(future.current.pop())
    coalesce.current = { key: null, time: 0 }
    setDirty(true)
    setHistoryTick((t) => t + 1)
  }

  // ---------- Вид: масштаб и сдвиг ----------
  const fitView = (box = size) => {
    if (!box.w || !box.h) return
    const els = elementsRef.current
    if (!els.length) { setView({ x: 40, y: 40, k: 1 }); return }
    const b = sketchBounds(els, 40)
    const k = clamp(Math.min(box.w / b.w, box.h / b.h), MIN_ZOOM, 3)
    setView({ x: (box.w - b.w * k) / 2 - b.x * k, y: (box.h - b.h * k) / 2 - b.y * k, k })
  }
  const zoomAt = (sp, factor) => {
    const v = viewRef.current
    const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM)
    const wx = (sp.x - v.x) / v.k
    const wy = (sp.y - v.y) / v.k
    setView({ x: sp.x - wx * k, y: sp.y - wy * k, k })
  }

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const box = { w: entry.contentRect.width, h: entry.contentRect.height }
      setSize(box)
      if (!fitted.current && box.w && box.h) { fitted.current = true; fitView(box) }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const node = svgRef.current
    if (!node) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const sp = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomAt(sp, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  // Не даём странице прокручиваться под редактором.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // ---------- Помощники ----------
  const screenPoint = (event) => {
    const rect = svgRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const toWorld = (sp) => { const v = viewRef.current; return { x: (sp.x - v.x) / v.k, y: (sp.y - v.y) / v.k } }
  const withStyle = (base) => ({ id: uid(), color: style.color, width: style.width, ...base })

  /** Точка с учётом магнита и выравнивания по 90°/45° от опорной точки. */
  const resolvePoint = (raw, anchor = null, exclude = null) => {
    const snap = magnet ? findSnap(raw, elementsRef.current, viewRef.current.k, exclude) : null
    setSnapMark(snap)
    if (snap) return { x: snap.x, y: snap.y }
    return anchor && ortho ? orthoSnap(anchor, raw) : raw
  }

  /** При перетаскивании фигуры подтягиваем её ближайшую опорную точку к чужой. */
  const snapMoved = (moved, excludeId) => {
    if (!magnet) { setSnapMark(null); return moved }
    const k = viewRef.current.k
    const others = elementsRef.current.filter((el) => el.id !== excludeId)
    let best = null
    let bestD = 14 / k
    for (const q of anchorPoints(moved)) {
      for (const el of others) {
        for (const t of keyPoints(el)) {
          const d = dist(q, t)
          if (d < bestD) { bestD = d; best = { dx: t.x - q.x, dy: t.y - q.y, x: t.x, y: t.y } }
        }
      }
    }
    setSnapMark(best ? { x: best.x, y: best.y, kind: 'point' } : null)
    return best ? translate(moved, best.dx, best.dy) : moved
  }

  /**
   * С какой стороны вынести размерную линию (+1 / −1 по нормали).
   * Выносим наружу детали; если обе стороны свободны — вверх, у вертикальных — влево.
   */
  const dimSide = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const n = { x: -(y2 - y1) / len, y: (x2 - x1) / len }
    const outward = Math.abs(n.y) > 0.3 ? n.y : n.x
    const preferred = outward > 0 ? -1 : 1
    const m = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    const solids = elementsRef.current.filter((el) => el.type === 'rect' || el.type === 'circle')
    const inside = (s) => {
      const q = { x: m.x + n.x * s * 20, y: m.y + n.y * s * 20 }
      return solids.some((el) => hitTest(el, q, 0, true))
    }
    return inside(preferred) && !inside(-preferred) ? -preferred : preferred
  }

  const eraseAt = (p) => {
    const els = elementsRef.current
    const tol = 8 / viewRef.current.k
    for (let i = els.length - 1; i >= 0; i -= 1) {
      if (hitTest(els[i], p, tol, false)) {
        const id = els[i].id
        setEls(els.filter((el) => el.id !== id))
        if (id === selectedId) setSelectedId(null)
        return
      }
    }
  }

  const cancelInteraction = () => {
    const d = drag.current
    if (d?.snapshot && elementsRef.current !== d.snapshot) setEls(d.snapshot)
    if (draftRef.current) setDraft(null)
    drag.current = null
    setSnapMark(null)
  }

  // ---------- Текст ----------
  const openText = (point, existing = null) => {
    const te = existing
      ? { id: existing.id, x: existing.x, y: existing.y, value: existing.text, size: existing.size, color: existing.color }
      : { id: null, x: point.x, y: point.y, value: '', size: style.textSize, color: style.color }
    startTextInput(te)
  }
  /** Ввод подписи размера прямо на чертеже. */
  const openLabel = (el) => {
    const g = dimGeometry(el)
    startTextInput({ id: el.id, field: 'label', x: g.labelPos.x, y: g.labelPos.y, value: el.label || '', size: g.size, color: el.color, centered: true })
  }
  const startTextInput = (te) => {
    setTextEdit(te)
    // Фокус ставим синхронно в обработчике касания — иначе на iPad не откроется клавиатура.
    const ta = textareaRef.current
    if (ta) { ta.value = te.value; ta.focus({ preventScroll: true }) }
  }
  const commitText = () => {
    const te = textEditRef.current
    if (!te) return
    setTextEdit(null)
    textareaRef.current?.blur()
    const els = elementsRef.current
    if (te.field === 'label') {
      const value = te.value.replace(/\s+/g, ' ').trim()
      const old = els.find((el) => el.id === te.id)
      if (old && value !== (old.label || '')) commit(els.map((el) => (el.id === te.id ? { ...el, label: value } : el)))
      return
    }
    const value = te.value.replace(/\s+$/, '')
    if (te.id) {
      const old = els.find((el) => el.id === te.id)
      if (!old) return
      if (!value.trim()) { commit(els.filter((el) => el.id !== te.id)); setSelectedId(null) }
      else if (value !== old.text) commit(els.map((el) => (el.id === te.id ? { ...el, text: value } : el)))
    } else if (value.trim()) {
      commit([...els, roundEl({ id: uid(), type: 'text', x: te.x, y: te.y, text: value, size: te.size, color: te.color })])
    }
  }

  // ---------- Указатель: мышь, палец, стилус ----------
  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return
    // Без этого браузер шлёт «мышиные» события после касания и сбивает фокус с поля текста.
    event.preventDefault()
    const active = document.activeElement
    if (active && active !== textareaRef.current && active !== document.body) active.blur?.()
    const sp = screenPoint(event)
    svgRef.current.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, sp)
    if (event.pointerType === 'pen') penSeen.current = true

    if (textEditRef.current) { commitText(); drag.current = { mode: 'consumed' }; return }
    if (pointers.current.size === 2) {
      cancelInteraction()
      const [a, b] = [...pointers.current.values()]
      drag.current = { mode: 'gesture', d0: Math.max(dist(a, b), 1), m0: mid(a, b), v0: { ...viewRef.current } }
      return
    }
    if (pointers.current.size > 2) return

    const wp = toWorld(sp)
    const k = viewRef.current.k
    // Если планшет используется со стилусом — палец только двигает лист (защита от ладони).
    const fingerPans = event.pointerType === 'touch' && penSeen.current && tool !== 'select'
    if (readOnly || tool === 'pan' || event.button === 1 || fingerPans) {
      drag.current = { mode: 'pan', s0: sp, v0: { ...viewRef.current } }
      return
    }
    const els = elementsRef.current
    switch (tool) {
      case 'select': {
        if (selected) {
          const handle = handlesOf(selected).find((h) => dist(h, wp) <= 16 / k)
          if (handle) { drag.current = { mode: 'handle', id: selected.id, handle: handle.id, orig: selected, snapshot: els }; return }
        }
        const hit = pickElement(els, wp, 10 / k)
        if (hit) { setSelectedId(hit.id); drag.current = { mode: 'move', id: hit.id, start: wp, orig: hit, snapshot: els, moved: false }; return }
        setSelectedId(null)
        drag.current = { mode: 'pan', s0: sp, v0: { ...viewRef.current } }
        return
      }
      case 'eraser': drag.current = { mode: 'erase', snapshot: els, last: wp }; eraseAt(wp); return
      case 'text': drag.current = { mode: 'text', s0: sp, wp }; return
      case 'line': { const p = resolvePoint(wp); setDraft(withStyle({ type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, dash: style.dash, label: '' })); break }
      case 'dim': { const p = resolvePoint(wp); setDraft(withStyle({ type: 'dim', x1: p.x, y1: p.y, x2: p.x, y2: p.y, offset: -DEFAULT_DIM_OFFSET, dash: style.dimDash, labelSize: style.labelSize, label: '' })); break }
      case 'rect': { const p = resolvePoint(wp); setDraft(withStyle({ type: 'rect', x: p.x, y: p.y, w: 0, h: 0, radius: style.radius, corners: { ...style.corners } })); break }
      case 'circle': { const p = resolvePoint(wp); setDraft(withStyle({ type: 'circle', cx: p.x, cy: p.y, r: 0 })); break }
      case 'cross': { const p = resolvePoint(wp); setDraft(withStyle({ type: 'cross', cx: p.x, cy: p.y, size: 28 })); break }
      case 'pen': setDraft(withStyle({ type: 'pen', points: [[wp.x, wp.y]] })); break
      default: return
    }
    drag.current = { mode: 'draw' }
  }

  const onPointerMove = (event) => {
    const sp = screenPoint(event)
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, sp)
    const d = drag.current
    const wp = toWorld(sp)
    const k = viewRef.current.k
    if (!d) {
      // Подсказка магнита при наведении мышью.
      if (event.pointerType === 'mouse' && magnet && !readOnly && SNAP_TOOLS.includes(tool)) setSnapMark(findSnap(wp, elementsRef.current, k))
      return
    }
    switch (d.mode) {
      case 'gesture': {
        if (pointers.current.size < 2) return
        const [a, b] = [...pointers.current.values()]
        const nk = clamp(d.v0.k * dist(a, b) / d.d0, MIN_ZOOM, MAX_ZOOM)
        const w = { x: (d.m0.x - d.v0.x) / d.v0.k, y: (d.m0.y - d.v0.y) / d.v0.k }
        const m = mid(a, b)
        setView({ x: m.x - w.x * nk, y: m.y - w.y * nk, k: nk })
        return
      }
      case 'pan': setView({ ...d.v0, x: d.v0.x + sp.x - d.s0.x, y: d.v0.y + sp.y - d.s0.y }); return
      case 'draw': {
        const cur = draftRef.current
        if (!cur) return
        if (cur.type === 'line') { const p = resolvePoint(wp, { x: cur.x1, y: cur.y1 }); setDraft({ ...cur, x2: p.x, y2: p.y }) }
        else if (cur.type === 'dim') {
          const p = resolvePoint(wp, { x: cur.x1, y: cur.y1 })
          setDraft({ ...cur, x2: p.x, y2: p.y, offset: dimSide(cur.x1, cur.y1, p.x, p.y) * DEFAULT_DIM_OFFSET })
        }
        else if (cur.type === 'rect') { const p = resolvePoint(wp); setDraft({ ...cur, w: p.x - cur.x, h: p.y - cur.y }) }
        else if (cur.type === 'circle') setDraft({ ...cur, r: dist({ x: cur.cx, y: cur.cy }, wp) })
        else if (cur.type === 'cross') { const p = resolvePoint(wp); setDraft({ ...cur, cx: p.x, cy: p.y }) }
        else if (cur.type === 'pen') {
          const last = cur.points[cur.points.length - 1]
          if (Math.hypot(wp.x - last[0], wp.y - last[1]) * k >= 1.5) setDraft({ ...cur, points: [...cur.points, [wp.x, wp.y]] })
        }
        return
      }
      case 'move': {
        const dx = wp.x - d.start.x
        const dy = wp.y - d.start.y
        if (!d.moved && Math.hypot(dx, dy) * k < 4) return
        d.moved = true
        const moved = snapMoved(translate(d.orig, dx, dy), d.id)
        setEls(d.snapshot.map((el) => (el.id === d.id ? moved : el)))
        return
      }
      case 'handle': {
        const o = d.orig
        const exclude = new Set([o.id])
        let next = o
        if (o.type === 'dim' && d.handle === 'off') {
          // Отступ — проекция пальца на нормаль к измеряемому отрезку.
          const g = dimGeometry(o)
          next = { ...o, offset: (wp.x - o.x1) * g.n.x + (wp.y - o.y1) * g.n.y }
        } else if (o.type === 'line' || o.type === 'dim') {
          if (d.handle === 'p1') { const p = resolvePoint(wp, { x: o.x2, y: o.y2 }, exclude); next = { ...o, x1: p.x, y1: p.y } }
          else { const p = resolvePoint(wp, { x: o.x1, y: o.y1 }, exclude); next = { ...o, x2: p.x, y2: p.y } }
        } else if (o.type === 'rect') {
          const corners = handlesOf(o)
          const opposite = corners[(d.handle + 2) % 4]
          const p = resolvePoint(wp, null, exclude)
          next = { ...normRect(o), x: opposite.x, y: opposite.y, w: p.x - opposite.x, h: p.y - opposite.y }
        } else if (o.type === 'circle') {
          next = { ...o, r: Math.max(2, dist({ x: o.cx, y: o.cy }, wp)) }
        }
        setEls(d.snapshot.map((el) => (el.id === d.id ? next : el)))
        return
      }
      case 'erase': {
        const steps = Math.max(1, Math.ceil(dist(d.last, wp) * k / 6))
        for (let i = 1; i <= steps; i += 1) eraseAt({ x: d.last.x + (wp.x - d.last.x) * i / steps, y: d.last.y + (wp.y - d.last.y) * i / steps })
        d.last = wp
        break
      }
      default:
    }
  }

  const finishDraft = () => {
    const cur = draftRef.current
    setDraft(null)
    if (!cur) return
    const k = viewRef.current.k
    let el = cur
    if ((cur.type === 'line' || cur.type === 'dim') && dist({ x: cur.x1, y: cur.y1 }, { x: cur.x2, y: cur.y2 }) * k < 4) return
    if (cur.type === 'rect' && (Math.abs(cur.w) * k < 4 || Math.abs(cur.h) * k < 4)) return
    if (cur.type === 'circle' && cur.r * k < 4) el = { ...cur, r: 20 }
    if (cur.type === 'pen') el = { ...cur, points: simplifyPoints(cur.points, 0.8 / k) }
    const finalEl = roundEl(el)
    commit([...elementsRef.current, finalEl])
    // Сразу после размерной линии — ввод её значения.
    if (finalEl.type === 'dim') openLabel(finalEl)
  }

  /** Двойное касание: текст — редактировать, размер — ввести значение, линия — подпись. */
  const handleTap = (el) => {
    const now = Date.now()
    if (lastTap.current.id === el.id && now - lastTap.current.time < 400) {
      lastTap.current = { id: null, time: 0 }
      if (el.type === 'text') openText(null, el)
      else if (el.type === 'dim') openLabel(el)
      else if (el.type === 'line') labelInputRef.current?.focus()
    } else {
      lastTap.current = { id: el.id, time: now }
    }
  }

  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId)
    const d = drag.current
    if (!d) return
    if (d.mode === 'gesture') { drag.current = pointers.current.size ? { mode: 'consumed' } : null; return }
    if (pointers.current.size) return
    drag.current = null
    setSnapMark(null)
    switch (d.mode) {
      case 'draw': finishDraft(); return
      case 'move': {
        if (d.moved) {
          setEls(elementsRef.current.map((el) => (el.id === d.id ? roundEl(el) : el)))
          pushHistory(d.snapshot)
          return
        }
        handleTap(d.orig)
        return
      }
      case 'handle':
        if (elementsRef.current !== d.snapshot) {
          setEls(elementsRef.current.map((el) => (el.id === d.id ? roundEl(el) : el)))
          pushHistory(d.snapshot)
        } else {
          handleTap(d.orig) // нажатие на ручку без движения — тоже касание фигуры
        }
        return
      case 'erase': if (elementsRef.current !== d.snapshot) pushHistory(d.snapshot); return
      case 'text': {
        if (dist(d.s0, screenPoint(event)) > 8) return
        const hit = pickElement(elementsRef.current, d.wp, 8 / viewRef.current.k)
        openText(d.wp, hit?.type === 'text' ? hit : null)
        return
      }
      default:
    }
  }

  // ---------- Свойства фигуры / инструмента ----------
  const setProp = (field, value) => {
    const currentKind = selected ? selected.type : tool
    if (selected) {
      commit(elementsRef.current.map((el) => (el.id === selected.id ? { ...el, [field]: value } : el)), `${selected.id}:${field}`)
    }
    const styleKey = { size: 'textSize', dash: currentKind === 'dim' ? 'dimDash' : 'dash' }
    if (['color', 'width', 'dash', 'size', 'labelSize', 'radius', 'corners'].includes(field)) setStyle((s) => ({ ...s, [styleKey[field] || field]: value }))
  }
  const deleteSelected = () => {
    if (!selected) return
    commit(elementsRef.current.filter((el) => el.id !== selected.id))
    setSelectedId(null)
  }
  const chooseTool = (id) => {
    commitText()
    cancelInteraction()
    setTool(id)
    if (id !== 'select') setSelectedId(null)
  }

  // ---------- Сохранение, экспорт, закрытие ----------
  const save = async (closeAfter = false) => {
    if (readOnly || saving) return
    commitText()
    setSaving(true)
    try {
      await onSave({ version: 1, elements: elementsRef.current, updatedAt: new Date().toISOString() })
      setDirty(false)
      if (closeAfter) onClose()
    } catch { /* сообщение об ошибке показывает карточка процесса */ }
    finally { setSaving(false) }
  }
  const requestClose = () => {
    commitText()
    if (dirty && !readOnly) setConfirmClose(true)
    else onClose()
  }
  const exportPng = () => {
    const svg = exportSvgRef.current
    if (!svg || !elementsRef.current.length) return
    const b = sketchBounds(elementsRef.current, 30)
    const scale = clamp(3000 / Math.max(b.w, b.h), 1, 3)
    const width = Math.round(b.w * scale)
    const height = Math.round(b.h * scale)
    const clone = svg.cloneNode(true)
    clone.setAttribute('width', width)
    clone.setAttribute('height', height)
    const source = new XMLSerializer().serializeToString(clone)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${exportName}.png`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }, 'image/png')
    }
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
  }

  // ---------- Клавиатура ----------
  const keyHandler = useRef(null)
  keyHandler.current = (event) => {
    const tag = event.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && (key === 'z' || key === 'я')) { event.preventDefault(); if (readOnly) return; if (event.shiftKey) redo(); else undo(); return }
    if (mod && (key === 'y' || key === 'н')) { event.preventDefault(); if (!readOnly) redo(); return }
    if (mod && (key === 's' || key === 'ы')) { event.preventDefault(); save(); return }
    if (event.key === 'Escape') { if (drag.current || draftRef.current) cancelInteraction(); else if (selectedId) setSelectedId(null); else requestClose(); return }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !readOnly) { event.preventDefault(); deleteSelected(); return }
    if (!mod && !event.altKey && !readOnly) {
      const found = TOOLS.find((t) => t.key === key)
      if (found) chooseTool(found.id)
    }
  }
  useEffect(() => {
    const listener = (event) => keyHandler.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  // ---------- Отрисовка ----------
  const k = view.k
  const visible = { x: -view.x / k, y: -view.y / k, w: (size.w || 1) / k, h: (size.h || 1) / k }
  const props = selected || { color: style.color, width: style.width, dash: tool === 'dim' ? style.dimDash : style.dash, size: style.textSize, labelSize: style.labelSize, radius: style.radius, corners: style.corners }
  const kind = selected ? selected.type : (DRAW_TOOLS.includes(tool) ? tool : null)
  const textFont = textEdit ? Math.max(16, textEdit.size * k) : 16
  const textLongest = textEdit ? Math.max(4, ...textEdit.value.split('\n').map((line) => line.length)) : 0
  const textScreen = textEdit ? { left: textEdit.x * k + view.x, top: textEdit.y * k + view.y, fontSize: textFont, color: textEdit.color, width: Math.max(textEdit.centered ? 120 : 160, textLongest * textFont * 0.62 + 24), ...(textEdit.centered ? { transform: 'translate(-50%, -50%)', textAlign: 'center', marginLeft: 0 } : {}) } : null

  return <div className="sketch-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <header className="sketch-header">
      <div className="sketch-title">
        <button className="sketch-icon-btn" onClick={requestClose} aria-label="Закрыть рисовальщик" title="Закрыть"><X size={20} /></button>
        <div><b>{title}</b>{subtitle && <small>{subtitle}</small>}</div>
      </div>
      <div className="sketch-actions">
        {!readOnly && <div className="sketch-group">
          <button className="sketch-icon-btn" onClick={undo} disabled={!past.current.length} title="Отменить (Ctrl+Z)" aria-label="Отменить"><Undo2 size={19} /></button>
          <button className="sketch-icon-btn" onClick={redo} disabled={!future.current.length} title="Повторить (Ctrl+Shift+Z)" aria-label="Повторить"><Redo2 size={19} /></button>
        </div>}
        {!readOnly && <div className="sketch-group">
          <button className={'sketch-toggle' + (magnet ? ' on' : '')} onClick={() => setMagnet((v) => !v)} aria-pressed={magnet} title="Притягивать к концам и краям линий"><Magnet size={17} /><span>Магнит</span></button>
          <button className={'sketch-toggle' + (ortho ? ' on' : '')} onClick={() => setOrtho((v) => !v)} aria-pressed={ortho} title="Выравнивать линии по горизонтали и вертикали"><b>90°</b><span>Ровно</span></button>
        </div>}
        <div className="sketch-group">
          <button className="sketch-icon-btn" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1 / 1.25)} title="Уменьшить" aria-label="Уменьшить"><ZoomOut size={19} /></button>
          <button className="sketch-zoom-value" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1 / k)} title="Масштаб 100%">{Math.round(k * 100)}%</button>
          <button className="sketch-icon-btn" onClick={() => zoomAt({ x: size.w / 2, y: size.h / 2 }, 1.25)} title="Увеличить" aria-label="Увеличить"><ZoomIn size={19} /></button>
          <button className="sketch-icon-btn" onClick={() => fitView()} title="Показать весь чертёж" aria-label="Показать весь чертёж"><Maximize size={18} /></button>
        </div>
        <button className="secondary-button sketch-export" onClick={exportPng} disabled={!elements.length} title="Скачать чертёж картинкой"><Download size={16} /><span>PNG</span></button>
        {!readOnly && <button className="primary-button sketch-save" onClick={() => save(false)} disabled={saving || !dirty}><Check size={16} />{saving ? 'Сохраняем…' : dirty ? 'Сохранить' : 'Сохранено'}</button>}
      </div>
    </header>

    <div className={'sketch-body' + (readOnly ? ' read-only' : '')}>
      {!readOnly && <nav className="sketch-tools" aria-label="Инструменты">
        {TOOLS.map(({ id, label, title: toolTitle, icon: Icon, key }) => <button key={id} className={'sketch-tool' + (tool === id ? ' active' : '')} onClick={() => chooseTool(id)} aria-pressed={tool === id} title={`${toolTitle || label} (${key.toUpperCase()})`}><Icon size={21} /><span>{label}</span></button>)}
      </nav>}

      <div className="sketch-canvas-wrap" ref={wrapRef}>
        <svg ref={svgRef} className={`sketch-canvas tool-${readOnly ? 'pan' : tool}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={(event) => { if (!drag.current && event.pointerType === 'mouse') setSnapMark(null) }} onContextMenu={(event) => event.preventDefault()}>
          <defs>
            <pattern id="sketch-grid-minor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e6ebe5" strokeWidth={1 / k} /></pattern>
            <pattern id="sketch-grid" width="100" height="100" patternUnits="userSpaceOnUse">{k >= 0.35 && <rect width="100" height="100" fill="url(#sketch-grid-minor)" />}<path d="M100 0H0V100" fill="none" stroke="#d3dcd2" strokeWidth={1 / k} /></pattern>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
            <rect x={visible.x} y={visible.y} width={visible.w} height={visible.h} fill="url(#sketch-grid)" />
            {elements.map((el) => (textEdit?.id === el.id
              ? (textEdit.field === 'label' ? <SketchShape key={el.id} el={el} hideLabel /> : null)
              : <SketchShape key={el.id} el={el} />))}
            {draft && <SketchShape el={draft} />}
            {selected && !readOnly && <SelectionOverlay el={selected} k={k} />}
            <SnapMark snap={snapMark} k={k} />
          </g>
        </svg>
        <textarea
          ref={textareaRef}
          className={'sketch-text-input' + (textEdit ? ' active' : '')}
          style={textScreen || undefined}
          value={textEdit?.value ?? ''}
          rows={Math.max(1, (textEdit?.value || '').split('\n').length)}
          placeholder="Текст"
          aria-label="Текст на чертеже"
          tabIndex={textEdit ? 0 : -1}
          onChange={(event) => setTextEdit({ ...textEditRef.current, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commitText() }
            if (event.key === 'Escape') { event.preventDefault(); setTextEdit(null); event.currentTarget.blur() }
          }}
          onBlur={commitText}
        />
        {!elements.length && !draft && !textEdit && <div className="sketch-empty"><b>{readOnly ? 'Чертёж пока пустой' : 'Чистый лист'}</b>{!readOnly && <span>Выберите «Линия» или «Прямоугольник» и начните чертить. Двумя пальцами — масштаб и сдвиг листа.</span>}</div>}
        {!readOnly && <div className="sketch-hint">{HINTS[tool]}</div>}
      </div>

      {!readOnly && <aside className="sketch-panel" aria-label="Свойства">
        <div className="sketch-panel-head">
          <small>{selected ? 'Выбрано' : kind ? 'Новая фигура' : 'Свойства'}</small>
          <b>{kind ? TYPE_NAMES[kind] : TOOLS.find((t) => t.id === tool)?.title || TOOLS.find((t) => t.id === tool)?.label}</b>
        </div>
        {kind ? <>
          <div className="sketch-field">
            <span>Цвет</span>
            <div className="sketch-swatches">{COLORS.map((c) => <button key={c.value} className={'sketch-swatch' + (props.color === c.value ? ' on' : '')} style={{ '--swatch': c.value }} onClick={() => setProp('color', c.value)} aria-label={c.name} title={c.name} />)}</div>
          </div>
          {kind !== 'text' && <div className="sketch-field">
            <span>Толщина</span>
            <div className="sketch-segmented">{WIDTHS.map((w) => <button key={w.value} className={props.width === w.value ? 'on' : ''} onClick={() => setProp('width', w.value)} title={w.name}><i style={{ height: Math.max(2, w.value * 0.8) }} /></button>)}</div>
          </div>}
          {(kind === 'line' || kind === 'dim') && <label className="sketch-check"><input type="checkbox" checked={!!props.dash} onChange={(event) => setProp('dash', event.target.checked)} /><span>Пунктир {kind === 'line' && <small>— например, для стыка</small>}</span></label>}
          {(kind === 'line' || kind === 'dim') && selected && <label className="sketch-field">
            <span>{kind === 'dim' ? 'Значение размера' : 'Размер на линии'}</span>
            <input ref={labelInputRef} className="sketch-input" value={selected.label || ''} placeholder={kind === 'dim' ? 'Например, 250мм' : 'Например, 2450'} onChange={(event) => setProp('label', event.target.value)} />
            <small>{kind === 'dim' ? 'Двойное нажатие на размер тоже открывает ввод.' : 'Подпись встанет над серединой линии.'}</small>
          </label>}
          {kind === 'dim' && <div className="sketch-field">
            <span>Размер текста</span>
            <div className="sketch-segmented">{[{ value: 20, name: 'S' }, { value: 26, name: 'M' }, { value: 36, name: 'L' }].map((s) => <button key={s.value} className={(props.labelSize || 26) === s.value ? 'on' : ''} onClick={() => setProp('labelSize', s.value)}>{s.name}</button>)}</div>
            {selected && <button className="secondary-button sketch-wide" onClick={() => setProp('offset', -(selected.offset || 0))}><MoveHorizontal size={15} style={{ transform: 'rotate(90deg)' }} />На другую сторону</button>}
          </div>}
          {kind === 'rect' && <div className="sketch-field">
            <span>Скруглённые углы</span>
            <div className="sketch-corners">
              <div className="sketch-corners-preview" style={{ borderRadius: ['tl', 'tr', 'br', 'bl'].map((c) => (props.corners?.[c] ? '16px' : '2px')).join(' ') }} />
              {['tl', 'tr', 'bl', 'br'].map((c) => <button key={c} className={`sketch-corner ${c}${props.corners?.[c] ? ' on' : ''}`} onClick={() => setProp('corners', { ...props.corners, [c]: !props.corners?.[c] })} aria-pressed={!!props.corners?.[c]} aria-label={`Скруглить ${CORNER_NAMES[c]} угол`} title={`Скруглить ${CORNER_NAMES[c]} угол`} />)}
            </div>
            <label className="sketch-inline">Радиус <input className="sketch-input" type="number" min="1" step="5" value={props.radius ?? 40} onChange={(event) => setProp('radius', Math.max(1, Number(event.target.value) || 1))} /></label>
          </div>}
          {kind === 'text' && <div className="sketch-field">
            <span>Размер текста</span>
            <div className="sketch-segmented">{TEXT_SIZES.map((s) => <button key={s.value} className={props.size === s.value ? 'on' : ''} onClick={() => setProp('size', s.value)}>{s.name}</button>)}</div>
            {selected && <button className="secondary-button sketch-wide" onClick={() => openText(null, selected)}><Type size={15} />Изменить текст</button>}
          </div>}
          {selected && <button className="sketch-delete" onClick={deleteSelected}><Trash2 size={16} />Удалить фигуру</button>}
        </> : <div className="sketch-tips">
          <p><b>Как чертить столешницу</b></p>
          <ol>
            <li>Обведите базы линиями или прямоугольниками — концы сами притянутся друг к другу.</li>
            <li>Инструментом «Размер» проведите от края до края детали и впишите значение — получится размерная линия со стрелками.</li>
            <li>Стык — пунктирной линией, фаску — красной линией с подписью.</li>
            <li>Мойку и варочную — прямоугольником, отверстия — кругом, отметки — крестиком.</li>
          </ol>
        </div>}
      </aside>}
    </div>

    {confirmClose && <div className="sketch-confirm-backdrop" onPointerDown={(event) => event.target === event.currentTarget && setConfirmClose(false)}>
      <div className="sketch-confirm" role="alertdialog" aria-label="Несохранённые изменения">
        <b>Сохранить чертёж?</b>
        <p>В чертеже есть несохранённые изменения.</p>
        <div>
          <button className="secondary-button" onClick={() => setConfirmClose(false)}>Остаться</button>
          <button className="secondary-button" onClick={onClose}>Не сохранять</button>
          <button className="primary-button" onClick={() => save(true)} disabled={saving}><Check size={15} />Сохранить и закрыть</button>
        </div>
      </div>
    </div>}

    <div className="sketch-export-source" aria-hidden="true"><SketchPreview elements={elements} svgRef={exportSvgRef} /></div>
  </div>
}
