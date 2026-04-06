# Kochanet Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time team chat with an on-demand AI assistant (invoked via `@ai`), matching the Kochanet test brief, deployed to Vercel, for submission on 2026-04-08.

**Architecture:** Next.js 15 App Router + TypeScript. BetterAuth for identity, bridged to Supabase via a custom-claim JWT so RLS works from the browser and Realtime. Single `messages` table with an `author_kind` discriminator for human and AI rows. AI streaming reuses the same Postgres Changes subscription used for new messages — the streaming continuation runs inside `after()` from `next/server` and writes batched UPDATEs to a placeholder row.

**Tech Stack:** Next.js 15, TypeScript, Tailwind, shadcn/ui, Supabase (Postgres + Realtime), BetterAuth, OpenAI SDK, `jose` for JWT signing, `react-markdown` + `remark-gfm` + `rehype-highlight`, Web Speech API, Vitest for unit tests.

**Source of truth:** `docs/superpowers/specs/2026-04-06-kochanet-chat-design.md` — every architectural decision is documented there. This plan is the executable form of that spec.

---

## File structure map

This plan creates (or modifies) the following files. Each is a focused unit with one responsibility.

**Scaffold and config:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.local.example`
- `app/layout.tsx`, `app/globals.css`

**Auth:**
- `lib/auth/better-auth.ts` — BetterAuth server instance
- `lib/auth/client.ts` — BetterAuth React client
- `lib/auth/supabase-jwt.ts` — ★ mints Supabase-compat JWT from BetterAuth session
- `app/api/auth/[...all]/route.ts` — BetterAuth catch-all mount
- `middleware.ts` — session-based redirect between route groups

**Supabase clients:**
- `lib/supabase/server.ts` — server client, attaches minted JWT
- `lib/supabase/browser.ts` + `lib/supabase/supabase-provider.tsx` — browser client + React provider
- `lib/supabase/service-role.ts` — service-role client (AI path only)
- `lib/supabase/types.ts` — generated DB types

**Migrations:**
- `supabase/migrations/0001_init.sql` — BetterAuth tables + app tables + indexes
- `supabase/migrations/0002_rls.sql` — helper function + RLS policies
- `supabase/seed.ts` — Node seed script (BetterAuth signups + channel data)

**Server actions:**
- `server/messages.ts` — `sendMessage`, `loadMessages`, `searchMessages`
- `server/channels.ts` — `createChannel`, `joinChannel`, `inviteMember`, `updateLastRead`
- `server/ai.ts` — `checkAIRateLimit`

**AI logic:**
- `lib/ai/openai.ts`, `lib/ai/system-prompt.ts`
- `lib/ai/build-context.ts` — last-30 formatter with display-name resolution
- `lib/ai/stream-response.ts` — the `after()` streaming continuation

**Realtime hooks:**
- `lib/realtime/use-messages.ts` — global messages subscription + optimistic merge + gap-fill
- `lib/realtime/use-presence.ts`, `lib/realtime/use-typing.ts`, `lib/realtime/use-connection-state.ts`

**Utilities:**
- `lib/utils/mention.ts` — `@ai` regex detection
- `lib/utils/thinking-verbs.ts` — rotating verb pool + memoized picker
- `lib/utils/format.ts` — date/time helpers

**Routes and pages:**
- `app/(auth)/layout.tsx`, `sign-in/page.tsx`, `sign-up/page.tsx`
- `app/(app)/layout.tsx`, `page.tsx`
- `app/(app)/c/[channelId]/page.tsx`, `error.tsx`

**Components:**
- `components/ui/*` — shadcn primitives (Button, Input, Avatar, Popover, ScrollArea, Dialog, etc.)
- `components/sidebar/sidebar.tsx`, `channel-list.tsx`, `channel-item.tsx`
- `components/chat/chat-view.tsx`, `message-list.tsx`, `message-item.tsx`, `ai-thinking.tsx`, `ai-message-body.tsx`, `composer.tsx`, `mention-autocomplete.tsx`
- `components/presence/presence-bar.tsx`, `typing-indicator.tsx`

**Tests (Vitest):**
- `lib/auth/supabase-jwt.test.ts`
- `lib/utils/mention.test.ts`
- `lib/ai/build-context.test.ts`
- `server/ai.test.ts`
- `server/messages.test.ts`

**Docs:**
- `README.md`

---

## Testing approach

- **Vitest** for unit tests on pure-logic modules and server actions. Run with `pnpm test`.
- **Strict TDD** (failing test → implement → pass → commit) for: JWT bridge, mention detection, context builder, rate limiter, and the core branching inside `sendMessage`.
- **Runtime smoke verification** (open browser, perform action, verify) for UI components, realtime behavior, auth flows, and the AI streaming pipeline end-to-end. Each UI task has explicit "open `localhost:3000/c/<channel>` and check X" instructions.
- No Playwright, no component tests for individual React components. Documented as a tradeoff in the README.

---

## Phase 1 — Project scaffold and base configuration

### Task 1: Initialize Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore` (if not already present)

- [ ] **Step 1: Run the Next.js scaffold**

From `/Users/admin/Documents/work/kochanet-chat`:

```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-eslint \
  --turbopack \
  --use-pnpm
```

If the command prompts about the existing directory containing `docs/` and `.git/`, answer yes to proceed. The scaffold will add files alongside the existing docs directory.

- [ ] **Step 2: Verify the dev server starts**

Run: `pnpm dev`
Expected: server starts on `http://localhost:3000`, landing page renders. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with TypeScript + Tailwind"
```

---

### Task 2: Install runtime dependencies

**Files:**
- Modify: `package.json` (via `pnpm add`)

- [ ] **Step 1: Install dependencies**

```bash
pnpm add \
  @supabase/supabase-js \
  @supabase/ssr \
  better-auth \
  jose \
  openai \
  react-markdown \
  remark-gfm \
  rehype-highlight \
  highlight.js \
  lucide-react \
  clsx \
  tailwind-merge \
  class-variance-authority \
  zod
```

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D \
  vitest \
  @vitest/ui \
  @testing-library/react \
  @testing-library/jest-dom \
  jsdom \
  @types/node \
  tsx
```

- [ ] **Step 3: Verify install**

Run: `pnpm list --depth=0`
Expected: all packages above appear in the output.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add runtime and dev dependencies"
```

---

### Task 3: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Create vitest config**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 2: Create setup file**

`vitest.setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Add test script**

In `package.json` add under `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test**

`lib/utils/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 6: Delete the smoke test**

```bash
rm lib/utils/smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json
git commit -m "chore: configure Vitest with jsdom + testing-library"
```

---

### Task 4: Configure Tailwind with the design tokens

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the Tailwind config**

Replace `tailwind.config.ts` with:
```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#001B2E',
        'bg-lifted': '#0a2840',
        surface: '#294C60',
        hover: '#15384f',
        border: '#3a5d72',
        accent: '#ADB6C4',
        'accent-deep': '#7d8a9c',
        muted: '#6c7886',
        success: '#4ade80',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2: Write base styles**

Replace `app/globals.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body {
    background-color: #001B2E;
    color: #ADB6C4;
    font-family: system-ui, -apple-system, sans-serif;
  }
  *:focus-visible {
    outline: 2px solid #ADB6C4;
    outline-offset: 2px;
  }
}

@keyframes pulse-dot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1); }
}
@keyframes blink-caret {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.pulse-dot   { animation: pulse-dot 1.4s ease-in-out infinite; }
.blink-caret { animation: blink-caret 1s steps(1) infinite; }
```

- [ ] **Step 3: Verify**

Replace `app/page.tsx` with a temp smoke screen:
```tsx
export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center">
      <div className="text-accent">
        <h1 className="text-2xl font-bold text-white">Kochanet Chat</h1>
        <p className="text-muted">Scaffold working.</p>
      </div>
    </main>
  )
}
```

Run: `pnpm dev` and open `http://localhost:3000`.
Expected: dark navy background with light sage "Kochanet Chat" heading.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css app/page.tsx
git commit -m "feat: configure Tailwind with navy palette design tokens"
```

---

### Task 5: Set up environment variable template

**Files:**
- Create: `.env.local.example`
- Create: `.env.local` (gitignored, local dev values)

- [ ] **Step 1: Write the template**

`.env.local.example`:
```bash
# Supabase (public — safe in browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase (server only)
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# BetterAuth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=

# GitHub OAuth (BetterAuth social provider)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# OpenAI
OPENAI_API_KEY=
```

- [ ] **Step 2: Copy to local**

```bash
cp .env.local.example .env.local
```

Leave values blank for now — they will be filled in Task 6 after creating the Supabase project.

- [ ] **Step 3: Verify .env.local is gitignored**

Run: `git status --porcelain .env.local`
Expected: empty output (file is ignored).

- [ ] **Step 4: Commit**

```bash
git add .env.local.example
git commit -m "chore: add environment variable template"
```

---

## Phase 2 — Supabase project and schema migrations

### Task 6: Create the hosted Supabase project (manual)

**Files:** none (dashboard action)

- [ ] **Step 1: Create the project**

Go to https://supabase.com/dashboard, create a new project named `kochanet-chat`. Pick any region close to you. Note the DB password.

- [ ] **Step 2: Copy API values into .env.local**

Navigate to **Project Settings → API**. Copy:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
- `JWT Secret` (scroll down in the same page) → `SUPABASE_JWT_SECRET`

- [ ] **Step 3: Copy DB connection string**

Navigate to **Project Settings → Database → Connection string → URI (Session pooler)**. Copy it into `DATABASE_URL` in `.env.local`. Replace `[YOUR-PASSWORD]` with the DB password from step 1.

- [ ] **Step 4: Generate BetterAuth secret**

```bash
openssl rand -base64 32
```

Paste the output into `BETTER_AUTH_SECRET` in `.env.local`.

- [ ] **Step 5: Verify env is loadable**

```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING'); console.log('SERVICE:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING')"
```

Expected: both print `set`. (If `dotenv` isn't installed, `pnpm add -D dotenv` first — we'll only need it temporarily for this sanity check.)

No commit here — `.env.local` is gitignored.

---

### Task 7: Install the Supabase CLI and initialize local config

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/migrations/` directory

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
```

Or follow https://supabase.com/docs/guides/cli if not on Homebrew.

- [ ] **Step 2: Initialize local config**

```bash
cd /Users/admin/Documents/work/kochanet-chat
supabase init
```

Answer "No" to the VS Code settings prompt.

- [ ] **Step 3: Link to the hosted project**

```bash
supabase link --project-ref <project-ref>
```

The `<project-ref>` is the subdomain from your `NEXT_PUBLIC_SUPABASE_URL` (e.g., `abcdefgh` from `https://abcdefgh.supabase.co`). You will be prompted for the DB password.

- [ ] **Step 4: Verify link**

```bash
supabase db pull
```

Expected: either an empty diff or a message about already being in sync.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "chore: initialize Supabase CLI config and link to hosted project"
```

---

### Task 8: Generate BetterAuth schema into an init migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Configure BetterAuth temporarily to generate schema**

Create a minimal BetterAuth instance so the CLI can generate the schema. `lib/auth/better-auth.ts`:
```typescript
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    },
  },
})
```

Install the Postgres driver:
```bash
pnpm add pg
pnpm add -D @types/pg
```

- [ ] **Step 2: Generate BetterAuth schema**

```bash
pnpm dlx @better-auth/cli generate --config lib/auth/better-auth.ts --output /tmp/better-auth-schema.sql
```

If the CLI prompts for format, pick SQL. Output will be in `/tmp/better-auth-schema.sql`.

- [ ] **Step 3: Create the init migration**

```bash
supabase migration new init
```

This creates `supabase/migrations/<timestamp>_init.sql`. Rename it to match the convention:
```bash
mv supabase/migrations/*_init.sql supabase/migrations/0001_init.sql
```

- [ ] **Step 4: Paste BetterAuth schema + app schema into 0001_init.sql**

Open `supabase/migrations/0001_init.sql`. Paste at the top the contents of `/tmp/better-auth-schema.sql`, then append the app schema below it:

```sql
-- ============================================================================
-- BetterAuth tables (generated by @better-auth/cli)
-- ============================================================================
-- [paste generated SQL here]

-- ============================================================================
-- App tables
-- ============================================================================

create table channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('public', 'private')),
  created_by  uuid not null,
  created_at  timestamptz not null default now()
);

create table channel_members (
  channel_id    uuid not null references channels(id) on delete cascade,
  user_id       uuid not null,
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  last_read_at  timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table messages (
  id                  uuid primary key default gen_random_uuid(),
  channel_id          uuid not null references channels(id) on delete cascade,
  author_kind         text not null check (author_kind in ('user', 'ai')),
  author_id           uuid,
  invoked_by_user_id  uuid,
  body                text not null default '',
  client_id           uuid,
  ai_status           text check (ai_status in ('streaming', 'complete', 'error')),
  created_at          timestamptz not null default now(),
  constraint messages_ai_status_consistency
    check ((author_kind = 'ai') = (ai_status is not null))
);

create index messages_channel_created_idx
  on messages (channel_id, created_at desc, id desc);

create unique index messages_client_id_unique
  on messages (channel_id, author_id, client_id)
  where client_id is not null;
```

- [ ] **Step 5: Apply the migration**

```bash
supabase db push
```

Expected: migration applied, no errors.

- [ ] **Step 6: Verify in Supabase Studio**

Open the Supabase dashboard → Table Editor. Expected: `user`, `session`, `account`, `verification` (from BetterAuth), plus `channels`, `channel_members`, `messages`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_init.sql lib/auth/better-auth.ts package.json pnpm-lock.yaml
git commit -m "feat: add init migration with BetterAuth schema and app tables"
```

---

### Task 9: Add RLS policies migration

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

- [ ] **Step 1: Create the migration file**

```bash
supabase migration new rls
mv supabase/migrations/*_rls.sql supabase/migrations/0002_rls.sql
```

- [ ] **Step 2: Write RLS policies**

`supabase/migrations/0002_rls.sql`:
```sql
-- Enable RLS on app tables (BetterAuth tables stay un-RLS'd; browser never queries them)
alter table channels        enable row level security;
alter table channel_members enable row level security;
alter table messages        enable row level security;

-- Helper: extract our custom claim from the JWT
create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_user_id',
    ''
  )::uuid
$$;

-- ----------------------------------------------------------------------------
-- channel_members: each user manages only their own membership rows
-- ----------------------------------------------------------------------------
create policy cm_select_own  on channel_members for select
  using (user_id = app_user_id());

create policy cm_insert_self on channel_members for insert
  with check (user_id = app_user_id());

create policy cm_delete_self on channel_members for delete
  using (user_id = app_user_id());

create policy cm_update_own  on channel_members for update
  using (user_id = app_user_id())
  with check (user_id = app_user_id());

-- ----------------------------------------------------------------------------
-- channels: members see their channels; authenticated users see all public channels
-- ----------------------------------------------------------------------------
create policy channels_select_member on channels for select using (
  type = 'public'
  or exists (
    select 1 from channel_members
    where channel_members.channel_id = channels.id
      and channel_members.user_id = app_user_id()
  )
);

create policy channels_insert_authenticated on channels for insert
  with check (created_by = app_user_id());

-- ----------------------------------------------------------------------------
-- messages: readable by channel members, insertable only as self + as 'user' kind
-- AI message inserts come from service-role client and bypass RLS entirely
-- ----------------------------------------------------------------------------
create policy messages_select_member on messages for select using (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);

create policy messages_insert_member on messages for insert with check (
  author_kind = 'user'
  and author_id = app_user_id()
  and exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
      and channel_members.user_id = app_user_id()
  )
);

-- No UPDATE or DELETE policy on messages: browser-initiated updates are denied.
-- The AI streaming continuation updates messages via the service-role client only.
```

- [ ] **Step 3: Apply the migration**

```bash
supabase db push
```

Expected: migration applied.

- [ ] **Step 4: Enable Realtime on messages**

In the Supabase dashboard → Database → Publications → `supabase_realtime`: toggle `messages` ON. (Alternatively, append to the migration: `alter publication supabase_realtime add table messages;` and re-push.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat: add RLS policies and app_user_id helper for JWT custom claim"
```

---

## Phase 3 — BetterAuth wiring

### Task 10: Mount BetterAuth at /api/auth/[...all]

**Files:**
- Create: `app/api/auth/[...all]/route.ts`
- Modify: `lib/auth/better-auth.ts` (already exists from Task 8)

- [ ] **Step 1: Create the route handler**

`app/api/auth/[...all]/route.ts`:
```typescript
import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth/better-auth'

export const { POST, GET } = toNextJsHandler(auth.handler)
```

- [ ] **Step 2: Create a GitHub OAuth app**

Go to https://github.com/settings/developers → New OAuth App.
- Application name: `kochanet-chat-dev`
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Copy the Client ID and Client Secret into `.env.local` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

- [ ] **Step 3: Verify BetterAuth responds**

Run: `pnpm dev`
In another terminal: `curl http://localhost:3000/api/auth/ok`
Expected: JSON response like `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/
git commit -m "feat: mount BetterAuth catch-all route with GitHub social provider"
```

---

### Task 11: Create BetterAuth React client

**Files:**
- Create: `lib/auth/client.ts`

- [ ] **Step 1: Write the client**

`lib/auth/client.ts`:
```typescript
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
})

export const { useSession, signIn, signUp, signOut } = authClient
```

- [ ] **Step 2: Add `NEXT_PUBLIC_APP_URL` to env**

Append to `.env.local.example`:
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

And to `.env.local` with the same value.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/client.ts .env.local.example
git commit -m "feat: add BetterAuth React client hooks"
```

---

## Phase 4 — The JWT bridge (strict TDD)

### Task 12: Write the Supabase JWT minting function

**Files:**
- Create: `lib/auth/supabase-jwt.ts`
- Create: `lib/auth/supabase-jwt.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/auth/supabase-jwt.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { jwtVerify } from 'jose'
import { mintSupabaseJwt } from './supabase-jwt'

beforeEach(() => {
  process.env.SUPABASE_JWT_SECRET = 'test-secret-at-least-32-characters-long!'
})

describe('mintSupabaseJwt', () => {
  it('returns a signed JWT with the expected claims', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const token = await mintSupabaseJwt(userId)

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    expect(payload.sub).toBe(userId)
    expect(payload.role).toBe('authenticated')
    expect(payload.app_user_id).toBe(userId)
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('sets expiration about 1 hour in the future', async () => {
    const token = await mintSupabaseJwt('22222222-2222-2222-2222-222222222222')
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)

    const now = Math.floor(Date.now() / 1000)
    expect(payload.exp! - now).toBeGreaterThan(3500)
    expect(payload.exp! - now).toBeLessThanOrEqual(3600)
  })

  it('throws if SUPABASE_JWT_SECRET is missing', async () => {
    delete process.env.SUPABASE_JWT_SECRET
    await expect(mintSupabaseJwt('any')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/auth/supabase-jwt.test.ts`
Expected: FAIL with "Cannot find module './supabase-jwt'".

- [ ] **Step 3: Write the minimal implementation**

`lib/auth/supabase-jwt.ts`:
```typescript
import { SignJWT } from 'jose'

export async function mintSupabaseJwt(betterAuthUserId: string): Promise<string> {
  const secretValue = process.env.SUPABASE_JWT_SECRET
  if (!secretValue) {
    throw new Error('SUPABASE_JWT_SECRET is not set')
  }
  const secret = new TextEncoder().encode(secretValue)

  return new SignJWT({
    sub: betterAuthUserId,
    role: 'authenticated',
    app_user_id: betterAuthUserId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/auth/supabase-jwt.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/supabase-jwt.ts lib/auth/supabase-jwt.test.ts
git commit -m "feat: add Supabase JWT bridge with custom app_user_id claim"
```

---

### Task 13: Server-side Supabase client

**Files:**
- Create: `lib/supabase/server.ts`

- [ ] **Step 1: Write the server client factory**

`lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { headers, cookies } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'

/**
 * Creates a Supabase client for server components, server actions, and route
 * handlers. Automatically attaches a minted Supabase JWT derived from the
 * current BetterAuth session, so RLS sees the right user.
 *
 * If there's no BetterAuth session, the returned client is unauthenticated —
 * queries will hit RLS with no app_user_id and get filtered accordingly.
 */
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
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
      global: jwt
        ? { headers: { Authorization: `Bearer ${jwt}` } }
        : undefined,
    }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/server.ts
