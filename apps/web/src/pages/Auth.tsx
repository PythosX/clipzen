import { useState } from 'react'; import { Link, useNavigate } from 'react-router-dom'; import { api } from '../api'; import { Logo } from '../components/Shell'
export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState(false), go = useNavigate()
  const reg = mode === 'register'
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (reg && f.password !== f.confirm) return setErr('Passwords do not match.')
    setBusy(true)
    try { await api(`/api/auth/${mode}`, { method: 'POST', json: f }); go('/app') } catch (x: any) { setErr(x.message) } finally { setBusy(false) }
  }
  return <div className="glow grid min-h-screen place-items-center p-4"><form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-card p-6">
    <Logo /><h1 className="pt-2 font-display text-2xl">{reg ? 'Create your account' : 'Log in'}</h1>
    {reg && <input className="input" placeholder="Name" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />}
    <input className="input" type="email" placeholder="Email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
    <input className="input" type={show ? 'text' : 'password'} placeholder="Password (8+ characters)" required minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
    {reg && <input className="input" type={show ? 'text' : 'password'} placeholder="Confirm password" required value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} />}
    <label className="flex items-center gap-2 text-sm text-mute"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show password</label>
    {err && <p role="alert" className="text-sm text-bad">{err}</p>}
    <button className="btn-p w-full" disabled={busy}>{busy ? 'Please wait…' : reg ? 'Create account' : 'Log in'}</button>
    <p className="text-sm text-mute">{reg ? <>Have an account? <Link className="text-sky" to="/login">Log in</Link></> : <>New here? <Link className="text-sky" to="/register">Create an account</Link></>}</p>
  </form></div>
}
