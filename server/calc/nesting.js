// Раскрой деталей столешницы на листы материала. Чистая функция без зависимостей —
// её вызывает сервер (server/calc/estimate.js) и тесты. Все размеры в миллиметрах.
//
// Шаги:
//  1. Деталь шире рабочей ширины листа режется вдоль длинной стороны: первая полоса занимает всю
//     рабочую ширину листа, остаток идёт доборной полосой под склейку (продольный стык).
//  2. Деталь длиннее листа режется поперёк (1–2 стыка). Стык не ставится через мойку и через
//     круглые и прямые вырезы (и ближе rules.cutoutClearance к их краю); через варочную панель — можно.
//  3. Детали раскладываются на комплекты листов разными стратегиями, выбирается лучшая раскладка.

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_RULES = { cutoutClearance: 100, minPart: 120, maxSeams: 2 };
// Вырезы, через которые стык проходить не может. Варочная панель (hob) — может.
const SEAM_BLOCKERS = ['sink', 'circle', 'cutout'];

function splitFreeRectangles(freeRects, placed) {
  const split = [];
  for (const free of freeRects) {
    const right = placed.x + placed.w;
    const bottom = placed.y + placed.h;
    if (placed.x >= free.x + free.w || right <= free.x || placed.y >= free.y + free.h || bottom <= free.y) {
      split.push(free);
      continue;
    }
    if (placed.x > free.x) split.push({ x: free.x, y: free.y, w: placed.x - free.x, h: free.h });
    if (right < free.x + free.w) split.push({ x: right, y: free.y, w: free.x + free.w - right, h: free.h });
    if (placed.y > free.y) split.push({ x: free.x, y: free.y, w: free.w, h: placed.y - free.y });
    if (bottom < free.y + free.h) split.push({ x: free.x, y: bottom, w: free.w, h: free.y + free.h - bottom });
  }
  const valid = split.filter(rect => rect.w > 0 && rect.h > 0);
  return valid.filter((rect, index) => !valid.some((other, otherIndex) => otherIndex !== index && rect.x >= other.x && rect.y >= other.y && rect.x + rect.w <= other.x + other.w && rect.y + rect.h <= other.y + other.h));
}

function rectangleGap(a, b) {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0);
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0);
  return Math.hypot(dx, dy);
}

/** Габарит выреза: у круга — квадрат по диаметру. */
function cutoutBounds(shape) {
  if (shape.type !== 'circle') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const d = Math.min(shape.w, shape.h);
  return { x: shape.x + (shape.w - d) / 2, y: shape.y + (shape.h - d) / 2, w: d, h: d };
}

/**
 * Запрещённые для стыка отрезки вдоль оси разреза: вырезы (кроме варочной панели), которые лежат на этой полосе.
 * axis 'x' — стык вертикальный (x = const), отрезки по x; axis 'y' — стык горизонтальный, отрезки по y.
 */
function forbiddenIntervals(rect, shapes, axis, clearance) {
  const list = [];
  for (const shape of shapes) {
    if (!SEAM_BLOCKERS.includes(shape.type)) continue;
    const b = cutoutBounds(shape);
    const overlapX = Math.min(b.x + b.w, rect.x + rect.w) - Math.max(b.x, rect.x);
    const overlapY = Math.min(b.y + b.h, rect.y + rect.h) - Math.max(b.y, rect.y);
    if (overlapX <= 0 || overlapY <= 0) continue;
    list.push(axis === 'x' ? [b.x - clearance, b.x + b.w + clearance] : [b.y - clearance, b.y + b.h + clearance]);
  }
  return list;
}
const isForbidden = (at, intervals) => intervals.some(([from, to]) => at > from && at < to);

/**
 * Шаг 1. Деталь, которая шире рабочей ширины листа, делим вдоль длинной стороны на полосы:
 * первая — на всю рабочую ширину листа, следующая — остаток (доборная полоса для склейки).
 * Стык сдвигается к стене, если попадает на мойку или вырез. Возвращает полосы и продольные стыки.
 */
