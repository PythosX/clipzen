import { aiJson, AiError } from "./ai"
export interface Env { DB: D1Database; BUCKET: R2Bucket; ALLOWED_ORIGIN: string; MAX_UPLOAD_BYTES: string; YOUTUBE_CLIENT_ID?: string; INSTAGRAM_APP_ID?: string; AI_API_KEY?: string; AI_MODEL?: string }
type Ctx = { env: Env; req: Request; url: URL; user: { id: string; name: string; email: string; onboarded: number } | null }
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map(h => parseInt(h, 16)));
const id = () => crypto.randomUUID();
const J = (d: unknown, s = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', ...h } });
const E = (code: string, message: string, s = 400) => J({ error: { code, message } }, s);
const ALLOWED = ['video/mp4', 'video/quicktime', 'video/webm'];

async function pbkdf2(pw: string, salt: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256));
}
const sha = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const safeEq = (a: string, b: string) => a.length === b.length && [...a].reduce((r, c, i) => r | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

async function startSession(env: Env, userId: string) {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const exp = new Date(Date.now() + 30 * 864e5).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(raw), userId, exp).run();
  return `cz_session=${raw}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${30 * 86400}`;
}
const cookie = (req: Request) => /(?:^|;\s*)cz_session=([a-f0-9]+)/.exec(req.headers.get('cookie') || '')?.[1];

async function auth(env: Env, req: Request) {
  const t = cookie(req); if (!t) return null;
  return await env.DB.prepare("SELECT u.id,u.name,u.email,u.onboarded FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now')").bind(await sha(t)).first<Ctx['user']>();
}

type H = (c: Ctx, p: string[]) => Promise<Response>;
const routes: [string, RegExp, boolean, H][] = [];
const r = (m: string, path: string, needAuth: boolean, h: H) => routes.push([m, new RegExp('^' + path.replace(/:\w+/g, '([^/]+)') + '$'), needAuth, h]);

r('POST', '/api/auth/register', false, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || String(b.password || '').length < 8 || !String(b.name || '').trim()) return E('VALIDATION', 'Enter a name, a valid email and a password of at least 8 characters.');
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) return E('EMAIL_TAKEN', 'An account with this email already exists.', 409);
  const uid = id(), salt = crypto.getRandomValues(new Uint8Array(16));
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)').bind(uid, String(b.name).trim().slice(0, 80), email, hex(salt) + ':' + await pbkdf2(b.password, salt)),
    c.env.DB.prepare('INSERT INTO user_preferences(user_id) VALUES(?)').bind(uid),
    c.env.DB.prepare('INSERT INTO automation_settings(user_id) VALUES(?)').bind(uid)]);
  return J({ ok: true }, 201, { 'set-cookie': await startSession(c.env, uid) });
});
r('POST', '/api/auth/login', false, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const u = await c.env.DB.prepare('SELECT id,password_hash FROM users WHERE email=?').bind(String(b.email || '').toLowerCase()).first<{ id: string; password_hash: string }>();
  const [salt, h] = (u?.password_hash || '00:00').split(':');
  const ok = u && safeEq(await pbkdf2(String(b.password || ''), unhex(salt.length % 2 ? '00' : salt)), h);
  if (!u || !ok) return E('BAD_CREDENTIALS', 'Email or password is incorrect.', 401);
  return J({ ok: true }, 200, { 'set-cookie': await startSession(c.env, u.id) });
});
r('POST', '/api/auth/logout', false, async (c) => {
  const t = cookie(c.req); if (t) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(t)).run();
  return J({ ok: true }, 200, { 'set-cookie': 'cz_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0' });
});
r('GET', '/api/auth/me', true, async (c) => J({ user: c.user }));