git commit -m "feat: add server-side Supabase client that attaches BetterAuth-derived JWT"
```

---

### Task 14: Service-role Supabase client (AI path only)

**Files:**
- Create: `lib/supabase/service-role.ts`

- [ ] **Step 1: Write the client**

`lib/supabase/service-role.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * The service-role Supabase client bypasses RLS entirely. ONLY import this
 * from server-side AI code (lib/ai/stream-response.ts, server/ai.ts,
 * supabase/seed.ts). Every other path should use the user-scoped clients
 * in lib/supabase/server.ts or lib/supabase/browser.ts.
 *
 * Any import of this module should be reviewed as a privilege boundary.
 */
export function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/service-role.ts
git commit -m "feat: add service-role Supabase client (AI insert path only)"
```

---

### Task 15: Browser Supabase client + React provider

**Files:**
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/supabase-provider.tsx`
- Create: `server/session.ts` (server action to refresh JWT)

- [ ] **Step 1: Write the browser client factory**

`lib/supabase/browser.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createBrowserSupabaseClient(jwt: string | null): SupabaseClient {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
      realtime: jwt
        ? { params: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } }
        : undefined,
    }
  )
}
```

- [ ] **Step 2: Write the JWT refresh server action**

`server/session.ts`:
```typescript
'use server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'

export async function refreshSupabaseJwt(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  return mintSupabaseJwt(session.user.id)
}
```

- [ ] **Step 3: Write the React provider**

`lib/supabase/supabase-provider.tsx`:
```tsx
'use client'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from './browser'
import { refreshSupabaseJwt } from '@/server/session'

const SupabaseContext = createContext<SupabaseClient | null>(null)

const REFRESH_INTERVAL_MS = 50 * 60 * 1000 // 50 minutes — 10-minute safety margin before 1h expiry

export function SupabaseProvider({
  initialJwt,
  children,
}: {
  initialJwt: string | null
  children: React.ReactNode
}) {
  const [jwt, setJwt] = useState<string | null>(initialJwt)
  const client = useMemo(() => createBrowserSupabaseClient(jwt), [jwt])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!jwt) return
    intervalRef.current = setInterval(async () => {
      const fresh = await refreshSupabaseJwt()
      setJwt(fresh)
    }, REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jwt])

  // Propagate the new JWT to the realtime channel if already connected.
  useEffect(() => {
    if (jwt && client.realtime) {
      client.realtime.setAuth(jwt)
    }
  }, [jwt, client])

  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}

export function useSupabase(): SupabaseClient {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside <SupabaseProvider>')
  return ctx
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/browser.ts lib/supabase/supabase-provider.tsx server/session.ts
git commit -m "feat: add browser Supabase client with JWT refresh provider"
```

---

## Phase 5 — Middleware, route groups, and sign-in/sign-up pages

### Task 16: Auth-gate middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write the middleware**

`middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/sign-up']
const AUTH_COOKIE_NAME = 'better-auth.session_token'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets and auth API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))

  if (!hasSession && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (hasSession && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

Note: cookie presence is a fast heuristic — the authoritative session check happens server-side inside `createClient()`. We don't validate the cookie contents in middleware because middleware runs on the Edge runtime and BetterAuth's full verification requires Node APIs.

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware redirecting between auth and app route groups"
```

---

### Task 17: (auth) route group layout and pages

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/sign-in/page.tsx`
- Create: `app/(auth)/sign-up/page.tsx`

- [ ] **Step 1: Create the (auth) layout**

`app/(auth)/layout.tsx`:
```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">Kochanet Chat</h1>
          <p className="mt-1 text-sm text-muted">Team workspace with an AI teammate</p>
        </div>
        {children}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Create the sign-in page**

`app/(auth)/sign-in/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth/client'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signIn.email({ email, password })
    setBusy(false)
    if (res.error) {
      setError(res.error.message || 'Sign-in failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  async function onGitHub() {
    await signIn.social({ provider: 'github', callbackURL: '/' })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-warning">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent p-2 font-semibold text-bg disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="relative py-2 text-center">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-surface px-2 text-xs text-muted">or</span>
      </div>

      <button
        type="button"
        onClick={onGitHub}
        className="w-full rounded-lg border border-border p-2 text-accent hover:bg-hover"
      >
        Continue with GitHub
      </button>

      <p className="text-center text-xs text-muted">
        No account? <a href="/sign-up" className="text-accent underline">Sign up</a>
      </p>
    </form>
  )
}
```

- [ ] **Step 3: Create the sign-up page**

`app/(auth)/sign-up/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signUp } from '@/lib/auth/client'

export default function SignUpPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await signUp.email({ email, password, name })
    setBusy(false)
    if (res.error) {
      setError(res.error.message || 'Sign-up failed')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Display name</span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Password (min 8)</span>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      {error && <p className="text-sm text-warning">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent p-2 font-semibold text-bg disabled:opacity-60"
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <p className="text-center text-xs text-muted">
        Already have one? <a href="/sign-in" className="text-accent underline">Sign in</a>
      </p>
    </form>
  )
}
```

- [ ] **Step 4: Smoke-test**

Run `pnpm dev`, open `http://localhost:3000/sign-up`.
Expected: centered card on dark navy background, working form.
Create a test account with any email/password. On success, the middleware should redirect to `/`. There's no `(app)` layout yet, so you'll see a 404 — that's fine, we'll build it in the next task.

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)"
git commit -m "feat: add (auth) route group with sign-in and sign-up pages"
```

---

### Task 18: (app) route group layout skeleton

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx`
- Delete: `app/page.tsx` (old scaffold page)

- [ ] **Step 1: Delete old scaffold page**

```bash
rm app/page.tsx
```

- [ ] **Step 2: Create (app) layout**

`app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { mintSupabaseJwt } from '@/lib/auth/supabase-jwt'
import { SupabaseProvider } from '@/lib/supabase/supabase-provider'
import { Sidebar } from '@/components/sidebar/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/sign-in')

  const jwt = await mintSupabaseJwt(session.user.id)

  return (
    <SupabaseProvider initialJwt={jwt}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          currentUser={{ id: session.user.id, name: session.user.name || session.user.email }}
        />
        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>
    </SupabaseProvider>
  )
}
```

- [ ] **Step 3: Create redirect index page**

`app/(app)/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppIndex() {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, channels(id, name)')
    .order('joined_at')
    .limit(1)

  const first = memberships?.[0]
  if (first) {
    redirect(`/c/${first.channel_id}`)
  }

  redirect('/onboarding')
}
```

- [ ] **Step 4: Create a temporary onboarding stub**

`app/(app)/onboarding/page.tsx`:
```tsx
export default function OnboardingPage() {
  return (
    <div className="grid h-full place-items-center text-muted">
      <p>No channels yet. (Channel creation UI comes in a later task.)</p>
    </div>
  )
}
```

- [ ] **Step 5: Create a placeholder Sidebar component**

`components/sidebar/sidebar.tsx`:
```tsx
export function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-lifted p-4">
      <div className="text-xs uppercase tracking-wide text-muted">Workspace</div>
      <div className="mt-1 font-semibold text-white">Kochanet</div>
      <div className="mt-6 text-xs text-muted">Signed in as</div>
      <div className="text-sm text-accent">{currentUser.name}</div>
    </aside>
  )
}
```

- [ ] **Step 6: Smoke-test**

Run `pnpm dev`, go to `http://localhost:3000`.
Expected: redirect to `/sign-in` if logged out, or to `/onboarding` if logged in (because no channels exist yet).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)" components/sidebar/sidebar.tsx
git commit -m "feat: add (app) route group shell with JWT provider + sidebar stub"
```

---

## Phase 6 — Channels (server actions + sidebar listing)

### Task 19: `createChannel` and `joinChannel` server actions

**Files:**
- Create: `server/channels.ts`

- [ ] **Step 1: Write the server actions**

`server/channels.ts`:
```typescript
'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const createChannelSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(['public', 'private']),
})

export async function createChannel(input: { name: string; type: 'public' | 'private' }) {
  const parsed = createChannelSchema.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const supabase = await createClient()

  const { data: channel, error } = await supabase
    .from('channels')
    .insert({
      name: parsed.name,
      type: parsed.type,
      created_by: session.user.id,
    })
    .select()
    .single()
  if (error) throw error

  // Owner auto-joins as 'owner' role
  const { error: memberErr } = await supabase
    .from('channel_members')
    .insert({
      channel_id: channel.id,
      user_id: session.user.id,
      role: 'owner',
    })
  if (memberErr) throw memberErr

  revalidatePath('/', 'layout')
  return channel
}

export async function joinChannel(channelId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const supabase = await createClient()
  const { error } = await supabase
    .from('channel_members')
    .insert({
      channel_id: channelId,
      user_id: session.user.id,
      role: 'member',
    })
  if (error && error.code !== '23505') throw error // 23505 = unique violation, already a member

  revalidatePath('/', 'layout')
}

