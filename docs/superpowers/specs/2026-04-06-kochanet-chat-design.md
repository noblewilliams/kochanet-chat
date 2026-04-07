# Kochanet Next.js Test — Design Document

**Date:** 2026-04-06
**Status:** Draft for implementation
**Submission deadline:** 2026-04-08 (Wednesday)
**Time budget:** 15–20 hours

---

## 1. Overview

The Kochanet Next.js Developer Test asks for a real-time team chat application with an on-demand AI assistant. The AI is framed in the brief as "a helpful team member that joins when called, not a chatbot that requires every interaction to go through it" — invoked via `@ai` mention inside the message stream like any other teammate.

This document describes the full design of what we will build. Every architectural decision below was deliberately chosen against alternatives, and the alternatives are documented inline so each choice can be defended in the required 5–10 minute video walkthrough.

---

## 2. Scope

### 2.1 In scope (will be built)

- **Authentication** via BetterAuth with email/password and one social provider (GitHub).
- **Real-time chat** with:
  - Instant message delivery to all participants in a channel.
  - Per-channel typing indicators.
  - Per-channel presence (who's currently here right now).
  - Optimistic message sends with server-confirmed reconciliation.
  - Reconnect with gap-fill on transient disconnections.
- **Channels** with public/private visibility, invites, message history with cursor pagination, basic search.
- **Slack-style read receipts** — per-user `last_read_at` per channel — driving unread badges in the sidebar and a "new messages" divider in the chat view.
- **AI assistant** invoked via `@ai` mention:
  - Streaming response visible to all channel participants in real time.
  - Context-aware (last 30 messages of the channel).
  - Concurrent invocations from multiple users handled independently.
  - Rate limited to 5 invocations per user per rolling minute.
  - Markdown rendering of AI replies (lists, bold, inline code, code blocks).
- **Voice features** — Web Speech API for STT into the composer and TTS for AI reply playback.
- **Responsive layout** — desktop and mobile.
- **Deployed instance** on Vercel with two seeded test users.
- **README** and **5–10 minute video walkthrough**.

### 2.2 Cut from scope (and why)

| Feature | Why cut |
|---|---|
| Dark mode toggle | App is dark mode by default; no toggle needed |
| Message edits, reactions, threads, reply-to | Out of scope for V1; would expand schema and UI surface significantly |
| File / image sharing | Requires Storage setup, upload UI, preview rendering — full day |
| PWA / push notifications | Marginal demo value vs setup cost in 2 days |
| Multiple social auth providers | One satisfies the brief; each additional provider is a separate OAuth setup |
| Smart context summarization | Bonus tier; static last-30-messages window is sufficient |
| Fancy search highlighting | `ilike` returns matches; UI shows them in a list |
| Per-message read confirmations | Slack-style channel-pointer is enough |
| Keyboard shortcut suite | Enter / Shift+Enter / Escape only |

### 2.3 Minimum-viable concessions

- **Voice features** use the **Web Speech API** (browser native), not OpenAI Whisper / TTS. Tradeoff: voice quality depends on the browser; no audio file storage; no waveforms or transcripts. This satisfies the brief's voice requirement at ~2 hours instead of a full day. Documented as a limitation in the README.
- **Search** uses `ilike` against the messages table — no full-text indexing, no ranking, no inline highlight rendering. Sub-100ms on the seed dataset, sufficient for the demo.
- **Manual smoke testing** instead of automated tests. Playwright e2e tests are listed in "what I'd do with more time."

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Required by brief |
| Backend / DB / Realtime | Supabase (Postgres + Realtime + Auth schema unused) | Required option (vs Firebase); chosen for Postgres + Realtime per-row RLS |
| Auth | BetterAuth | Required by brief |
| AI | OpenAI API (GPT-4-class model with streaming) | Required by brief |
| UI primitives | shadcn/ui + Tailwind CSS | Fast, accessible, easy to theme to our palette, no opinionated visual baggage |
| Markdown rendering | `react-markdown` + `remark-gfm` + `rehype-highlight` | Streaming-friendly, GitHub-flavored support, syntax highlighting for code blocks |
| JWT signing for the auth bridge | `jose` | Standards-compliant, well-maintained, ~30 lines of code |
| Voice | Web Speech API (`SpeechRecognition`, `SpeechSynthesis`) | Free, no audio storage, satisfies brief at minimum cost |
| Hosting | Vercel | Required-friendly; supports `after()` via fluid compute |

---

## 4. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  ┌─────────────┐  ┌────────────────┐  ┌────────────────────────┐    │
│  │ React UI    │  │ Supabase JS    │  │ Web Speech API         │    │
│  │ (shadcn +   │  │ Client         │  │ (STT + TTS)            │    │
│  │  Tailwind)  │  │ + Realtime     │  │                        │    │
│  └──────┬──────┘  └───────┬────────┘  └────────────────────────┘    │
│         │                  │                                         │
└─────────┼──────────────────┼─────────────────────────────────────────┘
          │                  │
          │ Server actions   │ WS (Postgres Changes,
          │ (form-style      │  Broadcast, Presence)
          │  mutations)      │ — JWT minted by bridge
          ▼                  │
┌─────────────────────────────────────────────────────────────────────┐
│ Vercel — Next.js server                                             │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ BetterAuth     │  │ Server       │  │ AI flow:                │  │
│  │ (email + GH)   │  │ Components / │  │  sendMessage detects @ai│  │
│  │                │  │ Server       │  │   ↓ inserts placeholder │  │
│  │  /api/auth/*   │  │ Actions      │  │   ↓ schedules after()   │  │
│  │                │  │              │  │   ↓ streams to OpenAI   │  │
│  └───────┬────────┘  └───────┬──────┘  │   ↓ batched UPDATEs     │  │
│          │                    │         └────────┬────────────────┘  │
│          │ session            │ JWT bridge       │                   │
│          ▼                    ▼                  ▼                   │
└──────────┼────────────────────┼──────────────────┼───────────────────┘
           │                    │                  │
           │                    │                  │ service-role
           │                    │                  │ client
           │                    ▼                  ▼
           │          ┌─────────────────────────────────────────┐
           │          │ Supabase (Postgres + Realtime broker)    │
           │          │                                          │
           └─────────►│  public.user, session, account, ...      │ ◄── BetterAuth
                      │  public.channels                          │
                      │  public.channel_members                   │
                      │  public.messages    ──► Realtime          │
                      │                         (Postgres Changes)│
                      └──────────────────────────────────────────┘
```

The two non-obvious arrows here are:

1. **The "JWT bridge" arrow** from BetterAuth to the server-side Supabase client — server-side code mints a Supabase-compatible JWT from the BetterAuth session before talking to Postgres or Realtime, so RLS sees the right user.
2. **The "AI flow" arrow** from a server action through `after()` to a service-role client — the AI streaming continuation runs *after* the server action returns its response, using `after()` from `next/server` to keep the work alive on the same serverless invocation.

Both are explained in detail below.

---

## 5. Data model

### 5.1 Tables

```sql
-- A chat room
create table channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('public', 'private')),
  created_by  text not null,                          -- BetterAuth user id (text/cuid); no FK
  created_at  timestamptz not null default now()
);

-- Membership + read-receipt pointer
create table channel_members (
  channel_id    uuid not null references channels(id) on delete cascade,
  user_id       text not null,                        -- BetterAuth user id (text/cuid); no FK
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),   -- Slack-style read receipt
  primary key (channel_id, user_id)
);

-- Human + AI messages, discriminated by author_kind
create table messages (
  id                  uuid primary key default gen_random_uuid(),
  channel_id          uuid not null references channels(id) on delete cascade,
  author_kind         text not null check (author_kind in ('user', 'ai')),
  author_id           text,                           -- BetterAuth user id (text/cuid); NULL for AI rows
  invoked_by_user_id  text,                           -- only set when author_kind='ai'
  body                text not null default '',       -- AI placeholder rows start empty
  client_id           uuid,                           -- optimistic-update dedup key
  ai_status           text check (ai_status in ('streaming', 'complete', 'error')),
  created_at          timestamptz not null default now(),
  -- AI rows have a status; human rows must not
  constraint messages_ai_status_consistency
    check ((author_kind = 'ai') = (ai_status is not null))
);

-- Indexes
create index messages_channel_created_idx
  on messages (channel_id, created_at desc, id desc);

-- Optimistic-dedup guard: same author can't insert two messages
-- with the same client_id in the same channel
create unique index messages_client_id_unique
  on messages (channel_id, author_id, client_id)
  where client_id is not null;
```

### 5.2 Why the schema looks like this

**No foreign keys to a users table.** BetterAuth lives in its own tables (`public.user`, `public.session`, etc.) and we deliberately avoid mirroring those identities into a separate Supabase `users` table that would need syncing. Every `user_id` / `author_id` / `created_by` column is therefore a "trust the JWT" reference, not an enforced FK. Tradeoff: lose database-level FK validation; gain not having a sync table to maintain. Worth surfacing on video.

**Single `messages` table for human and AI.** A `author_kind` discriminator (`'user' | 'ai'`) keeps both kinds in one table. Alternatives we rejected:

- *AI as a synthetic user row* — would force a fake identity into BetterAuth's user table or maintain a separate `participants` union table; chosen approach is more honest.
- *Two tables* (`messages` + `ai_messages`) — would force every query to UNION, every realtime subscription to double up, and break sort order during streaming.

**`invoked_by_user_id`** on AI rows lets us attribute "AI's response to Alice's question," which is also useful when building the OpenAI prompt context (so the AI can address the invoker by name) and shows the evaluator we thought about it.

**`client_id`** enables clean optimistic updates. The browser generates a UUID when sending; the server insert preserves it; when the realtime echo arrives the browser matches by `client_id` to replace the optimistic row. The partial unique index makes accidental double-sends a server-side error instead of a duplicate row.

**`ai_status`** is implicit-state for AI rows: a placeholder starts at `'streaming'` with an empty body, transitions to `'complete'` after the final UPDATE, or `'error'` with a fallback body on failure. The check constraint enforces that `ai_status` is non-null *if and only if* `author_kind='ai'`.

**The composite index `(channel_id, created_at desc, id desc)`** makes paginated history loads cheap and gives messages a deterministic sort order even when two arrive in the same millisecond. The `id desc` tiebreak matters because realtime can deliver near-simultaneous rows in any order.

**No `updated_at` or soft-delete columns.** We cut edits and reactions; if those land later, the columns land with them.

---

## 6. Authentication and the BetterAuth ↔ Supabase bridge

### 6.1 The problem

Supabase Row Level Security policies are written assuming **Supabase Auth**. They reference `auth.uid()`, which reads from a JWT that the Supabase client sends with every request. BetterAuth does not mint that JWT; it manages its own session in its own cookies.

If we do nothing, `auth.uid()` is `null` in every policy. Our RLS either denies everything or allows everything — neither acceptable.

### 6.2 Options considered

**Option A — Mint a Supabase-compatible JWT from the BetterAuth session.** Server-side, after BetterAuth verifies the session, sign a short-lived JWT using `SUPABASE_JWT_SECRET` (the same secret Supabase uses to validate JWTs from its own auth), embed our user identifier as a custom claim, and pass it to the Supabase client. RLS then works as designed — including from the browser, including for Realtime subscriptions.

**Option B — Service-role only, bypass RLS entirely.** Use the service-role key on the server, gate every read/write through a server action that first checks BetterAuth. Looks simple until Realtime: browser subscriptions still go through Supabase's auth layer, so we'd either need a custom WebSocket relay (huge) or leave RLS half-on (defeats the simplicity). Plus any bug in our authorization layer is catastrophic with no DB-level safety net.

**Option C — Run two auth systems in parallel.** BetterAuth as user-facing identity, plus a shadow Supabase Auth user for each one. Two user tables, every signup writes to two places, sync bugs forever.

### 6.3 Decision: Option A, with a custom JWT claim variant

We mint a JWT with a **custom claim `app_user_id`** instead of mirroring identities into a Supabase `users` table. RLS policies reference `auth.jwt() ->> 'app_user_id'` (as text — see footnote) instead of `auth.uid()`. BetterAuth stays the only source of truth for identity — no sync table, no shadow accounts.

> **Footnote on identifier types:** BetterAuth's default schema generator uses **text** IDs (cuid/nanoid format like `r3kJ8x...`), not UUIDs. When this was discovered during implementation we adapted: every user-reference column in the app schema is `text` (not `uuid`), the RLS helper `app_user_id()` returns `text` (no cast), and the JWT custom claim is read as a JSON string. The change is invisible to TypeScript code, which uses `string` regardless. The "trust the JWT" decision (no FK to a users table) is unchanged.

**Why A wins:** Supabase Realtime with per-row RLS is the main reason to be on Supabase in this stack. Option B effectively gives that up. Option C is engineering debt we cannot afford to maintain in 2 days.

### 6.4 The bridge code

```typescript
// lib/auth/supabase-jwt.ts
import { SignJWT } from 'jose'

const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!)

export async function mintSupabaseJwt(betterAuthUserId: string): Promise<string> {
  return new SignJWT({
    sub: betterAuthUserId,
    role: 'authenticated',          // required by Supabase RLS
    app_user_id: betterAuthUserId,  // our custom claim
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'
import { headers, cookies } from 'next/headers'

export async function createClient() {
  const session = await auth.api.getSession({ headers: await headers() })
  const jwt = session ? await mintSupabaseJwt(session.user.id) : null
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
      global: jwt
        ? { headers: { Authorization: `Bearer ${jwt}` } }
        : undefined,
    }
  )
}
```

For the **browser-side** Supabase client, we mint the JWT in the authenticated layout's server component, pass it to a `SupabaseProvider` client component via props, and refresh it on a timer (every ~50 minutes, before the 1-hour expiry). The provider creates the browser client once with the current JWT and re-creates it on refresh.

### 6.5 RLS policies

```sql
alter table channels        enable row level security;
alter table channel_members enable row level security;
alter table messages        enable row level security;

-- Convenience function: extracts our custom claim
create or replace function app_user_id() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id', '')
$$;

-- channel_members: each user manages only their own membership rows
create policy cm_select_own  on channel_members for select using (user_id = app_user_id());
create policy cm_insert_self on channel_members for insert with check (user_id = app_user_id());
create policy cm_delete_self on channel_members for delete using (user_id = app_user_id());
create policy cm_update_own  on channel_members for update
  using (user_id = app_user_id()) with check (user_id = app_user_id());

-- channels: any authenticated user can see public channels (for discovery); private channels require membership
create policy channels_select_member on channels for select using (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = channels.id
      and channel_members.user_id = app_user_id()
  )
  or type = 'public'
);

create policy channels_insert_authenticated on channels for insert with check (
  created_by = app_user_id()
);

-- messages: visible if you're a member of the channel
create policy messages_select_member on messages for select using (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);

-- messages: insertable only as yourself, only as 'user' kind
-- (AI inserts come from service-role and bypass RLS entirely)
create policy messages_insert_member on messages for insert with check (
  author_kind = 'user'
  and author_id = app_user_id()
  and exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);
```

There is intentionally **no UPDATE policy on messages**: the only path that mutates messages is the AI streaming continuation, which runs server-side with the service-role client (which bypasses RLS). This denies all browser-initiated message edits as a side effect, which is fine because we cut message editing.

---

## 7. Realtime topology

### 7.1 The three Supabase Realtime primitives

| Primitive | What it does | Where we use it |
|---|---|---|
| **Postgres Changes** | Subscribe to row-level INSERT/UPDATE/DELETE on a table; RLS-filtered | New messages, AI streaming UPDATEs, read-receipt updates |
| **Broadcast** | Ephemeral pub/sub on a named topic; not persisted | Typing indicators |
| **Presence** | Synced state of "who's joined this channel right now"; auto-cleanup on disconnect | Per-channel presence |

### 7.2 Topology

**One global subscription** to the `messages` table for the entire app, with no filter — RLS does the per-user filtering. This single subscription drives:

- Live message updates in the currently-viewed channel.
- Sidebar unread badge increments for messages in channels the user isn't currently viewing.
- AI streaming UPDATEs for placeholder rows as they fill in (same UPDATE event stream).

**Per-channel subscriptions** for typing (Broadcast) and presence (Presence), joined when the user enters a channel and dropped when they leave.

### 7.3 Why Postgres Changes for messages, not Broadcast

Broadcast would mean the server inserts to DB *and* publishes a message-shaped payload on a topic. Lower latency, but:

- Two paths to keep consistent — risk of "broadcast says X, DB says Y."
- Reconnect / gap-fill becomes a separate code path (broadcast doesn't backfill).
- Users joining mid-conversation see nothing until the next broadcast.

Postgres Changes makes the database the single source of truth: reconnect just refetches, gap-fill is a SQL `where id > last_seen_id` query, and consistency is automatic. Cost is ~100–300ms extra latency per message, which is invisible to users.

### 7.4 Reconnect and gap-fill

The Supabase JS client emits `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` events on each subscription. We hook these in `useConnectionState` to drive a small `● connected` indicator that flips to amber on disconnect.

Per-channel state tracks the latest message id we've received. On `SUBSCRIBED` after a reconnect, the active channel fires a one-shot query (`select * from messages where channel_id = $1 and id > $2 order by created_at, id`) to fill any gap created by the disconnect. Channels that are not currently being viewed gap-fill lazily when next opened — no need to backfill everything immediately.

### 7.5 Optimistic updates

When the user hits send:

1. The browser generates a UUID `clientId` and immediately renders the message locally with status `'sending'`.
2. The `sendMessage` server action inserts the row including `client_id = clientId`. The partial unique index `(channel_id, author_id, client_id) where client_id is not null` prevents accidental duplicates if the action runs twice.
3. The realtime echo arrives via Postgres Changes. The browser matches by `client_id`, replaces the optimistic row with the server-confirmed row.
4. If the server action errors, the optimistic row flips to status `'failed'` with a retry button.

This pattern is local to the `useMessages` hook; components only see "messages" without knowing whether a particular message is still pending.

---

## 8. AI invocation flow

### 8.1 Trigger

Server-side regex `\b@ai\b` (case-insensitive, word-boundary so "saying" doesn't match), evaluated inside the `sendMessage` server action. We never trust the client to flag mentions — a `mentions_ai` boolean from the browser would be trivially spoofable.

### 8.2 Orchestration with `after()`

```typescript
// server/messages.ts (sketch)
'use server'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { invokeAI } from '@/lib/ai/stream-response'
import { checkAIRateLimit } from '@/server/ai'

export async function sendMessage(input: { channelId: string; body: string; clientId: string }) {
  // Authn comes from BetterAuth, not Supabase Auth
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')
  const user = session.user

  const supabase = await createClient() // attaches minted Supabase JWT automatically

  // 1. Insert the user's message via the user's JWT — RLS enforces membership
  const { data: userMsg, error: e1 } = await supabase
    .from('messages')
    .insert({
      channel_id: input.channelId,
      author_kind: 'user',
      author_id: user.id,
      body: input.body,
      client_id: input.clientId,
    })
    .select()
    .single()
  if (e1) throw e1

  // 2. If @ai is mentioned, rate-limit, insert the placeholder, schedule the stream
  if (/\b@ai\b/i.test(input.body)) {
    await checkAIRateLimit(user.id) // throws RateLimitError if exceeded

    const { data: placeholder, error: e2 } = await serviceRoleClient()
      .from('messages')
      .insert({
        channel_id: input.channelId,
        author_kind: 'ai',
        author_id: null,
        invoked_by_user_id: user.id,
        body: '',
        ai_status: 'streaming',
      })
      .select()
      .single()
    if (e2) throw e2

    after(() =>
      invokeAI({
        channelId: input.channelId,
        placeholderId: placeholder.id,
        invokerName: user.name,
      })
    )
  }

  return { ok: true, message: userMsg }
}
```

The important thing here is that **the user message insert goes through the user-scoped Supabase client** (so RLS enforces that the user is a member of the channel), while **the AI placeholder insert goes through the service-role client** (because the AI has no JWT and must bypass RLS). Two different clients, two different trust levels, in the same server action.

The `after()` call schedules the streaming continuation to run **after** the server action returns its response to the client, but inside the same serverless function invocation. Vercel's fluid compute keeps the function alive long enough for the streaming work to finish. The user's browser sees its own message echo and the empty AI placeholder almost immediately (~100–300ms after sending), and then the placeholder body starts filling in shortly after.

### 8.3 Streaming via batched UPDATEs

```typescript
// lib/ai/stream-response.ts (sketch)
import { openai } from './openai'
import { buildContext } from './build-context'
import { serviceRoleClient } from '@/lib/supabase/service-role'

const BATCH_INTERVAL_MS = 80
const BATCH_TOKEN_COUNT = 30

export async function invokeAI(opts: {
  channelId: string
  placeholderId: string
  invokerName: string
}) {
  const supabase = serviceRoleClient()

  try {
    const messages = await buildContext(opts.channelId, opts.invokerName)
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      stream: true,
    })

    let buffer = ''
    let pendingTokens = 0
    let lastFlush = Date.now()

    const flush = async () => {
      await supabase
        .from('messages')
        .update({ body: buffer })
        .eq('id', opts.placeholderId)
      pendingTokens = 0
      lastFlush = Date.now()
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? ''
      if (!delta) continue
      buffer += delta
      pendingTokens += 1

      const elapsed = Date.now() - lastFlush
      if (pendingTokens >= BATCH_TOKEN_COUNT || elapsed >= BATCH_INTERVAL_MS) {
        await flush()
      }
    }

    // Final flush + mark complete
    await supabase
      .from('messages')
      .update({ body: buffer, ai_status: 'complete' })
      .eq('id', opts.placeholderId)
  } catch (err) {
    await supabase
      .from('messages')
      .update({
        body: 'AI failed to respond. Tap to retry.',
        ai_status: 'error',
      })
      .eq('id', opts.placeholderId)
  }
}
```

Each UPDATE fires a Postgres Changes event that all channel viewers receive via the same subscription that handles new messages. This is the **architectural payoff** of the realtime design: there is **one** WebSocket channel for the entire app, and AI streaming reuses it instead of inventing a separate streaming endpoint.

Tradeoff: ~30–50 DB writes per AI response (one per batch). Acceptable for a take-home and most production chat. The alternative (Broadcast for streaming, single INSERT at the end) creates two consistency stories and a worse "user joins mid-stream" experience.

### 8.4 Context window

```typescript
// lib/ai/build-context.ts
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { SYSTEM_PROMPT } from './system-prompt'

export async function buildContext(channelId: string, invokerName: string) {
  const supabase = serviceRoleClient()

  // 1. Last 30 messages in the channel
  const { data: rows } = await supabase
    .from('messages')
    .select('author_kind, author_id, body, ai_status')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(30)

  const ordered = (rows ?? []).reverse()

  // 2. Resolve author display names in one batch query against BetterAuth's user table
  //    (BetterAuth stores its users in public.user, same schema — no cross-schema join)
  const authorIds = [...new Set(
    ordered.filter(r => r.author_kind === 'user' && r.author_id).map(r => r.author_id!)
  )]
  const { data: users } = await supabase
    .from('user')                                 // BetterAuth's user table
    .select('id, name')
    .in('id', authorIds)
  const nameById = new Map(users?.map(u => [u.id, u.name]) ?? [])
  const displayName = (id: string | null) => (id && nameById.get(id)) || 'Unknown'

  // 3. Format for OpenAI
  const messages = ordered
    .map((row) => {
      if (row.author_kind === 'ai') {
        // Skip placeholder/error/in-flight rows; only include completed AI responses
        return row.ai_status === 'complete'
          ? { role: 'assistant' as const, content: row.body }
          : null
      }
      return {
        role: 'user' as const,
        content: `${displayName(row.author_id)}: ${row.body}`,
      }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  // 4. System prompt includes the invoker's name so the AI can address them directly
  const system = `${SYSTEM_PROMPT}\n\nYou were just summoned by ${invokerName}. Address your response to them when it makes sense.`

  return [
    { role: 'system' as const, content: system },
    ...messages,
  ]
}
```

The author-name prefix on user messages is the trick that lets the AI understand who said what without restructuring the OpenAI message format. Combined with the invoker's name in the system prompt, it lets the AI naturally address people: "Alice, you mentioned Docker networking earlier..."

System prompt (rough draft, refined during implementation):

> You are an assistant in a team workspace. You're not a chatbot — you're being summoned by a teammate who @mentioned you in a group conversation. Be concise, professional, and helpful. Use markdown for structure when it helps (lists, code blocks). When you reference a teammate, use their name. When you don't know something, say so.

### 8.5 Concurrency

Each `@ai` mention spawns its own placeholder row and its own streaming flow. Two simultaneous mentions from different users produce two AI responses streaming in parallel, each with its own `invoked_by_user_id`. No queue, no debounce. Cost is two parallel OpenAI streams, which is fine.

### 8.6 Rate limiting

```typescript
// server/ai.ts
export async function checkAIRateLimit(userId: string) {
  const supabase = serviceRoleClient()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('author_kind', 'ai')
    .eq('invoked_by_user_id', userId)
    .gte('created_at', new Date(Date.now() - 60_000).toISOString())

  if ((count ?? 0) >= 5) {
    throw new RateLimitError('5 AI invocations per minute max')
  }
}
```

5 invocations per user per rolling minute, enforced via a single SQL count query. No Redis, no token buckets. The client catches the rate-limit error and shows a toast.

---

## 9. UI / UX design

### 9.1 Layout — Slack-like 2-column

```
┌────────────────────┬──────────────────────────────────────────┐
│ Workspace          │ # engineering            5 online        │
│                    ├──────────────────────────────────────────┤
│ CHANNELS           │                                          │
│ # general          │  Bob — Same error as yesterday?          │
│ # engineering ●●●  │  Alice — @ai docker networking           │
│ # random   3       │  ✦ ai — analyzing ●●●                    │
│                    │  ✦ ai — Common causes include...|        │
│ PEOPLE             │                                          │
│ ● Alice            │                                          │
│ ● Bob              ├──────────────────────────────────────────┤
│ ○ Carol            │ [ @ai what should... ] [🎙] [→]          │
│                    │ ↵ send · shift+↵ newline   ● connected   │
└────────────────────┴──────────────────────────────────────────┘
```

Left rail = channels list and people summary. Right side = full chat (header with channel name + presence summary, message list, composer). Mobile collapses the rail into a hamburger drawer.

Rejected alternatives: Discord-style 3-column (members rail duplicates info already in the header, awkward second drawer on mobile); Linear-minimal (less self-explanatory affordances for join/invite, risky for evaluator).

### 9.2 AI message visual style — Variant C (inline minimal)

AI messages render with the **same shape** as human messages. Only two things distinguish them:

1. The **gradient avatar** (`#ADB6C4 → #7d8a9c`) with a `✦` glyph instead of an initial.
2. The **author name** rendered as `ai` in bold white instead of a normal sender name.

No background tint, no border, no badge. This treats the AI as a peer teammate, not a banner UI element. The brief asks for AI to be "visually distinguished" from human messages — the gradient avatar with the `✦` glyph and the bold white lowercase `ai` name accomplish that without breaking conversational flow.

### 9.3 AI lifecycle states

| State | What renders |
|---|---|
| `streaming` with empty body | `<rotating verb> ●●●` — verb picked from a small pool (`thinking`, `analyzing`, `pondering`, `considering`, `reasoning`, `working`, `composing`, `formulating`, `searching`, `processing`), memoized per message id so it stays stable |
| `streaming` with partial body | Markdown-rendered body with a blinking caret at the end |
| `complete` | Markdown-rendered body, no caret |
| `error` | Fallback body ("AI failed to respond. Tap to retry.") with a retry affordance |

The verb is picked client-side and memoized by `useMemo(() => pickVerb(), [messageId])`. Different viewers may see different verbs in the brief ~500ms thinking window — acceptable cosmetic drift.

### 9.4 Markdown rendering

AI message bodies render through `react-markdown` + `remark-gfm` (tables, strikethrough, GitHub-flavored extensions) + `rehype-highlight` (syntax highlighting for code blocks). The renderer must tolerate **incomplete markdown gracefully** — open code fences, unclosed lists, partial bold marks during streaming are expected. `react-markdown` handles this correctly (renders partial state best-effort, completes on next batch).

Re-render happens on every UPDATE batch (~every 80ms). This is cheap because react-markdown is fast on small bodies and message bodies don't grow huge.

### 9.5 Composer

| Element | Detail |
|---|---|
| Input field | `#294C60` background, `1.5px solid #ADB6C4` border when focused with `rgba(173,182,196,0.18)` glow. Multi-line capable (Shift+Enter). |
| Mic button | 42×42px square, `#ADB6C4` background, `#001B2E` SVG mic icon, hairline bottom shadow |
| Send button | 42×42px square, `#ADB6C4` background, `#001B2E` SVG right-arrow icon, same shadow |
| @mention popover | Off-tone `#294C60` card with `#3a5d72` border, popover anchored above the composer when the user types `@`. `ai` is pinned to the top with a "Summon the assistant" hint; channel members follow below. Enter to confirm, Escape to dismiss, arrow keys to navigate. |
| Hint row | Below the composer: `↵ send · shift+↵ newline · @ mention` on the left, `● connected` indicator on the right (green / amber / red based on `useConnectionState`). |

### 9.6 Color palette

Three base colors, all in a cool navy family. Dark mode by necessity.

| Token | Hex | Where it lives |
|---|---|---|
| `--color-bg` | `#001B2E` | Page canvas; icon color *inside* primary buttons (light-on-dark) |
| `--color-surface` | `#294C60` | Input field, popover/modal cards, code block backgrounds, default user-avatar fill, AI gradient endpoint |
| `--color-accent` | `#ADB6C4` | Primary text on the dark canvas, AI signature (avatar gradient + name), button background, focused input border, streaming caret |

Functionally necessary derived tones, all in the same cool family:

| Hex | Use |
|---|---|
| `#0a2840` | Slightly lifted bg for the sidebar |
| `#15384f` | Hover/selected states for list items |
| `#3a5d72` | Borders against the surface tone |
| `#7d8a9c` | Second stop in the AI avatar gradient |
| `#ffffff` | Strongest text (sender names, AI name, emphasized words) |
| `#6c7886` | Muted text (timestamps, hints, secondary metadata) |
| `#4ade80` | Semantic "● connected" green — deliberately outside the palette so connection state reads at a glance |
| `#f59e0b` | Semantic amber for degraded connection |

**Same color for AI signature and primary buttons** (`#ADB6C4`) is intentional and works because shape and position distinguish them — round avatar with `✦` in the message stream vs. fixed square button in the composer.

### 9.7 Mobile / responsive

Below `768px`, the left rail collapses into a hamburger drawer. The drawer slides in from the left over a translucent backdrop. The composer stays pinned to the bottom of the viewport. The popover appears as a bottom sheet on small screens instead of an absolute-positioned card.

### 9.8 Accessibility notes

- All interactive controls reachable via keyboard. Tab order: sidebar channels → composer input → mic → send.
- `Esc` closes the @mention popover.
- Send button has `aria-label="Send message"`, mic has `aria-label="Voice input"`.
- Message body has `aria-live="polite"` so screen readers announce streaming AI tokens (debounced via the same 80ms batching).
- Focus ring visible on all controls (2px `#ADB6C4` outline, never `outline: none`).
- Color contrast: `#ADB6C4` text on `#001B2E` background is ~10:1 — well above WCAG AAA.
- Connection-state indicator carries both color *and* a label ("connected" / "reconnecting" / "offline"), not color alone.

---

## 10. Project structure

```
kochanet-chat/
├── app/
│   ├── (auth)/                          ← unauthenticated route group
│   │   ├── layout.tsx                   centered card layout
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   ├── (app)/                           ← authenticated route group
│   │   ├── layout.tsx                   sidebar + main shell, mints initial JWT
│   │   ├── page.tsx                     redirect to first channel
│   │   └── c/[channelId]/
│   │       ├── page.tsx                 server component, fetches initial messages
│   │       └── error.tsx
│   ├── api/auth/[...all]/route.ts       ← BetterAuth catch-all mount point
│   ├── layout.tsx                       root layout (theme, fonts, providers)
│   └── globals.css
│
├── components/
│   ├── ui/                              shadcn primitives (Button, Input, Avatar, Popover, etc.)
│   ├── chat/
│   │   ├── chat-view.tsx                client component, owns realtime subscriptions for the channel
│   │   ├── message-list.tsx
│   │   ├── message-item.tsx             branches on author_kind
│   │   ├── ai-thinking.tsx              rotating-verb + dots placeholder
│   │   ├── ai-message-body.tsx          react-markdown + remark-gfm + rehype-highlight
│   │   ├── composer.tsx                 input + mic + send + popover anchor
│   │   └── mention-autocomplete.tsx
│   ├── sidebar/
│   │   ├── sidebar.tsx
│   │   ├── channel-list.tsx
│   │   └── channel-item.tsx             unread badge, active state
│   └── presence/
│       ├── presence-bar.tsx
│       └── typing-indicator.tsx
│
├── lib/
│   ├── auth/
│   │   ├── better-auth.ts               BetterAuth server instance
│   │   ├── client.ts                    BetterAuth client (createAuthClient)
│   │   └── supabase-jwt.ts              ★ THE BRIDGE — mints JWT from BA session
│   ├── supabase/
│   │   ├── server.ts                    server-side client, attaches JWT
│   │   ├── browser.ts                   browser client, uses JWT passed from server
│   │   ├── service-role.ts              service-role client — only for AI insert path
│   │   └── types.ts                     generated DB types
│   ├── ai/
│   │   ├── openai.ts                    OpenAI SDK client
│   │   ├── system-prompt.ts             team-workspace assistant prompt
│   │   ├── build-context.ts             last-30 messages → OpenAI message array
│   │   └── stream-response.ts           streaming continuation that runs inside after()
│   ├── realtime/
│   │   ├── use-messages.ts              subscribe to messages table, RLS filters
│   │   ├── use-presence.ts              per-channel Supabase Presence
│   │   ├── use-typing.ts                per-channel Broadcast for typing
│   │   └── use-connection-state.ts      drives the green/amber connection indicator
│   └── utils/
│       ├── mention.ts                   @ai detection regex
│       ├── format.ts                    date/time formatting
│       └── thinking-verbs.ts            verb pool + memoized picker
│
├── server/                              ← server actions
│   ├── messages.ts                      sendMessage, loadMore, search
│   ├── channels.ts                      createChannel, joinChannel, invite, updateLastRead
│   └── ai.ts                            checkAIRateLimit, invokeAI helpers
│
├── middleware.ts                        BetterAuth session check + redirect
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql                schema
│   │   ├── 0002_rls.sql                 RLS policies
│   │   └── 0003_seed.sql                static reference data
│   └── seed.ts                          Node seed script — creates 2 BetterAuth users + channels
│
├── docs/superpowers/specs/
│   └── 2026-04-06-kochanet-chat-design.md   ← this file
│
├── public/                              static assets
├── .env.local.example
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

**Things deliberately not included:** no `src/` wrapping directory, no global state library (Zustand / Jotai / Redux), no tRPC, no `tests/` directory. The realtime hooks own all reactive state; server actions are the API.

---

## 11. Deploy and seeding plan

### 11.1 Hosting topology

- **One Supabase project** (free tier). Hosts both BetterAuth's tables (`public.user`, `public.session`, `public.account`, `public.verification`) and the app tables (`public.channels`, `public.channel_members`, `public.messages`). The Supabase `auth.*` schema stays empty since we are not using Supabase Auth.
- **One Vercel project** linked to the GitHub repo. Auto-deploys on push to `main`. Fluid compute is on by default, enabling `after()`.
- **Local dev points at the hosted Supabase project** — no local Docker. For 2 days of work the offline-dev benefit isn't worth the setup overhead.

### 11.2 Environment variables

```bash
# Supabase — public (safe to ship to the browser)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase — server only (never exposed)
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # used ONLY by lib/supabase/service-role.ts
SUPABASE_JWT_SECRET=...                 # used by lib/auth/supabase-jwt.ts

# BetterAuth
BETTER_AUTH_SECRET=...                  # generate with `openssl rand -base64 32`
BETTER_AUTH_URL=https://<vercel-url>    # used for OAuth callback URLs
DATABASE_URL=postgresql://...           # Supabase pooled connection string for BetterAuth's adapter

# Social auth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# OpenAI
OPENAI_API_KEY=sk-...
```

GitHub is the chosen social provider over Google because GitHub OAuth setup is ~30 seconds, BetterAuth has a first-class GitHub provider, and the evaluator definitely has a GitHub account.

### 11.3 Migrations

Three SQL migrations under `supabase/migrations/`, applied via `supabase db push`:

1. **`0001_init.sql`** — creates `channels`, `channel_members`, `messages`, indexes, and BetterAuth's tables (generated by `npx @better-auth/cli generate`, output pasted in).
2. **`0002_rls.sql`** — enables RLS on the three app tables and writes the policies from §6.5.
3. **`0003_seed.sql`** — static reference data only (none currently). Could become empty.

### 11.4 Seeding test users

A standalone Node script `supabase/seed.ts` runs once after deploy:

1. Imports the BetterAuth server instance.
2. Calls `auth.api.signUpEmail()` for `alice@kochanet.test` (password `alice-test-password`) and `bob@kochanet.test` (password `bob-test-password`). Going through BetterAuth's normal API ensures password hashing, account row, and session row are all correct.
3. Captures the two BetterAuth user IDs from the signup responses.
4. Uses the **service-role Supabase client** to insert: a `# general` channel, a `# engineering` channel, two `channel_members` rows per channel, and ~5 seed messages so the chat is populated when the evaluator first opens it.
5. Logs the credentials to stdout.
6. Idempotent: checks whether the test users already exist before creating them.

Run with `pnpm tsx supabase/seed.ts`.

### 11.5 Pre-deploy checklist (in order)

1. Create Supabase project; copy URL, anon key, service role key, JWT secret, pooled connection string.
2. Create GitHub OAuth app; copy client ID and secret. Set redirect URL to a placeholder, update after first deploy.
3. Create OpenAI API key.
4. Create the GitHub repo; push initial commit.
5. Create Vercel project, link to the GitHub repo, paste env vars in the dashboard.
6. Deploy. Note the assigned `<vercel-url>`.
7. Update `BETTER_AUTH_URL` env var and the GitHub OAuth redirect URL to the actual `<vercel-url>`.
8. Run `supabase db push` against the hosted project.
9. Run `pnpm tsx supabase/seed.ts` (locally, against the hosted Supabase).
10. Smoke-test: sign in as Alice, see seeded messages, send a test message in `#engineering`, type `@ai any thoughts on the deploy?`, watch it stream. Open a second incognito window, sign in as Bob, verify presence/typing/messages in real time.

---

## 12. Risks and open questions

| Risk | Mitigation |
|---|---|
| `after()` behavior on Vercel under heavy load | We're targeting fluid compute on a free-tier project with low expected traffic; risk is low. Fallback if it misbehaves: spawn a `fetch()` to a route handler at the end of the server action and let the route handler do the streaming. |
| BetterAuth + Supabase JWT secret rotation | Both BetterAuth and Supabase require restart-style secret rotation. Not a concern in 2 days, but worth mentioning in README. |
| Web Speech API browser support | Works in Chrome / Edge / Safari; degrades in Firefox. README will note "voice features require a Chromium-based browser or Safari." |
| OpenAI stream interruption mid-response | The error branch in `invokeAI` writes a fallback body and `ai_status='error'`. The browser sees the same UPDATE event and renders the retry affordance. |
| Race when two clients send a message at the same millisecond | Composite index `(channel_id, created_at desc, id desc)` provides deterministic ordering via the `id desc` tiebreak. |
| RLS bypass for AI inserts via service-role client is a privilege boundary | Isolated in one file (`lib/supabase/service-role.ts`) which is only imported by `lib/ai/stream-response.ts`. Code review focuses on this single path. |
| Markdown rendering during incomplete code fences | `react-markdown` is designed to handle partial input — open fences render as best-effort and complete on the next batch. We'll sanity-check this during implementation; if it proves unacceptable, fallback is to defer rendering until the first newline-closed block and render plaintext in between. |

---

## 13. Deferred features ("with more time" list for the README)

- Streaming AI responses chunked to broadcast for sub-100ms latency
- Smart context summarization when the conversation exceeds 30 messages
- Read receipts beyond unread badges (per-message check marks)
- Multiple social auth providers (Google, Discord)
- Edits, reactions, threads, reply-to
- File / image sharing with previews
- Dark mode toggle (and an actual light theme)
- PWA support and push notifications
- Keyboard shortcut suite (cmd-k channel switcher, etc.)
- Playwright e2e tests for the realtime + AI flow
- Search highlighting + ranking via Postgres full-text search

---

## 14. Decision log summary

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Backend | Supabase | Firebase |
| Auth bridge | Mint Supabase JWT from BetterAuth session, custom `app_user_id` claim | Service-role only (loses Realtime RLS); parallel auth systems (sync hell) |
| Channel/permission model | Slack-like, membership required to read | Discord-style hierarchy (overkill); public-no-membership flag (read receipts force the row anyway) |
| AI message representation | Single `messages` table with `author_kind` discriminator | Synthetic AI user row (forces fake account); two tables (UNION queries) |
| AI invocation orchestration | Server action inserts placeholder + `after()` schedules streaming continuation | Route handler (less secure entry); database trigger (overcomplicated) |
| AI streaming transport | Postgres Changes UPDATEs to placeholder row, batched 80ms / 30 tokens | Broadcast (two consistency stories, worse mid-stream join) |
| Realtime for messages | Postgres Changes (single global subscription, RLS-filtered) | Broadcast (redundant); per-channel subscriptions (no sidebar updates) |
| Optimistic updates | Yes, with `client_id uuid` column for dedup | None (inferior UX); content-based dedup (fragile) |
| Layout | Slack 2-column | Discord 3-column (members rail duplicates header); Linear minimal (less obvious affordances) |
| AI message style | Inline minimal — gradient avatar + colored name only | Subtle tint + badge; bordered card |
| Color palette | Navy dark mode (`#001B2E`, `#294C60`, `#ADB6C4`) | Sage light mode (felt dull); sage + cyan light mode (mid iteration) |
| Voice | Web Speech API only | OpenAI Whisper + TTS (full day of work) |
| Search | `ilike` over `messages.body` | Full-text search + highlighting (over-budget) |
| Project structure | Route groups, `lib/` for clients/hooks, `server/` for actions | `src/` wrapping (unnecessary); state library (no need) |
| Seed users | Node script via BetterAuth signUpEmail API + service-role channel inserts | Direct SQL inserts (would skip password hashing) |
