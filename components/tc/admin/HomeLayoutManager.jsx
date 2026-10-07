'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import { api, auth } from '@/lib/tc'
import { broadcastStorefrontSettingsChanged } from '@/lib/storefrontEvents'
import { DEFAULT_HOME_SECTION_ORDER, HOME_SECTIONS, normalizeHomeSectionOrder } from '@/lib/homeLayout'

const details = Object.fromEntries(HOME_SECTIONS.map((section) => [section.id, section]))

export default function HomeLayoutManager() {
  const [order, setOrder] = useState(DEFAULT_HOME_SECTION_ORDER)
  const [savedOrder, setSavedOrder] = useState(DEFAULT_HOME_SECTION_ORDER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(null)
  const [message, setMessage] = useState('')
  const dragId = useRef(null)

  useEffect(() => {
    let active = true
    api('/admin/home-layout', { token: auth.get() })
      .then((result) => {
        if (!active) return
        const next = normalizeHomeSectionOrder(result?.section_order)
        setOrder(next)
        setSavedOrder(next)
      })
      .catch((error) => { if (active) setMessage(error.message || 'Could not load the layout.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const move = (fromId, toId) => {
    if (fromId === toId) return
    setOrder((current) => {
      const from = current.indexOf(fromId)
      const to = current.indexOf(toId)
      if (from < 0 || to < 0) return current
      const next = [...current]
      next.splice(from, 1)
      next.splice(to, 0, fromId)
      return next
    })
    setMessage('')
  }

  const moveBy = (id, delta) => {
    const index = order.indexOf(id)
    if (order[index + delta]) move(id, order[index + delta])
  }

  const onPointerMove = (event) => {
    if (!dragId.current) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-home-section-id]')
    if (target) move(dragId.current, target.dataset.homeSectionId)
  }

  const stopDragging = () => {
    dragId.current = null
    setDragging(null)
  }

  const save = async (nextOrder = order) => {
    setSaving(true)
    setMessage('')
    try {
      const result = await api('/admin/home-layout', { method: 'PUT', token: auth.get(), body: { section_order: nextOrder } })
      const normalized = normalizeHomeSectionOrder(result.section_order)
      setOrder(normalized)
      setSavedOrder(normalized)
      setMessage('Layout saved. The homepage will use this order on refresh.')
      broadcastStorefrontSettingsChanged('homepage')
    } catch (error) {
      setMessage(error.message || 'Could not save the layout.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    if (!window.confirm('Reset the homepage sections to their default order?')) return
    const defaults = [...DEFAULT_HOME_SECTION_ORDER]
    setOrder(defaults)
    save(defaults)
  }

  return <div className="max-w-3xl space-y-6">
    <div className="border-b border-ink/10 pb-5">
      <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold-dark">Storefront Configuration</span>
      <h1 className="mt-1 font-display text-4xl text-ink">Home Layout</h1>
      <p className="mt-2 text-sm text-cocoa">Drag the handles to arrange sections. Use the arrow buttons for precise moves. Existing feature settings control whether Shop by Occasion and Instagram appear.</p>
    </div>
    {loading ? <p className="text-sm text-cocoa">Loading homepage layout…</p> : <div className="space-y-2">
      {order.map((id, index) => {
        const section = details[id]
        return <div key={id} data-home-section-id={id} className={`flex min-w-0 items-center gap-2 border bg-cream p-3 transition-colors sm:gap-4 ${dragging === id ? 'border-gold-dark bg-sand/40 shadow-md' : 'border-ink/10'}`}>
          <button type="button" aria-label={`Drag ${section.name}`} onPointerDown={(event) => { dragId.current = id; setDragging(id); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={onPointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging} className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center text-cocoa active:cursor-grabbing" style={{ touchAction: 'none' }}><GripVertical size={20} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{section.name}</p><p className="text-xs text-cocoa">{section.description}</p></div>
          <span className="hidden text-xs tabular-nums text-cocoa sm:block">{index + 1}</span>
          <div className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Move ${section.name} up`} disabled={index === 0} onClick={() => moveBy(id, -1)} className="flex h-10 w-10 items-center justify-center border border-ink/10 text-ink disabled:opacity-30"><ArrowUp size={16} /></button>
            <button type="button" aria-label={`Move ${section.name} down`} disabled={index === order.length - 1} onClick={() => moveBy(id, 1)} className="flex h-10 w-10 items-center justify-center border border-ink/10 text-ink disabled:opacity-30"><ArrowDown size={16} /></button>
          </div>
        </div>
      })}
    </div>}
    {message && <p role="status" className="text-sm text-cocoa">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={loading || saving} onClick={reset} className="flex min-h-11 items-center gap-2 border border-ink/20 px-4 text-xs font-semibold uppercase tracking-wider text-ink disabled:opacity-50"><RotateCcw size={15} /> Reset to Default</button>
      <button type="button" disabled={loading || saving || order.join('|') === savedOrder.join('|')} onClick={() => save()} className="min-h-11 bg-ink px-5 text-xs font-semibold uppercase tracking-wider text-cream disabled:opacity-50">{saving ? 'Saving…' : 'Save Layout'}</button>
    </div>
  </div>
}
