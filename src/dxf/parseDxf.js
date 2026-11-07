// Лёгкий разбор ASCII DXF для предпросмотра (без внешних библиотек).
// Все кривые переводятся в ломаные, блоки (INSERT) и размеры (DIMENSION) раскрываются.
// На выходе — координаты SVG (ось Y направлена вниз).

const ACI = { 1: '#e0312b', 2: '#c79a00', 3: '#2e9d4b', 4: '#0b97a8', 5: '#1e5bd8', 6: '#b0309a', 7: '#1f2a24', 8: '#6f746f', 9: '#a3a8a3' }
const DEFAULT_COLOR = '#1f2a24'
const MAX_DEPTH = 8
const ARC_STEP = Math.PI / 48

function aciColor(index) {
  if (ACI[index]) return ACI[index]
  if (index >= 250 && index <= 255) { const v = Math.round(60 + (index - 250) * 30); return `rgb(${v},${v},${v})` }
  return DEFAULT_COLOR
}
function trueColor(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const hex = (n & 0xffffff).toString(16).padStart(6, '0')
  return hex === 'ffffff' ? DEFAULT_COLOR : `#${hex}`
}

/** Декодирование: новые DXF — UTF-8, старые русские — Windows-1251. */
export function decodeDxf(buffer) {
  const bytes = new Uint8Array(buffer)
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 22))
  if (head.startsWith('AutoCAD Binary DXF')) throw new Error('binary')
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('windows-1251').decode(bytes) }
}

// ---------- Матрицы 2D: [a, b, c, d, e, f] → x' = a·x + c·y + e, y' = b·x + d·y + f ----------
const IDENTITY = [1, 0, 0, 1, 0, 0]
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const translateM = (x, y) => [1, 0, 0, 1, x, y]
const rotateM = (deg) => { const r = deg * Math.PI / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0] }
const scaleM = (sx, sy) => [sx, 0, 0, sy, 0, 0]

// ---------- Чтение групп «код — значение» ----------
function readPairs(text) {
  const lines = text.split(/\r\n|\r|\n/)
  const pairs = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) { i -= 1; continue }
    pairs.push([code, lines[i + 1].replace(/\s+$/, '')])
  }
  return pairs
}

/** Разбивает поток групп на сущности: { type, g: [[code, value], ...] }. */
function splitEntities(pairs, start, stopValues) {
  const list = []
  let i = start
  while (i < pairs.length) {
    const [code, value] = pairs[i]
    if (code === 0 && stopValues.includes(value)) break
    if (code !== 0) { i += 1; continue }
    const entity = { type: value.trim(), g: [] }
    i += 1
    while (i < pairs.length && pairs[i][0] !== 0) { entity.g.push(pairs[i]); i += 1 }
    list.push(entity)
  }
  return { list, end: i }
}

const num = (g, code, fallback = 0) => { const pair = g.find((p) => p[0] === code); return pair ? parseFloat(pair[1]) : fallback }
const str = (g, code, fallback = '') => { const pair = g.find((p) => p[0] === code); return pair ? pair[1] : fallback }
const has = (g, code) => g.some((p) => p[0] === code)

/** Склеивает POLYLINE + VERTEX… + SEQEND в одну сущность. */
function groupPolylines(entities) {
  const out = []
  for (let i = 0; i < entities.length; i += 1) {
    const e = entities[i]
    if (e.type === 'POLYLINE') {
      const vertices = []
      i += 1
      while (i < entities.length && entities[i].type === 'VERTEX') { vertices.push(entities[i]); i += 1 }
      if (i < entities.length && entities[i].type !== 'SEQEND') i -= 1
      out.push({ ...e, vertices })
    } else if (e.type !== 'VERTEX' && e.type !== 'SEQEND') out.push(e)
  }
  return out
}

/** Текст MTEXT без кодов форматирования. */
function cleanMText(raw) {
  return raw
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\P/g, '\n')
    .replace(/\\~/g, ' ')
    .replace(/\\S([^;]*?)[#^/]([^;]*?);/g, '$1/$2')
    .replace(/\\[ACcFfHhQTWp][^;\\]*;/g, '')
    .replace(/\\[LlOoKkNX]/g, '')
    .replace(/\\\\/g, '\\')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/%%%/g, '%')
}
const cleanText = (raw) => cleanMText(raw)

