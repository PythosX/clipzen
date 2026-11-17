import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Activity, BarChart3, CalendarClock, FileText, Film, HelpCircle, LayoutDashboard, ListChecks, LogOut, Menu, Plug, Search, Settings, TrendingUp, Wand2 } from 'lucide-react'
import { api } from '../api'; import type { User } from '../App'
const nav = [['', 'Overview', LayoutDashboard], ['library', 'Content Library', Film], ['analysis', 'AI Analysis', Wand2], ['trends', 'Trend Research', TrendingUp], ['metadata', 'Metadata Studio', FileText], ['scheduler', 'Smart Scheduler', CalendarClock], ['queue', 'Publishing Queue', ListChecks], ['analytics', 'Analytics', BarChart3]] as const
const nav2 = [['integrations', 'Integrations', Plug], ['settings', 'Settings', Settings], ['help', 'Help & Support', HelpCircle]] as const
export const Logo = () => <span className="flex items-center gap-2 font-display text-lg font-bold"><span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-brand to-sky"><Activity size={16} /></span>Clipzen</span>
export default function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(false), go = useNavigate()
  const item = ([to, label, Icon]: readonly [string, string, any]) => <NavLink key={to} to={'/app/' + to} end={to === ''} title={label} onClick={() => setOpen(false)}
    className={({ isActive }) => `flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm transition ${isActive ? 'bg-elev text-ink shadow-[inset_2px_0_0_#8B5CF6]' : 'text-mute hover:bg-card'}`}><Icon size={18} />{!collapsed && label}</NavLink>
  return <div className="min-h-screen md:flex">
    {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
    <aside className={`fixed z-40 h-full border-r border-line bg-bg2 p-3 transition-transform md:static md:translate-x-0 ${open ? '' : '-translate-x-full'} ${collapsed ? 'w-[72px]' : 'w-60'}`}>
      <button className="mb-4 px-2 py-3" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">{collapsed ? <Menu size={20} /> : <Logo />}</button>
      <nav className="space-y-1">{nav.map(item)}</nav><div className="my-3 border-t border-line" /><nav className="space-y-1">{nav2.map(item)}</nav>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button className="btn-s md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
        <div className="relative max-w-md flex-1"><Search size={16} className="absolute left-3 top-3.5 text-mute" /><input className="input pl-9" placeholder="Search videos" aria-label="Search" /></div>
        <span className="hidden text-sm text-mute sm:block">{user.name}</span>
        <button className="btn-s" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); go('/login') }} aria-label="Log out"><LogOut size={16} /></button>
      </header>
      <main className="p-4 md:p-8">{children}</main>
    </div></div>
}