export async function updateLastRead(channelId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return

  const supabase = await createClient()
  await supabase
    .from('channel_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('channel_id', channelId)
    .eq('user_id', session.user.id)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/channels.ts
git commit -m "feat: add channel server actions (create, join, updateLastRead)"
```

---

### Task 20: Sidebar with channel list

**Files:**
- Modify: `components/sidebar/sidebar.tsx`
- Create: `components/sidebar/channel-list.tsx`
- Create: `components/sidebar/channel-item.tsx`
- Create: `components/sidebar/new-channel-button.tsx`

- [ ] **Step 1: Rewrite the Sidebar to fetch channels server-side**

`components/sidebar/sidebar.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { ChannelList } from './channel-list'
import { NewChannelButton } from './new-channel-button'
import { SignOutButton } from './sign-out-button'

export async function Sidebar({ currentUser }: { currentUser: { id: string; name: string } }) {
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, last_read_at, channels(id, name, type)')
    .order('joined_at')

  const channels = (memberships ?? [])
    .map((m) => ({
      id: m.channel_id,
      name: (m.channels as unknown as { name: string }).name,
      type: (m.channels as unknown as { type: 'public' | 'private' }).type,
      lastReadAt: m.last_read_at,
    }))

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-bg-lifted">
      <div className="p-4 border-b border-border">
        <div className="text-xs uppercase tracking-wide text-muted">Workspace</div>
        <div className="mt-1 font-semibold text-white">Kochanet</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Channels
          </span>
          <NewChannelButton />
        </div>
        <ChannelList channels={channels} />
      </div>

      <div className="border-t border-border p-3">
        <div className="text-xs text-muted">Signed in as</div>
        <div className="text-sm text-accent truncate">{currentUser.name}</div>
        <SignOutButton className="mt-2" />
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create ChannelList**

`components/sidebar/channel-list.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChannelItem } from './channel-item'

type Channel = {
  id: string
  name: string
  type: 'public' | 'private'
  lastReadAt: string
}

export function ChannelList({ channels }: { channels: Channel[] }) {
  const params = useParams<{ channelId?: string }>()
  const active = params?.channelId

  if (channels.length === 0) {
    return <p className="px-2 text-xs text-muted">No channels yet. Create one.</p>
  }

  return (
    <ul className="space-y-0.5">
      {channels.map((c) => (
        <li key={c.id}>
          <Link href={`/c/${c.id}`}>
            <ChannelItem channel={c} isActive={active === c.id} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Create ChannelItem**

`components/sidebar/channel-item.tsx`:
```tsx
type Channel = { id: string; name: string; type: 'public' | 'private' }

export function ChannelItem({
  channel,
  isActive,
  unreadCount = 0,
}: {
  channel: Channel
  isActive: boolean
  unreadCount?: number
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
        isActive ? 'bg-hover text-white' : 'text-accent hover:bg-hover/60'
      }`}
    >
      <span className="truncate">
        <span className="text-muted">{channel.type === 'public' ? '#' : '🔒'}</span>{' '}
        {channel.name}
      </span>
      {unreadCount > 0 && (
        <span className="ml-2 rounded-full bg-warning px-1.5 text-[10px] font-semibold text-bg">
          {unreadCount}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create NewChannelButton**

`components/sidebar/new-channel-button.tsx`:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createChannel } from '@/server/channels'

export function NewChannelButton() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'public' | 'private'>('public')
  const [pending, start] = useTransition()
  const router = useRouter()

  function onCreate(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const ch = await createChannel({ name, type })
      setOpen(false)
      setName('')
      router.push(`/c/${ch.id}`)
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="New channel"
        className="text-muted hover:text-accent text-lg leading-none"
      >
        +
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/50"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onCreate}
            className="w-80 rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <h2 className="font-semibold text-white">New channel</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              className="w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
            />
            <div className="flex gap-4 text-sm text-accent">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={type === 'public'}
                  onChange={() => setType('public')}
                />
                Public
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={type === 'private'}
                  onChange={() => setType('private')}
                />
                Private
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-muted hover:text-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !name}
                className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-50"
              >
                {pending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 5: Create SignOutButton**

`components/sidebar/sign-out-button.tsx`:
```tsx
'use client'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth/client'

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  async function onClick() {
    await signOut()
    router.push('/sign-in')
    router.refresh()
  }
  return (
    <button
      onClick={onClick}
      className={`text-xs text-muted underline hover:text-accent ${className ?? ''}`}
    >
      Sign out
    </button>
  )
}
```

- [ ] **Step 6: Smoke-test**

Run `pnpm dev`. Sign in with your test account. Click `+` in the sidebar, create a channel named `general` (public). Expected:
- The channel appears in the sidebar.
- You're redirected to `/c/<channel-id>` (which will 404 until Task 21).

- [ ] **Step 7: Commit**

```bash
git add components/sidebar/
git commit -m "feat: sidebar lists channels and allows creating new ones"
```

---

### Task 21: Channel page skeleton and initial-message fetch

**Files:**
- Create: `app/(app)/c/[channelId]/page.tsx`
- Create: `app/(app)/c/[channelId]/error.tsx`
- Create: `components/chat/chat-view.tsx`

- [ ] **Step 1: Create the channel page**

Important: member display names must be resolved via a **two-step query** — one against `channel_members` for user IDs, a second against `public.user` for names — because our schema has no foreign key between `channel_members.user_id` and `public.user.id` (see the spec's "no FK to users table" decision). PostgREST's embedded-select syntax (`user:user_id(...)`) won't work without that FK.

`app/(app)/c/[channelId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { ChatView } from '@/components/chat/chat-view'

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>
}) {
  const { channelId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return notFound()

  const supabase = await createClient()

  const { data: channel, error } = await supabase
    .from('channels')
    .select('id, name, type')
    .eq('id', channelId)
    .single()
  if (error || !channel) return notFound()

  const { data: initialMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Reverse to chronological order for rendering
  const messages = (initialMessages ?? []).slice().reverse()

  // Two-step member fetch: membership rows then user names (no FK between them)
  const { data: memberRows } = await supabase
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)

  const userIds = (memberRows ?? []).map((r) => r.user_id)
  const { data: users } = userIds.length
    ? await supabase.from('user').select('id, name').in('id', userIds)
    : { data: [] as Array<{ id: string; name: string }> }

  const memberList = (users ?? []).map((u) => ({ id: u.id, name: u.name }))

  return (
    <ChatView
      channel={channel}
      initialMessages={messages}
      members={memberList}
      currentUser={{ id: session.user.id, name: session.user.name || session.user.email }}
    />
  )
}
```

- [ ] **Step 2: Create error boundary**

`app/(app)/c/[channelId]/error.tsx`:
```tsx
'use client'
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-white">Something broke</h2>
        <p className="mt-2 text-sm text-muted">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded bg-accent px-3 py-1.5 text-sm font-semibold text-bg"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create ChatView stub (just renders messages)**

`components/chat/chat-view.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Database } from '@/lib/supabase/types'

type Message = {
  id: string
  channel_id: string
  author_kind: 'user' | 'ai'
  author_id: string | null
  body: string
  client_id: string | null
  ai_status: 'streaming' | 'complete' | 'error' | null
  created_at: string
  invoked_by_user_id: string | null
}

type Member = { id: string; name: string }
type Channel = { id: string; name: string; type: 'public' | 'private' }

export function ChatView({
  channel,
  initialMessages,
  members,
  currentUser,
}: {
  channel: Channel
  initialMessages: Message[]
  members: Member[]
  currentUser: { id: string; name: string }
}) {
  const [messages] = useState(initialMessages)
  const nameById = new Map(members.map((m) => [m.id, m.name]))

  return (
    <>
      <header className="flex items-center justify-between border-b border-border bg-bg-lifted px-5 py-3">
        <div>
          <h1 className="font-semibold text-white">
            <span className="text-muted">{channel.type === 'public' ? '#' : '🔒'}</span>{' '}
            {channel.name}
          </h1>
          <p className="text-xs text-muted">{members.length} member(s)</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-center text-muted">No messages yet. Say hi.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="flex gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-surface grid place-items-center text-xs font-semibold text-accent">
                  {m.author_kind === 'ai'
                    ? '✦'
                    : (nameById.get(m.author_id ?? '') ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {m.author_kind === 'ai' ? 'ai' : nameById.get(m.author_id ?? '') ?? 'Unknown'}
                  </div>
                  <div className="text-sm text-accent">{m.body}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border bg-bg p-4">
        <p className="text-center text-xs text-muted">Composer comes in Task 24.</p>
      </footer>
    </>
  )
}
```

Also create a minimal `lib/supabase/types.ts`:
```typescript
// Generated types would normally go here via `supabase gen types typescript`.
// For now, a hand-written type placeholder.
export type Database = Record<string, unknown>
```

- [ ] **Step 4: Smoke-test**

Run `pnpm dev`. Create a channel. Expected: you land on the channel page, see the header with the channel name and "0 member(s)" wait — actually, since you auto-joined as owner in `createChannel`, you should see "1 member(s)". And "No messages yet. Say hi." in the body.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/c" components/chat/chat-view.tsx lib/supabase/types.ts
git commit -m "feat: add channel page with initial message fetch and ChatView skeleton"
```

---

## Phase 7 — Basic messages (sendMessage + composer, no AI or realtime yet)

### Task 22: Write the `@ai` mention detection utility (strict TDD)

**Files:**
- Create: `lib/utils/mention.ts`
- Create: `lib/utils/mention.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/utils/mention.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { mentionsAI } from './mention'

describe('mentionsAI', () => {
  it('returns true for lowercase @ai', () => {
    expect(mentionsAI('@ai help me')).toBe(true)
  })
  it('returns true for uppercase @AI', () => {
    expect(mentionsAI('hey @AI what up')).toBe(true)
  })
  it('returns true for mixed case @Ai', () => {
    expect(mentionsAI('@Ai please')).toBe(true)
  })
  it('returns false when ai is part of another word', () => {
    expect(mentionsAI('I am saying hi')).toBe(false)
    expect(mentionsAI('@ainsley was here')).toBe(false)
  })
  it('returns false when there is no @', () => {
    expect(mentionsAI('ai is cool')).toBe(false)
  })
  it('returns true when @ai appears mid-sentence', () => {
    expect(mentionsAI('thanks @ai for that answer')).toBe(true)
  })
  it('returns false for empty string', () => {
    expect(mentionsAI('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm test lib/utils/mention.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

`lib/utils/mention.ts`:
```typescript
const AI_MENTION_REGEX = /(^|\s)@ai\b/i

export function mentionsAI(body: string): boolean {
  if (!body) return false
  return AI_MENTION_REGEX.test(body)
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm test lib/utils/mention.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/mention.ts lib/utils/mention.test.ts
git commit -m "feat: add @ai mention detection utility"
```

---

### Task 23: `sendMessage` server action (user path, no AI yet)

**Files:**
- Create: `server/messages.ts`

- [ ] **Step 1: Write the server action (user path only)**

`server/messages.ts`:
```typescript
'use server'
import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'

const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  clientId: z.string().uuid(),
})

export async function sendMessage(input: {
  channelId: string
  body: string
  clientId: string
}) {
  const parsed = sendMessageSchema.parse(input)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')
  const user = session.user

  const supabase = await createClient()

  const { data: userMsg, error } = await supabase
    .from('messages')
    .insert({
      channel_id: parsed.channelId,
      author_kind: 'user',
      author_id: user.id,
      body: parsed.body,
      client_id: parsed.clientId,
    })
    .select()
    .single()
  if (error) throw error

  // AI branch is added in Task 38 — @ai detection, placeholder insert, after() scheduling

  return { ok: true as const, message: userMsg }
}

export async function loadMessagesBefore(channelId: string, beforeCreatedAt: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).slice().reverse()
}

export async function searchMessages(channelId: string, query: string) {
  if (!query.trim()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}
```

- [ ] **Step 2: Commit**

```bash
git add server/messages.ts
git commit -m "feat: add sendMessage server action (user path) + load/search helpers"
```

---

### Task 24: Composer component (text-only, no voice/popover yet)

**Files:**
- Create: `components/chat/composer.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Write the Composer**

`components/chat/composer.tsx`:
```tsx
'use client'
import { useState, useRef, useTransition } from 'react'
import { sendMessage } from '@/server/messages'

function uuid() {
  return crypto.randomUUID()
}

export function Composer({
  channelId,
  onOptimisticSend,
}: {
  channelId: string
  onOptimisticSend?: (opts: { clientId: string; body: string }) => void
}) {
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const body = value.trim()
    if (!body || pending) return

    const clientId = uuid()
    onOptimisticSend?.({ clientId, body })
    setValue('')
    textareaRef.current?.focus()

    start(async () => {
      try {
        await sendMessage({ channelId, body, clientId })
      } catch (err) {
        // Optimistic reconciliation comes in Task 29; for now, just log.
        console.error('sendMessage failed', err)
      }
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-border bg-bg p-4">
      <div className="flex items-center gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={`Message…`}
          aria-label="Message input"
          className="flex-1 resize-none rounded-lg border border-border bg-surface px-4 py-3 text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
        />
        <button
          type="button"
          aria-label="Voice input (coming soon)"
          disabled
          className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-accent text-bg disabled:opacity-60"
        >
          {/* Mic SVG — replaced in Task 32 when voice lands */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || pending}
          aria-label="Send message"
          className="grid h-[42px] w-[42px] place-items-center rounded-lg bg-accent text-bg disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>
          <kbd className="text-accent">↵</kbd> send ·{' '}
          <kbd className="text-accent">shift+↵</kbd> newline
        </span>
        <span id="conn-status" className="text-success">
          ● connected
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire Composer into ChatView**

In `components/chat/chat-view.tsx`, replace the footer section:

```tsx
      <Composer channelId={channel.id} />
```

And add the import:
```tsx
import { Composer } from './composer'
```

- [ ] **Step 3: Smoke-test**

Run `pnpm dev`. Open a channel. Type a message, hit Enter.
Expected: the message appears *after* a page refresh (no realtime yet), and you can see it in Supabase Studio. No errors in the console.

- [ ] **Step 4: Commit**

```bash
git add components/chat/composer.tsx components/chat/chat-view.tsx
git commit -m "feat: add Composer component with text send via server action"
```

---

## Phase 8 — Realtime (Postgres Changes, optimistic updates, reconnect, presence, typing)

### Task 25: Define the shared Message type and useMessages hook skeleton

**Files:**
- Create: `lib/realtime/types.ts`
- Create: `lib/realtime/use-messages.ts`

- [ ] **Step 1: Define the types**

`lib/realtime/types.ts`:
```typescript
export type MessageRow = {
  id: string
  channel_id: string
  author_kind: 'user' | 'ai'
  author_id: string | null
  invoked_by_user_id: string | null
  body: string
  client_id: string | null
  ai_status: 'streaming' | 'complete' | 'error' | null
  created_at: string
}

export type OptimisticStatus = 'sending' | 'failed'

export type Message = MessageRow & {
  _optimistic?: OptimisticStatus
}
```

- [ ] **Step 2: Write the hook skeleton with initial data only**

`lib/realtime/use-messages.ts`:
```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'
import type { Message, MessageRow } from './types'

export function useMessages(channelId: string, initial: MessageRow[]) {
  const supabase = useSupabase()
  const [messages, setMessages] = useState<Message[]>(initial)
  const lastSeenIdRef = useRef<string | null>(initial.at(-1)?.id ?? null)

  // Subscription and reconciliation will be added in subsequent tasks.

  const addOptimistic = useCallback((opts: { clientId: string; body: string; authorId: string }) => {
    const now = new Date().toISOString()
    const opt: Message = {
      id: `opt-${opts.clientId}`,
      channel_id: channelId,
      author_kind: 'user',
      author_id: opts.authorId,
      invoked_by_user_id: null,
      body: opts.body,
      client_id: opts.clientId,
      ai_status: null,
      created_at: now,
      _optimistic: 'sending',
    }
    setMessages((prev) => [...prev, opt])
  }, [channelId])

  return { messages, setMessages, addOptimistic, lastSeenIdRef }
}
```

- [ ] **Step 3: Wire into ChatView**

Replace the `useState(initialMessages)` in `components/chat/chat-view.tsx` with:
```tsx
import { useMessages } from '@/lib/realtime/use-messages'
// ...
const { messages, addOptimistic } = useMessages(channel.id, initialMessages)
```

And pass `addOptimistic` into Composer:
```tsx
<Composer
  channelId={channel.id}
  onOptimisticSend={(o) => addOptimistic({ ...o, authorId: currentUser.id })}
/>
```

- [ ] **Step 4: Smoke-test**

Refresh the channel page. Expected: exactly the same as before (initial messages shown). Sending a message should now make it appear *immediately* (optimistic), but it won't get reconciled with the server row until the realtime subscription lands in Task 26.

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/types.ts lib/realtime/use-messages.ts components/chat/chat-view.tsx
git commit -m "feat: add useMessages hook with optimistic insert (no realtime yet)"
```

---

### Task 26: Subscribe to Postgres Changes for new messages + optimistic reconciliation

**Files:**
- Modify: `lib/realtime/use-messages.ts`

- [ ] **Step 1: Add the subscription**

Replace `lib/realtime/use-messages.ts` with the full version:

```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSupabase } from '@/lib/supabase/supabase-provider'
import type { Message, MessageRow } from './types'

export function useMessages(channelId: string, initial: MessageRow[]) {
  const supabase = useSupabase()
  const [messages, setMessages] = useState<Message[]>(initial)
  const lastSeenIdRef = useRef<string | null>(initial.at(-1)?.id ?? null)

  const handleInsert = useCallback((row: MessageRow) => {
    if (row.channel_id !== channelId) return

    setMessages((prev) => {
      // Reconcile optimistic row with server-confirmed one by matching client_id
      if (row.client_id) {
        const idx = prev.findIndex(
          (m) => m._optimistic === 'sending' && m.client_id === row.client_id
        )
        if (idx >= 0) {
          const next = prev.slice()
          next[idx] = { ...row }
          return next
        }
      }
      // Plain insert if not already present
      if (prev.some((m) => m.id === row.id)) return prev
      return [...prev, row]
    })
    lastSeenIdRef.current = row.id
  }, [channelId])

  const handleUpdate = useCallback((row: MessageRow) => {
    if (row.channel_id !== channelId) return
    setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
  }, [channelId])

  useEffect(() => {
    const ch: RealtimeChannel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => handleInsert(payload.new as MessageRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => handleUpdate(payload.new as MessageRow)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, handleInsert, handleUpdate])

  const addOptimistic = useCallback((opts: { clientId: string; body: string; authorId: string }) => {
    const now = new Date().toISOString()
    const opt: Message = {
      id: `opt-${opts.clientId}`,
      channel_id: channelId,
      author_kind: 'user',
      author_id: opts.authorId,
      invoked_by_user_id: null,
      body: opts.body,
      client_id: opts.clientId,
      ai_status: null,
      created_at: now,
      _optimistic: 'sending',
    }
    setMessages((prev) => [...prev, opt])
  }, [channelId])

  const markOptimisticFailed = useCallback((clientId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m._optimistic === 'sending' && m.client_id === clientId
          ? { ...m, _optimistic: 'failed' }
          : m
      )
    )
  }, [])

  return { messages, setMessages, addOptimistic, markOptimisticFailed, lastSeenIdRef }
}
```

- [ ] **Step 2: Wire the failure path**

In `components/chat/composer.tsx`, accept an `onOptimisticFail` prop and call it in the catch:

```tsx
onOptimisticFail?: (clientId: string) => void
// ...
} catch (err) {
  console.error('sendMessage failed', err)
  onOptimisticFail?.(clientId)
}
```

In `components/chat/chat-view.tsx`:
```tsx
const { messages, addOptimistic, markOptimisticFailed } = useMessages(channel.id, initialMessages)
// ...
<Composer
  channelId={channel.id}
  onOptimisticSend={(o) => addOptimistic({ ...o, authorId: currentUser.id })}
  onOptimisticFail={markOptimisticFailed}
/>
```

- [ ] **Step 3: Smoke-test the realtime path**

Run `pnpm dev`. Open two browser windows (one normal, one incognito). Sign in as two different users (create a second account if needed). Create a public channel from window 1. In window 2, navigate to the same channel (you may need to "join" it — for now, manually insert a channel_members row via Supabase Studio, or skip to Task 27 for a join UI).

Send a message in window 1. Expected: it appears **immediately** in window 1 (optimistic) and then **within ~300ms** in window 2 (via Postgres Changes).

- [ ] **Step 4: Commit**

```bash
git add lib/realtime/use-messages.ts components/chat/composer.tsx components/chat/chat-view.tsx
git commit -m "feat: subscribe to Postgres Changes for live messages + optimistic reconciliation"
```

---

### Task 27: Public-channel "Join" affordance

**Files:**
- Create: `components/chat/join-channel-prompt.tsx`
- Modify: `app/(app)/c/[channelId]/page.tsx`

- [ ] **Step 1: Add a membership check in the channel page**

In `app/(app)/c/[channelId]/page.tsx`, after fetching the channel, check whether the current user is a member:

```typescript
  const { data: myMembership } = await supabase
    .from('channel_members')
    .select('user_id')
    .eq('channel_id', channelId)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (!myMembership) {
    if (channel.type === 'public') {
      return <JoinChannelPrompt channel={channel} />
    }
    return notFound()
  }
```

Add `import { JoinChannelPrompt } from '@/components/chat/join-channel-prompt'` at the top.

- [ ] **Step 2: Write the prompt component**

`components/chat/join-channel-prompt.tsx`:
```tsx
'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { joinChannel } from '@/server/channels'

export function JoinChannelPrompt({
  channel,
}: {
  channel: { id: string; name: string; type: 'public' | 'private' }
}) {
  const [pending, start] = useTransition()
  const router = useRouter()

  function onJoin() {
    start(async () => {
      await joinChannel(channel.id)
      router.refresh()
    })
  }

  return (
    <div className="grid h-full place-items-center">
      <div className="max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold text-white">Join #{channel.name}?</h2>
        <p className="mt-1 text-sm text-muted">
          This is a public channel. Join to read and send messages.
        </p>
        <button
          onClick={onJoin}
          disabled={pending}
          className="mt-4 rounded-lg bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-60"
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Smoke-test**

With two accounts, test: account A creates a public channel, account B navigates to `/c/<id>` — expected: sees the join prompt. Clicks Join — expected: page refreshes into the normal chat view.

- [ ] **Step 4: Commit**

```bash
git add components/chat/join-channel-prompt.tsx "app/(app)/c"
git commit -m "feat: prompt to join public channels if not already a member"
```

---

### Task 28: `useConnectionState` hook

**Files:**
- Create: `lib/realtime/use-connection-state.ts`
- Modify: `components/chat/composer.tsx`

- [ ] **Step 1: Write the hook**

`lib/realtime/use-connection-state.ts`:
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export function useConnectionState(): ConnectionStatus {
  const supabase = useSupabase()
  const [status, setStatus] = useState<ConnectionStatus>('connecting')

  useEffect(() => {
    const probe = supabase.channel('connection-probe', {
      config: { presence: { key: crypto.randomUUID() } },
    })
    probe
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('connected')
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('reconnecting')
        else if (s === 'CLOSED') setStatus('offline')
      })

    return () => {
      supabase.removeChannel(probe)
    }
  }, [supabase])

  return status
}
```

- [ ] **Step 2: Update Composer to show real status**

In `components/chat/composer.tsx`, replace the hardcoded `● connected` with:

```tsx
import { useConnectionState } from '@/lib/realtime/use-connection-state'

// inside the component
const connStatus = useConnectionState()
const statusLabel = {
  connecting: { text: 'connecting', color: 'text-warning' },
  connected: { text: 'connected', color: 'text-success' },
  reconnecting: { text: 'reconnecting', color: 'text-warning' },
  offline: { text: 'offline', color: 'text-warning' },
}[connStatus]

// replace the <span> in the hint row:
<span className={statusLabel.color} aria-live="polite">
  ● {statusLabel.text}
</span>
```

- [ ] **Step 3: Smoke-test**

Open a channel. Expected: "● connecting" briefly, then "● connected". Kill your network → should flip to "● reconnecting" or "● offline" within a few seconds.

- [ ] **Step 4: Commit**

```bash
git add lib/realtime/use-connection-state.ts components/chat/composer.tsx
git commit -m "feat: add useConnectionState and wire live indicator to composer"
```

---

### Task 29: Gap-fill on reconnect

**Files:**
- Modify: `lib/realtime/use-messages.ts`

- [ ] **Step 1: Add a gap-fill effect**

In `lib/realtime/use-messages.ts`, extend the subscription effect to fill gaps when the channel re-subscribes:

```typescript
  useEffect(() => {
    let subscribedOnce = false

    const ch: RealtimeChannel = supabase
      .channel(`messages:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => handleInsert(payload.new as MessageRow)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => handleUpdate(payload.new as MessageRow)
      )
      .subscribe(async (state) => {
        if (state === 'SUBSCRIBED') {
          if (!subscribedOnce) {
            subscribedOnce = true
            return
          }
          // Re-subscribed after a drop — fill any gap
          const lastSeenCreatedAt =
            messages.at(-1)?.created_at ?? new Date(0).toISOString()
          const { data: missed } = await supabase
            .from('messages')
            .select('*')
            .eq('channel_id', channelId)
            .gt('created_at', lastSeenCreatedAt)
            .order('created_at', { ascending: true })
          if (missed && missed.length) {
            setMessages((prev) => {
              const existing = new Set(prev.map((m) => m.id))
              const additions = missed.filter((m) => !existing.has(m.id)) as MessageRow[]
              return [...prev, ...additions]
            })
          }
        }
      })

    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, handleInsert, handleUpdate, messages])
```

Note the dependency array includes `messages` so the gap-fill uses the latest `lastSeenCreatedAt`. This re-runs on every message, which is fine for demo-scale — a production version would use a ref instead.

- [ ] **Step 2: Smoke-test**

Open a channel. In DevTools → Network, throttle to "Offline" for ~10 seconds, then back to "Online". While offline, have a second account send 2–3 messages. Expected: when the first tab reconnects, the gap-fill query pulls in the missed messages.

- [ ] **Step 3: Commit**

```bash
git add lib/realtime/use-messages.ts
git commit -m "feat: gap-fill missed messages on Realtime resubscribe"
```

---

### Task 30: Per-channel presence via Supabase Presence

**Files:**
- Create: `lib/realtime/use-presence.ts`
- Create: `components/presence/presence-bar.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Write the hook**

`lib/realtime/use-presence.ts`:
```typescript
'use client'
import { useEffect, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'

export type PresenceUser = { userId: string; name: string }

export function usePresence(channelId: string, me: PresenceUser) {
  const supabase = useSupabase()
  const [online, setOnline] = useState<PresenceUser[]>([])

  useEffect(() => {
    const ch = supabase.channel(`presence:${channelId}`, {
      config: { presence: { key: me.userId } },
    })

    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState<PresenceUser>()
        const users: PresenceUser[] = []
        for (const key of Object.keys(state)) {
          const entry = state[key][0]
          if (entry) users.push(entry)
        }
        setOnline(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track(me)
        }
      })

    return () => {
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, me.userId, me.name])

  return online
}
```

- [ ] **Step 2: Write the PresenceBar**

`components/presence/presence-bar.tsx`:
```tsx
'use client'
import { usePresence } from '@/lib/realtime/use-presence'

export function PresenceBar({
  channelId,
  me,
}: {
  channelId: string
  me: { userId: string; name: string }
}) {
  const online = usePresence(channelId, me)
  return (
    <span className="text-xs text-muted" aria-live="polite">
      {online.length} online
    </span>
  )
}
```

- [ ] **Step 3: Wire into ChatView header**

In `components/chat/chat-view.tsx`, replace the static `"{members.length} member(s)"` with:
```tsx
import { PresenceBar } from '@/components/presence/presence-bar'
// ...
<PresenceBar channelId={channel.id} me={{ userId: currentUser.id, name: currentUser.name }} />
```

- [ ] **Step 4: Smoke-test**

Open a channel in two tabs (signed in as two different users). Expected: both tabs show "2 online". Closing one tab should flip the other to "1 online" within a few seconds.

- [ ] **Step 5: Commit**

```bash
git add lib/realtime/use-presence.ts components/presence/presence-bar.tsx components/chat/chat-view.tsx
git commit -m "feat: per-channel presence with Supabase Presence primitive"
```

---

### Task 31: Typing indicators via Broadcast

**Files:**
- Create: `lib/realtime/use-typing.ts`
- Create: `components/presence/typing-indicator.tsx`
- Modify: `components/chat/composer.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Write the typing hook**

`lib/realtime/use-typing.ts`:
```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSupabase } from '@/lib/supabase/supabase-provider'

type TypingPayload = { userId: string; name: string }

const TYPING_IDLE_MS = 3000
const TYPING_BROADCAST_THROTTLE_MS = 1500

export function useTyping(channelId: string, me: { userId: string; name: string }) {
  const supabase = useSupabase()
  const [typers, setTypers] = useState<TypingPayload[]>([])
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastSentRef = useRef<number>(0)
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const ch = supabase.channel(`typing:${channelId}`, {
      config: { broadcast: { self: false } },
    })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const p = payload as TypingPayload
      if (!p?.userId || p.userId === me.userId) return

      setTypers((prev) =>
        prev.some((t) => t.userId === p.userId) ? prev : [...prev, p]
      )

      const existing = clearTimers.current.get(p.userId)
      if (existing) clearTimeout(existing)
      clearTimers.current.set(
        p.userId,
        setTimeout(() => {
          setTypers((prev) => prev.filter((t) => t.userId !== p.userId))
          clearTimers.current.delete(p.userId)
        }, TYPING_IDLE_MS)
      )
    })
    ch.subscribe()
    channelRef.current = ch
    return () => {
      clearTimers.current.forEach((t) => clearTimeout(t))
      clearTimers.current.clear()
      supabase.removeChannel(ch)
    }
  }, [supabase, channelId, me.userId])

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (now - lastSentRef.current < TYPING_BROADCAST_THROTTLE_MS) return
    lastSentRef.current = now
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: me.userId, name: me.name },
    })
  }, [me.userId, me.name])

  return { typers, notifyTyping }
}
```

- [ ] **Step 2: Write the indicator UI**

`components/presence/typing-indicator.tsx`:
```tsx
export function TypingIndicator({ typers }: { typers: { name: string }[] }) {
  if (typers.length === 0) return <div className="h-4" />
  const names = typers.map((t) => t.name)
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names.length} people are typing…`

  return (
    <div className="flex h-4 items-center gap-2 px-5 text-xs text-muted" aria-live="polite">
      <span className="flex gap-1">
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" />
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.2s' }} />
        <span className="h-1 w-1 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.4s' }} />
      </span>
      <span>{label}</span>
    </div>
  )
}
```

- [ ] **Step 3: Hook Composer up to `notifyTyping`**

Accept a new prop in Composer and call it on every `onChange`:

```tsx
export function Composer({
  channelId,
  onOptimisticSend,
  onOptimisticFail,
  onTyping,
}: {
  channelId: string
  onOptimisticSend?: (opts: { clientId: string; body: string }) => void
  onOptimisticFail?: (clientId: string) => void
  onTyping?: () => void
}) {
  // ...
  <textarea
    // ...
    onChange={(e) => {
      setValue(e.target.value)
      onTyping?.()
    }}
  />
}
```

- [ ] **Step 4: Wire into ChatView**

```tsx
import { useTyping } from '@/lib/realtime/use-typing'
import { TypingIndicator } from '@/components/presence/typing-indicator'

// inside ChatView:
const { typers, notifyTyping } = useTyping(channel.id, {
  userId: currentUser.id,
  name: currentUser.name,
})

// Below the message list, above the Composer:
<TypingIndicator typers={typers} />
<Composer
  channelId={channel.id}
  onOptimisticSend={(o) => addOptimistic({ ...o, authorId: currentUser.id })}
  onOptimisticFail={markOptimisticFailed}
  onTyping={notifyTyping}
/>
```

- [ ] **Step 5: Smoke-test**

Open the same channel in two tabs as different users. Start typing in tab 1. Expected: tab 2 shows "X is typing…" within 1–2 seconds. Stop typing — indicator disappears after ~3 seconds.

- [ ] **Step 6: Commit**

```bash
git add lib/realtime/use-typing.ts components/presence/typing-indicator.tsx components/chat/composer.tsx components/chat/chat-view.tsx
git commit -m "feat: typing indicators via Broadcast with throttled notifications"
```

---

## Phase 9 — Read receipts and unread badges

### Task 32: `updateLastRead` on channel visit + unread badge in sidebar

**Files:**
- Modify: `app/(app)/c/[channelId]/page.tsx`
- Modify: `components/sidebar/sidebar.tsx`
- Modify: `components/sidebar/channel-list.tsx`

- [ ] **Step 1: Mark channel as read on page visit**

In `app/(app)/c/[channelId]/page.tsx`, after the membership check, call `updateLastRead`:

```typescript
import { updateLastRead } from '@/server/channels'
// ...
  // We're definitely a member at this point — mark as read
  await updateLastRead(channelId)
```

- [ ] **Step 2: Compute unread counts in the sidebar**

In `components/sidebar/sidebar.tsx`, after fetching memberships, also fetch the latest message per channel:

```typescript
  const channelIds = channels.map((c) => c.id)

  const unreadMap = new Map<string, number>()
  if (channelIds.length) {
    // For each channel, count messages newer than our last_read_at.
    // Do it with a single query using a CTE-style RPC, or in parallel per channel
    // for simplicity on small demo datasets.
    await Promise.all(
      channels.map(async (c) => {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', c.id)
          .gt('created_at', c.lastReadAt)
        unreadMap.set(c.id, count ?? 0)
      })
    )
  }

  const channelsWithUnread = channels.map((c) => ({
    ...c,
    unreadCount: unreadMap.get(c.id) ?? 0,
  }))
```

Pass `channelsWithUnread` to `<ChannelList channels={channelsWithUnread} />`.

- [ ] **Step 3: Pass unread count through to ChannelItem**

Update the `Channel` type in `channel-list.tsx`:
```typescript
type Channel = {
  id: string
  name: string
  type: 'public' | 'private'
  lastReadAt: string
  unreadCount: number
}
```

And pass `unreadCount={c.unreadCount}` to `<ChannelItem>`.

- [ ] **Step 4: Smoke-test**

Create two channels as user A. Send messages in channel 2 while viewing channel 1. Refresh the sidebar — expected: channel 2 shows an unread badge. Click channel 2 — badge disappears after navigation (because `updateLastRead` bumps the pointer on page load, then sidebar re-renders).

Note: the unread count updates on navigation, not in real time, because the sidebar is a server component. That's acceptable for V1 — a fully live sidebar would require a second realtime subscription in a client component, which we're deferring.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/c" components/sidebar/
git commit -m "feat: mark channel read on visit + sidebar unread badges"
```

---

### Task 33: "New messages" divider in the chat view

**Files:**
- Modify: `components/chat/chat-view.tsx`
- Modify: `app/(app)/c/[channelId]/page.tsx`

- [ ] **Step 1: Fetch the user's last_read_at for this channel BEFORE updating it**

In `app/(app)/c/[channelId]/page.tsx`, reorder so we read the prior `last_read_at` before bumping it:

```typescript
  const { data: myMembership } = await supabase
    .from('channel_members')
    .select('user_id, last_read_at')
    .eq('channel_id', channelId)
    .eq('user_id', session.user.id)
    .maybeSingle()

  // ... (join prompt logic)

  const priorLastReadAt = myMembership?.last_read_at ?? new Date(0).toISOString()

  // Mark as read now
  await updateLastRead(channelId)

  // Pass priorLastReadAt into ChatView for the divider
```

Pass `priorLastReadAt={priorLastReadAt}` to `<ChatView>`.

- [ ] **Step 2: Render the divider**

In `components/chat/chat-view.tsx`, accept the prop and insert a divider before the first message newer than it:

```tsx
export function ChatView({
  channel,
  initialMessages,
  priorLastReadAt,
  members,
  currentUser,
}: {
  // ...
  priorLastReadAt: string
}) {
  // ...
  return (
    // ...
    <ul className="space-y-3">
      {messages.map((m, i) => {
        const showDivider =
          priorLastReadAt &&
          m.created_at > priorLastReadAt &&
          (i === 0 || messages[i - 1].created_at <= priorLastReadAt) &&
          m.author_id !== currentUser.id
        return (
          <Fragment key={m.id}>
            {showDivider && (
              <li className="flex items-center gap-3 py-2" aria-label="New messages">
                <div className="flex-1 h-px bg-accent/40" />
                <span className="text-[10px] uppercase tracking-wider text-accent">
                  New messages
                </span>
                <div className="flex-1 h-px bg-accent/40" />
              </li>
            )}
            <li className="flex gap-3">
              {/* existing message rendering */}
            </li>
          </Fragment>
        )
      })}
    </ul>
  )
}
```

Add `import { Fragment } from 'react'`.

- [ ] **Step 3: Smoke-test**

As user A, send a message in a channel while user B is viewing a different channel. User B navigates to the channel — expected: sees a "New messages" divider above A's message. Refreshing the page removes the divider (because `priorLastReadAt` has been bumped).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/c" components/chat/chat-view.tsx
git commit -m "feat: New messages divider in chat view based on prior last_read_at"
```

---

## Phase 10 — AI foundation (logic modules with strict TDD)

### Task 34: OpenAI client + system prompt

**Files:**
- Create: `lib/ai/openai.ts`
- Create: `lib/ai/system-prompt.ts`

- [ ] **Step 1: Write the OpenAI client**

`lib/ai/openai.ts`:
```typescript
import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const AI_MODEL = 'gpt-4o-mini'
```

(We use `gpt-4o-mini` for cost on a take-home. Swap to `gpt-4o` in `.env`-driven config if quality is lacking during smoke testing.)

- [ ] **Step 2: Write the system prompt**

`lib/ai/system-prompt.ts`:
```typescript
export const SYSTEM_PROMPT = `You are an assistant inside a team workspace called Kochanet Chat. You are NOT a general-purpose chatbot — you are a teammate who has been summoned by someone using an @ai mention inside an ongoing conversation.

Rules:
- Be concise and professional. Match the energy of a helpful engineer in a team channel.
- The messages you see include prior context from other teammates. Use that context to give relevant answers.
- When you reference a specific teammate, use their name (shown as "Name: message" in the conversation history).
- Use Markdown for structure when it helps — lists, fenced code blocks, inline \`code\`, bold emphasis. Keep formatting light.
- If you don't know something or the question is ambiguous, say so and ask a clarifying question. Don't fabricate.
- Do not repeat the user's question back to them. Get straight to the answer.`
```

- [ ] **Step 3: Commit**

```bash
git add lib/ai/openai.ts lib/ai/system-prompt.ts
git commit -m "feat: add OpenAI client and team-workspace system prompt"
```

---

### Task 35: Rate limiter with test

**Files:**
- Create: `server/ai.ts`
- Create: `server/ai.test.ts`

- [ ] **Step 1: Write the failing test**

`server/ai.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the service-role client before importing the module under test
const mockCount = vi.fn<[], Promise<{ count: number | null }>>()
vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => mockCount(),
          }),
        }),
      }),
    }),
  }),
}))