function bulgePoints(x1, y1, x2, y2, bulge) {
  if (Math.abs(bulge) < 1e-9) return [[x2, y2]]
  const theta = 4 * Math.atan(bulge)
  const c = Math.hypot(x2 - x1, y2 - y1)
  if (c < 1e-12) return [[x2, y2]]
  const r = c / (2 * Math.sin(theta / 2))
  const a = Math.atan2(y2 - y1, x2 - x1) + (Math.PI / 2 - theta / 2)
  const cx = x1 + r * Math.cos(a)
  const cy = y1 + r * Math.sin(a)
  const start = Math.atan2(y1 - cy, x1 - cx)
  const steps = Math.max(2, Math.ceil(Math.abs(theta) / ARC_STEP))
  const radius = Math.abs(r)
  const pts = []
  for (let i = 1; i <= steps; i += 1) {
    const t = start + theta * i / steps
    pts.push([cx + radius * Math.cos(t), cy + radius * Math.sin(t)])
  }
  pts[pts.length - 1] = [x2, y2]
  return pts
}

function arcPoints(cx, cy, r, startDeg, endDeg) {
  let s = startDeg * Math.PI / 180
  let e = endDeg * Math.PI / 180
  while (e <= s) e += Math.PI * 2
  const steps = Math.max(2, Math.ceil((e - s) / ARC_STEP))
  const pts = []
  for (let i = 0; i <= steps; i += 1) { const t = s + (e - s) * i / steps; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]) }
  return pts
}

/** B-сплайн (NURBS) по алгоритму де Бура. */
function splinePoints(degree, knots, control, weights) {
  const n = control.length
  if (n < 2) return control
  if (knots.length !== n + degree + 1) return control
  const w = weights.length === n ? weights : control.map(() => 1)
  const t0 = knots[degree]
  const t1 = knots[n]
  const samples = Math.min(400, Math.max(24, n * 12))
  const pts = []
  for (let s = 0; s <= samples; s += 1) {
    const t = s === samples ? t1 - 1e-9 * (t1 - t0 || 1) : t0 + (t1 - t0) * s / samples
    let k = degree
    while (k < n - 1 && t >= knots[k + 1]) k += 1
    const d = []
    for (let j = 0; j <= degree; j += 1) {
      const p = control[k - degree + j]
      const wt = w[k - degree + j]
      d.push([p[0] * wt, p[1] * wt, wt])
    }
    for (let r = 1; r <= degree; r += 1) {
      for (let j = degree; j >= r; j -= 1) {
        const i = k - degree + j
        const denom = knots[i + degree - r + 1] - knots[i]
        const alpha = denom ? (t - knots[i]) / denom : 0
        d[j] = [(1 - alpha) * d[j - 1][0] + alpha * d[j][0], (1 - alpha) * d[j - 1][1] + alpha * d[j][1], (1 - alpha) * d[j - 1][2] + alpha * d[j][2]]
      }
    }
    const [x, y, wt] = d[degree]
    pts.push([x / (wt || 1), y / (wt || 1)])
  }
  return pts
}

