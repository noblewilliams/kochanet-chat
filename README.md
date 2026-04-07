# Kochanet Chat

A real-time team chat with an on-demand AI assistant. Built for the **Kochanet Next.js Developer Test**.

**Live demo:** _(set after deploy)_

## Test credentials

| Email | Password |
|---|---|
| `alice@kochanet.test` | `alice-test-password-1!` |
| `bob@kochanet.test`   | `bob-test-password-1!` |

**To see real-time features in action:** open two browser windows (one regular, one incognito), sign in as Alice in one and Bob in the other, navigate to `#engineering`, and start chatting.

**To test the AI:** in any channel, send a message mentioning `@ai`, e.g.:
- `@ai what causes Docker containers to lose network connectivity after restart?`
- `@ai give me three ways to debug a 504 gateway timeout`
- `@ai suggest a concise commit message for fixing a race condition in a seed script`

The AI's response streams in real time and is visible to every participant in the channel.

## Stack and justification

- **Next.js 16 (App Router) + TypeScript** — required by the brief. The plan was written for Next.js 15 but `create-next-app@latest` resolved to 16; `after()` from `next/server` is still supported (no longer experimental in 16) so the AI streaming architecture is unchanged.
- **Supabase** (Postgres + Realtime) — chosen over Firebase because Postgres gives us proper Row Level Security, which we use heavily for per-channel authorization. **Supabase Realtime with per-row RLS is the architectural foundation** that lets the browser subscribe directly to database changes without a custom WebSocket relay.
- **BetterAuth** — required by the brief. BetterAuth doesn't integrate natively with Supabase RLS, so we built a JWT bridge (`lib/auth/supabase-jwt.ts`) that mints Supabase-compatible JWTs from BetterAuth sessions with a custom `app_user_id` claim. RLS policies reference this claim instead of `auth.uid()`. **This is the most important architectural decision in the project** — see `docs/superpowers/specs/2026-04-06-kochanet-chat-design.md` §6 for the full reasoning and the options that were rejected.
- **OpenAI API** (`gpt-4o-mini`) — required by the brief. Configurable in `lib/ai/openai.ts`.
- **Tailwind CSS v4** — included with the Next.js 16 scaffold. Design tokens defined as a `@theme` block in `app/globals.css` (v4's CSS-based config style).
- **`react-markdown` + `remark-gfm` + `rehype-highlight`** — streaming-friendly markdown for AI responses with code-block syntax highlighting.
- **Voice input — Groq `whisper-large-v3-turbo`** via the OpenAI-compatible audio endpoint (no separate SDK; we reuse the `openai` client with a custom `baseURL`). The Composer captures audio with the browser's `MediaRecorder` API, sends the blob to a server action, and Groq transcribes it in well under a second. Chosen over the Web Speech API because (a) Web Speech doesn't work in Firefox, (b) Groq's Whisper accuracy is significantly higher, and (c) Groq's STT latency is fast enough that the "record-then-transcribe" UX feels nearly as live as in-browser streaming. The chat AI itself still goes through OpenAI (`gpt-4o-mini`) as required by the brief.
- **Voice output — Web Speech API** (`speechSynthesis`) for the "read aloud" button on completed AI replies. No round-trip cost, no audio storage.
- **Vercel** — fluid compute is on by default, which enables `after()` from `next/server`. The AI streaming continuation runs inside `after()` — see below.

## Architecture highlights

### Real-time communication

- **Postgres Changes** on the `messages` table is the single source of truth. One global subscription (RLS-filtered per user) drives both the active chat view and sidebar unread counts.
- **Broadcast** on a per-channel topic for typing indicators (ephemeral by design — no DB writes per keystroke).
- **Presence** on a per-channel topic for the "X online" count.
- **Optimistic updates** via a `client_id` column on messages — the browser generates a UUID on send, the server insert preserves it, and the realtime echo is matched by `client_id` to replace the pending row.
- **Reconnect gap-fill**: `useMessages` tracks the latest seen `created_at`; on re-subscribe after a drop it runs a one-shot `select * from messages where created_at > last_seen` to backfill missed messages.

### AI invocation and streaming — the architectural payoff

The AI reuses the **same realtime infrastructure as human messages** — there is only **one** WebSocket channel in the entire app. The flow:

1. `sendMessage` server action inserts the user's message via the user-scoped Supabase client (RLS enforces channel membership).
2. If the body matches `\b@ai\b`, it rate-limits (5/minute/user), then inserts a **placeholder AI message row** via the **service-role** client (`ai_status='streaming'`, `body=''`). This insert fires a Postgres Changes event → all browsers in the channel see an empty AI bubble within ~300ms.
3. The server action calls `after()` from `next/server` to schedule the streaming work. The HTTP response returns to the client; the streaming continuation keeps running inside the same serverless invocation thanks to Vercel's fluid compute.
4. Inside `after()`, `invokeAI` opens an OpenAI streaming response and **batches `UPDATE`s to the placeholder row every ~80ms or every ~30 tokens**, whichever comes first. Each `UPDATE` fires a Postgres Changes event; the browser sees the body grow in real time.
5. Final `UPDATE` sets `ai_status='complete'`. On error, `ai_status='error'` with a fallback body and a retry affordance.

This trades ~30–50 DB writes per AI response for a **single** realtime channel, automatic persistence from token 1, and zero separate streaming infrastructure.

**Context window:** last 30 messages in the channel, formatted with author-name prefixes (`Alice: message`). Display names resolved via a **batched query against BetterAuth's `public.user` table** (no FK between BetterAuth users and the app schema — see "trust the JWT" decision below). Only completed AI responses are included in context — in-flight placeholders are skipped so the AI doesn't see its own unfinished work.

**Concurrency:** multiple simultaneous `@ai` invocations each get their own placeholder row and stream in parallel. Each row carries `invoked_by_user_id`. No queue, no debounce.

### Authentication and authorization

- **BetterAuth** with email/password + GitHub OAuth. Session is a cookie (`better-auth.session_token`).
- **`proxy.ts`** (Next.js 16 renamed `middleware.ts` to `proxy.ts`) is a cheap cookie-presence check that redirects between `(auth)` and `(app)` route groups. The authoritative session check happens server-side in `lib/supabase/server.ts` via `auth.api.getSession()`.
- **The JWT bridge:** `mintSupabaseJwt(betterAuthUserId)` signs a Supabase-compatible JWT with `SUPABASE_JWT_SECRET`, embeds the BetterAuth user id as the custom claim `app_user_id`, valid 1 hour.
- **RLS policies** reference `nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')` (returned as `text` — see schema note below). The policies are in `supabase/migrations/0002_rls.sql`.
- The browser gets a fresh JWT on initial page load (passed through `SupabaseProvider`) and refreshes it via a server action every 50 minutes.
- **The service-role client is only imported by `lib/ai/stream-response.ts`, `server/ai.ts`, `server/channels.ts` (for invites), and `supabase/seed.ts`.** Every other path is user-scoped. Auditing the import list audits the entire bypass surface.

### Schema notes

- **BetterAuth user IDs are `text`, not `uuid`.** Discovered during implementation — `@better-auth/cli generate` produces `user.id text`. We adapted by using `text` for all user-reference columns in the app schema and returning `text` from the `app_user_id()` RLS helper. TypeScript code is unaffected because it uses `string` regardless.
- **No foreign keys to the BetterAuth `user` table.** Every `user_id` / `author_id` / `created_by` column is a "trust the JWT" reference. Tradeoff: lose database-level FK enforcement, gain not having a sync table to maintain. The migrations and the RLS policies handle authorization without needing FK constraints.

### Project structure

```
app/                    Next.js App Router
├── (auth)/             sign-in and sign-up pages (route group)
├── (app)/              authenticated shell (route group)
│   └── c/[channelId]/  individual channel page
└── api/auth/[...all]/  BetterAuth catch-all mount
components/             React components (chat, sidebar, presence)
lib/
├── auth/               BetterAuth instance, client, JWT bridge
├── supabase/           server/browser/service-role clients + provider
├── ai/                 OpenAI client, system prompt, context builder, streaming continuation
├── realtime/           useMessages, usePresence, useTyping, useConnectionState
└── utils/              mention detection, thinking verbs
server/                 server actions (messages, channels, ai, session)
supabase/migrations/    schema and RLS policies
docs/superpowers/       design spec and implementation plan
```

### Component structure

- **Server components** fetch initial data (`app/(app)/c/[channelId]/page.tsx`).
- **Client components** own realtime subscriptions (`components/chat/chat-view.tsx` mounts `useMessages`, `useTyping`, `useConnectionState`).
- **Hooks** in `lib/realtime/` encapsulate the realtime topology — components never touch the Supabase JS client directly. This keeps the realtime topology decision in one folder you can audit.

## Environment variables

See `.env.local.example`. You need a Supabase project, a GitHub OAuth app, and an OpenAI API key.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server only
SUPABASE_JWT_SECRET=           # server only — used by the JWT bridge

BETTER_AUTH_SECRET=            # openssl rand -base64 32
BETTER_AUTH_URL=               # http://localhost:3000 in dev, deployed URL in prod
NEXT_PUBLIC_APP_URL=           # same as above
DATABASE_URL=                  # Supabase pooled connection string

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

OPENAI_API_KEY=                # chat AI (gpt-4o-mini)
GROQ_API_KEY=                  # voice transcription (whisper-large-v3-turbo)
```

## Local setup

```bash
pnpm install
cp .env.local.example .env.local  # fill in values
pnpm dlx supabase link --project-ref <your-project-ref>
pnpm dlx supabase db push
pnpm tsx supabase/seed.ts
pnpm dev
```

## Assumptions made

- **The AI is a distinct peer, not a user account.** AI messages have `author_id = NULL` and an `author_kind = 'ai'` discriminator. `invoked_by_user_id` attributes each AI response to the user who summoned it.
- **Read receipts are Slack-style** (per-channel `last_read_at`), not per-message. Drives sidebar unread badges and a "new messages" divider on entry.
- **Public channels still require a membership row** — "public" just means anyone can self-join. This is the industry-standard Slack model and keeps RLS as a single clean expression.
- **No first-class DMs.** Could be modeled as private 2-member channels if ever needed. Out of scope for V1.

## Known limitations and tradeoffs

- **Voice input uses Groq Whisper** (`whisper-large-v3-turbo`) via a server action that takes a `MediaRecorder` blob and returns the transcript. Works in every modern browser including Firefox. No audio file storage, no waveforms — the audio blob is sent to Groq once and discarded. Voice OUTPUT (the "read aloud" button on AI replies) still uses the browser's `speechSynthesis` API.
- **Search uses Postgres `ilike`**, no full-text indexing or ranking. Fast enough on the seed dataset. No highlight rendering.
- **Unread badges update on navigation, not live.** The sidebar is a server component. A live sidebar would need a second realtime subscription. Deferred.
- **No automated tests for UI components.** Business logic (JWT bridge, mention detection, rate limiter, context builder) has Vitest unit tests (`pnpm test`). UI was smoke-tested manually.
- **Rate limiting is per-user by Postgres count**, not Redis token bucket. Fine for a demo.
- **The service-role insert path for AI messages is a privilege boundary.** It's isolated to one file (`lib/supabase/service-role.ts`) which is only imported by `lib/ai/stream-response.ts`, `server/ai.ts`, `server/channels.ts` (invites), and the seed script. Reviewing that import list is reviewing the entire bypass surface.
- **Tailwind v4** — `tailwind.config.ts` doesn't exist; design tokens live in `app/globals.css` as a `@theme` block. This is the v4 idiom but differs from many tutorials.
- **Spec was written for Next.js 15 with uuid user IDs.** Implementation surfaced two adaptations: (1) Next.js 16 renamed `middleware.ts` to `proxy.ts` and the function name from `middleware` to `proxy`; (2) BetterAuth's `cli generate` produces `text` user IDs not `uuid`, so the app schema uses `text` for user-reference columns. Both are documented in the spec footnotes.

## What I would do with more time

- Playwright e2e tests for the full realtime + AI flow across two browser contexts.
- Smart context summarization when the channel exceeds 30 messages.
- Streaming AI via `Broadcast` with chunked deltas for sub-100ms visible latency.
- Per-message read confirmations (checkmarks) on top of the current channel-pointer model.
- Message edits, reactions, threads, reply-to.
- File / image sharing with Supabase Storage.
- Dark mode toggle (and an actual light theme — currently dark mode only).
- Multiple social auth providers.
- PWA support and push notifications.
- Cmd-K channel switcher and full keyboard shortcut suite.
- Search with full-text indexing, ranking, and inline highlight rendering.
- Replace the `alert()` rate-limit fallback with a proper toast component.
- Live sidebar unread badge updates.

## Tests

```bash
pnpm test
```

Unit tests cover:
- `lib/auth/supabase-jwt.ts` — JWT minting with the custom claim, expiration, missing-secret error
- `lib/utils/mention.ts` — `@ai` detection (case-insensitive, word-boundary)
- `server/ai.ts` — rate limiter (5/min, edge cases)
- `lib/ai/build-context.ts` — context formatting, name resolution, AI placeholder filtering

## Video walkthrough outline (5–10 min)

1. **Sign in and tour the UI** (~1 min) — show both test accounts side-by-side, presence, typing, sidebar, channels.
2. **The BetterAuth ↔ Supabase JWT bridge** (~2 min) — the most non-obvious decision. Open `lib/auth/supabase-jwt.ts`, explain the custom claim, show `lib/supabase/server.ts` attaching it, show the RLS policy in `0002_rls.sql` referencing it. Explain what was rejected (service-role-only loses Realtime; parallel auth systems are sync hell).
3. **Real-time topology** (~1.5 min) — one global Postgres Changes subscription, RLS-filtered. Broadcast for typing. Presence for online. Open `lib/realtime/use-messages.ts` and show the subscription + gap-fill + optimistic reconciliation in one file.
4. **The AI flow** (~2 min) — the architectural payoff. Open `server/messages.ts` and walk through `sendMessage` → placeholder insert → `after()` continuation. Open `lib/ai/stream-response.ts` and explain the batched UPDATE loop. **Emphasize that AI streaming reuses the same realtime channel as new messages — there is only one WebSocket in the entire app.**
5. **Tradeoffs and surprises** (~1 min) — voice via Web Speech, BetterAuth's text IDs (vs the spec's assumed uuid), Tailwind v4 instead of v3, no automated UI tests, sidebar unread is not live. Point at the "What I would do with more time" section.
6. **Challenges** (~0.5 min) — the BetterAuth RLS mismatch and how it was solved with custom claims was the most interesting problem.
