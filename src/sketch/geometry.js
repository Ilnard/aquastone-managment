// Геометрия и модель данных чертежа замера.
// Все координаты — в «мировых» единицах холста; на экран они переводятся через view = { x, y, k }:
// screen = world * k + (x, y).

export const SKETCH_FONT = 'Arial, Helvetica, sans-serif'

export const uid = () => Math.random().toString(36).slice(2, 10)
export const r1 = (value) => Math.round(value * 10) / 10
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function closestOnSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (!len2) return { x: a.x, y: a.y }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1)
  return { x: a.x + t * dx, y: a.y + t * dy }
}
export const distToSegment = (p, a, b) => dist(p, closestOnSegment(p, a, b))

export function normRect(el) {
  return { ...el, x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) }
}
export function rectCorners(el) {
  const { x, y, w, h } = normRect(el)
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

export const textLines = (el) => String(el.text || '').split('\n')
export function textBox(el) {
  const lines = textLines(el)
  const longest = Math.max(1, ...lines.map((line) => line.length))
  return { x: el.x, y: el.y, w: longest * el.size * 0.58, h: lines.length * el.size * 1.2 }
}

/** Угол подписи в диапазоне [-90°, 90°): текст читается слева направо, вертикальный — снизу вверх. */
export function readableAngle(dx, dy) {
  let angle = Math.atan2(dy, dx) * 180 / Math.PI
  if (angle >= 90) angle -= 180
  if (angle < -90) angle += 180
  return angle
}

/**
 * Размер: p1→p2 — измеряемые точки, offset — расстояние размерной линии от них
 * (со знаком, по нормали n). Возвращает всё, что нужно для отрисовки и попадания.
 */
export function dimGeometry(el) {
  const dx = el.x2 - el.x1
  const dy = el.y2 - el.y1
  const len = Math.hypot(dx, dy) || 1
  const u = { x: dx / len, y: dy / len }
  const n = { x: -u.y, y: u.x }
  const off = el.offset || 0
  const s = off < 0 ? -1 : 1
  const nOut = { x: n.x * s, y: n.y * s }
  const a = { x: el.x1 + n.x * off, y: el.y1 + n.y * off }
  const b = { x: el.x2 + n.x * off, y: el.y2 + n.y * off }
  const gap = Math.min(6, Math.abs(off))
  const ext = 12
  const ext1 = [{ x: el.x1 + nOut.x * gap, y: el.y1 + nOut.y * gap }, { x: a.x + nOut.x * ext, y: a.y + nOut.y * ext }]
  const ext2 = [{ x: el.x2 + nOut.x * gap, y: el.y2 + nOut.y * gap }, { x: b.x + nOut.x * ext, y: b.y + nOut.y * ext }]
  const size = el.labelSize || 26
  const center = mid(a, b)
  const labelPos = { x: center.x + nOut.x * size * 0.8, y: center.y + nOut.y * size * 0.8 }
  const angle = readableAngle(dx, dy)
  const labelW = Math.max(1, String(el.label || '').length) * size * 0.58
  return { u, n, nOut, a, b, ext1, ext2, center, labelPos, angle, size, labelW, len }
}

/** Точки, к которым «магнитятся» другие фигуры. */
export function keyPoints(el) {
  switch (el.type) {
    case 'line': return [{ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }, { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 }]
    case 'rect': return rectCorners(el)
    case 'circle':
    case 'cross': return [{ x: el.cx, y: el.cy }]
    default: return []
  }
}
/** Точки фигуры, которые при перетаскивании ищут, к чему примагнититься. */
export function anchorPoints(el) {
  return el.type === 'dim' ? [{ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }] : keyPoints(el)
}

/** Отрезки (края), к которым тоже можно примагнититься. */
export function segments(el) {
  if (el.type === 'line') return [[{ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }]]
  if (el.type === 'rect') { const c = rectCorners(el); return c.map((p, i) => [p, c[(i + 1) % 4]]) }
  return []
}

export function bbox(el) {
  const pad = (el.width || 0) / 2
  switch (el.type) {
    case 'line': return { x1: Math.min(el.x1, el.x2) - pad, y1: Math.min(el.y1, el.y2) - pad, x2: Math.max(el.x1, el.x2) + pad, y2: Math.max(el.y1, el.y2) + pad }
    case 'rect': { const n = normRect(el); return { x1: n.x - pad, y1: n.y - pad, x2: n.x + n.w + pad, y2: n.y + n.h + pad } }
    case 'circle': return { x1: el.cx - el.r - pad, y1: el.cy - el.r - pad, x2: el.cx + el.r + pad, y2: el.cy + el.r + pad }
    case 'cross': { const s = el.size / 2 + pad; return { x1: el.cx - s, y1: el.cy - s, x2: el.cx + s, y2: el.cy + s } }
    case 'text': { const b = textBox(el); return { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h } }
    case 'dim': {
      const g = dimGeometry(el)
      const r = Math.max(g.labelW / 2, g.size)
      const pts = [{ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }, g.ext1[1], g.ext2[1], { x: g.labelPos.x - r, y: g.labelPos.y - r }, { x: g.labelPos.x + r, y: g.labelPos.y + r }]
      return { x1: Math.min(...pts.map((p) => p.x)), y1: Math.min(...pts.map((p) => p.y)), x2: Math.max(...pts.map((p) => p.x)), y2: Math.max(...pts.map((p) => p.y)) }
    }
    case 'pen': {
      const xs = el.points.map((p) => p[0])
      const ys = el.points.map((p) => p[1])
      return { x1: Math.min(...xs) - pad, y1: Math.min(...ys) - pad, x2: Math.max(...xs) + pad, y2: Math.max(...ys) + pad }
    }
    default: return { x1: 0, y1: 0, x2: 0, y2: 0 }
  }
}

export function sketchBounds(elements, padding = 30) {
  if (!elements.length) return { x: 0, y: 0, w: 400, h: 300 }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const el of elements) {
    const b = bbox(el)
    // У линии с размером подпись выходит за её пределы.
    const extra = el.type === 'line' && el.label ? (el.labelSize || 24) * 1.6 : 0
    x1 = Math.min(x1, b.x1 - extra); y1 = Math.min(y1, b.y1 - extra)
    x2 = Math.max(x2, b.x2 + extra); y2 = Math.max(y2, b.y2 + extra)
  }
  return { x: x1 - padding, y: y1 - padding, w: Math.max(1, x2 - x1) + padding * 2, h: Math.max(1, y2 - y1) + padding * 2 }
}

