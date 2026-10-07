'use client'

import { useCallback, useEffect, useState } from 'react'
import { api, auth } from '@/lib/tc'

const EMPTY_DRAFT = { subject: '', preview_text: '', audience: 'active', blocks: [{ type: 'heading', text: '' }, { type: 'paragraph', text: '' }] }
const ACTIVE = new Set(['QUEUED', 'SENDING'])
const dateLabel = (value) => value ? new Date(value).toLocaleString() : '—'
const blockLabel = { heading: 'Heading', paragraph: 'Paragraph', image: 'Image', button: 'Button / link', divider: 'Divider' }

export default function NewsletterCampaignManager() {
  const [campaigns, setCampaigns] = useState([])
  const [recipientCount, setRecipientCount] = useState(0)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [draftId, setDraftId] = useState('')
  const [editing, setEditing] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewWidth, setPreviewWidth] = useState('desktop')
  const [confirmCount, setConfirmCount] = useState(null)
  const [selected, setSelected] = useState(null)
  const [failures, setFailures] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const [history, audience] = await Promise.all([
      api('/admin/newsletter-campaigns', { token: auth.get() }),
      api('/admin/newsletter-campaigns/audience', { token: auth.get() }),
    ])
    setCampaigns(history.campaigns || [])
    setRecipientCount(audience.recipient_count || 0)
    if (selected?.id) {
      const details = await api(`/admin/newsletter-campaigns/${encodeURIComponent(selected.id)}`, { token: auth.get() })
      setSelected(details.campaign)
      setFailures(details.failures || [])
    }
  }, [selected?.id])

  useEffect(() => { refresh().catch((failure) => setError(failure.message || 'Could not load campaigns.')) }, [refresh])
  useEffect(() => {
    if (!campaigns.some((campaign) => ACTIVE.has(campaign.status))) return
    const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}) }, 15000)
    return () => clearInterval(timer)
  }, [campaigns, refresh])

  const changeDraft = (update) => { setDraft((current) => ({ ...current, ...update })); setPreviewHtml(''); setConfirmCount(null) }
  const changeBlock = (index, update) => changeDraft({ blocks: draft.blocks.map((block, at) => at === index ? { ...block, ...update } : block) })
  const addBlock = (type) => changeDraft({ blocks: [...draft.blocks, type === 'divider' ? { type } : type === 'image' ? { type, url: '', alt: '' } : type === 'button' ? { type, text: '', url: '' } : { type, text: '' }] })
  const saveDraft = async () => {
    const result = await api(draftId ? `/admin/newsletter-campaigns/${encodeURIComponent(draftId)}` : '/admin/newsletter-campaigns', {
      method: draftId ? 'PATCH' : 'POST', body: draft, token: auth.get(),
    })
    setDraftId(result.campaign.id)
    await refresh()
    return result.campaign
  }
  const run = async (task) => {
    setBusy(true); setError(''); setNotice('')
    try { await task() } catch (failure) { setError(failure.message || 'This action could not be completed.') }
    finally { setBusy(false) }
  }
  const preview = () => run(async () => {
    const result = await api('/admin/newsletter-campaigns/preview', { method: 'POST', body: draft, token: auth.get() })
    setPreviewHtml(result.html)
  })
  const prepareSend = () => run(async () => {
    if (!previewHtml) throw new Error('Preview the email before sending.')
    const saved = await saveDraft()
    const audience = await api('/admin/newsletter-campaigns/audience', { token: auth.get() })
    setRecipientCount(audience.recipient_count || 0)
    if (!audience.recipient_count) throw new Error('No active subscribers available.')
    setDraftId(saved.id)
    setConfirmCount(audience.recipient_count)
  })
  const sendCampaign = () => run(async () => {
    const result = await api(`/admin/newsletter-campaigns/${encodeURIComponent(draftId)}/send`, { method: 'POST', body: {}, token: auth.get() })
    setConfirmCount(null); setEditing(false); setPreviewHtml('')
    setSelected(result.campaign)
    setNotice('Newsletter queued. The protected worker will send it in small batches.')
    await refresh()
  })
  const actOnCampaign = (campaign, action) => run(async () => {
    const result = await api(`/admin/newsletter-campaigns/${encodeURIComponent(campaign.id)}/${action}`, { method: 'POST', body: {}, token: auth.get() })
    setSelected(result.campaign)
    setNotice(action === 'cancel' ? 'Future batches cancelled. Already-sent emails cannot be recalled.' : 'Failed deliveries queued for one controlled retry.')
    await refresh()
  })

  return <section className="space-y-5 border border-ink/10 bg-cream p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">The Thretha Edit</p><h2 className="mt-1 font-display text-3xl text-ink">Newsletter Campaigns</h2><p className="mt-1 text-xs text-cocoa">Recipients: {recipientCount} active subscriber{recipientCount === 1 ? '' : 's'}</p></div>
      <button type="button" onClick={() => { setDraft(structuredClone(EMPTY_DRAFT)); setDraftId(''); setEditing(true); setPreviewHtml(''); setSelected(null); setError(''); setNotice('') }} className="min-h-11 bg-ink px-4 text-[10px] font-bold uppercase tracking-wider text-cream">+ Create Newsletter</button>
    </div>
    {error && <p role="alert" className="border border-coral/20 bg-coral-light/20 p-3 text-xs text-coral">{error}</p>}
    {notice && <p role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}

    {editing && <div className="space-y-5 border-t border-ink/10 pt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink">Email subject<input value={draft.subject} maxLength={180} onChange={(event) => changeDraft({ subject: event.target.value })} className="mt-1 min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm font-normal" /></label>
        <label className="block text-xs font-semibold text-ink">Preview text (optional)<input value={draft.preview_text} maxLength={250} onChange={(event) => changeDraft({ preview_text: event.target.value })} className="mt-1 min-h-11 w-full border border-ink/20 bg-paper px-3 text-sm font-normal" /></label>
      </div>
      <div><p className="text-xs font-semibold text-ink">Audience</p><p className="mt-1 text-xs text-cocoa">Active, consented subscribers · {recipientCount} estimated recipients</p></div>
      <div className="space-y-3"><p className="text-xs font-semibold text-ink">Content</p><p className="text-[11px] text-cocoa">Paragraphs support **bold**, *italic*, and [link text](https://example.com) formatting. Storefront links may start with /product/.</p>
        {draft.blocks.map((block, index) => <div key={index} className="border border-ink/15 bg-paper p-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-cocoa">{blockLabel[block.type]}</span><button type="button" onClick={() => changeDraft({ blocks: draft.blocks.filter((_, at) => at !== index) })} className="text-[10px] text-coral">Remove</button></div>
          {['heading', 'paragraph', 'button'].includes(block.type) && (block.type === 'paragraph' ? <textarea value={block.text} rows={5} onChange={(event) => changeBlock(index, { text: event.target.value })} className="w-full border border-ink/20 bg-cream p-3 text-sm" placeholder="Write your paragraph" /> : <input value={block.text} onChange={(event) => changeBlock(index, { text: event.target.value })} className="min-h-11 w-full border border-ink/20 bg-cream px-3 text-sm" placeholder={block.type === 'heading' ? 'Heading' : 'Button label'} />)}
          {['image', 'button'].includes(block.type) && <label className="mt-2 block text-[11px] text-cocoa">{block.type === 'image' ? 'HTTPS image URL' : 'HTTPS or storefront link'}<input value={block.url} onChange={(event) => changeBlock(index, { url: event.target.value })} className="mt-1 min-h-10 w-full border border-ink/20 bg-cream px-3 text-xs" placeholder={block.type === 'button' ? '/product/your-product' : 'https://...'} /></label>}
          {block.type === 'image' && <label className="mt-2 block text-[11px] text-cocoa">Image description<input value={block.alt} onChange={(event) => changeBlock(index, { alt: event.target.value })} className="mt-1 min-h-10 w-full border border-ink/20 bg-cream px-3 text-xs" /></label>}
        </div>)}
        <div className="flex flex-wrap gap-2">{Object.entries(blockLabel).map(([type, label]) => <button key={type} type="button" onClick={() => addBlock(type)} className="border border-ink/20 px-3 py-2 text-[10px] font-semibold text-ink">+ {label}</button>)}</div>
      </div>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => run(async () => { await saveDraft(); setNotice('Draft saved. No email has been sent.') })} className="min-h-10 border border-ink/20 px-4 text-[10px] font-bold uppercase disabled:opacity-50">Save Draft</button><button type="button" disabled={busy} onClick={preview} className="min-h-10 border border-ink/20 px-4 text-[10px] font-bold uppercase disabled:opacity-50">Preview</button><button type="button" disabled={busy || !previewHtml || recipientCount === 0} onClick={prepareSend} className="min-h-10 bg-ink px-4 text-[10px] font-bold uppercase text-cream disabled:opacity-50">Confirm recipients &amp; send</button></div>
      {previewHtml && <div className="space-y-3"><div className="flex items-center gap-3"><p className="text-xs font-semibold">Actual email preview</p><button type="button" onClick={() => setPreviewWidth('desktop')} className="text-xs underline">Desktop</button><button type="button" onClick={() => setPreviewWidth('mobile')} className="text-xs underline">Mobile</button></div><iframe title="Newsletter email preview" sandbox="" srcDoc={previewHtml} className="mx-auto h-[520px] max-w-full border border-ink/15 bg-white" style={{ width: previewWidth === 'mobile' ? 375 : 700 }} /></div>}
      {confirmCount !== null && <div role="dialog" aria-modal="true" aria-label="Send Newsletter?" className="border-2 border-ink bg-paper p-5 space-y-3"><h3 className="font-display text-2xl">Send Newsletter?</h3><p className="text-sm">Subject: <strong>{draft.subject}</strong></p><p className="text-sm">Recipients: <strong>{confirmCount} active subscriber{confirmCount === 1 ? '' : 's'}</strong></p><p className="text-xs text-cocoa">This will queue an email for all active subscribers. Subscribers who unsubscribe before their turn will be skipped.</p><div className="flex gap-2"><button type="button" onClick={() => setConfirmCount(null)} className="border border-ink/20 px-4 py-2 text-xs">Cancel</button><button type="button" disabled={busy} onClick={sendCampaign} className="bg-ink px-4 py-2 text-xs font-bold text-cream disabled:opacity-50">Send Newsletter</button></div></div>}
    </div>}

    <div className="border-t border-ink/10 pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-ink">Newsletter Campaigns</h3>{campaigns.length === 0 ? <p className="mt-3 text-xs text-cocoa">No campaigns yet.</p> : <div className="mt-3 space-y-2">{campaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => run(async () => { const details = await api(`/admin/newsletter-campaigns/${encodeURIComponent(campaign.id)}`, { token: auth.get() }); setSelected(details.campaign); setFailures(details.failures || []); setEditing(false) })} className="flex w-full flex-wrap items-center justify-between gap-2 border border-ink/10 bg-paper p-3 text-left"><span className="text-sm font-semibold text-ink">{campaign.subject}</span><span className="text-[10px] uppercase text-cocoa">{campaign.status} · {campaign.sent_count || 0}/{campaign.recipient_count || 0} sent · {campaign.failed_count || 0} failed · Created {dateLabel(campaign.created_at)} · Completed {dateLabel(campaign.completed_at)}</span></button>)}</div>}</div>
    {selected && <div className="border border-ink/15 bg-paper p-4 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-display text-2xl text-ink">{selected.subject}</h3><p className="text-xs text-cocoa">{selected.status} · Created {dateLabel(selected.created_at)} · Completed {dateLabel(selected.completed_at)}</p></div>{selected.status === 'DRAFT' && <button type="button" onClick={() => { setDraft({ subject: selected.subject, preview_text: selected.preview_text, audience: 'active', blocks: selected.blocks }); setDraftId(selected.id); setEditing(true); setPreviewHtml(''); setSelected(null) }} className="border border-ink/20 px-3 py-2 text-xs">Edit Draft</button>}</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><p>Recipients: <strong>{selected.recipient_count}</strong></p><p>Sent: <strong>{selected.sent_count}</strong></p><p>Failed: <strong>{selected.failed_count}</strong></p><p>Remaining: <strong>{Math.max(0, selected.recipient_count - selected.sent_count - selected.failed_count - selected.unknown_count - selected.skipped_count)}</strong></p></div>
      {ACTIVE.has(selected.status) && <div><div className="h-2 overflow-hidden bg-sand"><div className="h-full bg-mango" style={{ width: `${selected.recipient_count ? Math.min(100, Math.round(100 * (selected.sent_count + selected.failed_count + selected.unknown_count + selected.skipped_count) / selected.recipient_count)) : 0}%` }} /></div><p className="mt-1 text-xs text-cocoa">{selected.status === 'QUEUED' ? 'Queued…' : 'Sending…'} {selected.sent_count}/{selected.recipient_count} sent ({selected.recipient_count ? Math.min(100, Math.round(100 * (selected.sent_count + selected.failed_count + selected.unknown_count + selected.skipped_count) / selected.recipient_count)) : 0}%). Status refreshes every 15 seconds.</p></div>}
      {(selected.unknown_count > 0 || selected.skipped_count > 0) && <p className="text-xs text-cocoa">Skipped: {selected.skipped_count}. Uncertain delivery outcomes: {selected.unknown_count}; these are not retried to avoid duplicates.</p>}
      {failures.length > 0 && <div className="text-xs text-cocoa"><p className="font-semibold">Recent delivery issues</p>{failures.map((item, index) => <p key={index}>{item.status}: {item.failure_reason}</p>)}</div>}
      <div className="flex flex-wrap gap-2">{selected.failed_count > 0 && ['PARTIAL', 'FAILED'].includes(selected.status) && <button type="button" disabled={busy} onClick={() => actOnCampaign(selected, 'retry-failed')} className="border border-ink/20 px-3 py-2 text-xs disabled:opacity-50">Retry Failed</button>}{ACTIVE.has(selected.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Cancel future newsletter batches? Already-sent emails cannot be recalled.')) actOnCampaign(selected, 'cancel') }} className="border border-coral/30 px-3 py-2 text-xs text-coral disabled:opacity-50">Cancel Campaign</button>}</div>
    </div>}
  </section>
}