r('POST', '/api/videos/upload-url', true, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const max = Number(c.env.MAX_UPLOAD_BYTES);
  if (!ALLOWED.includes(b.contentType)) return E('UNSUPPORTED_TYPE', `Supported formats: ${ALLOWED.join(', ')}.`);
  if (!(b.size > 0) || b.size > max) return E('TOO_LARGE', `File must be between 1 byte and ${max} bytes (configured MAX_UPLOAD_BYTES).`);
  const vid = id(), name = String(b.fileName || 'video').replace(/[^\w.\- ]/g, '_').slice(0, 120);
  await c.env.DB.prepare('INSERT INTO videos(id,user_id,file_name,content_type,size_bytes,r2_key) VALUES(?,?,?,?,?,?)').bind(vid, c.user!.id, name, b.contentType, b.size, `${c.user!.id}/${vid}`).run();
  return J({ videoId: vid, uploadPath: `/api/videos/${vid}/content` }, 201);
});
// Streams the request body straight into R2 (never buffered in Worker memory).
r('PUT', '/api/videos/:id/content', true, async (c, [vid]) => {
  const v = await c.env.DB.prepare("SELECT r2_key,size_bytes,content_type FROM videos WHERE id=? AND user_id=? AND status='PENDING_UPLOAD'").bind(vid, c.user!.id).first<any>();
  if (!v || !c.req.body) return E('NOT_FOUND', 'Upload record not found or already completed.', 404);
  if (Number(c.req.headers.get('content-length')) !== v.size_bytes) return E('SIZE_MISMATCH', 'Content-Length does not match the declared size.');
  await c.env.BUCKET.put(v.r2_key, c.req.body, { httpMetadata: { contentType: v.content_type } });
  return J({ ok: true });
});
r('POST', '/api/videos/complete-upload', true, async (c) => {
  const b: any = await c.req.json().catch(() => ({}));
  const v = await c.env.DB.prepare("SELECT r2_key FROM videos WHERE id=? AND user_id=? AND status='PENDING_UPLOAD'").bind(b.videoId, c.user!.id).first<any>();
  if (!v || !(await c.env.BUCKET.head(v.r2_key))) return E('NOT_UPLOADED', 'The file was not found in storage. Upload it again.', 409);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE videos SET status='UPLOADED',duration_s=?,updated_at=datetime('now') WHERE id=?").bind(Number(b.durationS) || null, b.videoId),
    c.env.DB.prepare("INSERT INTO video_analysis(id,video_id,user_id,status) VALUES(?,?,?,'QUEUED')").bind(id(), b.videoId, c.user!.id)]);
  return J({ ok: true });
});
r('GET', '/api/videos', true, async (c) => {
  const lim = Math.min(Number(c.url.searchParams.get('limit')) || 24, 100), off = Number(c.url.searchParams.get('offset')) || 0;
  const rows = await c.env.DB.prepare("SELECT v.id,v.file_name,v.size_bytes,v.duration_s,v.status,v.created_at,(SELECT status FROM video_analysis a WHERE a.video_id=v.id ORDER BY rowid DESC LIMIT 1) AS analysis_status FROM videos v WHERE v.user_id=? AND v.status!='PENDING_UPLOAD' ORDER BY v.created_at DESC LIMIT ? OFFSET ?").bind(c.user!.id, lim, off).all();
  return J({ items: rows.results, limit: lim, offset: off });
});
r('DELETE', '/api/videos/:id', true, async (c, [vid]) => {
  const v = await c.env.DB.prepare('SELECT r2_key FROM videos WHERE id=? AND user_id=?').bind(vid, c.user!.id).first<any>();
  if (!v) return E('NOT_FOUND', 'Video not found.', 404);
  await c.env.BUCKET.delete(v.r2_key); await c.env.DB.prepare('DELETE FROM videos WHERE id=?').bind(vid).run();
  return J({ ok: true });
});
r('GET', '/api/overview', true, async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) total,SUM(status='PUBLISHED') published,SUM(status='SCHEDULED') scheduled FROM videos WHERE user_id=? AND status!='PENDING_UPLOAD'").bind(c.user!.id).first<any>();
  const failed = await c.env.DB.prepare("SELECT COUNT(*) n FROM publishing_jobs WHERE user_id=? AND status='FAILED'").bind(c.user!.id).first<any>();
  return J({ total: row.total || 0, published: row.published || 0, scheduled: row.scheduled || 0, failedJobs: failed.n, avgPerformance: null });
});
r('GET', '/api/integrations', true, async (c) => {
  const acc = await c.env.DB.prepare('SELECT platform,display_name,status FROM connected_accounts WHERE user_id=?').bind(c.user!.id).all<any>();
  const get = (p: string, configured: boolean) => ({ platform: p, configured, ...(acc.results.find(a => a.platform === p) ?? { status: configured ? 'disconnected' : 'not_configured' }) });
  return J({ youtube: get('youtube', !!c.env.YOUTUBE_CLIENT_ID), instagram: get('instagram', !!c.env.INSTAGRAM_APP_ID), ai: { configured: !!c.env.AI_API_KEY }, storage: { configured: !!c.env.BUCKET } });
});

