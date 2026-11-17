import { useEffect, useState } from 'react'; import { Link } from 'react-router-dom'; import { CalendarClock, Film, Send, Gauge } from 'lucide-react'; import { api } from '../api'
export default function Overview() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState('')
  useEffect(() => { api('/api/overview').then(setD).catch(e => setErr(e.message)) }, [])
  if (err) return <p role="alert" className="text-bad">{err}</p>
  const cards = [['Total Videos', d?.total, Film], ['Published Videos', d?.published, Send], ['Scheduled Videos', d?.scheduled, CalendarClock], ['Average Performance', d?.avgPerformance ?? '—', Gauge]] as const
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl">Welcome back, Creator</h1><p className="text-mute">Your content workflow at a glance.</p></div><Link to="/app/library" className="btn-p">Upload video</Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([l, v, I]) => <div key={l} className="rounded-xl border border-line bg-card p-5 transition hover:-translate-y-0.5 hover:bg-elev"><I size={18} className="text-sky" /><div className="mt-3 font-display text-3xl">{d ? v : <span className="inline-block h-8 w-12 animate-pulse rounded bg-elev" />}</div><div className="text-sm text-mute">{l}</div></div>)}</div>
    {d?.failedJobs > 0 && <p className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm">{d.failedJobs} publishing job(s) failed. Open the Publishing Queue to review.</p>}
    <p className="text-sm text-mute">Average performance shows “—” until a connected platform returns real analytics.</p>
  </div>
}
