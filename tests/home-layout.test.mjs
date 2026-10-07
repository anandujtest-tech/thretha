import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_HOME_SECTION_ORDER, HOME_SECTIONS, isValidHomeSectionOrderInput, normalizeHomeSectionOrder } from '../lib/homeLayout.js'

test('homepage registry has unique stable IDs and the requested default discovery order', () => {
  assert.equal(new Set(HOME_SECTIONS.map((section) => section.id)).size, HOME_SECTIONS.length)
  const ids = DEFAULT_HOME_SECTION_ORDER
  assert.deepEqual(ids.slice(ids.indexOf('silhouette'), ids.indexOf('new_arrivals') + 1), ['silhouette', 'filters', 'new_arrivals'])
})

test('saved homepage order drops unknown and duplicate IDs and appends missing sections', () => {
  const normalized = normalizeHomeSectionOrder(['new_arrivals', 'hero', 'deleted', 'new_arrivals'])
  assert.deepEqual(normalized.slice(0, 2), ['new_arrivals', 'hero'])
  assert.equal(normalized.includes('deleted'), false)
  assert.equal(normalized.length, DEFAULT_HOME_SECTION_ORDER.length)
  assert.deepEqual(new Set(normalized), new Set(DEFAULT_HOME_SECTION_ORDER))
})

test('invalid homepage layouts fall back to defaults', () => {
  assert.deepEqual(normalizeHomeSectionOrder(null), DEFAULT_HOME_SECTION_ORDER)
  assert.deepEqual(normalizeHomeSectionOrder('hero'), DEFAULT_HOME_SECTION_ORDER)
  assert.deepEqual(normalizeHomeSectionOrder(['deleted']), DEFAULT_HOME_SECTION_ORDER)
})

test('write input must be a bounded array of section IDs', () => {
  assert.equal(isValidHomeSectionOrderInput(['hero', 'unknown', 'hero']), true)
  assert.equal(isValidHomeSectionOrderInput('hero'), false)
  assert.equal(isValidHomeSectionOrderInput(['hero', null]), false)
  assert.equal(isValidHomeSectionOrderInput(Array(51).fill('hero')), false)
})
