import { isValidNewsletterEmail } from './newsletter.js'

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'image', 'button', 'divider'])
const DRAFT_FIELDS = new Set(['name', 'subject', 'preview_text', 'blocks', 'audience', 'recipient_ids'])

export function escapeNewsletterHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

export function newsletterLinkUrl(value, baseUrl) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 1000 || /[\u0000-\u001f\\]/.test(raw)) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    try { return new URL(raw, `${baseUrl.replace(/\/$/, '')}/`).href } catch { return null }
  }
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null
  } catch { return null }
}

function validInlineLinks(text, baseUrl) {
  for (const match of text.matchAll(/\[([^\]\n]{1,120})\]\(([^)\s]{1,1000})\)/g)) {
    if (!newsletterLinkUrl(match[2], baseUrl)) return false
  }
  return true
}

export function validateNewsletterDraft(input, baseUrl) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !DRAFT_FIELDS.has(key))) {
    return { error: 'Invalid newsletter fields.' }
  }
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length > 100 || /[\r\n\u0000-\u001f]/.test(name)) return { error: 'Campaign name must be at most 100 characters.' }
  const previewText = typeof input.preview_text === 'string' ? input.preview_text.trim() : ''
  if (!subject || subject.length > 180 || /[\r\n\u0000-\u001f]/.test(subject)) return { error: 'Enter a subject of up to 180 characters.' }
  if (previewText.length > 250 || /[\r\n\u0000-\u001f]/.test(previewText)) return { error: 'Preview text must be at most 250 characters on one line.' }
  const audience = input.audience || 'active'
  if (!['active', 'selected'].includes(audience)) return { error: 'Choose an audience.' }
  const ids = input.recipient_ids ?? []
  if (!Array.isArray(ids) || ids.length > 1000 || ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) || new Set(ids).size !== ids.length) return { error: 'Choose valid recipient IDs.' }
  if (audience === 'selected' && !ids.length) return { error: 'Select at least one recipient.' }
  if (audience === 'active' && ids.length) return { error: 'Clear selected recipients when sending to all active subscribers.' }
  if (!Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > 30) return { error: 'Add 1 to 30 content blocks.' }

  const blocks = []
  let meaningful = false
  for (const block of input.blocks) {
    if (!block || typeof block !== 'object' || Array.isArray(block) || !BLOCK_TYPES.has(block.type)) return { error: 'Invalid content block.' }
    const allowed = block.type === 'image' ? ['type', 'url', 'alt'] : block.type === 'button' ? ['type', 'text', 'url'] : block.type === 'divider' ? ['type'] : ['type', 'text']
    if (Object.keys(block).some((key) => !allowed.includes(key))) return { error: 'Invalid content block fields.' }
    if (block.type === 'divider') { blocks.push({ type: 'divider' }); continue }
    if (block.type === 'image') {
      const url = newsletterLinkUrl(block.url, baseUrl)
      const alt = typeof block.alt === 'string' ? block.alt.trim() : ''
      if (!url || !alt || alt.length > 160) return { error: 'Images need a safe HTTPS URL and alternative text.' }
      blocks.push({ type: 'image', url, alt }); meaningful = true; continue
    }
    const text = typeof block.text === 'string' ? block.text.trim() : ''
    const max = block.type === 'paragraph' ? 4000 : 160
    if (!text || text.length > max || !validInlineLinks(text, baseUrl)) return { error: `Enter valid ${block.type} content and links.` }
    if (block.type === 'button') {
      const url = newsletterLinkUrl(block.url, baseUrl)
      if (!url) return { error: 'Buttons need a safe HTTPS or storefront link.' }
      blocks.push({ type: 'button', text, url })
    } else blocks.push({ type: block.type, text })
    meaningful = true
  }
  if (!meaningful) return { error: 'Add newsletter content before saving.' }
  return { value: { name, subject, preview_text: previewText, audience, recipient_ids: audience === 'selected' ? ids : [], blocks } }
}

