import { Construction } from 'lucide-react'
export default function NotBuilt({ title, note }: { title: string; note: string }) {
  return <div className="max-w-xl rounded-xl border border-dashed border-line p-8"><Construction className="mb-3 text-warn" /><h1 className="font-display text-2xl">{title}</h1><p className="mt-2 text-mute">Not built yet. {note}</p></div>
}