export function hitTest(el, p, tol, fill = false) {
  const pad = tol + (el.width || 0) / 2
  switch (el.type) {
    case 'line': return distToSegment(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= pad
    case 'rect': {
      const n = normRect(el)
      if (fill && p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) return true
      return segments(el).some(([a, b]) => distToSegment(p, a, b) <= pad)
    }
    case 'circle': { const d = dist(p, { x: el.cx, y: el.cy }); return Math.abs(d - el.r) <= pad || (fill && d <= el.r) }
    case 'cross': return dist(p, { x: el.cx, y: el.cy }) <= el.size / 2 + pad
    case 'text': { const b = textBox(el); return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol }
    case 'dim': {
      const g = dimGeometry(el)
      if (distToSegment(p, g.a, g.b) <= pad || distToSegment(p, ...g.ext1) <= pad || distToSegment(p, ...g.ext2) <= pad) return true
      if (!el.label) return false
      const along = (p.x - g.labelPos.x) * g.u.x + (p.y - g.labelPos.y) * g.u.y
      const across = (p.x - g.labelPos.x) * g.n.x + (p.y - g.labelPos.y) * g.n.y
      return Math.abs(along) <= g.labelW / 2 + tol && Math.abs(across) <= g.size * 0.6 + tol
    }
    case 'pen': {
      const pts = el.points
      if (pts.length === 1) return dist(p, { x: pts[0][0], y: pts[0][1] }) <= pad
      for (let i = 1; i < pts.length; i += 1) {
        if (distToSegment(p, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] }) <= pad) return true
      }
      return false
    }
    default: return false
  }
}

/** Сверху вниз: сначала попадание по контуру, затем — внутрь прямоугольников и кругов. */
export function pickElement(elements, p, tol) {
  for (let i = elements.length - 1; i >= 0; i -= 1) if (hitTest(elements[i], p, tol, false)) return elements[i]
  for (let i = elements.length - 1; i >= 0; i -= 1) if (hitTest(elements[i], p, tol, true)) return elements[i]
  return null
}

/** Магнит: сначала концы/углы/центры, затем ближайшая точка на крае. */
export function findSnap(p, elements, k, exclude) {
  const pointTol = 18 / k
  const edgeTol = 11 / k
  let best = null
  let bestD = pointTol
  for (const el of elements) {
    if (exclude?.has(el.id)) continue
    for (const q of keyPoints(el)) {
      const d = dist(p, q)
      if (d < bestD) { bestD = d; best = { x: q.x, y: q.y, kind: 'point' } }
    }
  }
  if (best) return best
  bestD = edgeTol
  for (const el of elements) {
    if (exclude?.has(el.id)) continue
    for (const [a, b] of segments(el)) {
      const q = closestOnSegment(p, a, b)
      const d = dist(p, q)
      if (d < bestD) { bestD = d; best = { x: q.x, y: q.y, kind: 'edge' } }
    }
  }
  return best
}

