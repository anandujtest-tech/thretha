'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, auth } from '@/lib/tc'
import CampaignImageUpload from './CampaignImageUpload'

const EMPTY_DRAFT = { name: '', subject: '', preview_text: '', audience: 'active', recipient_ids: [], blocks: [{ type: 'heading', text: '' }, { type: 'paragraph', text: '' }] }
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
  const [step, setStep] = useState('content')
  const [reviewCount, setReviewCount] = useState(0)
  const [search, setSearch] = useState('')
  const [recipientPage, setRecipientPage] = useState(1)
  const [recipientRows, setRecipientRows] = useState([])
  const [recipientPages, setRecipientPages] = useState(1)
  const [recipientLoading, setRecipientLoading] = useState(false)
  const [recipientError, setRecipientError] = useState('')
  const [focusStep, setFocusStep] = useState(false)
  const stepHeading = useRef(null)
  const sendLock = useRef(false)
  const [selected, setSelected] = useState(null)
  const [failures, setFailures] = useState([])
  const [busy, setBusy] = useState(false)
  const [imageUploads, setImageUploads] = useState(0)
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
  useEffect(() => {
    if (!editing || step !== 'recipients' || draft.audience !== 'selected') return
    let cancelled = false
    setRecipientLoading(true); setRecipientError('')
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ eligible: '1', status: 'active', page: String(recipientPage) })
      if (search.trim()) params.set('q', search.trim())
      api(`/admin/newsletter-subscribers?${params}`, { token: auth.get() }).then((result) => {
        if (cancelled) return
        setRecipientRows(result.subscribers || []); setRecipientPages(result.pages || 1)
      }).catch((failure) => { if (!cancelled) setRecipientError(failure.message || 'Could not load subscribers.') })
        .finally(() => { if (!cancelled) setRecipientLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [editing, step, draft.audience, search, recipientPage])
  useEffect(() => { if (focusStep) { stepHeading.current?.focus(); setFocusStep(false) } }, [step, focusStep])

  const goTo = (next) => { setStep(next); setFocusStep(true); setError('') }
  const audienceCount = async (value = draft) => {
    if (value.audience === 'selected') return api('/admin/newsletter-campaigns/audience', { method: 'POST', body: { recipient_ids: value.recipient_ids }, token: auth.get() })
    return api('/admin/newsletter-campaigns/audience', { token: auth.get() })
  }

  const changeDraft = (update) => { setDraft((current) => ({ ...current, ...update })); setPreviewHtml('') }
  const changeBlock = (index, update) => { setDraft((current) => ({ ...current, blocks: current.blocks.map((block, at) => at === index ? { ...block, ...update } : block) })); setPreviewHtml('') }
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
  const review = () => run(async () => {
    if (!draft.name.trim()) throw new Error('Enter a campaign name.')
    if (draft.audience === 'selected' && !draft.recipient_ids.length) throw new Error('Select at least one recipient.')
    const [previewResult, audience] = await Promise.all([
      api('/admin/newsletter-campaigns/preview', { method: 'POST', body: draft, token: auth.get() }),
      audienceCount(),
    ])
    if (!audience.recipient_count) throw new Error('No eligible subscribers are available for this audience.')
    setPreviewHtml(previewResult.html)
    setReviewCount(audience.recipient_count)
    goTo('review')
  })
  const confirmSend = () => run(async () => {
    const audience = await audienceCount()
    if (!audience.recipient_count) throw new Error('No eligible subscribers remain.')
    if (audience.recipient_count !== reviewCount) { setReviewCount(audience.recipient_count); setNotice('Recipient count changed. Review the updated count before continuing.'); return }
    goTo('confirm')
  })
  const sendCampaign = async () => {
    if (sendLock.current) return
    sendLock.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const audience = await audienceCount()
      if (audience.recipient_count !== reviewCount || !audience.recipient_count) {
        setReviewCount(audience.recipient_count); goTo('review')
        setNotice('Recipient count changed. Review the updated count before sending.')
        return
      }
      const saved = await saveDraft()
      const result = await api(`/admin/newsletter-campaigns/${encodeURIComponent(saved.id)}/send`, { method: 'POST', body: {}, token: auth.get() })
      setEditing(false); setPreviewHtml(''); setSelected(result.campaign); setStep('content')
      setNotice(`Newsletter queued for ${result.campaign.recipient_count} eligible recipient${result.campaign.recipient_count === 1 ? '' : 's'}. Follow its progress below.`)
      await refresh()
    } catch (failure) { setError(failure.message || 'Could not queue the newsletter.') }
    finally { setBusy(false); sendLock.current = false }
  }
  const actOnCampaign = (campaign, action) => run(async () => {
    const result = await api(`/admin/newsletter-campaigns/${encodeURIComponent(campaign.id)}/${action}`, { method: 'POST', body: {}, token: auth.get() })
    setSelected(result.campaign)
    setNotice(action === 'cancel' ? 'Future batches cancelled. Already-sent emails cannot be recalled.' : 'Failed deliveries queued for one controlled retry.')
    await refresh()
  })

  return <section className="space-y-5 border border-ink/10 bg-cream p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] uppercase tracking-[0.25em] text-gold-dark">The Thretha Edit</p><h2 className="mt-1 font-display text-3xl text-ink">Newsletter Campaigns</h2><p className="mt-1 text-xs text-cocoa">Recipients: {recipientCount} active subscriber{recipientCount === 1 ? '' : 's'}</p></div>
      <button type="button" disabled={imageUploads > 0} onClick={() => { setDraft(structuredClone(EMPTY_DRAFT)); setDraftId(''); setEditing(true); setStep('content'); setPreviewHtml(''); setSelected(null); setError(''); setNotice('') }} className="min-h-11 bg-ink px-4 text-[10px] font-bold uppercase tracking-wider text-cream disabled:opacity-50">+ Create Newsletter</button>
    </div>
    {error && <p role="alert" className="border border-coral/20 bg-coral-light/20 p-3 text-xs text-coral">{error}</p>}
    {notice && <p role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}

    {editing && <div className="space-y-5 border-t border-ink/10 pt-5 pb-28 sm:pb-0">
      <nav aria-label="Newsletter creation steps" className="flex flex-wrap gap-2 text-[11px] font-semibold text-cocoa">
        {['Content', 'Recipients', 'Review', 'Send'].map((label, index) => <span key={label} aria-current={step === label.toLowerCase() || step === 'confirm' && label === 'Send' ? 'step' : undefined} className={`border px-2 py-1 ${step === label.toLowerCase() || step === 'confirm' && label === 'Send' ? 'border-ink bg-ink text-cream' : 'border-ink/20'}`}>{index + 1}. {label}</span>)}
      </nav>

      {step === 'content' && <div className="space-y-5">
        <h3 ref={stepHeading} tabIndex={-1} className="font-display text-2xl text-ink outline-none">1. Newsletter Content</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block min-w-0 text-xs font-semibold text-ink">Campaign name<input value={draft.name} maxLength={100} onChange={(event) => changeDraft({ name: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal" placeholder="Internal campaign name" /></label>
          <label className="block min-w-0 text-xs font-semibold text-ink">Email subject<input value={draft.subject} maxLength={180} onChange={(event) => changeDraft({ subject: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal" /></label>
          <label className="block min-w-0 text-xs font-semibold text-ink sm:col-span-2">Preview text (optional)<input value={draft.preview_text} maxLength={250} onChange={(event) => changeDraft({ preview_text: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 border border-ink/20 bg-paper px-3 text-sm font-normal" /></label>
        </div>
        <div className="space-y-3"><p className="text-xs font-semibold text-ink">Content</p><p className="text-[11px] text-cocoa">Paragraphs support **bold**, *italic*, and [link text](https://example.com) formatting. Storefront links may start with /product/.</p>
          {draft.blocks.map((block, index) => <div key={index} className="min-w-0 border border-ink/15 bg-paper p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-cocoa">{blockLabel[block.type]}</span><button type="button" disabled={imageUploads > 0} onClick={() => changeDraft({ blocks: draft.blocks.filter((_, at) => at !== index) })} className="min-h-10 text-[10px] text-coral disabled:opacity-50">Remove</button></div>
            {block.type === 'image' && <CampaignImageUpload value={block.url} onChange={(url) => changeBlock(index, { url })} folder="newsletters" previewClassName="max-h-64 w-full max-w-md object-contain bg-cream" onUploadStart={() => setImageUploads((count) => count + 1)} onUploadEnd={() => setImageUploads((count) => count - 1)} />}
            {['heading', 'paragraph', 'button'].includes(block.type) && (block.type === 'paragraph' ? <textarea value={block.text} rows={5} onChange={(event) => changeBlock(index, { text: event.target.value })} className="w-full min-w-0 border border-ink/20 bg-cream p-3 text-sm" placeholder="Write your paragraph" /> : <input value={block.text} onChange={(event) => changeBlock(index, { text: event.target.value })} className="min-h-11 w-full min-w-0 border border-ink/20 bg-cream px-3 text-sm" placeholder={block.type === 'heading' ? 'Heading' : 'Button label'} />)}
            {['image', 'button'].includes(block.type) && <label className="mt-2 block min-w-0 text-[11px] text-cocoa">{block.type === 'image' ? 'HTTPS image URL' : 'HTTPS or storefront link'}<input value={block.url} onChange={(event) => changeBlock(index, { url: event.target.value })} className="mt-1 min-h-10 w-full min-w-0 border border-ink/20 bg-cream px-3 text-xs" placeholder={block.type === 'button' ? '/product/your-product' : 'https://...'} /></label>}
            {block.type === 'image' && <label className="mt-2 block min-w-0 text-[11px] text-cocoa">Image description<input value={block.alt} onChange={(event) => changeBlock(index, { alt: event.target.value })} className="mt-1 min-h-10 w-full min-w-0 border border-ink/20 bg-cream px-3 text-xs" /></label>}
          </div>)}
          <div className="flex flex-wrap gap-2">{Object.entries(blockLabel).map(([type, label]) => <button key={type} type="button" disabled={imageUploads > 0} onClick={() => addBlock(type)} className="min-h-10 border border-ink/20 px-3 text-[10px] font-semibold text-ink disabled:opacity-50">+ {label}</button>)}</div>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || imageUploads > 0} onClick={() => run(async () => { await saveDraft(); setNotice('Draft saved. No email has been sent.') })} className="min-h-11 border border-ink/20 px-4 text-xs font-bold disabled:opacity-50">Save Draft</button><button type="button" disabled={busy || imageUploads > 0} onClick={preview} className="min-h-11 border border-ink/20 px-4 text-xs font-bold disabled:opacity-50">Preview Email</button></div>
        {previewHtml && <div className="space-y-3"><div className="flex items-center gap-3"><p className="text-xs font-semibold">Actual email preview</p><button type="button" onClick={() => setPreviewWidth('desktop')} className="min-h-10 text-xs underline">Desktop</button><button type="button" onClick={() => setPreviewWidth('mobile')} className="min-h-10 text-xs underline">Mobile</button></div><iframe title="Newsletter email preview" sandbox="" srcDoc={previewHtml} className="mx-auto h-[520px] max-w-full border border-ink/15 bg-white" style={{ width: previewWidth === 'mobile' ? 375 : 700 }} /></div>}
      </div>}

      {step === 'recipients' && <div className="space-y-4">
        <h3 ref={stepHeading} tabIndex={-1} className="font-display text-2xl text-ink outline-none">2. Recipients</h3>
        <p className="text-sm text-cocoa">Choose exactly who should receive this newsletter. Only active, consented subscribers are eligible.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex min-h-20 cursor-pointer items-start gap-3 border p-4 ${draft.audience === 'active' ? 'border-ink bg-paper' : 'border-ink/20'}`}><input type="radio" name="newsletter-audience" checked={draft.audience === 'active'} onChange={() => changeDraft({ audience: 'active', recipient_ids: [] })} className="mt-1" /><span><strong className="block text-sm">All active subscribers</strong><span className="text-xs text-cocoa">{recipientCount} eligible recipients</span></span></label>
          <label className={`flex min-h-20 cursor-pointer items-start gap-3 border p-4 ${draft.audience === 'selected' ? 'border-ink bg-paper' : 'border-ink/20'}`}><input type="radio" name="newsletter-audience" checked={draft.audience === 'selected'} onChange={() => changeDraft({ audience: 'selected', recipient_ids: [] })} className="mt-1" /><span><strong className="block text-sm">Select recipients</strong><span className="text-xs text-cocoa">{draft.audience === 'selected' ? draft.recipient_ids.length : 0} selected</span></span></label>
        </div>
        {draft.audience === 'selected' && <div className="space-y-3 border border-ink/15 bg-paper p-3 sm:p-4">
          <label className="block text-xs font-semibold text-ink">Search subscribers<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setRecipientPage(1) }} placeholder="Search by email" className="mt-1 min-h-11 w-full min-w-0 border border-ink/20 bg-cream px-3 text-sm font-normal" /></label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span role="status">{draft.recipient_ids.length} selected</span><button type="button" disabled={!draft.recipient_ids.length} onClick={() => changeDraft({ recipient_ids: [] })} className="min-h-10 underline disabled:opacity-50">Clear selection</button></div>
          {recipientLoading ? <p role="status" className="text-xs text-cocoa">Loading eligible subscribers…</p> : recipientError ? <p role="alert" className="text-xs text-coral">{recipientError}</p> : recipientRows.length ? <div className="max-h-72 space-y-1 overflow-y-auto">{recipientRows.map((subscriber) => <label key={subscriber.id} className="flex min-h-11 cursor-pointer items-center gap-3 border border-ink/10 p-2 text-xs"><input type="checkbox" checked={draft.recipient_ids.includes(subscriber.id)} onChange={(event) => { const checked = event.target.checked; setDraft((current) => ({ ...current, recipient_ids: checked ? [...current.recipient_ids, subscriber.id] : current.recipient_ids.filter((id) => id !== subscriber.id) })) }} /><span className="min-w-0 break-all">{subscriber.email_normalized}</span></label>)}</div> : <p className="text-xs text-cocoa">No eligible subscribers match this search.</p>}
          <div className="flex items-center justify-between text-xs"><button type="button" disabled={recipientPage <= 1 || recipientLoading} onClick={() => setRecipientPage((page) => page - 1)} className="min-h-10 border border-ink/20 px-3 disabled:opacity-50">Previous</button><span>Page {recipientPage} of {recipientPages}</span><button type="button" disabled={recipientPage >= recipientPages || recipientLoading} onClick={() => setRecipientPage((page) => page + 1)} className="min-h-10 border border-ink/20 px-3 disabled:opacity-50">Next</button></div>
        </div>}
      </div>}

      {step === 'review' && <div className="space-y-4">
        <h3 ref={stepHeading} tabIndex={-1} className="font-display text-2xl text-ink outline-none">3. Review Newsletter</h3>
        <dl className="grid gap-3 border border-ink/15 bg-paper p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-cocoa">Campaign</dt><dd className="font-semibold break-words">{draft.name}</dd></div><div><dt className="text-xs text-cocoa">Subject</dt><dd className="font-semibold break-words">{draft.subject}</dd></div><div><dt className="text-xs text-cocoa">Recipients</dt><dd className="font-semibold">{draft.audience === 'selected' ? 'Selected subscribers' : 'All active subscribers'} · {reviewCount} eligible</dd></div><div><dt className="text-xs text-cocoa">Delivery</dt><dd className="font-semibold">Send now</dd></div></dl>
        <p className="text-sm font-semibold">This newsletter will be sent to {reviewCount} recipient{reviewCount === 1 ? '' : 's'}.</p>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => goTo('content')} className="min-h-11 border border-ink/20 px-4 text-xs">Edit content</button><button type="button" onClick={() => goTo('recipients')} className="min-h-11 border border-ink/20 px-4 text-xs">Edit recipients</button></div>
        {previewHtml && <iframe title="Newsletter review preview" sandbox="" srcDoc={previewHtml} className="h-[420px] w-full max-w-[700px] border border-ink/15 bg-white" />}
      </div>}

      {step === 'confirm' && <div role="dialog" aria-modal="true" aria-labelledby="newsletter-confirm-title" onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) goTo('review')
        if (event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
          const next = event.shiftKey ? controls.at(-1) : controls[0]
          if (document.activeElement === stepHeading.current || event.shiftKey && document.activeElement === controls[0] || !event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); next?.focus() }
        }
      }} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-3 sm:p-6">
        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-paper p-5 shadow-xl sm:p-7">
          <h3 id="newsletter-confirm-title" ref={stepHeading} tabIndex={-1} className="font-display text-2xl text-ink outline-none">4. Ready to send?</h3>
          <p className="mt-3 text-sm font-semibold break-words">{draft.name}</p><p className="mt-1 text-xs text-cocoa break-words">{draft.subject}</p>
          <p className="mt-4 text-sm">{draft.audience === 'selected' ? 'Selected subscribers' : 'All active subscribers'} · <strong>{reviewCount} eligible recipient{reviewCount === 1 ? '' : 's'}</strong></p>
          <p className="mt-2 text-sm">This newsletter will be queued for {reviewCount} recipient{reviewCount === 1 ? '' : 's'}. Subscribers who unsubscribe before delivery are skipped.</p>
          {error && <p role="alert" className="mt-4 text-xs text-coral">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={() => goTo('review')} className="min-h-11 border border-ink/20 px-4 text-xs disabled:opacity-50">Back &amp; Edit</button><button type="button" disabled={busy} onClick={sendCampaign} className="min-h-11 bg-ink px-4 text-xs font-bold text-cream disabled:opacity-50">{busy ? 'Sending…' : 'Send Newsletter'}</button></div>
        </div>
      </div>}
      {step !== 'confirm' && <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/15 bg-paper px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
        {error && <p className="mx-auto mb-2 max-w-xl text-xs text-coral sm:mx-0">{error}</p>}
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 sm:mx-0"><span className="min-w-0 text-xs text-cocoa">{step === 'content' ? '1. Content' : step === 'recipients' ? draft.audience === 'selected' ? `${draft.recipient_ids.length} selected` : `${recipientCount} eligible` : `${reviewCount} recipients`}</span><button type="button" disabled={busy || imageUploads > 0 || step === 'recipients' && draft.audience === 'selected' && !draft.recipient_ids.length} onClick={() => step === 'content' ? goTo('recipients') : step === 'recipients' ? review() : confirmSend()} className="min-h-11 shrink-0 bg-ink px-4 text-xs font-bold text-cream disabled:opacity-50">{busy ? 'Checking…' : step === 'content' ? 'Continue to Recipients' : step === 'recipients' ? 'Continue to Review' : 'Continue to Send'}</button></div>
      </div>}
    </div>}

    <div className="border-t border-ink/10 pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-ink">Newsletter Campaigns</h3>{campaigns.length === 0 ? <p className="mt-3 text-xs text-cocoa">No campaigns yet.</p> : <div className="mt-3 space-y-2">{campaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => run(async () => { const details = await api(`/admin/newsletter-campaigns/${encodeURIComponent(campaign.id)}`, { token: auth.get() }); setSelected(details.campaign); setFailures(details.failures || []); setEditing(false) })} className="flex w-full flex-wrap items-center justify-between gap-2 border border-ink/10 bg-paper p-3 text-left"><span className="text-sm font-semibold text-ink">{campaign.name || campaign.subject}</span><span className="text-[10px] uppercase text-cocoa">{campaign.status} · {campaign.sent_count || 0}/{campaign.recipient_count || 0} sent · {campaign.failed_count || 0} failed · Created {dateLabel(campaign.created_at)} · Completed {dateLabel(campaign.completed_at)}</span></button>)}</div>}</div>
    {selected && <div className="border border-ink/15 bg-paper p-4 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-display text-2xl text-ink">{selected.name || selected.subject}</h3><p className="text-xs text-cocoa">{selected.status} · Created {dateLabel(selected.created_at)} · Completed {dateLabel(selected.completed_at)}</p></div>{selected.status === 'DRAFT' && <button type="button" disabled={imageUploads > 0} onClick={() => { setDraft({ name: selected.name || '', subject: selected.subject, preview_text: selected.preview_text, audience: selected.audience || 'active', recipient_ids: selected.recipient_ids || [], blocks: selected.blocks }); setDraftId(selected.id); setEditing(true); setStep('content'); setPreviewHtml(''); setSelected(null) }} className="border border-ink/20 px-3 py-2 text-xs disabled:opacity-50">Edit Draft</button>}</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><p>Recipients: <strong>{selected.recipient_count}</strong></p><p>Sent: <strong>{selected.sent_count}</strong></p><p>Failed: <strong>{selected.failed_count}</strong></p><p>Remaining: <strong>{Math.max(0, selected.recipient_count - selected.sent_count - selected.failed_count - selected.unknown_count - selected.skipped_count)}</strong></p></div>
      {ACTIVE.has(selected.status) && <div><div className="h-2 overflow-hidden bg-sand"><div className="h-full bg-mango" style={{ width: `${selected.recipient_count ? Math.min(100, Math.round(100 * (selected.sent_count + selected.failed_count + selected.unknown_count + selected.skipped_count) / selected.recipient_count)) : 0}%` }} /></div><p className="mt-1 text-xs text-cocoa">{selected.status === 'QUEUED' ? 'Queued…' : 'Sending…'} {selected.sent_count}/{selected.recipient_count} sent ({selected.recipient_count ? Math.min(100, Math.round(100 * (selected.sent_count + selected.failed_count + selected.unknown_count + selected.skipped_count) / selected.recipient_count)) : 0}%). Status refreshes every 15 seconds.</p></div>}
      {(selected.unknown_count > 0 || selected.skipped_count > 0) && <p className="text-xs text-cocoa">Skipped: {selected.skipped_count}. Uncertain delivery outcomes: {selected.unknown_count}; these are not retried to avoid duplicates.</p>}
      {failures.length > 0 && <div className="text-xs text-cocoa"><p className="font-semibold">Recent delivery issues</p>{failures.map((item, index) => <p key={index}>{item.status}: {item.failure_reason}</p>)}</div>}
      <div className="flex flex-wrap gap-2">{selected.failed_count > 0 && ['PARTIAL', 'FAILED'].includes(selected.status) && <button type="button" disabled={busy} onClick={() => actOnCampaign(selected, 'retry-failed')} className="border border-ink/20 px-3 py-2 text-xs disabled:opacity-50">Retry Failed</button>}{ACTIVE.has(selected.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Cancel future newsletter batches? Already-sent emails cannot be recalled.')) actOnCampaign(selected, 'cancel') }} className="border border-coral/30 px-3 py-2 text-xs text-coral disabled:opacity-50">Cancel Campaign</button>}</div>
    </div>}
  </section>
}
