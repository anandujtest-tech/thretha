import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_HOME_SECTION_ORDER, DEFAULT_HOME_SECTION_VISIBILITY, HOME_SECTIONS, getVisibleHomeSectionIds, isValidHomeSectionOrderInput, isValidHomeSectionVisibilityInput, normalizeHomeSectionOrder, normalizeHomeSectionVisibility } from '../lib/homeLayout.js'

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

test('all registered sections are visible by default for older saved layouts', () => {
  assert.deepEqual(normalizeHomeSectionVisibility(undefined), DEFAULT_HOME_SECTION_VISIBILITY)
  assert.deepEqual(getVisibleHomeSectionIds(['newsletter', 'hero'], undefined), normalizeHomeSectionOrder(['newsletter', 'hero']))
})

test('saved visibility hides only known sections without changing their order', () => {
  const visibility = normalizeHomeSectionVisibility({ hero: false, newsletter: false, deleted: false })
  assert.equal(visibility.hero, false)
  assert.equal(visibility.newsletter, false)
  assert.equal(visibility.filters, true)
  assert.equal(Object.hasOwn(visibility, 'deleted'), false)
  const rendered = getVisibleHomeSectionIds(['newsletter', 'hero', 'filters'], visibility)
  assert.equal(rendered.includes('hero'), false)
  assert.equal(rendered.includes('newsletter'), false)
  assert.equal(rendered[0], 'filters')
  assert.equal(rendered.length, DEFAULT_HOME_SECTION_ORDER.length - 2)
})

test('visibility input is bounded and boolean, and reset restores every section', () => {
  assert.equal(isValidHomeSectionVisibilityInput({ hero: false, unknown: true }), true)
  assert.equal(isValidHomeSectionVisibilityInput({ hero: 'false' }), false)
  assert.equal(isValidHomeSectionVisibilityInput([]), false)
  assert.equal(isValidHomeSectionVisibilityInput(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`key${i}`, true]))), false)
  const resetOrder = [...DEFAULT_HOME_SECTION_ORDER]
  const resetVisibility = { ...DEFAULT_HOME_SECTION_VISIBILITY }
  assert.deepEqual(getVisibleHomeSectionIds(resetOrder, resetVisibility), DEFAULT_HOME_SECTION_ORDER)
})
