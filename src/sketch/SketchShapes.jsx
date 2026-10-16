import { SKETCH_FONT, bbox, dimGeometry, handlesOf, penPath, readableAngle, rectPath, sketchBounds, textLines } from './geometry.js'

/** Размер: выносные линии, размерная линия со стрелками и подпись. */
function Dimension({ el, hideLabel }) {
  const g = dimGeometry(el)
  const w = el.width
  const as = Math.max(12, w * 3.2)
  const arrow = (p, dir) => `M${p.x + dir * g.u.x * as + g.n.x * as * 0.55} ${p.y + dir * g.u.y * as + g.n.y * as * 0.55}L${p.x} ${p.y}L${p.x + dir * g.u.x * as - g.n.x * as * 0.55} ${p.y + dir * g.u.y * as - g.n.y * as * 0.55}`
  const common = { stroke: el.color, strokeWidth: w, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  // Пунктир начинаем за стрелками, чтобы они оставались чёткими.
  const inset = g.len > as * 2.4 ? as * 0.9 : 0
  const a2 = { x: g.a.x + g.u.x * inset, y: g.a.y + g.u.y * inset }
  const b2 = { x: g.b.x - g.u.x * inset, y: g.b.y - g.u.y * inset }
  return <g>
    <path d={`M${g.ext1[0].x} ${g.ext1[0].y}L${g.ext1[1].x} ${g.ext1[1].y}M${g.ext2[0].x} ${g.ext2[0].y}L${g.ext2[1].x} ${g.ext2[1].y}`} {...common} />
    <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} {...common} strokeDasharray={el.dash ? `${w * 3} ${w * 3.5}` : undefined} />
    {inset > 0 && <path d={`M${g.a.x} ${g.a.y}L${a2.x} ${a2.y}M${g.b.x} ${g.b.y}L${b2.x} ${b2.y}`} {...common} />}
    <path d={arrow(g.a, 1) + arrow(g.b, -1)} {...common} />
    {el.label && !hideLabel ? <text x={g.labelPos.x} y={g.labelPos.y} transform={`rotate(${g.angle} ${g.labelPos.x} ${g.labelPos.y})`} textAnchor="middle" dominantBaseline="central" fontFamily={SKETCH_FONT} fontSize={g.size} fill={el.color} stroke="#fff" strokeWidth={g.size * 0.2} strokeLinejoin="round" paintOrder="stroke">{el.label}</text> : null}
  </g>
}

function LineLabel({ el }) {
  const size = el.labelSize || 24
  const mx = (el.x1 + el.x2) / 2
  const my = (el.y1 + el.y2) / 2
  const angle = readableAngle(el.x2 - el.x1, el.y2 - el.y1)
  const rad = angle * Math.PI / 180
  // Размер ставим над линией (перпендикулярно её направлению).
  const offset = size * 0.45 + (el.width || 0)
  const x = mx + Math.sin(rad) * offset
  const y = my - Math.cos(rad) * offset
  return <text x={x} y={y} transform={`rotate(${angle} ${x} ${y})`} textAnchor="middle" fontFamily={SKETCH_FONT} fontSize={size} fontWeight="700" fill={el.color} stroke="#fff" strokeWidth={size * 0.22} strokeLinejoin="round" paintOrder="stroke">{el.label}</text>
}

export function SketchShape({ el, hideLabel = false }) {
  const common = { stroke: el.color, strokeWidth: el.width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (el.type) {
    case 'dim': return <Dimension el={el} hideLabel={hideLabel} />
    case 'line': return <g><line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...common} strokeDasharray={el.dash ? `${el.width * 3} ${el.width * 3.5}` : undefined} />{el.label ? <LineLabel el={el} /> : null}</g>
    case 'rect': return <path d={rectPath(el)} {...common} />
    case 'circle': return <circle cx={el.cx} cy={el.cy} r={el.r} {...common} />
    case 'cross': { const s = el.size / 2; return <path d={`M${el.cx - s} ${el.cy - s}L${el.cx + s} ${el.cy + s}M${el.cx + s} ${el.cy - s}L${el.cx - s} ${el.cy + s}`} {...common} /> }
    case 'text': return <text fontFamily={SKETCH_FONT} fontSize={el.size} fill={el.color}>{textLines(el).map((line, i) => <tspan key={i} x={el.x} y={el.y + el.size * (0.92 + i * 1.2)}>{line || ' '}</tspan>)}</text>
    case 'pen': return <path d={penPath(el.points)} {...common} />
    default: return null
  }
}

export function SelectionOverlay({ el, k }) {
  const b = bbox(el)
  const pad = 6 / k
  const seg = el.type === 'dim' ? (({ a, b: e }) => ({ x1: a.x, y1: a.y, x2: e.x, y2: e.y }))(dimGeometry(el)) : el
  return <g pointerEvents="none">
    {el.type === 'line' || el.type === 'dim'
      ? <line x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke="#3a7bd5" strokeWidth={Math.max(el.width + 6 / k, 8 / k)} strokeOpacity="0.18" strokeLinecap="round" />
      : <rect x={b.x1 - pad} y={b.y1 - pad} width={b.x2 - b.x1 + pad * 2} height={b.y2 - b.y1 + pad * 2} fill="none" stroke="#3a7bd5" strokeWidth={1.5 / k} strokeDasharray={`${5 / k} ${4 / k}`} />}
    {handlesOf(el).map((h) => <circle key={h.id} cx={h.x} cy={h.y} r={8 / k} fill="#fff" stroke="#3a7bd5" strokeWidth={2.5 / k} />)}
  </g>
}

export function SnapMark({ snap, k }) {
  if (!snap) return null
  const s = 7 / k
  return snap.kind === 'point'
    ? <circle cx={snap.x} cy={snap.y} r={s} fill="#ff8a3d33" stroke="#e8661c" strokeWidth={2 / k} pointerEvents="none" />
    : <rect x={snap.x - s * 0.8} y={snap.y - s * 0.8} width={s * 1.6} height={s * 1.6} transform={`rotate(45 ${snap.x} ${snap.y})`} fill="#ff8a3d33" stroke="#e8661c" strokeWidth={2 / k} pointerEvents="none" />
}

/** Статичная картинка чертежа (превью в процессе и экспорт в PNG). */
export function SketchPreview({ elements = [], className = '', width, height, svgRef }) {
  const b = sketchBounds(elements, 30)
  return <svg ref={svgRef} className={className} xmlns="http://www.w3.org/2000/svg" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} width={width} height={height} preserveAspectRatio="xMidYMid meet">
    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#ffffff" />
    {elements.map((el) => <SketchShape key={el.id} el={el} />)}
  </svg>
}