import { checkAIRateLimit, RateLimitError } from './ai'

describe('checkAIRateLimit', () => {
  beforeEach(() => {
    mockCount.mockReset()
  })

  it('allows a request when the count is below 5', async () => {
    mockCount.mockResolvedValue({ count: 3 })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('allows a request when the count is 0', async () => {
    mockCount.mockResolvedValue({ count: 0 })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('allows a request when the count is null (no rows yet)', async () => {
    mockCount.mockResolvedValue({ count: null })
    await expect(checkAIRateLimit('user-1')).resolves.toBeUndefined()
  })

  it('throws RateLimitError when the count is 5 or more', async () => {
    mockCount.mockResolvedValue({ count: 5 })
    await expect(checkAIRateLimit('user-1')).rejects.toThrow(RateLimitError)
  })

  it('throws RateLimitError when the count is 10', async () => {
    mockCount.mockResolvedValue({ count: 10 })
    await expect(checkAIRateLimit('user-1')).rejects.toThrow('5 AI invocations per minute max')
  })
})
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm test server/ai.test.ts`
Expected: FAIL with "Cannot find module './ai'".

- [ ] **Step 3: Write the implementation**

`server/ai.ts`:
```typescript
import { serviceRoleClient } from '@/lib/supabase/service-role'

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

export async function checkAIRateLimit(userId: string): Promise<void> {
  const supabase = serviceRoleClient()
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('author_kind', 'ai')
    .eq('invoked_by_user_id', userId)
    .gte('created_at', oneMinuteAgo)

  if ((count ?? 0) >= 5) {
    throw new RateLimitError('5 AI invocations per minute max')
  }
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm test server/ai.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add server/ai.ts server/ai.test.ts
git commit -m "feat: add AI rate limiter (5/minute) with Postgres count check"
```

---

### Task 36: Context builder with test

**Files:**
- Create: `lib/ai/build-context.ts`
- Create: `lib/ai/build-context.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/ai/build-context.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rowsMock = vi.fn()
const usersMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  serviceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'messages') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => rowsMock(),
              }),
            }),
          }),
        }
      }
      if (table === 'user') {
        return {
          select: () => ({
            in: () => usersMock(),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('./system-prompt', () => ({
  SYSTEM_PROMPT: 'SYS',
}))

import { buildContext } from './build-context'

describe('buildContext', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    usersMock.mockReset()
  })

  it('formats human messages with author name prefix, includes system prompt and invoker name', async () => {
    // Messages come in descending order (newest first) from the DB
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'user', author_id: 'u-bob', body: 'Hi @ai', ai_status: null },
        { author_kind: 'user', author_id: 'u-alice', body: 'Hey', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({
      data: [
        { id: 'u-alice', name: 'Alice' },
        { id: 'u-bob', name: 'Bob' },
      ],
    })

    const msgs = await buildContext('chan-1', 'Bob')

    // System message first, mentioning the invoker
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('SYS')
    expect(msgs[0].content).toContain('Bob')

    // Messages then in chronological order (oldest first)
    expect(msgs[1]).toEqual({ role: 'user', content: 'Alice: Hey' })
    expect(msgs[2]).toEqual({ role: 'user', content: 'Bob: Hi @ai' })
  })

  it('includes only completed AI messages (not streaming/error placeholders)', async () => {
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'ai', author_id: null, body: 'partial...', ai_status: 'streaming' },
        { author_kind: 'ai', author_id: null, body: 'Done answer', ai_status: 'complete' },
        { author_kind: 'user', author_id: 'u-alice', body: 'Q?', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({ data: [{ id: 'u-alice', name: 'Alice' }] })

    const msgs = await buildContext('chan-1', 'Alice')

    expect(msgs).toHaveLength(3) // system + user + completed assistant
    expect(msgs[1]).toEqual({ role: 'user', content: 'Alice: Q?' })
    expect(msgs[2]).toEqual({ role: 'assistant', content: 'Done answer' })
  })

  it('falls back to "Unknown" when an author_id has no matching user row', async () => {
    rowsMock.mockResolvedValue({
      data: [
        { author_kind: 'user', author_id: 'u-ghost', body: 'hello', ai_status: null },
      ],
    })
    usersMock.mockResolvedValue({ data: [] })

    const msgs = await buildContext('chan-1', 'Nobody')
    expect(msgs[1]).toEqual({ role: 'user', content: 'Unknown: hello' })
  })
})
```

- [ ] **Step 2: Run and verify it fails**

Run: `pnpm test lib/ai/build-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`lib/ai/build-context.ts`:
```typescript
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { SYSTEM_PROMPT } from './system-prompt'

export type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

const CONTEXT_WINDOW = 30

export async function buildContext(
  channelId: string,
  invokerName: string
): Promise<OpenAIMessage[]> {
  const supabase = serviceRoleClient()

  // 1. Last N messages in the channel (descending, then reverse)
  const { data: rows } = await supabase
    .from('messages')
    .select('author_kind, author_id, body, ai_status')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_WINDOW)

  const ordered = ((rows ?? []) as Array<{
    author_kind: 'user' | 'ai'
    author_id: string | null
    body: string
    ai_status: 'streaming' | 'complete' | 'error' | null
  }>).slice().reverse()

  // 2. Resolve display names from BetterAuth's user table
  const authorIds = Array.from(
    new Set(
      ordered
        .filter((r) => r.author_kind === 'user' && r.author_id)
        .map((r) => r.author_id!)
    )
  )

  let nameById = new Map<string, string>()
  if (authorIds.length) {
    const { data: users } = await supabase
      .from('user')
      .select('id, name')
      .in('id', authorIds)
    nameById = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))
  }
  const displayName = (id: string | null) => (id && nameById.get(id)) || 'Unknown'

  // 3. Format each message for OpenAI
  const messages: OpenAIMessage[] = ordered
    .map((row): OpenAIMessage | null => {
      if (row.author_kind === 'ai') {
        return row.ai_status === 'complete'
          ? { role: 'assistant', content: row.body }
          : null
      }
      return {
        role: 'user',
        content: `${displayName(row.author_id)}: ${row.body}`,
      }
    })
    .filter((m): m is OpenAIMessage => m !== null)

  // 4. System prompt with invoker name appended
  const system = `${SYSTEM_PROMPT}\n\nYou were just summoned by ${invokerName}. Address your response to them when it makes sense.`

  return [{ role: 'system', content: system }, ...messages]
}
```

- [ ] **Step 4: Run and verify it passes**

Run: `pnpm test lib/ai/build-context.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/build-context.ts lib/ai/build-context.test.ts
git commit -m "feat: AI context builder with display-name resolution and invoker awareness"
```

---

### Task 37: Streaming continuation (`invokeAI`)

**Files:**
- Create: `lib/ai/stream-response.ts`

- [ ] **Step 1: Write the streaming function**

`lib/ai/stream-response.ts`:
```typescript
import { openai, AI_MODEL } from './openai'
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
      model: AI_MODEL,
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
    console.error('invokeAI failed:', err)
    await supabase
      .from('messages')
      .update({
        body: 'AI failed to respond. Try again in a moment.',
        ai_status: 'error',
      })
      .eq('id', opts.placeholderId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/stream-response.ts
git commit -m "feat: AI streaming continuation with batched UPDATEs to placeholder row"
```

---

## Phase 11 — AI wiring (sendMessage integration + UI)

### Task 38: Wire @ai detection into `sendMessage`

**Files:**
- Modify: `server/messages.ts`

- [ ] **Step 1: Update `sendMessage` with the AI branch**

Replace `server/messages.ts` with:
```typescript
'use server'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth/better-auth'
import { createClient } from '@/lib/supabase/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'
import { mentionsAI } from '@/lib/utils/mention'
import { checkAIRateLimit, RateLimitError } from './ai'
import { invokeAI } from '@/lib/ai/stream-response'

// Re-export for convenience (used by the Composer's error toast)
export { RateLimitError }

const sendMessageSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  clientId: z.string().uuid(),
})

export async function sendMessage(input: {
  channelId: string
  body: string
  clientId: string
}) {
  const parsed = sendMessageSchema.parse(input)

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')
  const user = session.user

  const supabase = await createClient()

  const { data: userMsg, error } = await supabase
    .from('messages')
    .insert({
      channel_id: parsed.channelId,
      author_kind: 'user',
      author_id: user.id,
      body: parsed.body,
      client_id: parsed.clientId,
    })
    .select()
    .single()
  if (error) throw error

  if (mentionsAI(parsed.body)) {
    await checkAIRateLimit(user.id)

    const admin = serviceRoleClient()
    const { data: placeholder, error: phErr } = await admin
      .from('messages')
      .insert({
        channel_id: parsed.channelId,
        author_kind: 'ai',
        author_id: null,
        invoked_by_user_id: user.id,
        body: '',
        ai_status: 'streaming',
      })
      .select()
      .single()
    if (phErr) throw phErr

    after(() =>
      invokeAI({
        channelId: parsed.channelId,
        placeholderId: placeholder.id,
        invokerName: user.name || 'Teammate',
      })
    )
  }

  return { ok: true as const, message: userMsg }
}

export async function loadMessagesBefore(channelId: string, beforeCreatedAt: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).slice().reverse()
}

export async function searchMessages(channelId: string, query: string) {
  if (!query.trim()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}
```

- [ ] **Step 2: Surface rate-limit errors in Composer**

In `components/chat/composer.tsx`, catch `RateLimitError` and show a toast-like alert:

```tsx
import { sendMessage } from '@/server/messages'
// ...
} catch (err) {
  console.error('sendMessage failed', err)
  const name = (err as Error).name
  if (name === 'RateLimitError') {
    alert("You're invoking the AI too often. Wait a minute and try again.")
  }
  onOptimisticFail?.(clientId)
}
```

(`alert()` is a placeholder — a real toast component would be nicer but we're in scope-cut mode.)

- [ ] **Step 3: Smoke-test**

In a channel, type `@ai tell me a joke about Docker` and send. Expected:
- Your user message appears immediately (optimistic) then reconciles via realtime.
- An empty AI placeholder appears in the channel within ~300ms.
- The placeholder body starts filling in progressively over the next 2–10 seconds.
- In another tab on the same channel, the streaming is visible simultaneously.

- [ ] **Step 4: Commit**

```bash
git add server/messages.ts components/chat/composer.tsx
git commit -m "feat: sendMessage detects @ai and schedules AI streaming via after()"
```

---

### Task 39: Rotating thinking verb helper

**Files:**
- Create: `lib/utils/thinking-verbs.ts`

- [ ] **Step 1: Write the helper**

`lib/utils/thinking-verbs.ts`:
```typescript
const VERBS = [
  'thinking',
  'analyzing',
  'pondering',
  'considering',
  'reasoning',
  'working',
  'composing',
  'formulating',
  'searching',
  'processing',
] as const

/**
 * Pick a stable verb from the pool based on a message id, so each viewer sees
 * the same verb for a given message (deterministic from id).
 */
export function thinkingVerbFor(messageId: string): (typeof VERBS)[number] {
  let hash = 0
  for (let i = 0; i < messageId.length; i++) {
    hash = (hash * 31 + messageId.charCodeAt(i)) | 0
  }
  return VERBS[Math.abs(hash) % VERBS.length]
}
```

Note: the spec says "client-side memoized per message id, cosmetic drift between viewers is OK." Hashing the message id instead is strictly better — every viewer agrees on the verb without the drift. Free upgrade.

- [ ] **Step 2: Commit**

```bash
git add lib/utils/thinking-verbs.ts
git commit -m "feat: deterministic thinking verb picker based on message id hash"
```

---

### Task 40: AI thinking and message body components

**Files:**
- Create: `components/chat/ai-thinking.tsx`
- Create: `components/chat/ai-message-body.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Create AIThinking**

`components/chat/ai-thinking.tsx`:
```tsx
import { thinkingVerbFor } from '@/lib/utils/thinking-verbs'

export function AIThinking({ messageId }: { messageId: string }) {
  const verb = thinkingVerbFor(messageId)
  return (
    <div className="mt-1.5 flex items-center gap-2 text-sm italic text-accent" aria-label={`AI is ${verb}`}>
      <span>{verb}</span>
      <span className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.2s' }} />
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" style={{ animationDelay: '0.4s' }} />
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Create AIMessageBody with markdown rendering**

`components/chat/ai-message-body.tsx`:
```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export function AIMessageBody({
  body,
  isStreaming,
}: {
  body: string
  isStreaming: boolean
}) {
  return (
    <div className="mt-1 text-sm leading-relaxed text-accent [&_code]:rounded [&_code]:bg-hover [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-white [&_pre]:mt-2 [&_pre]:rounded-lg [&_pre]:bg-bg-lifted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:text-white [&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc [&_li]:my-0.5 [&_a]:text-white [&_a]:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {body}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent blink-caret"
          aria-hidden
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update the message rendering in ChatView**

In `components/chat/chat-view.tsx`, replace the message `<li>` body with a branch on `author_kind`:

```tsx
import { AIThinking } from './ai-thinking'
import { AIMessageBody } from './ai-message-body'
// ...

<li className="flex gap-3">
  {m.author_kind === 'ai' ? (
    <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-accent to-accent-deep grid place-items-center text-bg font-bold">
      ✦
    </div>
  ) : (
    <div className="h-8 w-8 shrink-0 rounded-full bg-surface grid place-items-center text-xs font-semibold text-accent">
      {(nameById.get(m.author_id ?? '') ?? '?').slice(0, 1).toUpperCase()}
    </div>
  )}
  <div className="min-w-0 flex-1">
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-semibold text-white">
        {m.author_kind === 'ai' ? 'ai' : nameById.get(m.author_id ?? '') ?? 'Unknown'}
      </span>
      <span className="text-[10px] text-muted">
        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
      {m._optimistic === 'sending' && (
        <span className="text-[10px] text-muted">sending…</span>
      )}
      {m._optimistic === 'failed' && (
        <span className="text-[10px] text-warning">failed</span>
      )}
    </div>
    {m.author_kind === 'ai' ? (
      m.ai_status === 'streaming' && m.body === '' ? (
        <AIThinking messageId={m.id} />
      ) : (
        <AIMessageBody body={m.body} isStreaming={m.ai_status === 'streaming'} />
      )
    ) : (
      <div className="mt-0.5 text-sm text-accent whitespace-pre-wrap break-words">
        {m.body}
      </div>
    )}
  </div>
</li>
```

- [ ] **Step 4: Smoke-test end-to-end AI flow**

Open a channel. Send `@ai what is a closure in JavaScript?`.
Expected lifecycle:
1. Your message appears (optimistic → reconciled).
2. Within ~300ms, an empty AI bubble with `✦` avatar + `analyzing` (or other verb) + pulsing dots.
3. Within ~1–2s, the dots are replaced by actual streaming markdown text with a blinking caret at the end.
4. After the response finishes, the caret disappears.

Test in a second tab simultaneously — both tabs should see the stream in real time.

- [ ] **Step 5: Commit**

```bash
git add components/chat/ai-thinking.tsx components/chat/ai-message-body.tsx components/chat/chat-view.tsx
git commit -m "feat: AI thinking state + markdown-rendered streaming body with caret"
```

---

### Task 41: Auto-scroll to bottom on new messages

**Files:**
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Add scroll anchor and auto-scroll effect**

In `components/chat/chat-view.tsx`:

```tsx
import { useEffect, useRef } from 'react'
// ...
const scrollRef = useRef<HTMLDivElement>(null)
const endRef = useRef<HTMLDivElement>(null)
const stickToBottomRef = useRef(true)

function onScroll() {
  const el = scrollRef.current
  if (!el) return
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  stickToBottomRef.current = nearBottom
}

useEffect(() => {
  if (stickToBottomRef.current) {
    endRef.current?.scrollIntoView({ block: 'end' })
  }
}, [messages.length, messages.at(-1)?.body])

// wrap the message list container with the ref and onScroll:
<div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4">
  <ul className="space-y-3">
    {/* ... */}
  </ul>
  <div ref={endRef} />
</div>
```

Key detail: the `useEffect` depends on both `messages.length` (for new messages) and `messages.at(-1)?.body` (so it scrolls while the AI response is streaming and its body grows).

- [ ] **Step 2: Smoke-test**

Scroll up in a channel, then send a new message. Expected: stays put (doesn't auto-scroll because you're scrolled up). Scroll to bottom, send again — expected: auto-scrolls with new messages. Trigger an AI response and confirm it scrolls as the body streams.

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-view.tsx
git commit -m "feat: auto-scroll to bottom when near bottom, including during AI streaming"
```

---

## Phase 12 — Composer polish (mention autocomplete, voice)

### Task 42: @mention autocomplete popover

**Files:**
- Create: `components/chat/mention-autocomplete.tsx`
- Modify: `components/chat/composer.tsx`
- Modify: `app/(app)/c/[channelId]/page.tsx` (pass members to Composer)

- [ ] **Step 1: Create the popover component**

`components/chat/mention-autocomplete.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'

export type MentionCandidate =
  | { kind: 'ai'; handle: 'ai'; label: 'ai'; hint: string }
  | { kind: 'user'; handle: string; label: string; hint: string }

export function MentionAutocomplete({
  query,
  members,
  onSelect,
  onDismiss,
}: {
  query: string
  members: { id: string; name: string }[]
  onSelect: (handle: string) => void
  onDismiss: () => void
}) {
  const candidates: MentionCandidate[] = [
    { kind: 'ai', handle: 'ai', label: 'ai', hint: 'Summon the assistant' },
    ...members.map((m) => ({
      kind: 'user' as const,
      handle: m.name.toLowerCase().replace(/\s+/g, '.'),
      label: m.name,
      hint: '@' + m.name.toLowerCase().replace(/\s+/g, '.'),
    })),
  ]

  const q = query.toLowerCase()
  const filtered = candidates.filter(
    (c) => c.handle.includes(q) || c.label.toLowerCase().includes(q)
  )

  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered[index]) {
          e.preventDefault()
          onSelect(filtered[index].handle)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, index, onDismiss, onSelect])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-surface p-1.5 shadow-2xl">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted">
        Mentions
      </div>
      <ul>
        {filtered.map((c, i) => (
          <li key={c.handle}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c.handle)
              }}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                i === index ? 'bg-hover text-white' : 'text-accent'
              }`}
            >
              <div
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                  c.kind === 'ai'
                    ? 'bg-gradient-to-br from-accent to-accent-deep text-bg'
                    : 'bg-surface text-accent'
                }`}
              >
                {c.kind === 'ai' ? '✦' : c.label.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-xs font-semibold">{c.label}</div>
                <div className="truncate text-[10px] text-muted">{c.hint}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Integrate into Composer**

In `components/chat/composer.tsx`, track whether the caret is inside an active `@` token and render the popover:

```tsx
import { MentionAutocomplete } from './mention-autocomplete'

export function Composer({
  channelId,
  members,
  onOptimisticSend,
  onOptimisticFail,
  onTyping,
}: {
  channelId: string
  members: { id: string; name: string }[]
  onOptimisticSend?: (opts: { clientId: string; body: string }) => void
  onOptimisticFail?: (clientId: string) => void
  onTyping?: () => void
}) {
  // ...
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)

  function computeMention(text: string, caret: number) {
    // Find the last @ before the caret and make sure it's at the start of a word
    const slice = text.slice(0, caret)
    const match = slice.match(/(?:^|\s)@([\w.]*)$/)
    return match ? match[1] : null
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value
    setValue(v)
    onTyping?.()
    const caret = e.target.selectionStart ?? v.length
    setMentionQuery(computeMention(v, caret))
  }

  function insertMention(handle: string) {
    const ta = textareaRef.current
    if (!ta) return
    const caret = ta.selectionStart ?? value.length
    const before = value.slice(0, caret)
    const after = value.slice(caret)
    const replaced = before.replace(/@([\w.]*)$/, `@${handle} `)
    const newValue = replaced + after
    setValue(newValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = replaced.length
      ta.setSelectionRange(pos, pos)
    })
  }
```

And in the JSX, wrap the textarea in a relative container that anchors the popover:

```tsx
<div className="relative flex-1">
  <textarea
    ref={textareaRef}
    value={value}
    onChange={handleChange}
    onKeyDown={onKeyDown}
    // ... existing props
  />
  {mentionQuery !== null && (
    <MentionAutocomplete
      query={mentionQuery}
      members={members}
      onSelect={insertMention}
      onDismiss={() => setMentionQuery(null)}
    />
  )}
</div>
```

- [ ] **Step 3: Pass `members` from ChatView**

In `chat-view.tsx`, pass `members={members}` to `<Composer>`.

- [ ] **Step 4: Disable global Enter-to-send while popover is open**

In `onKeyDown`, early-return if `mentionQuery !== null`:
```tsx
function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (mentionQuery !== null) return // popover handles keys
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
```

- [ ] **Step 5: Smoke-test**

Type `@` in the composer — popover should appear showing `ai` first and channel members. Arrow down and press Enter to insert a mention. Escape dismisses.

- [ ] **Step 6: Commit**

```bash
git add components/chat/mention-autocomplete.tsx components/chat/composer.tsx components/chat/chat-view.tsx
git commit -m "feat: @mention autocomplete popover with keyboard navigation"
```

---

### Task 43: Voice input via Web Speech API

**Files:**
- Modify: `components/chat/composer.tsx`

- [ ] **Step 1: Add voice input state and handlers**

At the top of Composer:
```tsx
const [recording, setRecording] = useState(false)
const recognitionRef = useRef<any>(null)

function startVoiceInput() {
  const SR =
    (typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
    null
  if (!SR) {
    alert('Voice input is not supported in this browser.')
    return
  }
  const rec = new SR()
  rec.continuous = false
  rec.interimResults = true
  rec.lang = 'en-US'

  let finalTranscript = ''
  rec.onresult = (event: any) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i]
      if (res.isFinal) finalTranscript += res[0].transcript
      else interim += res[0].transcript
    }
    setValue((v) => (finalTranscript || interim ? `${finalTranscript}${interim}`.trim() : v))
  }
  rec.onerror = () => setRecording(false)
  rec.onend = () => setRecording(false)
  rec.start()
  recognitionRef.current = rec
  setRecording(true)
}