/** Выравнивание линии по горизонтали/вертикали (и мягко — по 45°). */
export function orthoSnap(anchor, p) {
  const dx = p.x - anchor.x
  const dy = p.y - anchor.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return p
  const angle = Math.atan2(dy, dx)
  const step = Math.PI / 4
  const index = Math.round(angle / step)
  const target = index * step
  const tolerance = (Math.abs(index) % 2 === 0 ? 8 : 4) * Math.PI / 180
  if (Math.abs(angle - target) > tolerance) return p
  return { x: anchor.x + Math.cos(target) * len, y: anchor.y + Math.sin(target) * len }
}

export function translate(el, dx, dy) {
  switch (el.type) {
    case 'line':
    case 'dim': return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy }
    case 'rect':
    case 'text': return { ...el, x: el.x + dx, y: el.y + dy }
    case 'circle':
    case 'cross': return { ...el, cx: el.cx + dx, cy: el.cy + dy }
    case 'pen': return { ...el, points: el.points.map(([x, y]) => [x + dx, y + dy]) }
    default: return el
  }
}

/** Ручки редактирования выделенной фигуры. */
export function handlesOf(el) {
  switch (el.type) {
    case 'line': return [{ id: 'p1', x: el.x1, y: el.y1 }, { id: 'p2', x: el.x2, y: el.y2 }]
    case 'dim': { const g = dimGeometry(el); return [{ id: 'p1', x: el.x1, y: el.y1 }, { id: 'p2', x: el.x2, y: el.y2 }, { id: 'off', x: g.center.x, y: g.center.y }] }
    case 'rect': return rectCorners(el).map((p, i) => ({ id: i, ...p }))
    case 'circle': return [{ id: 'r', x: el.cx + el.r, y: el.cy }]
    default: return []
  }
}

export function roundEl(el) {
  const out = { ...el }
  for (const key of ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'radius', 'offset']) if (typeof out[key] === 'number') out[key] = r1(out[key])
  if (out.type === 'rect') Object.assign(out, normRect(out))
  if (out.points) out.points = out.points.map(([x, y]) => [r1(x), r1(y)])
  return out
}

/** Упрощение линии карандаша (Рамер — Дуглас — Пекер), чтобы чертёж весил мало. */
export function simplifyPoints(points, epsilon) {
  if (points.length < 3) return points
  const sq = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
  const segDist = (p, a, b) => {
    const l2 = sq(a, b)
    if (!l2) return Math.sqrt(sq(p, a))
    const t = clamp(((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2, 0, 1)
    return Math.sqrt(sq(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]))
  }
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()
    let maxD = 0, index = -1
    for (let i = start + 1; i < end; i += 1) {
      const d = segDist(points[i], points[start], points[end])
      if (d > maxD) { maxD = d; index = i }
    }
    if (maxD > epsilon && index > 0) { keep[index] = 1; stack.push([start, index], [index, end]) }
  }
  return points.filter((_, i) => keep[i])
}

export function rectPath(el) {
  const { x, y, w, h } = normRect(el)
  const r = Math.max(0, Math.min(el.radius || 0, w / 2, h / 2))
  const c = el.corners || {}
  const tl = c.tl ? r : 0, tr = c.tr ? r : 0, br = c.br ? r : 0, bl = c.bl ? r : 0
  return [
    `M${x + tl} ${y}`,
    `H${x + w - tr}`, tr ? `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : '',
    `V${y + h - br}`, br ? `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : '',
    `H${x + bl}`, bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : '',
    `V${y + tl}`, tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : '',
    'Z',
  ].filter(Boolean).join(' ')
}

export function penPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M${points[0][0]} ${points[0][1]} l0.01 0`
  if (points.length === 2) return `M${points[0][0]} ${points[0][1]} L${points[1][0]} ${points[1][1]}`
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const mx = (points[i][0] + points[i + 1][0]) / 2
    const my = (points[i][1] + points[i + 1][1]) / 2
    d += ` Q${points[i][0]} ${points[i][1]} ${r1(mx)} ${r1(my)}`
  }
  const last = points[points.length - 1]
  return d + ` L${last[0]} ${last[1]}`
}