const PLAT = ['youtube', 'instagram'];
const own = (c: Ctx, vid: string) => c.env.DB.prepare('SELECT * FROM videos WHERE id=? AND user_id=?').bind(vid, c.user!.id).first<any>();
const body = (c: Ctx): Promise<any> => c.req.json().catch(() => ({}));
const latestAnalysis = (c: Ctx, vid: string) => c.env.DB.prepare('SELECT status,result_json,error,created_at FROM video_analysis WHERE video_id=? AND user_id=? ORDER BY rowid DESC LIMIT 1').bind(vid, c.user!.id).first<any>();

r('GET', '/api/videos/:id', true, async (c, [vid]) => {
  const v = await own(c, vid); if (!v) return E('NOT_FOUND', 'Video not found.', 404);
  const [a, m, j] = await Promise.all([latestAnalysis(c, vid),
    c.env.DB.prepare('SELECT id,platform,title,body,hashtags,source,updated_at FROM generated_metadata WHERE video_id=? AND user_id=?').bind(vid, c.user!.id).all(),
    c.env.DB.prepare('SELECT id,platform,status,run_at,error FROM publishing_jobs WHERE video_id=? AND user_id=?').bind(vid, c.user!.id).all()]);
  return J({ video: { id: v.id, file_name: v.file_name, status: v.status }, analysis: a ? { status: a.status, error: a.error, result: a.result_json ? JSON.parse(a.result_json) : null } : null, metadata: m.results, jobs: j.results });
});
r('POST', '/api/videos/:id/analyze', true, async (c, [vid]) => {
  const v = await own(c, vid); if (!v || v.status === 'PENDING_UPLOAD') return E('NOT_FOUND', 'Video not found.', 404);
  const b = await body(c), text = String(b.transcript || b.notes || '').trim().slice(0, 8000);
  if (text.length < 20) return E('NEED_CONTEXT', 'Add a description or transcript (20+ characters). Frame-level video analysis is not implemented yet, so analysis uses the text you provide.');
  const aid = id();
  await c.env.DB.prepare("INSERT INTO video_analysis(id,video_id,user_id,status,provider) VALUES(?,?,?,'RUNNING','text-only')").bind(aid, vid, c.user!.id).run();
  if (b.transcript) await c.env.DB.prepare('INSERT INTO transcripts(id,video_id,user_id,body) VALUES(?,?,?,?)').bind(id(), vid, c.user!.id, text).run();
  try {
    const out = await aiJson(c.env, `You analyse short-form videos. Use ONLY the creator-written text below; you have not seen the video. Return JSON with keys: topic, niche, language, format, audience, keywords (array of strings), summary, hook_assessment. Use null for anything the text does not support.\nText:\n${text}`);
    await c.env.DB.batch([c.env.DB.prepare("UPDATE video_analysis SET status='DONE',result_json=?,updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(out), aid),
      c.env.DB.prepare("UPDATE videos SET status='ANALYZED',updated_at=datetime('now') WHERE id=? AND status='UPLOADED'").bind(vid)]);
    return J({ ok: true });
  } catch (e) {
    const code = e instanceof AiError ? e.code : 'AI_ERROR', msg = e instanceof AiError ? e.message : 'Analysis failed.';
    await c.env.DB.prepare("UPDATE video_analysis SET status='FAILED',error=?,updated_at=datetime('now') WHERE id=?").bind(msg, aid).run();
    return E(code, msg, 502);
  }
});

const LIM: any = { youtube: { t: 100, b: 5000, h: 15 }, instagram: { t: 0, b: 2200, h: 30 } };
async function saveMeta(c: Ctx, vid: string, platform: string, m: any, source: 'ai' | 'manual') {
  const l = LIM[platform];
  const tags = (Array.isArray(m.hashtags) ? m.hashtags : String(m.hashtags || '').split(/[,\s]+/)).map((t: any) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, l.h).join(',');
  const row = [String(m.title || '').slice(0, l.t), String(m.body || '').slice(0, l.b), tags];
  const old = await c.env.DB.prepare('SELECT id,title,body,hashtags FROM generated_metadata WHERE video_id=? AND user_id=? AND platform=?').bind(vid, c.user!.id, platform).first<any>();
  const st = old
    ? [c.env.DB.prepare('INSERT INTO metadata_versions(id,metadata_id,snapshot_json) VALUES(?,?,?)').bind(id(), old.id, JSON.stringify(old)),
       c.env.DB.prepare("UPDATE generated_metadata SET title=?,body=?,hashtags=?,source=?,updated_at=datetime('now') WHERE id=?").bind(...row, source, old.id)]
    : [c.env.DB.prepare('INSERT INTO generated_metadata(id,video_id,user_id,platform,title,body,hashtags,source) VALUES(?,?,?,?,?,?,?,?)').bind(id(), vid, c.user!.id, platform, ...row, source)];
  st.push(c.env.DB.prepare("UPDATE videos SET status='METADATA_READY',updated_at=datetime('now') WHERE id=? AND status IN('UPLOADED','ANALYZED')").bind(vid));
  await c.env.DB.batch(st);
}
r('POST', '/api/metadata/generate', true, async (c) => {
  const b = await body(c), v = await own(c, b.videoId); if (!v) return E('NOT_FOUND', 'Video not found.', 404);
  const a = await latestAnalysis(c, b.videoId); if (a?.status !== 'DONE') return E('NO_ANALYSIS', 'Run a successful analysis first.', 409);
  try {
    const out: any = await aiJson(c.env, `Write social metadata for a short video, strictly consistent with this analysis: ${a.result_json}\nTone: ${String(b.tone || 'entertaining').slice(0, 30)}. Language: ${String(b.language || 'en').slice(0, 10)}.\nRules: no misleading clickbait, no unsupported claims, hashtags must relate to the actual content.\nReturn JSON: {"youtube":{"title","description","hashtags":[]},"instagram":{"caption","hashtags":[]}}`);
    await saveMeta(c, b.videoId, 'youtube', { title: out.youtube?.title, body: out.youtube?.description, hashtags: out.youtube?.hashtags }, 'ai');
    await saveMeta(c, b.videoId, 'instagram', { body: out.instagram?.caption, hashtags: out.instagram?.hashtags }, 'ai');
    return J({ ok: true });
  } catch (e) { return E(e instanceof AiError ? e.code : 'AI_ERROR', e instanceof AiError ? e.message : 'Generation failed. You can still write metadata manually.', 502); }
});
r('PUT', '/api/metadata/:vid/:platform', true, async (c, [vid, platform]) => {
  if (!PLAT.includes(platform)) return E('VALIDATION', 'Unknown platform.');
  if (!(await own(c, vid))) return E('NOT_FOUND', 'Video not found.', 404);
  await saveMeta(c, vid, platform, await body(c), 'manual'); return J({ ok: true });
});

r('POST', '/api/schedules', true, async (c) => {
  const b = await body(c), v = await own(c, b.videoId); if (!v || v.status === 'PENDING_UPLOAD') return E('NOT_FOUND', 'Video not found.', 404);
  const plats = [...new Set<string>((b.platforms || []).filter((p: string) => PLAT.includes(p)))]; if (!plats.length) return E('VALIDATION', 'Pick at least one platform.');
  const at = new Date(b.publishAt); if (isNaN(+at) || +at < Date.now() + 60000) return E('BAD_TIME', 'Choose a time at least one minute in the future.');
  const [meta, acc] = await Promise.all([c.env.DB.prepare('SELECT platform FROM generated_metadata WHERE video_id=? AND user_id=?').bind(b.videoId, c.user!.id).all<any>(),
    c.env.DB.prepare("SELECT platform FROM connected_accounts WHERE user_id=? AND status='connected'").bind(c.user!.id).all<any>()]);
  const missing = plats.filter(p => !meta.results.some(m => m.platform === p)); if (missing.length) return E('NO_METADATA', `Save metadata for ${missing.join(' and ')} first.`, 409);
  const tz = String(b.timezone || 'UTC').slice(0, 60), iso = at.toISOString();
  const st = plats.flatMap(p => [c.env.DB.prepare('INSERT INTO scheduled_posts(id,user_id,video_id,platform,publish_at,timezone) VALUES(?,?,?,?,?,?)').bind(id(), c.user!.id, b.videoId, p, iso, tz),
    c.env.DB.prepare('INSERT INTO publishing_jobs(id,user_id,video_id,platform,idempotency_key,run_at) VALUES(?,?,?,?,?,?)').bind(id(), c.user!.id, b.videoId, p, `${b.videoId}:${p}`, iso)]);
  st.push(c.env.DB.prepare("UPDATE videos SET status='SCHEDULED',updated_at=datetime('now') WHERE id=?").bind(b.videoId));
  try { await c.env.DB.batch(st); } catch { return E('ALREADY_SCHEDULED', 'This video already has a job for one of those platforms.', 409); }
  return J({ ok: true, warnings: plats.filter(p => !acc.results.some(a => a.platform === p)).map(p => `${p} is not connected, so its job will fail until you connect it.`) }, 201);
});
r('DELETE', '/api/schedules/:vid/:platform', true, async (c, [vid, platform]) => {
  const d = await c.env.DB.prepare("DELETE FROM publishing_jobs WHERE video_id=? AND platform=? AND user_id=? AND status IN('SCHEDULED','FAILED','RETRY_PENDING')").bind(vid, platform, c.user!.id).run();
  if (!d.meta.changes) return E('NOT_CANCELLABLE', 'No cancellable job found (it may be publishing or published).', 409);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM scheduled_posts WHERE video_id=? AND platform=? AND user_id=?').bind(vid, platform, c.user!.id),
    c.env.DB.prepare("UPDATE videos SET status='METADATA_READY' WHERE id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM publishing_jobs WHERE video_id=?)").bind(vid, c.user!.id, vid)]);
  return J({ ok: true });
});
r('GET', '/api/publishing/queue', true, async (c) => {
  const [rows, s] = await Promise.all([c.env.DB.prepare('SELECT j.id,j.video_id,j.platform,j.status,j.run_at,j.attempts,j.max_attempts,j.error,v.file_name FROM publishing_jobs j JOIN videos v ON v.id=j.video_id WHERE j.user_id=? ORDER BY j.run_at DESC LIMIT 100').bind(c.user!.id).all(),
    c.env.DB.prepare('SELECT paused,paused_platforms FROM automation_settings WHERE user_id=?').bind(c.user!.id).first()]);
  return J({ items: rows.results, settings: s });
});
r('POST', '/api/publishing/:jobId/retry', true, async (c, [jid]) => {
  const u = await c.env.DB.prepare("UPDATE publishing_jobs SET status='RETRY_PENDING',run_at=?,updated_at=datetime('now') WHERE id=? AND user_id=? AND status='FAILED' AND attempts<max_attempts").bind(new Date().toISOString(), jid, c.user!.id).run();
  return u.meta.changes ? J({ ok: true }) : E('NOT_RETRYABLE', 'Only failed jobs under the retry limit can be retried.', 409);
});
async function setPause(c: Ctx, on: boolean) {
  const b = await body(c), s = await c.env.DB.prepare('SELECT paused_platforms p FROM automation_settings WHERE user_id=?').bind(c.user!.id).first<any>();
  if (PLAT.includes(b.platform)) {
    const set = new Set<string>((s?.p || '').split(',').filter(Boolean)); on ? set.add(b.platform) : set.delete(b.platform);
    await c.env.DB.prepare('UPDATE automation_settings SET paused_platforms=? WHERE user_id=?').bind([...set].join(','), c.user!.id).run();
  } else await c.env.DB.prepare("UPDATE automation_settings SET paused=?,paused_platforms=CASE WHEN ?=0 THEN '' ELSE paused_platforms END WHERE user_id=?").bind(on ? 1 : 0, on ? 1 : 0, c.user!.id).run();
  return J({ ok: true });
}
r('POST', '/api/publishing/pause', true, c => setPause(c, true));
r('POST', '/api/publishing/resume', true, c => setPause(c, false));

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin') === env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : '';
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url); let res: Response;
    try {
      const hit = routes.map(([m, re, a, h]) => (m === req.method ? [re.exec(url.pathname), a, h] as const : null)).find(x => x?.[0]);
      if (!hit) res = E('NOT_FOUND', 'Route not found.', 404);
      else {
        const user = await auth(env, req);
        res = hit[1] && !user ? E('UNAUTHENTICATED', 'Please log in.', 401) : await hit[2]({ env, req, url, user }, hit[0]!.slice(1));
      }
    } catch (e) { console.error('unhandled', (e as Error).message); res = E('INTERNAL', 'Something went wrong on our side.', 500); }
    const out = new Response(res.body, res); Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v)); return out;
  },
  // Cron: atomically claim due jobs so overlapping runs cannot publish twice.
  async scheduled(_e: ScheduledEvent, env: Env) {
    const now = new Date().toISOString();
    const due = await env.DB.prepare("SELECT id FROM publishing_jobs WHERE status IN('SCHEDULED','RETRY_PENDING') AND run_at<=? AND NOT EXISTS(SELECT 1 FROM automation_settings a WHERE a.user_id=publishing_jobs.user_id AND (a.paused=1 OR (','||a.paused_platforms||',') LIKE '%,'||publishing_jobs.platform||',%')) LIMIT 10").bind(now).all<{ id: string }>();
    for (const j of due.results) {
      const claim = await env.DB.prepare("UPDATE publishing_jobs SET status='PUBLISHING',attempts=attempts+1,updated_at=? WHERE id=? AND status IN('SCHEDULED','RETRY_PENDING')").bind(now, j.id).run();
      if (!claim.meta.changes) continue;
      // TODO(milestone 7): call integrations/youtube.ts or integrations/instagram.ts here.
      // Until an integration is implemented and authorized the job fails honestly; it never reports fake success.
      await env.DB.batch([
        env.DB.prepare("UPDATE publishing_jobs SET status='FAILED',error='PLATFORM_NOT_CONFIGURED: publishing integration not implemented/authorized',updated_at=? WHERE id=?").bind(now, j.id),
        env.DB.prepare("INSERT INTO publishing_logs(id,job_id,level,message) VALUES(?,?,'error','Platform integration not configured')").bind(id(), j.id)]);
    }
  },
};
