import { useCallback, useEffect, useRef, useState } from 'react'; import { Trash2, UploadCloud } from 'lucide-react'; import { Link } from 'react-router-dom'; import { api, putFile, readDuration } from '../api'
const fmt = (s: number | null) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—'
export default function Library() {
  const [items, setItems] = useState<any[] | null>(null), [prog, setProg] = useState<Record<string, number>>({}), [err, setErr] = useState(''), [drag, setDrag] = useState(false), input = useRef<HTMLInputElement>(null)
  const load = useCallback(() => api('/api/videos').then(d => setItems(d.items)).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  async function upload(files: FileList | null) {
    setErr('')
    for (const f of Array.from(files ?? [])) {
      const key = f.name + f.size
      try {
        const { videoId, uploadPath } = await api('/api/videos/upload-url', { method: 'POST', json: { fileName: f.name, contentType: f.type, size: f.size } })
        await putFile(uploadPath, f, n => setProg(p => ({ ...p, [key]: n })))
        await api('/api/videos/complete-upload', { method: 'POST', json: { videoId, durationS: await readDuration(f) } })
      } catch (e: any) { setErr(`${f.name}: ${e.message}`) } finally { setProg(p => { const { [key]: _, ...rest } = p; return rest }) }
    }
    load()
  }
  return <div className="space-y-6"><h1 className="font-display text-2xl">Content Library</h1>
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
      className={`grid place-items-center rounded-2xl border-2 border-dashed p-10 text-center transition ${drag ? 'border-brand bg-brand/10' : 'border-line'}`}>
      <UploadCloud className="text-sky" /><p className="mt-2">Drag videos here or</p><button className="btn-s mt-2" onClick={() => input.current?.click()}>Choose files</button>
      <input ref={input} hidden type="file" multiple accept="video/mp4,video/quicktime,video/webm" onChange={e => upload(e.target.files)} /><p className="mt-2 text-xs text-mute">MP4, MOV or WebM. The size limit is set by the server.</p></div>
    {Object.entries(prog).map(([k, v]) => <div key={k} className="h-2 overflow-hidden rounded bg-elev"><div className="h-full bg-brand transition-all" style={{ width: v * 100 + '%' }} /></div>)}
    {err && <p role="alert" className="text-sm text-bad">{err}</p>}
    {items?.length === 0 && <p className="text-mute">No videos yet. Upload your first one above.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items?.map(v => <div key={v.id} className="rounded-xl border border-line bg-card p-4">
      <div className="truncate font-medium">{v.file_name}</div><div className="mt-1 text-sm text-mute">{fmt(v.duration_s)} · {new Date(v.created_at + 'Z').toLocaleDateString()}</div>
      <div className="mt-3 flex items-center justify-between"><span className="rounded-full bg-elev px-2 py-1 text-xs">{v.status}</span><span className="text-xs text-mute">AI: {v.analysis_status ?? '—'}</span>
        <Link to={"/app/video/"+v.id} className="btn-s">Open</Link><button aria-label="Delete video" className="btn-s" onClick={async () => { if (confirm('Delete this video permanently?')) { await api('/api/videos/' + v.id, { method: 'DELETE' }); load() } }}><Trash2 size={16} /></button></div></div>)}</div></div>
}
