// Права ролей: сервер проверяет каждое сохранение по этим правилам. Запуск: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forbiddenFields, stageChangeError } from '../src/permissions.js'
import { normalizeContact, normalizeProject } from '../src/requests.js'

const process = {
  stage: 'Фрезеровка/Распил', stageStatus: 'Не готов', client: 'Иванов', manager: 'Менеджер М', cncOperator: 'Петров',
  items: [{ product: 'Столешница для кухни', material: 'Акрил', decor: 'X', glue: 'A' }],
}

test('рядовые роли не меняют клиента и менеджера', () => {
  for (const role of ['Монтажник', 'ЧПУ', 'Замерщик', 'Технолог', 'Обработчик']) {
    const forbidden = forbiddenFields([role], ['client', 'manager'], [], { previous: process, next: { ...process, client: 'Другой' } })
    assert.deepEqual(forbidden.sort(), ['client', 'manager'], role)
  }
})

test('менеджер может менять клиента', () => {
  assert.deepEqual(forbiddenFields(['Менеджер'], ['client'], [], { previous: process, next: { ...process, client: 'Другой' } }), [])
})

test('монтажник не закрывает процесс', () => {
  assert.ok(stageChangeError(['Монтажник'], 'Сидоров', process, { ...process, stage: 'Завершён', stageStatus: null }))
})

test('ЧПУ отмечает «Готов» только у своего процесса', () => {
  assert.ok(stageChangeError(['ЧПУ'], 'Другой', process, { ...process, stageStatus: 'Готов' }))
  assert.equal(stageChangeError(['ЧПУ'], 'Петров', process, { ...process, stageStatus: 'Готов' }), null)
})

test('монтаж «Готов» — только с фотоотчётом', () => {
  const installing = { ...process, stage: 'Монтаж', stageStatus: 'Не готов', installers: ['Сидоров'] }
  assert.match(stageChangeError(['Менеджер'], 'М', installing, { ...installing, stageStatus: 'Готов' }, { photoCount: 0 }), /фото/)
  assert.equal(stageChangeError(['Менеджер'], 'М', installing, { ...installing, stageStatus: 'Готов' }, { photoCount: 1 }), null)
})

test('заявка: сумма и площадь из браузера не принимаются', () => {
  const { value } = normalizeProject({ material: 'quartz', shapes: [{ type: 'rect', x: 0, y: 0, w: 1000, h: 600 }], estimate: 1, summary: { area: 999 } })
  assert.equal(value.estimate, 0)
  assert.equal(value.summary.area, 0)
})

test('заявка: телефон и ФИО обязательны', () => {
  assert.ok(normalizeContact({ name: 'И', phone: '+79991234567' }).error)
  assert.ok(normalizeContact({ name: 'Иван', phone: '+7999123' }).error)
  assert.equal(normalizeContact({ name: 'Иван', phone: '89991234567' }).value.phone, '+7 (999) 123-45-67')
})