function renderInline(value, baseUrl) {
  const source = String(value || '')
  const pattern = /\[([^\]\n]{1,120})\]\(([^)\s]{1,1000})\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g
  let html = ''
  let cursor = 0
  for (const match of source.matchAll(pattern)) {
    html += escapeNewsletterHtml(source.slice(cursor, match.index))
    if (match[1] !== undefined) {
      const href = newsletterLinkUrl(match[2], baseUrl)
      html += href ? `<a href="${escapeNewsletterHtml(href)}" style="color:#8a5a3b;text-decoration:underline">${escapeNewsletterHtml(match[1])}</a>` : escapeNewsletterHtml(match[0])
    } else if (match[3] !== undefined) html += `<strong>${escapeNewsletterHtml(match[3])}</strong>`
    else html += `<em>${escapeNewsletterHtml(match[4])}</em>`
    cursor = match.index + match[0].length
  }
  return (html + escapeNewsletterHtml(source.slice(cursor))).replace(/\n/g, '<br>')
}

export function renderNewsletterEmail(campaign, { baseUrl, unsubscribeUrl }) {
  const blocks = Array.isArray(campaign.blocks) ? campaign.blocks : []
  const content = blocks.map((block) => {
    if (block.type === 'heading') return `<tr><td style="padding:14px 28px 6px"><h2 style="margin:0;font:normal 27px Georgia,serif;color:#171310;line-height:1.25">${renderInline(block.text, baseUrl)}</h2></td></tr>`
    if (block.type === 'paragraph') return `<tr><td style="padding:8px 28px 14px;font:15px/1.7 Arial,sans-serif;color:#51443b">${renderInline(block.text, baseUrl)}</td></tr>`
    if (block.type === 'image') {
      const url = newsletterLinkUrl(block.url, baseUrl)
      return url ? `<tr><td style="padding:12px 28px"><img src="${escapeNewsletterHtml(url)}" alt="${escapeNewsletterHtml(block.alt)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0"></td></tr>` : ''
    }
    if (block.type === 'button') {
      const url = newsletterLinkUrl(block.url, baseUrl)
      return url ? `<tr><td align="center" style="padding:16px 28px 22px"><a href="${escapeNewsletterHtml(url)}" style="display:inline-block;background:#1f1a17;color:#fffaf5;padding:14px 24px;font:bold 12px Arial,sans-serif;letter-spacing:1.5px;text-decoration:none;text-transform:uppercase">${escapeNewsletterHtml(block.text)}</a></td></tr>` : ''
    }
    if (block.type === 'divider') return '<tr><td style="padding:14px 28px"><hr style="border:0;border-top:1px solid #e7ddd3"></td></tr>'
    return ''
  }).join('')
  const safeUnsubscribe = escapeNewsletterHtml(unsubscribeUrl)
  const safePreview = escapeNewsletterHtml(campaign.preview_text || '')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeNewsletterHtml(campaign.subject)}</title></head><body style="margin:0;padding:0;background:#f7f2eb;color:#171310"><span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${safePreview}</span><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2eb"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fffaf5"><tr><td align="center" style="padding:32px 20px 24px;border-bottom:1px solid #e7ddd3"><div style="font:normal 30px Georgia,serif;letter-spacing:5px">THRETHA</div><div style="margin-top:6px;font:bold 10px Arial,sans-serif;letter-spacing:3px;color:#9c754e">CONTEMPORARY KERALA ATELIER</div></td></tr>${content}<tr><td align="center" style="padding:28px 20px;border-top:1px solid #e7ddd3;font:12px/1.7 Arial,sans-serif;color:#756a61">Thretha Couture · Kochi, Kerala<br>Questions? Reply to this email.<br><a href="${safeUnsubscribe}" style="color:#8a5a3b;text-decoration:underline">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`
}

export function newsletterPlainText(campaign, unsubscribeUrl) {
  const body = campaign.blocks.map((block) => block.type === 'divider' ? '---' : block.type === 'image' ? `${block.alt}: ${block.url}` : block.type === 'button' ? `${block.text}: ${block.url}` : block.text).join('\n\n')
  return `${campaign.subject}\n\n${body}\n\nThretha Couture · Kochi, Kerala\nUnsubscribe: ${unsubscribeUrl}`
}

export function activeNewsletterAudienceFilter(cutoff = null) {
  return {
    status: 'active',
    consented_at: cutoff ? { $lte: cutoff } : { $type: 'date' },
    email_normalized: { $regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  }
}

export function canSendNewsletterTo(subscriber, campaign) {
  return subscriber?.status === 'active' && isValidNewsletterEmail(subscriber.email_normalized) &&
    Boolean(subscriber.consented_at && new Date(subscriber.consented_at) <= new Date(campaign.queued_at))
}