function splitAcross(surface, shapes, slab, rules) {
  const usableShort = Math.min(slab.width, slab.height) - 2 * slab.margin;
  const horizontal = surface.w >= surface.h;
  const depth = horizontal ? surface.h : surface.w;
  const length = horizontal ? surface.w : surface.h;
  const whole = { ...surface, sourceId: surface.id };
  // Деталь помещается на лист (в любой ориентации) — продольный разрез не нужен.
  if (depth <= usableShort) return { strips: [whole], seams: [] };

  const axis = horizontal ? 'y' : 'x'; // линия стыка параллельна длинной стороне
  const origin = horizontal ? surface.y : surface.x;
  const end = origin + depth;
  const blocked = forbiddenIntervals(surface, shapes, axis, rules.cutoutClearance);
  // Режем от стены (fromStart) или от переднего края — берём вариант, где основная полоса шире.
  const attempt = (fromStart) => {
    const cuts = [];
    let previous = fromStart ? origin : end;
    const left = () => (fromStart ? end - previous : previous - origin);
    while (left() > usableShort) {
      let at = fromStart ? previous + usableShort : previous - usableShort;
      // Остаток не должен получиться узким: забираем часть ширины у текущей полосы.
      if (fromStart && end - at < rules.minPart) at = end - rules.minPart;
      if (!fromStart && at - origin < rules.minPart) at = origin + rules.minPart;
      // Стык на мойке или вырезе — сдвигаем его назад, к уже отрезанной полосе, до края запретной зоны.
      for (let guard = 0; guard < 20 && isForbidden(at, blocked); guard += 1) {
        const hit = blocked.filter(([from, to]) => at > from && at < to);
        at = fromStart ? Math.min(...hit.map(([from]) => from)) : Math.max(...hit.map(([, to]) => to));
      }
      if (Math.abs(at - previous) < rules.minPart) return null;
      cuts.push(Math.round(at));
      previous = at;
    }
    const sorted = cuts.sort((a, b) => a - b);
    const bounds = [origin, ...sorted, end];
    return { cuts: sorted, widest: Math.max(...bounds.slice(1).map((value, index) => value - bounds[index])) };
  };
  const options = [attempt(true), attempt(false)].filter(Boolean)
    .sort((a, b) => b.widest - a.widest || a.cuts.length - b.cuts.length);
  if (!options.length) return { strips: [whole], seams: [], failed: true };
  const { cuts } = options[0];

  const bounds = [origin, ...cuts, end];
  const strips = bounds.slice(1).map((stripEnd, index) => {
    const start = bounds[index];
    const size = stripEnd - start;
    return {
      ...surface,
      id: `${surface.id}-s${index + 1}`,
      sourceId: surface.id,
      x: horizontal ? surface.x : start,
      y: horizontal ? start : surface.y,
      w: horizontal ? surface.w : size,
      h: horizontal ? size : surface.h,
      name: surface.name,
    };
  });
  // Самая широкая полоса — основная, остальные — доборные.
  const widest = strips.reduce((best, strip) => (Math.min(strip.w, strip.h) > Math.min(best.w, best.h) ? strip : best), strips[0]);
  let extra = 0;
  strips.forEach((strip) => {
    strip.detailLabel = `${surface.name} · ${strip === widest ? 'основная полоса' : `доборная полоса${strips.length > 2 ? ` ${++extra}` : ''}`}`;
  });
  const seams = cuts.map((at) => (horizontal
    ? { sourceId: surface.id, axis: 'y', at, kind: 'along', x1: surface.x, y1: at, x2: surface.x + surface.w, y2: at, joinLength: length }
    : { sourceId: surface.id, axis: 'x', at, kind: 'along', x1: at, y1: surface.y, x2: at, y2: surface.y + surface.h, joinLength: length }));
  return { strips, seams };
}

function splitCombinations(positions, count, origin, end, minPart) {
  const result = [];
  const visit = (start, chosen) => {
    if (chosen.length === count) {
      const bounds = [origin, ...chosen, end];
      if (bounds.slice(1).every((value, index) => value - bounds[index] >= minPart)) result.push(chosen);
      return;
    }
    for (let i = start; i <= positions.length - (count - chosen.length); i++) visit(i + 1, [...chosen, positions[i]]);
  };
  visit(0, []);
  return result;
}

