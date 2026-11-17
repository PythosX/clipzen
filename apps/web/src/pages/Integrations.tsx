import { useEffect, useState } from 'react'; import { api } from '../api'
export default function Integrations() {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api('/api/integrations').then(setD) }, [])
  const label = (s: string) => ({ connected: 'Connected', disconnected: 'Disconnected', not_configured: 'Setup required', attention_required: 'Attention Required' } as any)[s] ?? s
  return <div className="space-y-4"><h1 className="font-display text-2xl">Integrations</h1>
    {d && (['youtube', 'instagram'] as const).map(p => <div key={p} className="flex items-center justify-between rounded-xl border border-line bg-card p-5"><div><div className="font-medium capitalize">{p}</div><div className="text-sm text-mute">{label(d[p].status)}{!d[p].configured && ' — add OAuth credentials to the Worker (see README).'}</div></div><button className="btn-s" disabled>OAuth flow: Milestone 7</button></div>)}
    {d && <p className="text-sm text-mute">AI provider: {d.ai.configured ? 'key present' : 'not configured'} · Storage: {d.storage.configured ? 'R2 bound' : 'not bound'}</p>}</div>
}