function stopVoiceInput() {
  recognitionRef.current?.stop()
  setRecording(false)
}
```

- [ ] **Step 2: Replace the disabled mic button**

```tsx
<button
  type="button"
  onClick={recording ? stopVoiceInput : startVoiceInput}
  aria-label={recording ? 'Stop voice input' : 'Start voice input'}
  className={`grid h-[42px] w-[42px] place-items-center rounded-lg text-bg ${
    recording ? 'bg-warning' : 'bg-accent'
  }`}
>
  {/* same mic SVG as before */}
</button>
```

- [ ] **Step 3: Smoke-test**

In Chrome/Edge/Safari, click the mic. Grant permission. Speak a phrase. Expected: the transcription appears in the input field. Click again to stop. (Firefox: expect the "not supported" alert — document this in the README.)

- [ ] **Step 4: Commit**

```bash
git add components/chat/composer.tsx
git commit -m "feat: voice input via Web Speech API (Chromium + Safari)"
```

---

### Task 44: Voice output (TTS) for AI messages

**Files:**
- Create: `components/chat/speak-button.tsx`
- Modify: `components/chat/ai-message-body.tsx`

- [ ] **Step 1: Create the speak button**

`components/chat/speak-button.tsx`:
```tsx
'use client'
import { useState } from 'react'