function buildSplitParts(surface, cuts, hob, axis) {
  const horizontal = axis === 'x';
  const origin = horizontal ? surface.x : surface.y;
  const end = origin + (horizontal ? surface.w : surface.h);
  const crossStart = horizontal ? surface.y : surface.x;
  const crossSize = horizontal ? surface.h : surface.w;
  const hobStart = hob ? (horizontal ? hob.x : hob.y) : 0;
  const hobEnd = hob ? hobStart + (horizontal ? hob.w : hob.h) : 0;
  const hobCrossStart = hob ? (horizontal ? hob.y : hob.x) : 0;
  const hobCrossEnd = hob ? hobCrossStart + (horizontal ? hob.h : hob.w) : 0;
  const sections = [origin, ...cuts, end];
  const parts = [];
  const baseLabel = surface.detailLabel || surface.name;
  sections.slice(1).forEach((sectionEnd, index) => {
    const sectionStart = sections[index];
    const overlapsHob = hob && sectionStart >= hobStart && sectionEnd <= hobEnd && hobCrossStart > crossStart && hobCrossEnd < crossStart + crossSize;
    const strips = overlapsHob
      ? [[crossStart, hobCrossStart - crossStart, 'верх'], [hobCrossEnd, crossStart + crossSize - hobCrossEnd, 'низ']].filter(([, size]) => size >= 30)
      : [[crossStart, crossSize, '']];
    strips.forEach(([stripStart, stripSize, suffix], stripIndex) => {
      const id = `${surface.id}-p${index + 1}${suffix ? `-${stripIndex + 1}` : ''}`;
      parts.push({
        id, sourceId: surface.sourceId ?? surface.id,
        packGroup: suffix ? `${surface.id}-section-${index + 1}` : undefined,
        sourceX: horizontal ? sectionStart : stripStart,
        sourceY: horizontal ? stripStart : sectionStart,
        sourceW: horizontal ? sectionEnd - sectionStart : stripSize,
        sourceH: horizontal ? stripSize : sectionEnd - sectionStart,
        name: surface.name,
        w: horizontal ? sectionEnd - sectionStart : stripSize,
        h: horizontal ? stripSize : sectionEnd - sectionStart,
        detailLabel: suffix ? `${baseLabel} · у панели, ${suffix}` : baseLabel,
      });
    });
  });
  return parts;
}

/**
 * Шаг 2. Варианты поперечного разреза одной полосы: целиком и с 1–2 стыками.
 * Стыки не ставятся на мойку и вырезы (кроме варочной панели).
 */
function lengthOptions(surface, shapes, slab, rules) {
  const maxLength = Math.max(slab.width, slab.height) - 2 * slab.margin;
  const horizontal = surface.w >= surface.h;
  const axis = horizontal ? 'x' : 'y';
  const origin = horizontal ? surface.x : surface.y;
  const length = horizontal ? surface.w : surface.h;
  const end = origin + length;
  const crossStart = horizontal ? surface.y : surface.x;
  const crossEnd = crossStart + (horizontal ? surface.h : surface.w);
  // Варочная панель, которая лежит на этой полосе.
  const hob = shapes.find((shape) => shape.type === 'hob'
    && Math.min(shape.x + shape.w, surface.x + surface.w) > Math.max(shape.x, surface.x)
    && Math.min(shape.y + shape.h, surface.y + surface.h) > Math.max(shape.y, surface.y));
  const hobStart = hob ? (horizontal ? hob.x : hob.y) : 0;
  const hobEnd = hob ? hobStart + (horizontal ? hob.w : hob.h) : 0;
  const hobCrossStart = hob ? (horizontal ? hob.y : hob.x) : 0;
  const hobCrossEnd = hob ? hobCrossStart + (horizontal ? hob.h : hob.w) : 0;
  const blocked = forbiddenIntervals(surface, shapes, axis, rules.cutoutClearance);

  const options = [{ parts: [surface], seams: [], cutCount: 0, seamLength: 0, hobEdgePenalty: 0, key: `${surface.id}-whole`, fits: length <= maxLength }];
  const candidates = new Set();
  const inside = (point) => point > origin + rules.minPart && point < end - rules.minPart;
  const searchStep = Math.max(250, Math.floor(length / 6 / 50) * 50);
  for (let point = origin + searchStep; point < end - rules.minPart; point += searchStep) candidates.add(Math.round(point));
  if (hob) [hobStart, hobEnd, (hobStart + hobEnd) / 2].forEach((point) => { if (inside(point)) candidates.add(Math.round(point)); });
  // Сразу за краем запретной зоны — чтобы стык можно было поставить рядом с мойкой, а не на ней.
  blocked.forEach(([from, to]) => [from, to].forEach((point) => { if (inside(point)) candidates.add(Math.round(point)); }));
  for (let count = 1; count <= rules.maxSeams; count++) {
    for (let i = 1; i <= count; i++) {
      const point = origin + length * i / (count + 1);
      if (inside(point)) candidates.add(Math.round(point));
    }
  }
  const positions = [...candidates].filter((point) => !isForbidden(point, blocked)).sort((a, b) => a - b);
  for (let count = 1; count <= rules.maxSeams; count++) {
    for (const cuts of splitCombinations(positions, count, origin, end, rules.minPart)) {
      const bounds = [origin, ...cuts, end];
      if (bounds.slice(1).some((value, index) => value - bounds[index] > maxLength)) continue;
      const seams = cuts.map((at) => {
        const throughHob = hob && at >= hobStart && at <= hobEnd && hobCrossStart < crossEnd && hobCrossEnd > crossStart;
        const full = crossEnd - crossStart;
        const joinLength = throughHob ? Math.max(0, full - (Math.min(crossEnd, hobCrossEnd) - Math.max(crossStart, hobCrossStart))) : full;
        return horizontal
          ? { sourceId: surface.sourceId ?? surface.id, axis, at, kind: 'across', x1: at, y1: crossStart, x2: at, y2: crossEnd, joinLength }
          : { sourceId: surface.sourceId ?? surface.id, axis, at, kind: 'across', x1: crossStart, y1: at, x2: crossEnd, y2: at, joinLength };
      });
      options.push({
        parts: buildSplitParts(surface, cuts, hob, axis),
        seams,
        cutCount: count,
        seamLength: seams.reduce((sum, seam) => sum + seam.joinLength, 0),
        hobEdgePenalty: hob ? cuts.reduce((sum, at) => sum + Math.min(Math.abs(at - hobStart), Math.abs(at - hobEnd)), 0) : 0,
        key: `${surface.id}-${cuts.join('-')}`,
        fits: true,
      });
    }
  }
  return options;
}

