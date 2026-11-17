import { useCallback, useEffect, useState } from 'react'; import { useParams } from 'react-router-dom'; import { api } from '../api'
const LIM: any = { youtube: { title: 100, body: 5000 }, instagram: { title: 0, body: 2200 } }
export default function Video() {
  const { id } = useParams(), [d, setD] = useState<any>(null), [err, setErr] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(''), [ctx, setCtx] = useState(''), [tone, setTone] = useState('entertaining')
  const [edit, setEdit] = useState<any>({}), [plats, setPlats] = useState(['youtube', 'instagram']), [when, setWhen] = useState('')
  const load = useCallback(() => api('/api/videos/' + id).then(x => { setD(x); setEdit(Object.fromEntries(x.metadata.map((m: any) => [m.platform, m]))) }).catch(e => setErr(e.message)), [id])
  useEffect(() => { load() }, [load])
  const run = async (k: string, fn: () => Promise<any>) => { setBusy(k); setErr(''); setMsg(''); try { const r = await fn(); if (r?.warnings?.length) setMsg(r.warnings.join(' ')); } catch (e: any) { setErr(e.message) } finally { setBusy(''); load() } }
  if (!d) return <p className={err ? 'text-bad' : 'text-mute'}>{err || 'Loading…'}</p>
  const a = d.analysis, r = a?.result
  const field = (p: string) => { const m = edit[p] ?? { title: '', body: '', hashtags: '' }, l = LIM[p], set = (k: string, v: string) => setEdit({ ...edit, [p]: { ...m, [k]: v } })
    return <div key={p} className="space-y-2 rounded-xl border border-line bg-card p-4"><div className="flex justify-between"><b className="capitalize">{p}</b><span className="text-xs text-mute">{m.source === 'ai' ? 'AI suggestion' : m.id ? 'Edited by you' : 'Empty'}</span></div>
      {l.title > 0 && <input className="input" aria-label="Title" placeholder="Title" value={m.title} onChange={e => set('title', e.target.value)} />}
      <textarea className="input min-h-[110px] py-2" aria-label="Text" placeholder={p === 'youtube' ? 'Description' : 'Caption'} value={m.body} onChange={e => set('body', e.target.value)} />
      <input className="input" aria-label="Hashtags" placeholder="hashtags, comma separated" value={m.hashtags} onChange={e => set('hashtags', e.target.value)} />
      <div className="flex items-center justify-between"><span className={`text-xs ${m.body.length > l.body ? 'text-bad' : 'text-mute'}`}>{m.body.length}/{l.body}</span><button className="btn-s" disabled={!!busy} onClick={() => run('save' + p, () => api(`/api/metadata/${id}/${p}`, { method: 'PUT', json: m }))}>Save</button></div></div> }
  return <div className="max-w-3xl space-y-6"><h1 className="truncate font-display text-2xl">{d.video.file_name}</h1>
    {err && <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm">{err}</p>}{msg && <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">{msg}</p>}
    <section className="space-y-3"><h2 className="font-display text-xl">AI analysis</h2>
      <textarea className="input min-h-[90px] py-2" placeholder="Paste a transcript or describe the video (20+ characters)" value={ctx} onChange={e => setCtx(e.target.value)} />
      <button className="btn-p" disabled={!!busy} onClick={() => run('an', () => api(`/api/videos/${id}/analyze`, { method: 'POST', json: { transcript: ctx } }))}>{busy === 'an' ? 'Analyzing…' : a?.status === 'FAILED' ? 'Retry analysis' : 'Analyze'}</button>
      {a?.status === 'FAILED' && <p className="text-sm text-bad">Last attempt failed: {a.error}</p>}
      {r && <div className="rounded-xl border border-line bg-card p-4 text-sm"><p className="mb-2 text-xs text-mute">AI suggestions based on the text you provided, not on video frames.</p>
        {['topic', 'niche', 'language', 'format', 'audience', 'summary', 'hook_assessment'].map(k => <p key={k}><span className="text-mute">{k.replace('_', ' ')}: </span>{String(r[k] ?? 'Not determinable')}</p>)}<p><span className="text-mute">keywords: </span>{(r.keywords ?? []).join(', ')}</p></div>}</section>
    <section className="space-y-3"><h2 className="font-display text-xl">Metadata</h2>
      <div className="flex gap-2"><select className="input max-w-[200px]" value={tone} onChange={e => setTone(e.target.value)}>{['entertaining', 'educational', 'storytelling', 'professional', 'casual', 'suspenseful'].map(t => <option key={t}>{t}</option>)}</select>
        <button className="btn-s" disabled={!!busy || a?.status !== 'DONE'} onClick={() => run('gen', () => api('/api/metadata/generate', { method: 'POST', json: { videoId: id, tone } }))}>{busy === 'gen' ? 'Generating…' : 'Generate with AI'}</button></div>
      <div className="grid gap-3 md:grid-cols-2">{['youtube', 'instagram'].map(field)}</div></section>
    <section className="space-y-3"><h2 className="font-display text-xl">Schedule</h2>
      <div className="flex flex-wrap gap-4">{['youtube', 'instagram'].map(p => <label key={p} className="flex min-h-[44px] items-center gap-2 capitalize"><input type="checkbox" checked={plats.includes(p)} onChange={e => setPlats(e.target.checked ? [...plats, p] : plats.filter(x => x !== p))} />{p}</label>)}</div>
      <input type="datetime-local" className="input max-w-xs" value={when} onChange={e => setWhen(e.target.value)} /><p className="text-xs text-mute">Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Times are experimental choices, not predictions.</p>
      <button className="btn-p" disabled={!!busy || !when} onClick={() => run('sch', () => api('/api/schedules', { method: 'POST', json: { videoId: id, platforms: plats, publishAt: new Date(when).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }))}>Schedule</button>
      {d.jobs.map((j: any) => <p key={j.id} className="text-sm"><span className="capitalize">{j.platform}</span>: {j.status} · {new Date(j.run_at).toLocaleString()}</p>)}</section></div>
}