/** Разбор файла: { polylines: [{ points, color, closed }], fills, texts, bounds, stats }. */
export function parseDxf(text) {
  const pairs = readPairs(text)
  const layers = new Map()
  const blocks = new Map()
  let entities = []

  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i][0] !== 0 || pairs[i][1].trim() !== 'SECTION') continue
    const name = pairs[i + 1]?.[1]?.trim()
    if (name === 'TABLES') {
      const { list, end } = splitEntities(pairs, i + 2, ['ENDSEC'])
      for (const e of list) {
        if (e.type !== 'LAYER') continue
        const color = num(e.g, 62, 7)
        const flags = num(e.g, 70, 0)
        layers.set(str(e.g, 2), { color: has(e.g, 420) ? trueColor(str(e.g, 420)) : aciColor(Math.abs(color)), visible: color >= 0 && !(flags & 1) })
      }
      i = end
    } else if (name === 'BLOCKS') {
      const { list, end } = splitEntities(pairs, i + 2, ['ENDSEC'])
      let current = null
      for (const e of list) {
        if (e.type === 'BLOCK') { current = { name: str(e.g, 2), base: [num(e.g, 10), num(e.g, 20)], entities: [] }; blocks.set(current.name, current) }
        else if (e.type === 'ENDBLK') current = null
        else if (current) current.entities.push(e)
      }
      for (const block of blocks.values()) block.entities = groupPolylines(block.entities)
      i = end
    } else if (name === 'ENTITIES') {
      const { list, end } = splitEntities(pairs, i + 2, ['ENDSEC'])
      entities = groupPolylines(list)
      i = end
    }
  }

  const polylines = []
  const fills = []
  const texts = []
  const stats = { entities: 0, skipped: {} }

  const resolveColor = (g, layerName, parentColor) => {
    if (has(g, 420)) return trueColor(str(g, 420)) || DEFAULT_COLOR
    const index = num(g, 62, 256)
    if (index === 0) return parentColor || DEFAULT_COLOR
    if (index === 256) return layers.get(layerName)?.color || DEFAULT_COLOR
    return aciColor(Math.abs(index))
  }

  const draw = (list, matrix, parentColor, parentLayer, depth) => {
    for (const e of list) {
      const g = e.g
      let layer = str(g, 8, '0')
      if (layer === '0' && parentLayer) layer = parentLayer
      if (layers.get(layer)?.visible === false) continue
      const color = resolveColor(g, layer, parentColor)
      // Ось выдавливания (0,0,-1) — объект «зеркальный» по X.
      const ocs = num(g, 230, 1) < 0 ? multiply(matrix, scaleM(-1, 1)) : matrix
      const emit = (pts, closed = false, m = ocs) => { if (pts.length > 1) polylines.push({ points: pts.map(([x, y]) => apply(m, x, y)), color, closed }) }
      stats.entities += 1
      switch (e.type) {
        case 'LINE': emit([[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)]], false, matrix); break
        case 'XLINE': case 'RAY': break
        case 'CIRCLE': emit(arcPoints(num(g, 10), num(g, 20), num(g, 40), 0, 360), true); break
        case 'ARC': emit(arcPoints(num(g, 10), num(g, 20), num(g, 40), num(g, 50), num(g, 51))); break
        case 'ELLIPSE': {
          const cx = num(g, 10), cy = num(g, 20), mx = num(g, 11), my = num(g, 21), ratio = num(g, 40, 1)
          let s = num(g, 41, 0), en = num(g, 42, Math.PI * 2)
          while (en <= s) en += Math.PI * 2
          const steps = Math.max(8, Math.ceil((en - s) / ARC_STEP))
          const pts = []
          for (let k = 0; k <= steps; k += 1) {
            const t = s + (en - s) * k / steps
            pts.push([cx + mx * Math.cos(t) - my * ratio * Math.sin(t), cy + my * Math.cos(t) + mx * ratio * Math.sin(t)])
          }
          emit(pts, false, matrix)
          break
        }
        case 'LWPOLYLINE': {
          const closed = (num(g, 70, 0) & 1) === 1
          const verts = []
          for (const [code, value] of g) {
            if (code === 10) verts.push({ x: parseFloat(value), y: 0, b: 0 })
            else if (code === 20 && verts.length) verts[verts.length - 1].y = parseFloat(value)
            else if (code === 42 && verts.length) verts[verts.length - 1].b = parseFloat(value)
          }
          emit(polyWithBulges(verts, closed), closed)
          break
        }
        case 'POLYLINE': {
          const flags = num(g, 70, 0)
          if (flags & (16 | 64)) { stats.skipped.MESH = (stats.skipped.MESH || 0) + 1; break }
          const closed = (flags & 1) === 1
          const verts = (e.vertices || []).filter((v) => !(num(v.g, 70, 0) & 16)).map((v) => ({ x: num(v.g, 10), y: num(v.g, 20), b: num(v.g, 42, 0) }))
          emit(polyWithBulges(verts, closed), closed, flags & 8 ? matrix : ocs)
          break
        }
        case 'SPLINE': {
          const control = []
          const fit = []
          const knots = []
          const weights = []
          for (const [code, value] of g) {
            if (code === 10) control.push([parseFloat(value), 0])
            else if (code === 20 && control.length) control[control.length - 1][1] = parseFloat(value)
            else if (code === 11) fit.push([parseFloat(value), 0])
            else if (code === 21 && fit.length) fit[fit.length - 1][1] = parseFloat(value)
            else if (code === 40) knots.push(parseFloat(value))
            else if (code === 41) weights.push(parseFloat(value))
          }
          const degree = num(g, 71, 3)
          const pts = control.length > degree ? splinePoints(degree, knots, control, weights) : fit
          emit(pts.length > 1 ? pts : fit, false, matrix)
          break
        }
        case 'SOLID': case 'TRACE': {
          const p = [[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)], [num(g, 13, num(g, 12)), num(g, 23, num(g, 22))], [num(g, 12), num(g, 22)]]
          fills.push({ points: p.map(([x, y]) => apply(ocs, x, y)), color })
          break
        }
        case '3DFACE': {
          const p = [[num(g, 10), num(g, 20)], [num(g, 11), num(g, 21)], [num(g, 12), num(g, 22)], [num(g, 13), num(g, 23)]]
          emit(p, true, matrix)
          break
        }
        case 'TEXT': case 'ATTRIB': {
          const value = cleanText(str(g, 1))
          if (!value.trim()) break
          const h = num(g, 72, 0), v = num(g, 73, 0)
          const aligned = (h || v) && has(g, 11)
          const [px, py] = aligned ? [num(g, 11), num(g, 21)] : [num(g, 10), num(g, 20)]
          pushText(texts, ocs, px, py, num(g, 40, 2.5), num(g, 50, 0), value, color,
            h === 1 || h === 4 ? 'middle' : h === 2 ? 'end' : 'start',
            h === 4 || v === 2 ? 'middle' : v === 3 ? 'top' : 'baseline')
          break
        }
        case 'MTEXT': {
          const raw = g.filter((p) => p[0] === 3).map((p) => p[1]).join('') + str(g, 1)
          const value = cleanMText(raw)
          if (!value.trim()) break
          const attach = num(g, 71, 1)
          let rotation = num(g, 50, 0)
          if (has(g, 11)) rotation = Math.atan2(num(g, 21), num(g, 11)) * 180 / Math.PI
          const col = (attach - 1) % 3
          const row = Math.floor((attach - 1) / 3)
          pushText(texts, matrix, num(g, 10), num(g, 20), num(g, 40, 2.5), rotation, value, color,
            ['start', 'middle', 'end'][col], ['top', 'middle', 'bottom'][row])
          break
        }
        case 'INSERT': case 'DIMENSION': {
          const block = blocks.get(str(g, 2))
          if (!block || depth >= MAX_DEPTH) break
          let m
          if (e.type === 'DIMENSION') m = matrix // блок размера уже лежит в мировых координатах
          else {
            m = multiply(ocs, translateM(num(g, 10), num(g, 20)))
            m = multiply(m, rotateM(num(g, 50, 0)))
            m = multiply(m, scaleM(num(g, 41, 1), num(g, 42, 1)))
            m = multiply(m, translateM(-block.base[0], -block.base[1]))
          }
          draw(block.entities, m, color, layer, depth + 1)
          break
        }
        default:
          stats.skipped[e.type] = (stats.skipped[e.type] || 0) + 1
      }
    }
  }

  draw(entities, IDENTITY, null, null, 0)

  // Переворачиваем ось Y под SVG и считаем габариты.
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  const grow = (x, y) => { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y }
  for (const p of polylines) for (const pt of p.points) { pt[1] = -pt[1]; grow(pt[0], pt[1]) }
  for (const f of fills) for (const pt of f.points) { pt[1] = -pt[1]; grow(pt[0], pt[1]) }
  for (const t of texts) {
    t.y = -t.y
    t.rotation = -t.rotation
    // Габариты надписи (приблизительно), чтобы «вписать» не обрезало длинный текст.
    const w = Math.max(...t.lines.map((line) => line.length)) * t.height * 0.6
    const h = t.lines.length * t.height * 1.666
    const x0 = t.anchor === 'middle' ? -w / 2 : t.anchor === 'end' ? -w : 0
    const y0 = t.baseline === 'top' ? 0 : t.baseline === 'middle' ? -h / 2 : -h + t.height * 0.4
    const r = t.rotation * Math.PI / 180
    for (const [dx, dy] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]]) {
      grow(t.x + dx * Math.cos(r) - dy * Math.sin(r), t.y + dx * Math.sin(r) + dy * Math.cos(r))
    }
  }
  const bounds = Number.isFinite(x1) ? { x: x1, y: y1, w: Math.max(x2 - x1, 1e-6), h: Math.max(y2 - y1, 1e-6) } : null
  return { polylines, fills, texts, bounds, stats }
}

function polyWithBulges(verts, closed) {
  if (!verts.length) return []
  const pts = [[verts[0].x, verts[0].y]]
  const count = closed ? verts.length : verts.length - 1
  for (let i = 0; i < count; i += 1) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    pts.push(...bulgePoints(a.x, a.y, b.x, b.y, a.b))
  }
  return pts
}

function pushText(texts, matrix, x, y, height, rotationDeg, value, color, anchor, baseline) {
  const [px, py] = apply(matrix, x, y)
  // Масштаб и поворот, которые внёс блок.
  const scale = Math.hypot(matrix[0], matrix[1]) || 1
  const extra = Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI
  texts.push({ x: px, y: py, height: height * scale, rotation: rotationDeg + extra, lines: value.split('\n'), color, anchor, baseline })
}
