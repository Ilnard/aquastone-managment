// Телефоны в формате +7 (999) 888-77-66 — общие для интерфейса и сервера.

/** Привести номер к виду +7 (999) 888-77-66 (по мере ввода — частично). */
export function formatRussianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  const national = (digits[0] === '8' || digits[0] === '7' ? digits.slice(1) : digits).slice(0, 10)
  if (!national) return '+7'
  return '+7 (' + national.slice(0, 3) + (national.length >= 3 ? ')' : '') + (national.length > 3 ? ' ' + national.slice(3, 6) : '') + (national.length > 6 ? '-' + national.slice(6, 8) : '') + (national.length > 8 ? '-' + national.slice(8, 10) : '')
}

/** Удаление цифр Backspace/Delete в отформатированном номере: скобки и дефисы пропускаются. */
export function handleRussianPhoneKeyDown(event, value, onChange) {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return
  const input = event.currentTarget
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? start
  const digits = String(value || '').replace(/\D/g, '')
  const positions = [...String(value || '')].reduce((list, char, index) => { if (/\d/.test(char)) list.push(index); return list }, [])
  let removeIndexes = []
  if (start !== end) {
    removeIndexes = positions.map((position, index) => ({ position, index })).filter(({ position, index }) => position >= start && position < end && (index > 0 || start === 0)).map(({ index }) => index)
  } else if (event.key === 'Backspace') {
    const index = positions.findLastIndex((position, digitIndex) => position < start && digitIndex > 0)
    if (index >= 0) removeIndexes = [index]
  } else {
    const index = positions.findIndex((position, digitIndex) => position >= start && digitIndex > 0)
    if (index >= 0) removeIndexes = [index]
  }
  if (!removeIndexes.length) return
  event.preventDefault()
  const removeSet = new Set(removeIndexes)
  const nextDigits = [...digits].filter((_, index) => !removeSet.has(index)).join('')
  const nextValue = formatRussianPhone(nextDigits)
  const deletedBeforeCaret = removeIndexes.filter((index) => positions[index] < start).length
  const keepDigitsBeforeCaret = Math.max(0, [...String(value || '').slice(0, start)].filter((char) => /\d/.test(char)).length - deletedBeforeCaret)
  onChange(nextValue)
  requestAnimationFrame(() => {
    const formattedPositions = [...nextValue].reduce((list, char, index) => { if (/\d/.test(char)) list.push(index); return list }, [])
    const caret = keepDigitsBeforeCaret > 0 ? (formattedPositions[keepDigitsBeforeCaret - 1] ?? -1) + 1 : 0
    input.setSelectionRange(caret, caret)
  })
}
