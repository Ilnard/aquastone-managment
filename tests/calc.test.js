// Расчёт конструктора: цены, толщина, стыки, раскрой. Запуск: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateEstimate, normalizeShapes, publicConfig } from '../server/calc/estimate.js'
import { calculateNesting } from '../server/calc/nesting.js'
import { PRICING } from '../server/calc/pricing.js'

const rect = (id, x, y, w, h) => ({ id, type: 'rect', x, y, w, h, name: id })
const sink = (x, y) => ({ id: 'sink', type: 'sink', x, y, w: 540, h: 390 })
const thinnest = (material) => Number(Object.keys(PRICING.materials[material].thickness)[0])

/** Стык проходит по мойке (с запасом cutoutClearance)? */
const seamHitsCutout = (seam, cut, clearance = PRICING.seams.cutoutClearance) => (seam.axis === 'x'
  ? seam.at > cut.x - clearance && seam.at < cut.x + cut.w + clearance && Math.min(seam.y2, cut.y + cut.h) > Math.max(seam.y1, cut.y)
  : seam.at > cut.y - clearance && seam.at < cut.y + cut.h + clearance && Math.min(seam.x2, cut.x + cut.w) > Math.max(seam.x1, cut.x))

/** Детали на листе: внутри рабочей зоны, не пересекаются, между ними не меньше пропила. */
function assertValidLayout(variant, slab) {
  for (const board of variant.boards) {
    for (const p of board.pieces) {
      assert.ok(p.x >= slab.margin && p.y >= slab.margin, 'деталь заходит на краевой запас')
      assert.ok(p.x + p.w <= board.width - slab.margin && p.y + p.h <= board.height - slab.margin, 'деталь выходит за лист')
    }
    board.pieces.forEach((a, i) => board.pieces.slice(i + 1).forEach((b) => {
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0)
      const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0)
      assert.ok(Math.hypot(dx, dy) >= slab.kerf, 'между деталями меньше пропила')
    }))
  }
}

test('толщина влияет на цену: кварц 40 мм = 20 мм × коэффициент', () => {
  const shapes = [rect('a', 0, 0, 2000, 600)]
  const thin = calculateEstimate({ material: 'quartz', thickness: 20, shapes })
  const thick = calculateEstimate({ material: 'quartz', thickness: 40, shapes })
  const k = PRICING.materials.quartz.thickness[40]
  assert.equal(thick.price.materialCost, Math.round(thin.price.materialCost * k))
  assert.ok(thick.estimate > thin.estimate)
})

test('недоступная толщина — ошибка', () => {
  const result = calculateEstimate({ material: 'compact', thickness: 40, shapes: [rect('a', 0, 0, 2000, 600)] })
  assert.match(result.error, /недоступна/)
})

test('для заявки толщина обязательна', () => {
  const result = calculateEstimate({ material: 'quartz', shapes: [rect('a', 0, 0, 2000, 600)] }, { requireThickness: true })
  assert.match(result.error, /толщину/)
})

test('цена = (материал + вырезы) × коэффициент формы', () => {
  const pricing = structuredClone(PRICING)
  pricing.forms['l-shaped'].coefficient = 1.2
  const r = calculateEstimate({ material: 'quartz', thickness: 20, form: 'l-shaped', shapes: [rect('a', 0, 0, 2000, 600), sink(500, 100)] }, { pricing })
  assert.equal(r.price.cutoutsCost, pricing.cutouts.sink)
  assert.equal(r.estimate, Math.round((r.price.materialCost + r.price.cutoutsCost) * 1.2))
})

test('акриловый остров шире листа: продольный стык, основная полоса на всю рабочую ширину', () => {
  const slab = PRICING.materials.acrylic.slab
  const usable = slab.height - 2 * slab.margin
  const r = calculateEstimate({ material: 'acrylic', thickness: 12, shapes: [rect('a', 0, 0, 2400, 1100)] })
  assert.equal(r.feasible, true)
  const variant = r.variants[0]
  const along = variant.seams.filter((s) => s.kind === 'along')
  assert.equal(along.length, 1)
  assert.equal(along[0].at, usable)
  const pieces = variant.boards.flatMap((b) => b.pieces)
  assert.deepEqual(pieces.map((p) => Math.min(p.w, p.h)).sort((a, b) => b - a), [usable, 1100 - usable])
  assertValidLayout(variant, slab)
})

