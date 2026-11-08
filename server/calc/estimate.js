// Расчёт ориентира стоимости по эскизу из конструктора. Цены и коэффициенты — в pricing.js.
import { PRICING } from './pricing.js'
import { calculateNesting } from './nesting.js'

export const SHAPE_TYPES = ['rect', 'sink', 'hob', 'circle', 'cutout']
const CUTOUT_TYPES = SHAPE_TYPES.filter((type) => type !== 'rect')

const round2 = (n) => Math.round(n * 100) / 100
const num = (value, min, max) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null }

/** Что конструктору нужно знать заранее: материалы, допустимые толщины, формы. Цен здесь нет. */
export function publicConfig(pricing = PRICING) {
  return {
    materials: Object.fromEntries(Object.entries(pricing.materials).map(([key, m]) => [key, {
      title: m.title,
      thickness: Object.keys(m.thickness).map(Number).sort((a, b) => a - b),
      slab: { width: m.slab.width, height: m.slab.height, kerf: m.slab.kerf, margin: m.slab.margin },
    }])),
    forms: Object.entries(pricing.forms).map(([id, f]) => ({ id, title: f.title })),
    note: pricing.note,
  }
}

/** Эскиз из запроса: только известные типы, целые миллиметры, ограничение по количеству. */
export function normalizeShapes(input, pricing = PRICING) {
  const { limits } = pricing
  const list = Array.isArray(input) ? input : []
  const shapes = []
  let surfaces = 0, cutouts = 0
  for (const [index, raw] of list.entries()) {
    if (!raw || !SHAPE_TYPES.includes(raw.type)) continue
    const x = num(raw.x, 0, limits.maxSize), y = num(raw.y, 0, limits.maxSize)
    const w = num(raw.w, 1, limits.maxSize), h = num(raw.h, 1, limits.maxSize)
    if ([x, y, w, h].includes(null)) return { error: 'Размеры на эскизе указаны неверно.' }
    if (raw.type === 'rect' && ++surfaces > limits.surfaces) return { error: `На эскизе больше ${limits.surfaces} деталей — разделите расчёт или обратитесь к менеджеру.` }
    if (raw.type !== 'rect' && ++cutouts > limits.cutouts) return { error: `На эскизе больше ${limits.cutouts} вырезов.` }
    const id = String(raw.id ?? '').replace(/[^\w-]/g, '').slice(0, 40) || `s${index + 1}`
    shapes.push({ id, type: raw.type, name: String(raw.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || id, x, y, w, h })
  }
  // id должны быть уникальными — по ним конструктор связывает стыки и детали.
  const seen = new Set()
  for (const shape of shapes) { while (seen.has(shape.id)) shape.id += '_'; seen.add(shape.id) }
  if (!shapes.some((shape) => shape.type === 'rect')) return { error: 'На эскизе нет ни одной детали столешницы.' }
  return { value: shapes }
}

/** Вырез, центр которого не лежит ни на одной детали. */
export function outsideCutouts(shapes) {
  const surfaces = shapes.filter((s) => s.type === 'rect')
  return shapes.filter((c) => c.type !== 'rect').filter((c) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2
    return !surfaces.some((s) => cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h)
  })
}

const cache = new Map()
const CACHE_SIZE = 300

/**
 * Расчёт: { material, thickness, form, shapes, variant } → раскрой и стоимость.
 * requireThickness — для заявки толщина обязательна; в предпросмотре без толщины берём коэффициент 1.
 */
export function calculateEstimate(input = {}, { pricing = PRICING, requireThickness = false } = {}) {
  const material = pricing.materials[input.material]
  if (!material) return { error: 'Выберите материал.' }
  const thicknessKey = input.thickness == null || input.thickness === '' ? null : Number(input.thickness)
  if (thicknessKey != null && !(thicknessKey in material.thickness)) return { error: `Толщина ${thicknessKey} мм недоступна для материала «${material.title}».` }
  if (requireThickness && thicknessKey == null) return { error: 'Выберите толщину.' }
  const form = pricing.forms[input.form] ? input.form : null
  const { value: shapes, error } = normalizeShapes(input.shapes, pricing)
  if (error) return { error }

  const key = JSON.stringify([input.material, thicknessKey, form, input.variant || '', shapes])
  if (pricing === PRICING && cache.has(key)) return cache.get(key)

  const nesting = calculateNesting(shapes, material.slab, pricing.seams)
  const chosen = nesting.variants.find((variant) => variant.id === input.variant) || nesting
  const thicknessCoefficient = thicknessKey == null ? 1 : material.thickness[thicknessKey]
  const formCoefficient = form ? pricing.forms[form].coefficient : 1
  const purchasedM2 = (chosen.purchasedArea || 0) / 1e6
  const materialCost = Math.round(purchasedM2 * material.pricePerM2 * thicknessCoefficient)
  const cutouts = CUTOUT_TYPES.map((type) => {
    const count = shapes.filter((s) => s.type === type).length
    return { type, count, price: pricing.cutouts[type] || 0, sum: count * (pricing.cutouts[type] || 0) }
  }).filter((line) => line.count)
  const cutoutsCost = cutouts.reduce((sum, line) => sum + line.sum, 0)
  const total = nesting.feasible ? Math.round((materialCost + cutoutsCost) * formCoefficient) : 0

  const result = {
    feasible: Boolean(nesting.feasible),
    material: input.material,
    materialTitle: material.title,
    thickness: thicknessKey,
    form,
    formTitle: form ? pricing.forms[form].title : '',
    slab: { width: material.slab.width, height: material.slab.height, kerf: material.slab.kerf, margin: material.slab.margin },
    shapes,
    outside: outsideCutouts(shapes).map((s) => s.id),
    variants: nesting.variants.map((v) => ({ ...v, variants: undefined })),
    selected: chosen.id || null,
    summary: {
      area: round2(nesting.total / 1e6),
      purchasedArea: round2(purchasedM2),
      order: chosen.order?.label || '',
      orderDescription: chosen.order?.description || '',
      efficiency: chosen.efficiency || 0,
      variant: chosen.label || '',
      seams: (chosen.seams || []).length,
      seamLength: Math.round(chosen.seamLength || 0),
    },
    price: {
      pricePerM2: material.pricePerM2,
      thicknessCoefficient,
      materialCost,
      cutouts,
      cutoutsCost,
      formCoefficient,
      total,
    },
    estimate: total,
    note: nesting.feasible ? chosen.note : nesting.note,
    warnings: nesting.warnings || [],
    priceNote: pricing.note,
  }
  if (pricing === PRICING) {
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value)
    cache.set(key, result)
  }
  return result
}
