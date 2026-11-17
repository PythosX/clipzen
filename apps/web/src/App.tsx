import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { api } from './api'
import Landing from './pages/Landing'; import Auth from './pages/Auth'; import Shell from './components/Shell'
import Overview from './pages/Overview'; import Library from './pages/Library'; import Integrations from './pages/Integrations'; import NotBuilt from './pages/NotBuilt'; import Video from './pages/Video'; import Queue from './pages/Queue'
export type User = { id: string; name: string; email: string }
function Protected() {
  const [u, setU] = useState<User | null | undefined>(undefined)
  useEffect(() => { api('/api/auth/me').then(d => setU(d.user)).catch(() => setU(null)) }, [])
  if (u === undefined) return <div className="grid h-screen place-items-center text-mute">Loading…</div>
  return u ? <Shell user={u}><Outlet /></Shell> : <Navigate to="/login" replace />
}
export default function App() {
  const nb = (t: string, note: string) => <NotBuilt title={t} note={note} />
  return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Auth mode="login" />} /><Route path="/register" element={<Auth mode="register" />} />
    <Route path="/app" element={<Protected />}>
      <Route index element={<Overview />} /><Route path="library" element={<Library />} /><Route path="video/:id" element={<Video />} /><Route path="queue" element={<Queue />} /><Route path="scheduler" element={<Queue />} /><Route path="integrations" element={<Integrations />} />
      <Route path="analysis" element={nb('AI Analysis', 'Open a video from the Content Library to analyze it and edit its metadata.')} />
      <Route path="trends" element={nb('Trend Research', 'Needs a YouTube Data API key; Milestone 5.')} />
      <Route path="metadata" element={nb('Metadata Studio', 'Open a video from the Content Library to analyze it and edit its metadata.')} />
      <Route path="analytics" element={nb('Analytics', 'Shows only real platform data; Milestone 8.')} />
      <Route path="settings" element={nb('Settings', 'automation_settings table exists; UI is a later milestone.')} />
      <Route path="help" element={nb('Help & Support', 'See README.md in the repository.')} />
    </Route>
    <Route path="*" element={<Navigate to="/" />} />
  </Routes>
}
