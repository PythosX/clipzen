import { useCallback, useEffect, useState } from 'react'; import { api } from '../api'
export default function Queue() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState('')
  const load = useCallback(() => api('/api/publishing/queue').then(setD).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  const act = async (p: string, json?: any) => { setErr(''); try { await api(p, { method: 'POST', json }); } catch (e: any) { setErr(e.message) } load() }
  const paused = d?.settings?.paused === 1
  return <div className="max-w-3xl space-y-4"><div className="flex items-center justify-between"><h1 className="font-display text-2xl">Publishing Queue</h1>
    <button className="btn-s" onClick={() => act(paused ? '/api/publishing/resume' : '/api/publishing/pause')}>{paused ? 'Resume all publishing' : 'Pause all publishing'}</button></div>
    {paused && <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">Publishing is paused. Due jobs wait until you resume.</p>}
    {err && <p role="alert" className="text-sm text-bad">{err}</p>}{d?.items.length === 0 && <p className="text-mute">Nothing scheduled. Open a video in the Content Library to schedule it.</p>}
    {d?.items.map((j: any) => <div key={j.id} className="rounded-xl border border-line bg-card p-4"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{j.file_name}</div><div className="text-sm capitalize text-mute">{j.platform} · {new Date(j.run_at).toLocaleString()} · attempt {j.attempts}/{j.max_attempts}</div></div>
      <span className={`rounded-full px-2 py-1 text-xs ${j.status === 'FAILED' ? 'bg-bad/20' : 'bg-elev'}`}>{j.status}</span></div>
      {j.error && <p className="mt-2 text-sm text-bad">{j.error}</p>}
      <div className="mt-2 flex gap-2">{j.status === 'FAILED' && j.attempts < j.max_attempts && <button className="btn-s" onClick={() => act(`/api/publishing/${j.id}/retry`)}>Retry</button>}
        {['SCHEDULED', 'FAILED', 'RETRY_PENDING'].includes(j.status) && <button className="btn-s" onClick={async () => { if (confirm('Cancel this scheduled post?')) { try { await api(`/api/schedules/${j.video_id}/${j.platform}`, { method: 'DELETE' }) } catch (e: any) { setErr(e.message) } load() } }}>Cancel</button>}</div></div>)}</div>
}