export function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)

  function speak() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.')
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    speechSynthesis.cancel()
    speechSynthesis.speak(utter)
    setSpeaking(true)
  }

  function stop() {
    speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <button
      type="button"
      onClick={speaking ? stop : speak}
      aria-label={speaking ? 'Stop reading' : 'Read AI response aloud'}
      className="text-[10px] text-muted hover:text-accent underline"
    >
      {speaking ? '■ stop' : '▶ read aloud'}
    </button>
  )
}
```

- [ ] **Step 2: Add the button below completed AI messages**

In `ai-message-body.tsx`:
```tsx
import { SpeakButton } from './speak-button'

export function AIMessageBody({
  body,
  isStreaming,
}: {
  body: string
  isStreaming: boolean
}) {
  return (
    <div className="mt-1 text-sm leading-relaxed text-accent …">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {body}
      </ReactMarkdown>
      {isStreaming && (
        <span
          className="inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent blink-caret"
          aria-hidden
        />
      )}
      {!isStreaming && body && (
        <div className="mt-1">
          <SpeakButton text={body} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Smoke-test**

Trigger an AI response. After it finishes streaming, click "▶ read aloud". Expected: browser speaks the text. Click "■ stop" to interrupt.

- [ ] **Step 4: Commit**

```bash
git add components/chat/speak-button.tsx components/chat/ai-message-body.tsx
git commit -m "feat: text-to-speech playback for completed AI messages"
```

---

## Phase 13 — Responsive, search, invite, and polish

### Task 45: Mobile hamburger drawer

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `components/sidebar/mobile-drawer.tsx`

- [ ] **Step 1: Create MobileDrawer wrapper**

`components/sidebar/mobile-drawer.tsx`:
```tsx
'use client'
import { useState } from 'react'

export function MobileDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 rounded-lg bg-surface p-2 text-accent"
      >
        ☰
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="h-full">
            {children}
          </div>
          <div className="flex-1 bg-black/60" />
        </div>
      )}
      <div className="hidden md:block h-full">{children}</div>
    </>
  )
}
```

- [ ] **Step 2: Wrap Sidebar in the drawer**

In `app/(app)/layout.tsx`, replace `<Sidebar …/>` with:
```tsx
import { MobileDrawer } from '@/components/sidebar/mobile-drawer'
// ...
<MobileDrawer>
  <Sidebar currentUser={{ id: session.user.id, name: session.user.name || session.user.email }} />
</MobileDrawer>
```

- [ ] **Step 3: Add top padding on the chat header for the hamburger button on mobile**

In `components/chat/chat-view.tsx` header:
```tsx
<header className="flex items-center justify-between border-b border-border bg-bg-lifted px-5 py-3 md:pl-5 pl-14">
```

- [ ] **Step 4: Smoke-test**

Open DevTools → responsive mode → iPhone preset. Expected: sidebar is hidden behind a hamburger button. Tap ☰ → drawer slides in. Tap outside → drawer closes.

- [ ] **Step 5: Commit**

```bash
git add components/sidebar/mobile-drawer.tsx "app/(app)/layout.tsx" components/chat/chat-view.tsx
git commit -m "feat: mobile hamburger drawer for the sidebar"
```

---

### Task 46: Search within channel

**Files:**
- Create: `components/chat/channel-search.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Create ChannelSearch component**

`components/chat/channel-search.tsx`:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { searchMessages } from '@/server/messages'

export function ChannelSearch({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: string; body: string; created_at: string }>>([])
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const rows = await searchMessages(channelId, q)
      setResults(rows.map((r) => ({ id: r.id, body: r.body, created_at: r.created_at })))
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search channel"
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-accent hover:bg-hover"
      >
        🔍 Search
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl border border-border bg-surface p-5"
          >
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search messages…"
                className="flex-1 rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-3 font-semibold text-bg"
              >
                {pending ? '…' : 'Go'}
              </button>
            </form>
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto">
              {results.length === 0 && q && !pending && (
                <li className="text-sm text-muted">No matches.</li>
              )}
              {results.map((r) => (
                <li key={r.id} className="rounded border border-border p-3">
                  <div className="text-[10px] text-muted">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="mt-1 text-sm text-accent">{r.body}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Mount in the channel header**

In `components/chat/chat-view.tsx`:
```tsx
import { ChannelSearch } from './channel-search'
// in the header:
<div className="flex items-center gap-3">
  <PresenceBar channelId={channel.id} me={{ userId: currentUser.id, name: currentUser.name }} />
  <ChannelSearch channelId={channel.id} />
</div>
```

- [ ] **Step 3: Smoke-test**

Click Search. Type a query that exists in seed data. Expected: matching rows appear below. Empty query → empty results list.

- [ ] **Step 4: Commit**

```bash
git add components/chat/channel-search.tsx components/chat/chat-view.tsx
git commit -m "feat: in-channel message search with ilike query"
```

---

### Task 47: Invite members to a private channel

**Files:**
- Modify: `server/channels.ts`
- Create: `components/chat/invite-button.tsx`
- Modify: `components/chat/chat-view.tsx`

- [ ] **Step 1: Add the server action**

At the bottom of `server/channels.ts`:
```typescript
export async function inviteMember(input: { channelId: string; email: string }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('unauthorized')

  const supabase = await createClient()

  // Lookup the invitee by email in BetterAuth's user table (via the user-scoped
  // client — no RLS on public.user because browser never queries it; the server
  // has free read access to that schema)
  const { data: user } = await supabase
    .from('user')
    .select('id')
    .eq('email', input.email)
    .maybeSingle()

  if (!user) throw new Error('No user with that email. Ask them to sign up first.')

  // Insert membership via service role (the invitee can't insert their own row
  // because they don't have the RLS permission for this channel yet)
  const admin = serviceRoleClient()
  const { error } = await admin.from('channel_members').insert({
    channel_id: input.channelId,
    user_id: user.id,
    role: 'member',
  })
  if (error && error.code !== '23505') throw error
}
```

Add the import:
```typescript
import { serviceRoleClient } from '@/lib/supabase/service-role'
```

- [ ] **Step 2: Create the InviteButton component**

`components/chat/invite-button.tsx`:
```tsx
'use client'
import { useState, useTransition } from 'react'
import { inviteMember } from '@/server/channels'

export function InviteButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      try {
        await inviteMember({ channelId, email })
        setMsg('Invited!')
        setEmail('')
      } catch (err) {
        setMsg((err as Error).message)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-accent hover:bg-hover"
      >
        + Invite
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
            className="w-80 rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <h2 className="font-semibold text-white">Invite teammate</h2>
            <input
              autoFocus
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
            />
            {msg && <p className="text-xs text-muted">{msg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-bg disabled:opacity-60"
              >
                {pending ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Mount in the channel header alongside Search**

```tsx
import { InviteButton } from './invite-button'
// header right side:
<InviteButton channelId={channel.id} />
```

- [ ] **Step 4: Smoke-test**

In a channel you own, click Invite, enter a second test user's email. Expected: "Invited!" message. That user sees the channel in their sidebar on next page load.

- [ ] **Step 5: Commit**

```bash
git add server/channels.ts components/chat/invite-button.tsx components/chat/chat-view.tsx
git commit -m "feat: invite teammate by email (private or public channels)"
```

---

### Task 48: Empty/loading/error states cleanup + accessibility pass

**Files:**
- Modify: `components/chat/chat-view.tsx`
- Modify: `app/(app)/onboarding/page.tsx`

- [ ] **Step 1: Onboarding empty state**

Replace `app/(app)/onboarding/page.tsx`:
```tsx
export default function OnboardingPage() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <div className="text-3xl">👋</div>
        <h2 className="mt-2 text-lg font-semibold text-white">Welcome to Kochanet Chat</h2>
        <p className="mt-2 text-sm text-muted">
          You're not in any channels yet. Click the <span className="text-accent font-semibold">+</span> in the sidebar to create one, then invite teammates.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add aria-live to the message list**

In `components/chat/chat-view.tsx`, annotate the message container:
```tsx
<div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-4" aria-live="polite" aria-label="Messages">
```

- [ ] **Step 3: Add focus ring reset check**

Run `pnpm dev`, tab through the sign-in page → sidebar → composer. Expected: every focusable control shows a visible focus ring (the default outline in globals.css). If any control is missing a ring, add `focus:outline-none focus-visible:ring-2 focus-visible:ring-accent` to it.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/onboarding" components/chat/chat-view.tsx
git commit -m "feat: polish empty state + aria-live + a11y focus pass"
```

---

## Phase 14 — Seed, deploy, and docs

### Task 49: Seed script

**Files:**
- Create: `supabase/seed.ts`

- [ ] **Step 1: Write the seed script**

`supabase/seed.ts`:
```typescript
import 'dotenv/config'
import { auth } from '../lib/auth/better-auth'
import { serviceRoleClient } from '../lib/supabase/service-role'

const TEST_USERS = [
  { email: 'alice@kochanet.test', password: 'alice-test-password-1!', name: 'Alice Chen' },
  { email: 'bob@kochanet.test', password: 'bob-test-password-1!', name: 'Bob Martinez' },
]

async function ensureUser(u: typeof TEST_USERS[number]): Promise<string> {
  const admin = serviceRoleClient()
  const { data: existing } = await admin.from('user').select('id').eq('email', u.email).maybeSingle()
  if (existing) {
    console.log(`  ${u.email} already exists (id=${existing.id})`)
    return existing.id
  }

  const res = await auth.api.signUpEmail({
    body: { email: u.email, password: u.password, name: u.name },
  })
  if (!res || !('user' in res) || !res.user) {
    throw new Error(`Failed to sign up ${u.email}: ${JSON.stringify(res)}`)
  }
  console.log(`  created ${u.email} (id=${res.user.id})`)
  return res.user.id
}

async function main() {
  console.log('Seeding users…')
  const [aliceId, bobId] = await Promise.all(TEST_USERS.map(ensureUser))

  const admin = serviceRoleClient()

  console.log('Seeding channels…')
  const channels = [
    { name: 'general', type: 'public' as const, created_by: aliceId },
    { name: 'engineering', type: 'public' as const, created_by: aliceId },
  ]

  for (const c of channels) {
    const { data: existing } = await admin
      .from('channels')
      .select('id')
      .eq('name', c.name)
      .maybeSingle()
    let id = existing?.id
    if (!id) {
      const { data } = await admin.from('channels').insert(c).select('id').single()
      id = data!.id
      console.log(`  created #${c.name} (id=${id})`)
    } else {
      console.log(`  #${c.name} already exists (id=${id})`)
    }

    await admin
      .from('channel_members')
      .upsert([
        { channel_id: id, user_id: aliceId, role: 'owner' },
        { channel_id: id, user_id: bobId, role: 'member' },
      ], { onConflict: 'channel_id,user_id' })
  }

  console.log('Seeding messages in #engineering…')
  const { data: engChan } = await admin
    .from('channels')
    .select('id')
    .eq('name', 'engineering')
    .single()
  if (engChan) {
    const { count } = await admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', engChan.id)
    if ((count ?? 0) === 0) {
      const seedMessages = [
        { author_id: aliceId, body: 'Deployment failed again — third time today.' },
        { author_id: bobId, body: 'Same error as yesterday?' },
        { author_id: aliceId, body: 'Yeah, something about Docker networking.' },
        { author_id: bobId, body: "I'll take a look in 10." },
      ]
      for (const m of seedMessages) {
        await admin.from('messages').insert({
          channel_id: engChan.id,
          author_kind: 'user',
          ...m,
        })
      }
      console.log(`  inserted ${seedMessages.length} seed messages`)
    }
  }

  console.log('\n✓ Seed complete. Test credentials:')
  for (const u of TEST_USERS) {
    console.log(`  ${u.email} / ${u.password}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Install dotenv**

```bash
pnpm add -D dotenv
```

- [ ] **Step 3: Run the seed**

```bash
pnpm tsx supabase/seed.ts
```

Expected output:
```
Seeding users…
  created alice@kochanet.test (id=...)
  created bob@kochanet.test (id=...)
Seeding channels…
  created #general (id=...)
  created #engineering (id=...)
Seeding messages in #engineering…
  inserted 4 seed messages

✓ Seed complete. Test credentials:
  alice@kochanet.test / alice-test-password-1!
  bob@kochanet.test / bob-test-password-1!
```

- [ ] **Step 4: Verify via sign-in**

Run `pnpm dev`. Sign out of any existing session. Sign in with `alice@kochanet.test`. Expected: land in `#general`, see the engineering channel in the sidebar, see the seed messages when you click it.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.ts package.json pnpm-lock.yaml
git commit -m "feat: seed script creates test users, channels, and seed messages"
```

---

### Task 50: Deploy to Vercel

**Files:** none (dashboard actions)

- [ ] **Step 1: Push the repo to GitHub**

```bash
gh repo create kochanet-chat --public --source=. --remote=origin --push
```

(If `gh` isn't installed, create the repo manually on github.com and run `git remote add origin <url>` then `git push -u origin main`.)

- [ ] **Step 2: Create the Vercel project**

Go to https://vercel.com/new → Import `kochanet-chat` → pick the default framework (Next.js). Do NOT deploy yet — first add env vars.

- [ ] **Step 3: Add env vars in Vercel dashboard**

Paste each variable from `.env.local` into the Vercel project's Environment Variables section (Production + Preview + Development). EXCEPT set `BETTER_AUTH_URL` to the temporary deployment URL (you'll update after first deploy).

- [ ] **Step 4: Deploy**

Click "Deploy". Expected: build completes in 2–3 minutes. You'll get a URL like `https://kochanet-chat-xxxxxx.vercel.app`.

- [ ] **Step 5: Update `BETTER_AUTH_URL` and GitHub OAuth callback**

- In Vercel: update `BETTER_AUTH_URL` to the actual deployed URL and redeploy.
- In GitHub: edit the OAuth app, update Authorization callback URL to `https://<deployed-url>/api/auth/callback/github`.
- Also update `NEXT_PUBLIC_APP_URL` in Vercel to the deployed URL.

- [ ] **Step 6: Re-run the seed against production**

Make sure `.env.local` is pointing at the hosted Supabase (it already is). Run:
```bash
pnpm tsx supabase/seed.ts
```

- [ ] **Step 7: Smoke-test the deployed app**

Open the deployed URL in two incognito windows. Sign in as Alice in one, Bob in the other. Verify:
- Both see `#general` and `#engineering`.
- Sending a message in Alice's window appears in Bob's within ~500ms.
- Typing in Alice's window shows a typing indicator in Bob's.
- Presence shows 2 online in both.
- `@ai explain docker networking` in either window streams an AI response visible to both.
- Voice mic button records and transcribes in Chrome.
- Voice TTS plays the AI response after it completes.

- [ ] **Step 8: No commit needed** (deploy is dashboard-only)

---

### Task 51: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# Kochanet Chat

A real-time team chat with an on-demand AI assistant. Built for the Kochanet Next.js Developer Test.

**Live demo:** https://<your-vercel-url>

## Test credentials

| Email | Password |
|---|---|
| alice@kochanet.test | alice-test-password-1! |
| bob@kochanet.test | bob-test-password-1! |

**To see real-time features in action:** open two browser windows (one regular, one incognito), sign in as Alice in one and Bob in the other, navigate to `#engineering`, and start chatting.

**To test the AI:** in any channel, send a message mentioning `@ai`, e.g.:
- `@ai what causes Docker containers to lose network connectivity after restart?`
- `@ai give me three ways to debug a 504 gateway timeout`
- `@ai suggest a concise commit message for fixing a race condition in a seed script`

The AI's response streams in real time and is visible to every participant in the channel.

## Stack and justification

- **Next.js 15 App Router + TypeScript** — required by the brief.
- **Supabase** (Postgres + Realtime) — chosen over Firebase because Postgres gives us proper RLS, which I use heavily for per-channel authorization. Supabase Realtime with per-row RLS is the architectural foundation that lets the browser subscribe directly without a custom WebSocket relay.
- **BetterAuth** — required by the brief. BetterAuth doesn't integrate natively with Supabase RLS, so I built a JWT bridge (see `lib/auth/supabase-jwt.ts`) that mints Supabase-compatible JWTs from BetterAuth sessions with a custom `app_user_id` claim. RLS policies reference this claim instead of `auth.uid()`. **This is the most important architectural decision in the project** — see `docs/superpowers/specs/2026-04-06-kochanet-chat-design.md` §6 for the full reasoning and the options I rejected.
- **OpenAI API** — required by the brief. Model: `gpt-4o-mini` for cost on a take-home; swap via `lib/ai/openai.ts`.
- **shadcn/ui + Tailwind** — fast, accessible primitives that are easy to theme. Design palette is dark navy (`#001B2E`, `#294C60`, `#ADB6C4`).
- **`react-markdown` + `remark-gfm` + `rehype-highlight`** — streaming-friendly markdown for AI responses.
- **Web Speech API** — browser-native STT/TTS for the voice features. Chosen over OpenAI Whisper to satisfy the brief's voice requirement in ~2 hours instead of a full day. Known limitation: Firefox doesn't support `SpeechRecognition`.
- **Vercel** — fluid compute is on by default, which enables `after()` from `next/server`. The AI streaming continuation runs inside `after()` — see below.

## Architecture highlights

### Real-time communication

- **Postgres Changes** on the `messages` table is the single source of truth. One global subscription (RLS-filtered per user) drives both the active chat view and sidebar unread badges.
- **Broadcast** on a per-channel topic for typing indicators (ephemeral by design, no DB writes per keystroke).
- **Presence** on a per-channel topic for the "X online" count.
- **Optimistic updates** via a `client_id` column on messages — the browser generates a UUID on send, the server insert preserves it, and the realtime echo is matched by `client_id` to replace the pending row.
- **Reconnect gap-fill**: `useMessages` tracks the latest message created_at; on re-subscribe after a drop, it runs a one-shot `select * from messages where created_at > last_seen` to fill any gap.

### AI invocation and streaming

The AI reuses the same realtime infrastructure as human messages — **there is only one WebSocket channel in the app**. The flow:

1. `sendMessage` server action inserts the user's message (as the user, through RLS).
2. If the body matches `\b@ai\b`, it rate-limits (5/minute/user), then inserts a **placeholder AI message row** via the service-role client (`ai_status='streaming'`, `body=''`). This insert fires a Postgres Changes event → browser sees an empty AI bubble within ~300ms.
3. The server action calls `after()` from `next/server` to schedule the streaming work. The response returns to the client; the streaming continuation keeps running inside the same serverless invocation thanks to Vercel's fluid compute.
4. Inside `after()`, `invokeAI` opens an OpenAI streaming response and **batches UPDATEs to the placeholder row every ~80ms or every ~30 tokens, whichever comes first**. Each UPDATE fires a Postgres Changes event; the browser sees the body grow in real time.
5. Final UPDATE sets `ai_status='complete'`. On error, `ai_status='error'` with a fallback body.

This design trades ~30–50 DB writes per AI response for a single realtime channel, automatic persistence from token 1, and zero separate streaming infrastructure.

**Context window:** last 30 messages in the channel, formatted with author-name prefixes (`Alice: message`). Display names resolved via a batched query against BetterAuth's `public.user` table. Only completed AI responses are included — in-flight placeholders are skipped so the AI doesn't see its own unfinished work.

**Concurrency:** multiple simultaneous `@ai` invocations each get their own placeholder row and stream in parallel. No queue, no debounce.

### Authentication and authorization

- BetterAuth with email/password + GitHub OAuth. Session is a cookie (`better-auth.session_token`).
- Middleware (`middleware.ts`) is a cheap cookie-presence check that redirects between `(auth)` and `(app)` route groups. The authoritative session check happens server-side in `lib/supabase/server.ts` via `auth.api.getSession()`.
- The BetterAuth session is converted to a Supabase-compatible JWT by `mintSupabaseJwt` — signs with `SUPABASE_JWT_SECRET`, embeds the BetterAuth user id as the custom claim `app_user_id`, valid 1 hour.
- RLS policies reference `(auth.jwt() ->> 'app_user_id')::uuid` instead of `auth.uid()`. The policies are in `supabase/migrations/0002_rls.sql`.
- Browser gets a fresh JWT from the server on initial page load (passed through `SupabaseProvider`) and refreshes it via a server action every 50 minutes.
- The service-role client is **only** imported by `lib/ai/stream-response.ts` and the seed script. Every other path is user-scoped.

### Project structure

```
app/                    Next.js App Router
├── (auth)/             sign-in and sign-up pages (route group)
├── (app)/              authenticated shell (route group)
│   └── c/[channelId]/  individual channel page
└── api/auth/[...all]/  BetterAuth mount
components/             React components (chat, sidebar, presence, ui)
lib/
├── auth/               BetterAuth instance, client, JWT bridge
├── supabase/           server/browser/service-role clients + provider
├── ai/                 OpenAI client, system prompt, context builder, streaming continuation
├── realtime/           useMessages, usePresence, useTyping, useConnectionState
└── utils/              mention detection, thinking verbs, format helpers
server/                 server actions (messages, channels, ai, session)
supabase/migrations/    schema and RLS policies
docs/superpowers/       design spec and implementation plan
```

## Environment variables

See `.env.local.example`. You need a Supabase project, a GitHub OAuth app, and an OpenAI API key.

## Local setup (if you want to run it yourself)

```bash
pnpm install
cp .env.local.example .env.local  # fill in values
pnpm dlx supabase link --project-ref <your-project-ref>
pnpm dlx supabase db push
pnpm tsx supabase/seed.ts
pnpm dev
```

## Assumptions I made

- **The AI is a distinct peer, not a user account.** AI messages have `author_id = NULL` and an `author_kind = 'ai'` discriminator. `invoked_by_user_id` attributes each AI response to the user who summoned it.
- **Read receipts are Slack-style** (per-channel `last_read_at`), not per-message. Drives sidebar unread badges and a "new messages" divider on entry.
- **Public channels still require a membership row** — "public" just means anyone can self-join. This is the industry-standard Slack model and keeps RLS as a single clean expression.
- **No first-class DMs.** Could be modeled as private 2-member channels if ever needed. Out of scope for V1.

## Known limitations and tradeoffs

- **Voice features use the Web Speech API**, not OpenAI Whisper + TTS. Works in Chrome, Edge, and Safari but not Firefox. No audio file storage, no waveforms, no transcripts.
- **Search uses Postgres `ilike`**, no full-text indexing or ranking. Fast enough on the seed dataset. No highlight rendering.
- **Unread badges update on navigation, not live.** The sidebar is a server component. A live sidebar would need a second realtime subscription. Deferred.
- **No automated tests for UI components.** Business logic (JWT bridge, mention detection, rate limiter, context builder) has Vitest unit tests (`pnpm test`). UI was smoke-tested manually.
- **Rate limiting is per-user by Postgres count.** No Redis, no token buckets. Fine for a demo.
- **The service-role insert path for AI messages is a privilege boundary.** It's isolated to one file (`lib/supabase/service-role.ts`) which is only imported by `lib/ai/stream-response.ts` and the seed script. Reviewing that import list is reviewing the entire bypass surface.

## What I would do with more time

- Playwright e2e tests for the full realtime + AI flow across two browser contexts.
- Smart context summarization when the channel exceeds 30 messages (compress oldest batch into a "so far" summary).
- Streaming AI via `Broadcast` with chunked deltas for sub-100ms visible latency.
- Per-message read confirmations (checkmarks) on top of the current channel-pointer model.
- Message edits, reactions, threads, reply-to — would add `updated_at`, `deleted_at`, `reactions` (JSONB) to the schema.
- File / image sharing with Supabase Storage.
- Dark mode toggle (and an actual light theme).
- Multiple social auth providers (Google, Discord).
- PWA support and push notifications.
- Cmd-K channel switcher and full keyboard shortcut suite.
- Search with full-text indexing, ranking, and inline highlight rendering.
- AI can reference specific earlier messages by storing token-level anchors.
- Replace the `alert()` rate-limit fallback with a proper toast component.

## Video walkthrough outline (5–10 min)

1. **Sign in and tour the UI** (~1 min) — show both test accounts side-by-side, presence, typing, sidebar, channels.
2. **The BetterAuth ↔ Supabase JWT bridge** (~2 min) — the most non-obvious decision. Open `lib/auth/supabase-jwt.ts`, explain the custom claim, show `lib/supabase/server.ts` attaching it, show the RLS policy in `0002_rls.sql` referencing it. Explain what I rejected (service-role-only, parallel auth systems).
3. **Real-time topology** (~1.5 min) — one global Postgres Changes subscription, RLS-filtered. Broadcast for typing. Presence for online. Open `lib/realtime/use-messages.ts` and show the subscription + gap-fill + optimistic reconciliation in one file.
4. **The AI flow** (~2 min) — the architectural payoff. Open `server/messages.ts` and walk through the `sendMessage` action → placeholder insert → `after()` continuation. Open `lib/ai/stream-response.ts` and explain the batched UPDATE loop. **Emphasize that AI streaming reuses the same realtime channel as new messages — there is only one WebSocket in the app.**
5. **Tradeoffs I made and would change** (~1 min) — voice features via Web Speech, no automated UI tests, sidebar is not live, manual smoke testing. Point at the "With more time" section.
6. **Challenges** (~0.5 min) — the BetterAuth RLS mismatch and how I solved it with custom claims was the most interesting problem.
```

- [ ] **Step 2: Smoke-check the README**

Read it back end-to-end. Verify the deploy URL placeholder is updated to the actual URL.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with stack justification, architecture, and tradeoffs"
```

---

### Task 52: Final push and verify Vercel redeploys

**Files:** none

- [ ] **Step 1: Push final commits**

```bash
git push origin main
```

Expected: Vercel picks up the push and redeploys automatically.

- [ ] **Step 2: Final smoke test on the deployed URL**

Run through the full video walkthrough outline on the deployed URL to confirm everything still works after the final deploy:
- Sign in as Alice and Bob in two incognito windows.
- Navigate to `#engineering`.
- Send a regular message — verify realtime.
- Start typing — verify typing indicator.
- Send `@ai tell me about Docker networking` — verify streaming with markdown.
- Click the mic button, speak a sentence — verify transcription.
- Click "▶ read aloud" on an AI response — verify TTS.
- Create a new private channel — verify it's in the sidebar.
- Invite the other user by email — verify they see it.
- Kill network in DevTools for 10s, have the other user send messages, reconnect — verify gap-fill.

- [ ] **Step 3: Record the 5–10 minute video walkthrough**

Follow the outline in the README. Keep camera on. Narrate the non-obvious architectural decisions. Point at specific files and policies. Finish with tradeoffs and "with more time."

- [ ] **Step 4: Submit**

Submit via https://airtable.com/app6yvIltizp9X6XC/shrtpgZYOMJGg4wWy with:
- GitHub repo URL
- Deployed URL
- Test credentials (already in README)
- Video walkthrough link










