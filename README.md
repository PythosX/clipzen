# Clipzen (V1 foundation)

Monorepo: `apps/web` (React+Vite+TS+Tailwind) and `workers/api` (Cloudflare Worker + D1 + R2).

## Run locally
```bash
npm install
cd workers/api
npx wrangler d1 create clipzen          # paste database_id into wrangler.toml
npx wrangler r2 bucket create clipzen-videos
npm run migrate:local && npm run dev    # API on :8787
# new terminal, repo root:
npm run dev:web                          # web on :5173 (proxies /api)
```
Auth cookies are `Secure`; use `localhost` (browsers allow it over http).

## Deploy
Worker: `npm -w workers/api run deploy` and `migrate:remote`. Web: Cloudflare Pages (build `npm run build`, dir `dist`, env `VITE_API_URL`), then set `ALLOWED_ORIGIN` in wrangler.toml to the Pages URL.

## Status
**Working:** register/login/logout (PBKDF2, hashed session tokens), user-scoped video records, streamed R2 upload with progress, library list/delete, overview counts from D1, integration status (reports "Setup required" honestly), cron job claiming (atomic, duplicate-safe), full 15+ table schema.
**Added in v2:** AI layer (`ai.ts`, Gemini REST; set `AI_API_KEY` and `AI_MODEL` via `wrangler secret put` / `[vars]`), text-based analysis, metadata generate/edit with version snapshots and character limits, scheduling with one job per platform (idempotency key `videoId:platform` blocks duplicates), queue with retry/cancel, global and per-platform pause (cron respects it).
**Analysis limits:** it uses the transcript or description you paste; it does NOT watch video frames. Results are labelled accordingly.
**Not built:** onboarding, frame-level video analysis, trends, calendar views, manual-approval mode (needs a schema change), daily limit, YouTube/Instagram OAuth + publishing (cron currently marks jobs FAILED with PLATFORM_NOT_CONFIGURED, never fake success), analytics, settings, rate limiting, light mode. Pages for these show a "Not built yet" note.
**Deviation:** uploads stream through the Worker into R2 (no memory buffering) instead of presigned URLs, which need S3 API credentials.
**Untested:** written without network access, so `npm install`/build were not run. Expect small fixes.
