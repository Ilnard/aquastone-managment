import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Download, Maximize, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import { decodeDxf, parseDxf } from './parseDxf.js'
import './DxfPreview.css'

const LINE_SPACING = 1.666
const BASELINES = { top: 'hanging', middle: 'central', bottom: 'alphabetic', baseline: 'alphabetic' }

function toPath(points, closed) {
  let d = ''
  for (let i = 0; i < points.length; i += 1) d += (i ? 'L' : 'M') + points[i][0] + ' ' + points[i][1]
  return closed ? d + 'Z' : d
}

/** Готовим SVG-разметку один раз: группируем линии по цвету, чтобы рисовать быстро. */
function useDrawing(parsed) {
  return useMemo(() => {
    if (!parsed) return null
    const byColor = new Map()
    for (const p of parsed.polylines) byColor.set(p.color, (byColor.get(p.color) || '') + toPath(p.points, p.closed))
    const fills = parsed.fills.map((f) => ({ d: toPath(f.points, true), color: f.color }))
    return { strokes: [...byColor.entries()], fills, texts: parsed.texts }
  }, [parsed])
}

function DxfText({ t }) {
  const n = t.lines.length
  const ls = t.height * LINE_SPACING
  const startY = t.baseline === 'top' ? t.y : t.baseline === 'middle' ? t.y - (n - 1) * ls / 2 : t.y - (n - 1) * ls
  return <text transform={t.rotation ? `rotate(${t.rotation} ${t.x} ${t.y})` : undefined} fontSize={t.height} fill={t.color} textAnchor={t.anchor} dominantBaseline={BASELINES[t.baseline]} fontFamily="Arial, Helvetica, sans-serif">
    {t.lines.map((line, i) => <tspan key={i} x={t.x} y={startY + i * ls}>{line || ' '}</tspan>)}
  </text>
}

export default function DxfPreview({ url, name }) {
  const [state, setState] = useState({ status: 'loading' })
  const [view, setViewState] = useState(null)
  const viewRef = useRef(null)
  const setView = (v) => { viewRef.current = v; setViewState(v) }
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [fullscreen, setFullscreen] = useState(false)
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const pointers = useRef(new Map())
  const drag = useRef(null)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    setView(null)
    fetch(url)
      .then((response) => { if (!response.ok) throw new Error('http'); return response.arrayBuffer() })
      .then((buffer) => {
        const parsed = parseDxf(decodeDxf(buffer))
        if (!active) return
        setState(parsed.bounds ? { status: 'ready', parsed } : { status: 'empty' })
      })
      .catch((error) => { if (active) setState({ status: 'error', binary: error.message === 'binary' }) })
    return () => { active = false }
  }, [url])

  const drawing = useDrawing(state.parsed)

  useLayoutEffect(() => {
    const node = wrapRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [state.status])

  const fit = () => {
    const b = state.parsed?.bounds
    if (!b || !size.w || !size.h) return
    const k = Math.min(size.w / b.w, size.h / b.h) * 0.92
    setView({ k, x: (size.w - b.w * k) / 2 - b.x * k, y: (size.h - b.h * k) / 2 - b.y * k })
  }
  // Вписываем чертёж при загрузке и при смене размера окна (в т.ч. полноэкранный режим).
  useEffect(() => { fit() }, [state.parsed, size.w, size.h])

  const zoomAt = (sx, sy, factor) => {
    const v = viewRef.current
    if (!v) return
    const k = v.k * factor
    setView({ k, x: sx - (sx - v.x) * factor, y: sy - (sy - v.y) * factor })
  }

  useEffect(() => {
    const node = svgRef.current
    if (!node) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)))
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [state.status])

  useEffect(() => {
    if (!fullscreen) return undefined
    const onKey = (event) => { if (event.key === 'Escape') setFullscreen(false) }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [fullscreen])

  const point = (event) => { const rect = svgRef.current.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
  const onPointerDown = (event) => {
    event.preventDefault()
    svgRef.current.setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, point(event))
    const pts = [...pointers.current.values()]
    if (pts.length === 1) drag.current = { mode: 'pan', start: pts[0], v0: viewRef.current }
    else if (pts.length === 2) drag.current = { mode: 'pinch', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, m0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, v0: viewRef.current }
  }
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId) || !drag.current?.v0) return
    pointers.current.set(event.pointerId, point(event))
    const d = drag.current
    const pts = [...pointers.current.values()]
    if (d.mode === 'pan' && pts.length === 1) setView({ ...d.v0, x: d.v0.x + pts[0].x - d.start.x, y: d.v0.y + pts[0].y - d.start.y })
    else if (d.mode === 'pinch' && pts.length >= 2) {
      const factor = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / d.d0
      const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const k = d.v0.k * factor
      setView({ k, x: m.x - (d.m0.x - d.v0.x) * factor, y: m.y - (d.m0.y - d.v0.y) * factor })
    }
  }
  const onPointerUp = (event) => {
    pointers.current.delete(event.pointerId)
    const rest = [...pointers.current.values()]
    drag.current = rest.length === 1 ? { mode: 'pan', start: rest[0], v0: viewRef.current } : null
  }

  const skipped = state.parsed ? Object.keys(state.parsed.stats.skipped).filter((type) => !['POINT', 'VIEWPORT', 'SEQEND', 'ATTDEF'].includes(type)) : []

  return <div className={'dxf-preview' + (fullscreen ? ' fullscreen' : '')}>
    <div className="dxf-toolbar">
      <span className="dxf-name" title={name}>{name}</span>
      {state.status === 'ready' && <>
        <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)} title="Уменьшить" aria-label="Уменьшить"><ZoomOut size={16} /></button>
        <button type="button" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.3)} title="Увеличить" aria-label="Увеличить"><ZoomIn size={16} /></button>
        <button type="button" onClick={fit} title="Показать чертёж целиком" aria-label="Показать чертёж целиком"><Maximize size={15} /></button>
      </>}
      <a href={url} download={name} title="Скачать файл" aria-label="Скачать файл"><Download size={16} /></a>
      <button type="button" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? 'Свернуть' : 'Во весь экран'} aria-label={fullscreen ? 'Свернуть' : 'Во весь экран'}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
    </div>
    <div className="dxf-canvas" ref={wrapRef}>
      {state.status === 'loading' && <div className="dxf-message">Загружаем чертёж…</div>}
      {state.status === 'error' && <div className="dxf-message">{state.binary ? 'Это двоичный DXF — его предпросмотр не поддерживается. Сохраните файл в AutoCAD как ASCII DXF или скачайте его.' : 'Не удалось открыть файл для предпросмотра. Его можно скачать.'}</div>}
      {state.status === 'empty' && <div className="dxf-message">В файле не нашлось объектов для отображения.</div>}
      {state.status === 'ready' && <svg ref={svgRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={fit}>
        {view && drawing && <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {drawing.fills.map((f, i) => <path key={'f' + i} d={f.d} fill={f.color} stroke="none" />)}
          {drawing.strokes.map(([color, d]) => <path key={color} d={d} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
          {drawing.texts.map((t, i) => <DxfText key={'t' + i} t={t} />)}
        </g>}
      </svg>}
    </div>
    {state.status === 'ready' && <div className="dxf-footer">Колесо или два пальца — масштаб, перетаскивание — сдвиг, двойной клик — вписать.{skipped.length > 0 && <span> Не показаны: {skipped.join(', ')}.</span>}</div>}
  </div>
}