/**
 * Планы разреза всего эскиза. Базовый план — каждая полоса в самом простом допустимом виде
 * (целиком, если помещается, иначе с наименьшим числом стыков). Остальные планы меняют одну полосу.
 */
function generateSplitPlans(strips, crossSeams, shapes, slab, rules) {
  const optionsBy = strips.map((strip) => lengthOptions(strip, shapes, slab, rules));
  const cutsOf = (option) => option.seams.map((seam) => seam.at).join(',');
  const simplest = (options) => {
    const fitting = options.filter((o) => o.fits);
    const index = options.findIndex((option) => option.fits && option.cutCount === Math.min(...fitting.map((o) => o.cutCount)));
    return index >= 0 ? index : 0;
  };
  // Полосы одной детали (после продольного стыка) режем поперёк в одном месте — стык идёт одной линией.
  const firstOfSource = new Map();
  const baseIndex = optionsBy.map((options, i) => {
    const sourceId = strips[i].sourceId ?? strips[i].id;
    const first = firstOfSource.get(sourceId);
    if (first === undefined) { firstOfSource.set(sourceId, i); return simplest(options); }
    return -1; // выберем ниже, когда известен вариант первой полосы
  });
  const aligned = (i, mainOption) => {
    const index = optionsBy[i].findIndex((option) => option.fits && cutsOf(option) === cutsOf(mainOption));
    return index >= 0 ? index : simplest(optionsBy[i]);
  };
  baseIndex.forEach((index, i) => {
    if (index !== -1) return;
    const main = firstOfSource.get(strips[i].sourceId ?? strips[i].id);
    baseIndex[i] = aligned(i, optionsBy[main][baseIndex[main]]);
  });
  const crossLength = crossSeams.reduce((sum, seam) => sum + seam.joinLength, 0);
  const build = (choice) => {
    const chosen = choice.map((index, i) => optionsBy[i][index]);
    const seams = [...crossSeams, ...chosen.flatMap((option) => option.seams)];
    // Сколько деталей разрезаны поперёк по-разному на своих полосах (стык «лесенкой») — такие планы хуже.
    const cutsBySource = new Map();
    chosen.forEach((option, i) => {
      const sourceId = strips[i].sourceId ?? strips[i].id;
      cutsBySource.set(sourceId, [...(cutsBySource.get(sourceId) || []), cutsOf(option)]);
    });
    const misaligned = [...cutsBySource.values()].filter((list) => new Set(list).size > 1).length;
    return {
      misaligned,
      parts: chosen.flatMap((option) => option.parts),
      seams,
      // Стык, который проходит одной линией через несколько полос, считаем одним.
      cutCount: new Set(seams.map((seam) => `${seam.sourceId}|${seam.axis}|${seam.at}`)).size,
      seamLength: crossLength + chosen.reduce((sum, option) => sum + option.seamLength, 0),
      hobEdgePenalty: chosen.reduce((sum, option) => sum + option.hobEdgePenalty, 0),
      key: chosen.map((option) => option.key).join('|') || 'whole',
    };
  };
  const plans = [build(baseIndex)];
  const seen = new Set([plans[0].key]);
  const add = (choice) => {
    const plan = build(choice);
    if (!seen.has(plan.key)) { seen.add(plan.key); plans.push(plan); }
  };
  optionsBy.forEach((options, i) => options.forEach((option, index) => {
    if (index === baseIndex[i]) return;
    add(baseIndex.map((base, j) => (j === i ? index : base)));
    // Тот же разрез и для остальных полос этой детали.
    const sourceId = strips[i].sourceId ?? strips[i].id;
    if (firstOfSource.get(sourceId) === i) {
      add(baseIndex.map((base, j) => (j === i ? index : (strips[j].sourceId ?? strips[j].id) === sourceId ? aligned(j, option) : base)));
    }
  }));
  return plans;
}

