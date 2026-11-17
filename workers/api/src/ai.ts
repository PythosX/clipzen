import type { Env } from './index'
export class AiError extends Error { constructor(public code: string, m: string) { super(m) } }
// Provider-independent entry point. Only Gemini's REST API is wired; add others by branching on AI_PROVIDER.
export async function aiJson(env: Env, prompt: string): Promise<unknown> {
  if (!env.AI_API_KEY || !env.AI_MODEL) throw new AiError('AI_NOT_CONFIGURED', 'No AI provider is configured (set AI_API_KEY and AI_MODEL). You can edit metadata manually.')
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.AI_MODEL)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.AI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }) })
  if (res.status === 429) throw new AiError('AI_QUOTA', 'AI quota is exhausted. Try again later or edit manually.')
  if (!res.ok) throw new AiError('AI_ERROR', `The AI provider returned an error (${res.status}).`)
  const d: any = await res.json()
  try { return JSON.parse(d.candidates[0].content.parts[0].text) } catch { throw new AiError('AI_BAD_OUTPUT', 'The AI returned output that could not be read. Retry.') }
}