test('продольный стык обходит мойку', () => {
  const shapes = [rect('a', 0, 0, 2400, 1100), sink(930, 500)]
  const r = calculateEstimate({ material: 'acrylic', thickness: 12, shapes })
  assert.equal(r.feasible, true)
  for (const variant of r.variants) for (const seam of variant.seams) assert.ok(!seamHitsCutout(seam, shapes[1]), `стык ${seam.axis}@${seam.at} на мойке`)
})

test('поперечный стык никогда не проходит через мойку', () => {
  for (const material of ['quartz', 'acrylic', 'compact']) {
    for (let x = 100; x <= 3500; x += 200) {
      const shapes = [rect('a', 0, 0, 4200, 600), sink(x, 100)]
      const r = calculateEstimate({ material, thickness: thinnest(material), shapes })
      assert.equal(r.feasible, true, `${material}, мойка на ${x}`)
      for (const variant of r.variants) {
        for (const seam of variant.seams) assert.ok(!seamHitsCutout(seam, shapes[1]), `${material}: стык @${seam.at} на мойке ${x}`)
        assertValidLayout(variant, PRICING.materials[material].slab)
      }
    }
  }
})

test('стык через варочную панель допустим', () => {
  const hob = { id: 'hob', type: 'hob', x: 1700, y: 50, w: 590, h: 510 }
  const r = calculateEstimate({ material: 'quartz', thickness: 20, shapes: [rect('a', 0, 0, 4000, 600), hob] })
  const throughHob = r.variants.some((v) => v.seams.some((s) => s.at >= hob.x && s.at <= hob.x + hob.w))
  assert.ok(throughHob, 'ни в одном варианте стык не проходит через варочную панель')
})

test('полосы широкой детали режутся поперёк одной линией', () => {
  const r = calculateEstimate({ material: 'acrylic', thickness: 12, shapes: [rect('a', 0, 0, 3200, 1100)] })
  const across = r.variants[0].seams.filter((s) => s.kind === 'across').map((s) => s.at)
  assert.ok(across.length >= 2)
  assert.equal(new Set(across).size, 1)
})

test('невозможный раскрой: feasible=false и цена 0', () => {
  const r = calculateEstimate({ material: 'acrylic', thickness: 12, shapes: [rect('a', 0, 0, 2000, 747), sink(700, 179)] })
  assert.equal(r.feasible, false)
  assert.equal(r.estimate, 0)
  assert.ok(r.warnings.length)
})

test('площадь деталей на листах равна площади эскиза (без варочной)', () => {
  for (const shapes of [[rect('a', 0, 0, 2940, 620), rect('b', 2250, 620, 690, 1100)], [rect('a', 0, 0, 7000, 600)], [rect('a', 0, 0, 2400, 1500)]]) {
    for (const material of ['quartz', 'acrylic', 'compact']) {
      const n = calculateNesting(shapes, PRICING.materials[material].slab, PRICING.seams)
      assert.equal(n.feasible, true)
      const placed = n.boards.flatMap((b) => b.pieces).reduce((sum, p) => sum + p.w * p.h, 0)
      assert.equal(placed, n.total)
    }
  }
})

test('лимиты эскиза и проверка входных данных', () => {
  const many = Array.from({ length: PRICING.limits.surfaces + 1 }, (_, i) => rect('r' + i, i * 700, 0, 600, 600))
  assert.match(normalizeShapes(many).error, /больше/)
  assert.match(normalizeShapes([{ type: 'sink', x: 0, y: 0, w: 10, h: 10 }]).error, /нет ни одной детали/)
  assert.match(normalizeShapes([{ type: 'rect', x: 'a', y: 0, w: 10, h: 10 }]).error, /неверно/)
  assert.equal(calculateEstimate({ material: 'gold', shapes: [rect('a', 0, 0, 100, 100)] }).error, 'Выберите материал.')
})

test('публичные параметры не раскрывают цены', () => {
  const text = JSON.stringify(publicConfig())
  assert.ok(!text.includes('pricePerM2'))
  assert.ok(!text.includes(String(PRICING.materials.quartz.pricePerM2)))
  assert.deepEqual(publicConfig().materials.quartz.thickness, [20, 40])
})
