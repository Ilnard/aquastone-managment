// Справочник «Клей по декорам»: какой клей основной для декора и какой можно взять вместо него.
// Общий для сервера (стартовое заполнение базы) и демо-версии в браузере.

export const DECOR_MATERIALS = ['Кварц', 'Акрил']

/** Стартовые позиции — по 5 на группу, остальное менеджер добавит сам. */
export const DECOR_GLUE_SEEDS = [
  { material: 'Кварц', brand: 'Avant', decor: '1000', mainGlue: 'A-White', altGlue: '' },
  { material: 'Кварц', brand: 'Avant', decor: '1012', mainGlue: 'A-White', altGlue: '' },
  { material: 'Кварц', brand: 'Avant', decor: '1111', mainGlue: 'A-White', altGlue: 'S-White' },
  { material: 'Кварц', brand: 'Avant', decor: '5751', mainGlue: 'S-White', altGlue: 'N-White' },
  { material: 'Кварц', brand: 'Avant', decor: '5752', mainGlue: 'S-White', altGlue: 'N-White' },
  { material: 'Кварц', brand: 'Grandex', decor: 'R112 Соль Каспия', mainGlue: 'A-White', altGlue: '' },
  { material: 'Кварц', brand: 'Grandex', decor: 'R122 Алмазы Якутии', mainGlue: 'W-Ivory', altGlue: '' },
  { material: 'Кварц', brand: 'Grandex', decor: 'R104 Белая Тайга', mainGlue: 'A-White', altGlue: '' },
  { material: 'Кварц', brand: 'Grandex', decor: 'R515 Вулканы Камчатки', mainGlue: 'W-Ivory', altGlue: '' },
  { material: 'Кварц', brand: 'Grandex', decor: 'R403 Скалы Карелии', mainGlue: 'M-Gray', altGlue: '' },
  { material: 'Акрил', brand: 'Neonarm', decor: 'N-010', mainGlue: 'G-White', altGlue: '' },
  { material: 'Акрил', brand: 'Neonarm', decor: 'N-101', mainGlue: 'S-White', altGlue: '' },
  { material: 'Акрил', brand: 'Neonarm', decor: 'N-103', mainGlue: 'Gray', altGlue: '' },
  { material: 'Акрил', brand: 'Neonarm', decor: 'N-159', mainGlue: 'G-Sky', altGlue: '' },
  { material: 'Акрил', brand: 'Neonarm', decor: 'N-420', mainGlue: 'H-Gray', altGlue: '' },
  { material: 'Акрил', brand: 'Grandex', decor: 'P-101', mainGlue: 'Y-Ivory', altGlue: '' },
  { material: 'Акрил', brand: 'Grandex', decor: 'P-104', mainGlue: 'G-White', altGlue: '' },
  { material: 'Акрил', brand: 'Grandex', decor: 'S-201', mainGlue: 'H-Gray', altGlue: '' },
  { material: 'Акрил', brand: 'Grandex', decor: 'A-401', mainGlue: 'Magic', altGlue: '' },
  { material: 'Акрил', brand: 'Grandex', decor: 'M-605', mainGlue: 'C-Onyx', altGlue: '' },
]

const clean = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Проверка позиции: { value } — очищенные поля или { error } — что не так. */
export function normalizeDecorGlue(input = {}) {
  const value = {
    material: clean(input.material, 40),
    brand: clean(input.brand, 60),
    decor: clean(input.decor),
    mainGlue: clean(input.mainGlue, 60),
    altGlue: clean(input.altGlue, 60),
    note: clean(input.note, 300),
  }
  if (!value.material) return { error: 'Укажите материал.' }
  if (!value.brand) return { error: 'Укажите бренд.' }
  if (!value.decor) return { error: 'Укажите декор.' }
  if (!value.mainGlue) return { error: 'Укажите основной клей.' }
  if (value.altGlue && value.altGlue.toLocaleLowerCase('ru') === value.mainGlue.toLocaleLowerCase('ru')) return { error: 'Альтернативный клей совпадает с основным.' }
  return { value }
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })
/** Порядок: материал, бренд, декор (номера — по возрастанию). */
export const sortDecorGlues = (items) => [...items].sort((a, b) => collator.compare(a.material, b.material) || collator.compare(a.brand, b.brand) || collator.compare(a.decor, b.decor))