const orderArea = (order) => order.boards.reduce((sum, board) => sum + board.width * board.height, 0);
// Сколько целых листов максимум предлагаем, если комплектов из pricing.js не хватило.
const MAX_FULL_SLABS = 10;
function availableOrders(slab) {
  if (slab.orders?.length) {
    // Свои комплекты из pricing.js, а дальше — целые листы, пока их число не превысит самый большой комплект.
    const custom = [...slab.orders].sort((a, b) => orderArea(a) - orderArea(b));
    const largest = Math.max(...custom.map(orderArea));
    const extra = fullSlabOrders(slab).filter((order) => orderArea(order) > largest);
    return [...custom, ...extra];
  }
  return fullSlabOrders(slab);
}
function fullSlabOrders(slab) {
  return Array.from({ length: MAX_FULL_SLABS }, (_, index) => {
    const count = index + 1;
    return {
      id: 'full-' + count,
      label: count + (count === 1 ? ' лист' : count < 5 ? ' листа' : ' листов'),
      description: count + ' × ' + slab.width + ' × ' + slab.height + ' мм',
      boards: Array.from({ length: count }, () => ({ width: slab.width, height: slab.height, format: 'Полный лист' })),
    };
  });
}

// Длина общей границы двух прямоугольников, если между ними не больше зазора gap (рез пилы).
function sharedEdge(a, b, gap) {
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (overlapY > 0 && dx >= 0 && dx <= gap + 1) return overlapY;
  if (overlapX > 0 && dy >= 0 && dy <= gap + 1) return overlapX;
  return 0;
}

// Сколько периметра детали прилегает к краю рабочей зоны листа и к уже уложенным деталям.
// Чем больше, тем плотнее раскладка и тем цельнее остаётся обрезок.
function contactScore(rect, board, slab) {
  const left = slab.margin, top = slab.margin, right = board.width - slab.margin, bottom = board.height - slab.margin;
  let score = 0;
  if (rect.x <= left + 1) score += rect.h;
  if (rect.y <= top + 1) score += rect.w;
  if (rect.x + rect.w >= right - 1) score += rect.h;
  if (rect.y + rect.h >= bottom - 1) score += rect.w;
  for (const piece of board.pieces) score += sharedEdge(rect, piece, slab.kerf);
  return score;
}

/**
 * Стратегии укладки. Каждая — порядок деталей и правило выбора места.
 * Раскладку собираем всеми стратегиями и берём лучшую по итогу (см. layoutScore), а не по первой подходящей щели.
 *  - bssf: место, где деталь плотнее всего входит в свободную область (по короткой стороне);
 *  - contact: место с наибольшим прилеганием к краям и соседям — узкие полосы встают вплотную к деталям;
 *  - bl: левее-выше — свободным остаётся цельный правый край листа.
 */
