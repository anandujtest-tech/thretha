'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Pause, Play, Pencil, RefreshCw, Send, XCircle } from 'lucide-react'
import { api, auth } from '@/lib/tc'

const WEEKDAYS = [
  ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4],
  ['Friday', 5], ['Saturday', 6], ['Sunday', 0],
]
const TYPES = ['New Collection', 'New Arrival', 'Sale', 'Promotion', 'Back in Stock', 'Price Drop', 'Announcement', 'Engagement', 'Order Update']
const COOLDOWN_OPTIONS = [
  [0, 'Immediately'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'],
  [60, '1 hour'], [120, '2 hours'], [360, '6 hours'], [720, '12 hours'], [1440, '24 hours'],
]
const MAX_COOLDOWN_MINUTES = 7 * 24 * 60
const todayText = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const tomorrowText = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const emptyForm = () => ({
  title: '', message: '', type: 'Announcement', image: '', destination: '/', action_text: '',
  send_mode: 'now', schedule: { timezone: 'Asia/Kolkata', date: tomorrowText(), time: '19:00', frequency: 'weekly', days_of_week: [5], start_date: todayText(), end_date: '' },
})

function scheduleLabel(campaign) {
  const schedule = campaign.schedule || {}
  const timeZone = schedule.timezone || 'Asia/Kolkata'
  if (schedule.type === 'now') return 'Send now'
  if (schedule.type === 'once') return `${schedule.date || new Date(schedule.scheduled_at).toLocaleDateString()} · ${schedule.time || ''} ${timeZone}`
  const days = (schedule.days_of_week || []).map((day) => WEEKDAYS.find((entry) => entry[1] === day)?.[0]).filter(Boolean).join(', ')
  const frequency = schedule.frequency === 'custom_days' ? days : schedule.frequency === 'weekly' ? `Weekly${days ? ` · ${days}` : ''}` : schedule.frequency
  return `${frequency} · ${schedule.time || ''} ${timeZone}`
}

function cooldownLabel(minutes) {
  const value = Number(minutes)
  const preset = COOLDOWN_OPTIONS.find(([option]) => option === value)
  if (preset) return preset[1]
  if (value % 1440 === 0) return `${value / 1440} days`
  if (value % 60 === 0) return `${value / 60} hours`
  return `${value} minutes`
}

export default function BrowserPushManager() {
  const token = auth.get()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const submitLock = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldownChoice, setCooldownChoice] = useState('360')
  const [customCooldown, setCustomCooldown] = useState('360')

  const load = async () => {
    setLoading(true)
    try {
      setData(await api('/admin/push', { token }))
      setLoadError('')
    } catch (err) {
      setLoadError(err.message || 'Could not load browser notifications.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!data) return
    const value = Number(data.cooldown_minutes ?? 360)
    setCooldownChoice(COOLDOWN_OPTIONS.some(([minutes]) => minutes === value) ? String(value) : 'custom')
    setCustomCooldown(String(value))
  }, [data?.cooldown_minutes])

  const setSchedule = (key, value) => setForm((current) => ({ ...current, schedule: { ...current.schedule, [key]: value } }))
  const toggleDay = (day) => setForm((current) => {
    const days = current.schedule.days_of_week || []
    return { ...current, schedule: { ...current.schedule, days_of_week: days.includes(day) ? days.filter((value) => value !== day) : [...days, day] } }
  })

  const saveGlobal = async (enabled) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api('/admin/push/settings', { method: 'PUT', body: { enabled }, token })
      setData((current) => ({ ...current, ...result }))
      setNotice(enabled ? 'Browser notifications enabled.' : 'Browser notifications disabled. Due notifications will be skipped while disabled.')
      await load()
    } catch (err) { setError(err.message || 'Could not update browser notification settings.') }
    finally { setBusy(false) }
  }

  const saveCooldown = async () => {
    const cooldownMinutes = cooldownChoice === 'custom' ? Number(customCooldown) : Number(cooldownChoice)
    if (!Number.isSafeInteger(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > MAX_COOLDOWN_MINUTES) {
      setError(`Enter a whole number from 0 to ${MAX_COOLDOWN_MINUTES} minutes.`)
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/admin/push/settings', { method: 'PUT', body: { cooldown_minutes: cooldownMinutes }, token })
      setNotice(`Subscriber cooldown set to ${cooldownLabel(cooldownMinutes)}.`)
      await load()
    } catch (err) { setError(err.message || 'Could not update subscriber cooldown.') }
    finally { setBusy(false) }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitLock.current) return
    if (form.send_mode === 'now' && !window.confirm('Send this notification to all active subscribers? This cannot be undone.')) return
    submitLock.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      let result
      if (editing) result = await api(`/admin/push/campaigns/${encodeURIComponent(editing)}`, { method: 'PUT', body: form, token })
      else result = await api('/admin/push/campaigns', { method: 'POST', body: form, token })
      if (editing) setNotice('Campaign updated.')
      else if (form.send_mode !== 'now') setNotice('Notification scheduled successfully.')
      else if (result.status === 'sent' && result.sent > 0) setNotice('Notification sent successfully.')
      else if (result.status === 'sent' && result.skipped > 0) setNotice('Notification completed, but no subscribers were eligible because of cooldown.')
      else if (result.status === 'sent') setNotice('Notification completed. No active subscribers were available.')
      else if (result.status === 'processing') setNotice('Notification started. Remaining deliveries will continue in the background.')
      else if (result.status === 'disabled') setNotice('Notifications were paused before delivery; the campaign will not send until re-enabled.')
      else setNotice('Notification was created and remains queued for background processing.')
      setForm(emptyForm()); setEditing(null); await load()
    } catch (err) {
      setError(err.message || 'Could not save this notification.')
      if (form.send_mode === 'now') await load()
    }
    finally { submitLock.current = false; setBusy(false) }
  }

  const edit = (campaign) => {
    const schedule = campaign.schedule || {}
    setEditing(campaign.id)
    setForm({
      title: campaign.title, message: campaign.message, type: campaign.type,
      image: campaign.image || '', destination: campaign.destination || '/', action_text: campaign.action_text || '',
      send_mode: schedule.type === 'repeat' ? 'repeat' : 'once',
      schedule: {
        timezone: schedule.timezone || 'Asia/Kolkata', date: schedule.date || tomorrowText(),
        time: schedule.time || '19:00', frequency: schedule.frequency || 'weekly',
        days_of_week: schedule.days_of_week || [], start_date: schedule.start_date || todayText(), end_date: schedule.end_date || '',
      },
    })
    setError(''); setNotice('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const action = async (campaign, actionName) => {
    const verb = actionName === 'cancel' ? 'Cancel' : actionName === 'pause' ? 'Pause' : 'Resume'
    if (actionName === 'cancel' && !window.confirm(`Cancel “${campaign.title}”?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/admin/push/campaigns/${encodeURIComponent(campaign.id)}/action`, { method: 'POST', body: { action: actionName }, token })
      setNotice(`Campaign ${verb.toLowerCase()}d.`); await load()
    } catch (err) { setError(err.message || `Could not ${verb.toLowerCase()} campaign.`) }
    finally { setBusy(false) }
  }

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const campaigns = data?.campaigns || []

  return (
    <section className="mb-8 border border-ink/10 bg-cream p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cocoa-light">Customer messaging</p><h2 className="mt-1 font-display text-2xl text-ink">Browser Notifications</h2></div>
        <button type="button" disabled={busy || loading || (!data?.configured && !data?.enabled)} onClick={() => saveGlobal(!data?.enabled)} className={`border px-4 py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-50 ${data?.enabled ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-ink/20 text-ink'}`}>
          {data?.enabled ? 'ON · Disable' : 'OFF · Enable'}
        </button>
      </div>
      {loading && <p role="status" className="mt-3 text-xs text-cocoa-light">Loading notification status…</p>}
      {loadError && <p role="alert" className="mt-3 flex flex-wrap items-center gap-2 border border-rose-800/20 bg-rose-50 p-3 text-xs text-rose-900">Unable to load notification status: {loadError}<button type="button" onClick={load} disabled={loading} className="font-semibold underline disabled:opacity-50">Retry</button></p>}
      {!loading && !loadError && data && !data.configured && <p className="mt-3 border border-amber-700/20 bg-amber-50 p-3 text-xs text-amber-900">Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in the deployment environment before enabling browser push.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[["Active subscribers", data?.subscriber_count ?? '—'], ['Scheduled campaigns', data?.scheduled_count ?? '—'], ['Sent today', data?.sent_today ?? '—']].map(([label, value]) => <div key={label} className="border border-ink/10 bg-paper p-4"><p className="text-[10px] uppercase tracking-wider text-cocoa-light">{label}</p><p className="mt-1 text-2xl font-semibold text-ink">{value}</p></div>)}
      </div>

      <div className="mt-5 border border-ink/10 bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Subscriber cooldown</h3><p className="mt-1 text-xs text-cocoa-light">Minimum wait after a successful notification to the same device.</p></div>
          <p className="text-xs font-medium text-ink">Current: {cooldownLabel(data?.cooldown_minutes ?? 360)}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-48 text-xs text-cocoa">Cooldown interval
            <select value={cooldownChoice} onChange={(event) => setCooldownChoice(event.target.value)} disabled={loading || busy} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink disabled:opacity-50">
              {COOLDOWN_OPTIONS.map(([minutes, label]) => <option key={minutes} value={minutes}>{label}</option>)}
              <option value="custom">Custom</option>
            </select>
          </label>
          {cooldownChoice === 'custom' && <label className="w-44 text-xs text-cocoa">Custom minutes
            <input type="number" min="1" max={MAX_COOLDOWN_MINUTES} step="1" required value={customCooldown} onChange={(event) => setCustomCooldown(event.target.value)} disabled={loading || busy} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink disabled:opacity-50" />
          </label>}
          <button type="button" onClick={saveCooldown} disabled={busy || loading} className="border border-ink/20 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink disabled:opacity-50">Save cooldown</button>
        </div>
        <p className="mt-2 text-[11px] text-cocoa-light">Custom values must be whole minutes, up to 7 days. Choose Immediately for 0 minutes.</p>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4 border-t border-ink/10 pt-5">
        <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-ink">{editing ? 'Edit campaign' : 'Create notification'}</h3>{editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyForm()) }} className="text-xs underline">Stop editing</button>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-cocoa">Title<input required maxLength={100} value={form.title} onChange={(event) => update('title', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink" /></label>
          <label className="text-xs text-cocoa">Notification type<select value={form.type} onChange={(event) => update('type', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink">{TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="text-xs text-cocoa sm:col-span-2">Message<textarea required maxLength={500} rows={2} value={form.message} onChange={(event) => update('message', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink" /></label>
          <label className="text-xs text-cocoa">Destination path<input required value={form.destination} onChange={(event) => update('destination', event.target.value)} placeholder="/ or /category/sarees" className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink" /></label>
          <label className="text-xs text-cocoa">Button text (optional)<input maxLength={32} value={form.action_text} onChange={(event) => update('action_text', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink" /></label>
          <label className="text-xs text-cocoa sm:col-span-2">Image URL (optional, HTTPS or internal path)<input value={form.image} onChange={(event) => update('image', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-sm text-ink" /></label>
        </div>
        <div className="flex flex-wrap gap-4 border-y border-ink/10 py-3 text-xs text-ink">
          {[["now", 'Send now'], ['once', 'Schedule once'], ['repeat', 'Repeat']].map(([value, label]) => <label key={value} className="inline-flex items-center gap-2"><input type="radio" name="push-send-mode" checked={form.send_mode === value} onChange={() => update('send_mode', value)} />{label}</label>)}
        </div>
        {form.send_mode === 'once' && <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-cocoa">Date<input type="date" min={todayText()} required value={form.schedule.date} onChange={(event) => setSchedule('date', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
          <label className="text-xs text-cocoa">Time<input type="time" required value={form.schedule.time} onChange={(event) => setSchedule('time', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
          <label className="text-xs text-cocoa">Timezone<input required value={form.schedule.timezone} onChange={(event) => setSchedule('timezone', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
        </div>}
        {form.send_mode === 'repeat' && <div className="space-y-3 border border-ink/10 bg-paper p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-cocoa">Repeat<select value={form.schedule.frequency} onChange={(event) => setSchedule('frequency', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom_days">Custom days</option></select></label>
            <label className="text-xs text-cocoa">Time<input type="time" required value={form.schedule.time} onChange={(event) => setSchedule('time', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
            <label className="text-xs text-cocoa">Timezone<input required value={form.schedule.timezone} onChange={(event) => setSchedule('timezone', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
            <label className="text-xs text-cocoa">Start date<input type="date" required value={form.schedule.start_date} onChange={(event) => setSchedule('start_date', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
          </div>
          {(form.schedule.frequency === 'weekly' || form.schedule.frequency === 'custom_days') && <div className="flex flex-wrap gap-x-4 gap-y-2">{WEEKDAYS.map(([day, number]) => <label key={day} className="inline-flex items-center gap-1.5 text-xs text-ink"><input type="checkbox" checked={form.schedule.days_of_week.includes(number)} onChange={() => toggleDay(number)} />{day}</label>)}</div>}
          <label className="block max-w-xs text-xs text-cocoa">End date (leave blank for no end date)<input type="date" min={form.schedule.start_date} value={form.schedule.end_date} onChange={(event) => setSchedule('end_date', event.target.value)} className="mt-1 block w-full border border-ink/15 bg-paper p-2.5 text-ink" /></label>
        </div>}
        <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={busy || loading || !data?.configured || (form.send_mode === 'now' && !data?.enabled)} className="inline-flex items-center gap-2 bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-paper disabled:opacity-50"><Send className="h-3.5 w-3.5" />{busy ? 'Saving…' : form.send_mode === 'now' ? 'Send now' : editing ? 'Save changes' : 'Schedule notification'}</button>{!data?.enabled && form.send_mode === 'now' && <span className="text-xs text-cocoa-light">Enable the global setting to send.</span>}</div>
      </form>

      {error && <p role="alert" className="mt-4 border border-rose-800/20 bg-rose-50 p-3 text-xs text-rose-900">{error}</p>}
      {notice && <p role="status" className="mt-4 border border-emerald-800/20 bg-emerald-50 p-3 text-xs text-emerald-900">{notice}</p>}

      <div className="mt-7 border-t border-ink/10 pt-5">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Notification history</h3><button type="button" disabled={busy || loading} onClick={load} className="inline-flex items-center gap-1 text-[10px] uppercase text-cocoa"><RefreshCw className="h-3 w-3" />Refresh</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="border-b border-ink/10 text-[10px] uppercase tracking-wider text-cocoa-light"><tr>{['Notification', 'Type', 'Schedule', 'Status', 'Sent', 'Targeted', 'Success', 'Failed', 'Actions'].map((name) => <th key={name} className="p-2">{name}</th>)}</tr></thead><tbody className="divide-y divide-ink/5">{campaigns.map((campaign) => <tr key={campaign.id}><td className="p-2 font-medium text-ink">{campaign.title}</td><td className="p-2">{campaign.type}</td><td className="p-2">{scheduleLabel(campaign)}</td><td className="p-2 capitalize">{campaign.status}</td><td className="p-2">{campaign.run_count || 0}</td><td className="p-2">{campaign.targeted_count || 0}</td><td className="p-2">{campaign.success_count || 0}</td><td className="p-2">{campaign.failed_count || 0}</td><td className="p-2"><div className="flex items-center gap-2">{['scheduled', 'active', 'paused'].includes(campaign.status) && <><button type="button" title="Edit" onClick={() => edit(campaign)}><Pencil className="h-3.5 w-3.5" /></button>{campaign.status === 'paused' ? <button type="button" title="Resume" onClick={() => action(campaign, 'resume')}><Play className="h-3.5 w-3.5" /></button> : <button type="button" title="Pause" onClick={() => action(campaign, 'pause')}><Pause className="h-3.5 w-3.5" /></button>}<button type="button" title="Cancel" onClick={() => action(campaign, 'cancel')}><XCircle className="h-3.5 w-3.5" /></button></>}</div></td></tr>)}</tbody></table></div>
        {!campaigns.length && <p className="py-4 text-xs text-cocoa-light">No browser notification campaigns yet.</p>}
      </div>
    </section>
  )
}
