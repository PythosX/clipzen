const BASE = import.meta.env.VITE_API_URL ?? ''
export class ApiError extends Error { constructor(public code: string, msg: string) { super(msg) } }
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const res = await fetch(BASE + path, { credentials: 'include', ...rest, headers: json ? { 'content-type': 'application/json' } : rest.headers, body: json ? JSON.stringify(json) : rest.body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data?.error?.code ?? 'ERROR', data?.error?.message ?? 'Request failed')
  return data
}
export const readDuration = (f: File) => new Promise<number | null>(ok => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { ok(v.duration); URL.revokeObjectURL(v.src) }; v.onerror = () => ok(null); v.src = URL.createObjectURL(f) })
// XHR so we get real upload progress.
export const putFile = (path: string, f: File, onP: (n: number) => void) => new Promise<void>((ok, bad) => {
  const x = new XMLHttpRequest(); x.open('PUT', BASE + path); x.withCredentials = true; x.setRequestHeader('content-type', f.type)
  x.upload.onprogress = e => e.lengthComputable && onP(e.loaded / e.total); x.onload = () => x.status < 300 ? ok() : bad(new Error('Upload failed (' + x.status + ')')); x.onerror = () => bad(new Error('Network error during upload')); x.send(f)
})