const PART_ORDERS = {
  area: (a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h),
  long: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
  short: (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.w * b.h - a.w * a.h,
};
const PLACE_RULES = {
  bssf: (a, b) => a.shortSideFit - b.shortSideFit || a.longSideFit - b.longSideFit || a.areaWaste - b.areaWaste,
  contact: (a, b) => b.contact - a.contact || a.shortSideFit - b.shortSideFit || a.slot.y - b.slot.y || a.slot.x - b.slot.x,
  bl: (a, b) => a.boardIndex - b.boardIndex || a.slot.x - b.slot.x || a.slot.y - b.slot.y || a.shortSideFit - b.shortSideFit,
};
// Быстрый набор — для перебора вариантов разреза; полный — для окончательной раскладки выбранных вариантов.
const QUICK_STRATEGIES = [{ sort: 'area', place: 'bssf' }, { sort: 'area', place: 'contact' }];
const STRATEGIES = Object.keys(PART_ORDERS).flatMap(sort => Object.keys(PLACE_RULES).map(place => ({ sort, place })));
// Полосы вокруг варочной панели дополнительно пробуем уложить строго вдоль или строго поперёк листа:
// жадный выбор места сам по себе часто кладёт их вдоль нижнего края, хотя вертикально рядом с деталью они легли бы компактнее.
const STRIP_STRATEGIES = STRATEGIES.flatMap(strategy => ['any', 'vertical', 'horizontal'].map(strips => ({ ...strategy, strips })));

// Полосы одной секции (вокруг варочной панели) укладываем подряд, сразу после самой крупной детали группы.
function orderParts(parts, compare) {
  const sorted = [...parts].sort(compare);
  const result = [];
  const used = new Set();
  for (const part of sorted) {
    if (used.has(part)) continue;
    const group = part.packGroup ? sorted.filter(item => item.packGroup === part.packGroup) : [part];
    group.forEach(item => { used.add(item); result.push(item); });
  }
  return result;
}

function packOrder(parts, order, slab, strategy = STRATEGIES[0]) {
  const boards = order.boards.map((format, index) => ({
    ...format,
    index,
    pieces: [],
    freeRects: [{ x: slab.margin, y: slab.margin, w: format.width - 2 * slab.margin, h: format.height - 2 * slab.margin }],
  }));
  const unplaced = [];
  const placeRule = PLACE_RULES[strategy.place];

  for (const part of orderParts(parts, PART_ORDERS[strategy.sort])) {
    const options = [];
    boards.forEach(board => {
      const orientations = [
        { w: part.w, h: part.h, rotated: false },
        { w: part.h, h: part.w, rotated: true },
      ].filter((item, index, all) => item.w > 0 && item.h > 0 && item.w <= board.width - 2 * slab.margin && item.h <= board.height - 2 * slab.margin && all.findIndex(other => other.w === item.w && other.h === item.h) === index)
        .filter((item, index, all) => !part.packGroup || !strategy.strips || strategy.strips === 'any' || all.length < 2 || (strategy.strips === 'vertical' ? item.h >= item.w : item.w >= item.h));
      const groupKey = part.packGroup || part.sourceId;
      const related = board.pieces.filter(piece => (piece.packGroup || piece.sourceId) === groupKey);
      const hasRelatedElsewhere = boards.some(candidate => candidate !== board && candidate.pieces.some(piece => (piece.packGroup || piece.sourceId) === groupKey));
      for (const orientation of orientations) {
        const locations = [];
        for (const free of board.freeRects) {
          if (orientation.w > free.w || orientation.h > free.h) continue;
          const xs = [...new Set([free.x, free.x + free.w - orientation.w])];
          const ys = [...new Set([free.y, free.y + free.h - orientation.h])];
          xs.forEach(x => ys.forEach(y => locations.push({ x, y })));
        }
        related.forEach(piece => locations.push(
          { x: piece.x + piece.w + slab.kerf, y: piece.y },
          { x: piece.x - orientation.w - slab.kerf, y: piece.y },
          { x: piece.x, y: piece.y + piece.h + slab.kerf },
          { x: piece.x, y: piece.y - orientation.h - slab.kerf },
        ));
        for (const location of locations) {
          const free = board.freeRects.find(rect => location.x >= rect.x && location.y >= rect.y && location.x + orientation.w <= rect.x + rect.w && location.y + orientation.h <= rect.y + rect.h);
          if (!free || location.x < slab.margin || location.y < slab.margin || location.x + orientation.w > board.width - slab.margin || location.y + orientation.h > board.height - slab.margin) continue;
          const placedRect = { ...location, w: orientation.w, h: orientation.h };
          if (board.pieces.some(piece => rectangleGap(placedRect, piece) < slab.kerf)) continue;
          const spareW = free.w - orientation.w;
          const spareH = free.h - orientation.h;
          const sourceAnchor = related.reduce((best, piece) => Math.min(best, rectangleGap(placedRect, piece)), Infinity);
          options.push({
            board,
            free,
            slot: { ...orientation, ...location },
            // Части одной детали держим рядом и одинаково повёрнутыми — так их проще стыковать.
            relatedPenalty: related.length ? Math.round(sourceAnchor / 50) : hasRelatedElsewhere ? 100000 : 0,
            groupRotationPenalty: related.length && orientation.rotated !== related[0].rotated ? 1 : 0,
            shortSideFit: Math.min(spareW, spareH),
            longSideFit: Math.max(spareW, spareH),
            areaWaste: free.w * free.h - orientation.w * orientation.h,
            contact: contactScore(placedRect, board, slab),
            boardIndex: board.index,
            boardArea: board.width * board.height,
          });
        }
      }
    });
    options.sort((a, b) => a.relatedPenalty - b.relatedPenalty || a.groupRotationPenalty - b.groupRotationPenalty || placeRule(a, b) || a.boardArea - b.boardArea);

    const choice = options[0];
    if (!choice) {
      unplaced.push(part);
      continue;
    }
    const { board, slot } = choice;
    board.pieces.push({ ...part, w: slot.w, h: slot.h, x: slot.x, y: slot.y, rotated: slot.rotated });
    // Занятая зона — деталь плюс пропил справа и снизу (если за ними ещё есть место).
    const padded = {
      x: slot.x,
      y: slot.y,
      w: Math.min(board.width - slab.margin - slot.x, slot.w + slab.kerf),
      h: Math.min(board.height - slab.margin - slot.y, slot.h + slab.kerf),
    };
    board.freeRects = splitFreeRectangles(board.freeRects, padded);
  }
  const score = layoutScore(boards);
  boards.forEach(board => delete board.freeRects);
  return { boards, unplaced, score };
}

/**
 * Оценка готовой раскладки: самый большой цельный обрезок на каждом листе (его можно пустить в дело)
 * и компактность — площадь прямоугольника, охватывающего детали.
 */
function layoutScore(boards) {
  let offcut = 0, spread = 0;
  for (const board of boards) {
    offcut += board.freeRects.reduce((best, rect) => Math.max(best, rect.w * rect.h), 0);
    if (!board.pieces.length) continue;
    const right = Math.max(...board.pieces.map(piece => piece.x + piece.w));
    const bottom = Math.max(...board.pieces.map(piece => piece.y + piece.h));
    spread += right * bottom;
  }
  // Полосы одной секции на разных листах — плохо: их стыкуют между собой.
  const groupBoards = new Map();
  boards.forEach(board => board.pieces.forEach(piece => { if (piece.packGroup) groupBoards.set(piece.packGroup, new Set([...(groupBoards.get(piece.packGroup) || []), board.index])) }));
  const splitGroups = [...groupBoards.values()].filter(set => set.size > 1).length;
  return { offcut, spread, splitGroups };
}

// Обрезки, отличающиеся меньше чем на 5%, считаем равными — тогда выигрывает более компактная раскладка
// (иначе узкая полоса, растянутая вдоль края листа, «выигрывает» пару процентов обрезка и портит раскрой).
function betterLayout(a, b) {
  if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length;
  if (a.score.splitGroups !== b.score.splitGroups) return a.score.splitGroups < b.score.splitGroups;
  const diff = a.score.offcut - b.score.offcut;
  if (Math.abs(diff) > 0.05 * Math.max(a.score.offcut, b.score.offcut)) return diff > 0;
  if (a.score.spread !== b.score.spread) return a.score.spread < b.score.spread;
  return diff > 0;
}

// Лучшая раскладка деталей на заданный комплект листов из всех стратегий.
function packBest(parts, order, slab, strategies = parts.some(part => part.packGroup) ? STRIP_STRATEGIES : STRATEGIES) {
  let best = null;
  for (const strategy of strategies) {
    const packed = packOrder(parts, order, slab, strategy);
    if (!best || betterLayout(packed, best)) best = packed;
  }
  return best;
}

/**
 * Раскрой эскиза на листы.
 * shapes — детали (type 'rect') и вырезы (sink, hob, circle, cutout); slab — лист материала из pricing.js.
 * Возвращает выбранный (лучший) вариант и список вариантов: без стыков / 1 стык / 2 стыка …
 * feasible = false, если детали не удалось разложить ни в одном варианте.
 */
export function calculateNesting(shapes, slab, rules = DEFAULT_RULES) {
  rules = { ...DEFAULT_RULES, ...rules };
  const surfaces = shapes.filter(shape => shape.type === 'rect' && shape.w > 0 && shape.h > 0);
  const total = surfaces.reduce((sum, shape) => sum + shape.w * shape.h, 0);
  if (!surfaces.length) {
    return { feasible: false, count: 0, boards: [], total: 0, purchasedArea: 0, efficiency: 0, order: null, seams: [], unplaced: [], variants: [], note: 'Нарисуйте детали столешницы.' };
  }

  // Шаг 1: продольный разрез деталей, которые шире листа.
  const strips = [];
  const crossSeams = [];
  const warnings = [];
  for (const surface of surfaces) {
    const split = splitAcross(surface, shapes, slab, rules);
    strips.push(...split.strips);
    crossSeams.push(...split.seams);
    if (split.failed) warnings.push(`«${surface.name}»: не удалось поставить продольный стык в обход мойки и вырезов.`);
  }

  const orders = availableOrders(slab);
  const candidates = generateSplitPlans(strips, crossSeams, shapes, slab, rules);
  const bestByCutCount = new Map();
  for (const candidate of candidates) {
    const parts = candidate.parts.map(part => ({
      ...part,
      sourceId: part.sourceId ?? part.id,
      sourceX: part.sourceX ?? part.x,
      sourceY: part.sourceY ?? part.y,
      sourceW: part.sourceW ?? part.w,
      sourceH: part.sourceH ?? part.h,
    })).sort((a, b) => {
      const area = b.w * b.h - a.w * a.h;
      return area || Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });
    let packed = null;
    for (const order of orders) {
      packed = { order, ...packBest(parts, order, slab, QUICK_STRATEGIES) };
      if (!packed.unplaced.length) break;
    }
    if (!packed || packed.unplaced.length) continue;
    const purchasedArea = packed.order.boards.reduce((sum, board) => sum + board.width * board.height, 0);
    const plan = { ...candidate, ...packed, purchasedArea, packParts: parts, total };
    const previous = bestByCutCount.get(candidate.cutCount);
    if (!previous || plan.misaligned < previous.misaligned || (plan.misaligned === previous.misaligned && plan.purchasedArea < previous.purchasedArea) || (plan.misaligned === previous.misaligned && (plan.purchasedArea === previous.purchasedArea && (plan.seamLength < previous.seamLength || (plan.seamLength === previous.seamLength && plan.hobEdgePenalty < previous.hobEdgePenalty))))) {
      bestByCutCount.set(candidate.cutCount, plan);
    }
  }

  const variants = [...bestByCutCount.values()]
    .sort((a, b) => a.cutCount - b.cutCount || a.purchasedArea - b.purchasedArea || a.seamLength - b.seamLength)
    .slice(0, 3)
    .map((plan, index) => ({
      ...plan,
      id: plan.key,
      label: plan.cutCount === 0 ? 'Без стыков' : `${plan.cutCount} ${plan.cutCount === 1 ? 'стык' : plan.cutCount < 5 ? 'стыка' : 'стыков'}`,
      index: index + 1,
    }));

  if (!variants.length) {
    return {
      feasible: false, count: 0, boards: [], total, purchasedArea: 0, efficiency: 0, order: null, seams: [], unplaced: surfaces, variants: [], warnings,
      note: 'Детали не помещаются на листы этого материала даже со стыками. Уменьшите размеры или разделите деталь на эскизе.',
    };
  }

  // Окончательная раскладка выбранных вариантов — перебором всех стратегий; заодно проверяем, не хватит ли меньшего комплекта листов.
  for (const plan of variants) {
    for (const order of orders) {
      const area = order.boards.reduce((sum, board) => sum + board.width * board.height, 0);
      if (area > plan.purchasedArea) break;
      const packed = packBest(plan.packParts, order, slab);
      if (!packed.unplaced.length) { Object.assign(plan, packed, { order, purchasedArea: area }); break; }
    }
    delete plan.packParts;
    delete plan.score;
    delete plan.parts;
    let pieceIndex = 0;
    plan.boards.forEach(board => board.pieces.forEach(piece => {
      piece.tag ||= alphabet[pieceIndex % alphabet.length];
      piece.label = piece.detailLabel || piece.name;
      pieceIndex += 1;
    }));
    plan.count = plan.order.boards.length;
    plan.efficiency = plan.purchasedArea ? Math.min(100, Math.round(total / plan.purchasedArea * 100)) : 0;
    plan.feasible = true;
    plan.warnings = warnings;
    const along = plan.seams.filter(seam => seam.kind === 'along').length;
    plan.note = `${plan.label}${along ? ` (продольных — ${along})` : ''}: закупка ${plan.order.label.toLowerCase()}, длина стыков около ${Math.round(plan.seamLength)} мм.`;
  }
  return { ...variants[0], variants };
}
