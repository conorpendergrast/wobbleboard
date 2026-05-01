# CLAUDE.md

Project-level guidance for Claude Code working in this repo. Read this before doing anything destructive or environmental.

## What this project is

Wobbleboard — a Next.js 16 dashboard backed by Supabase, with one-way sync to Intercom and three authenticated API routes under `/api/intercom/*`. See `README.md` for the full picture.

## When the user wants to set the project up

The README has a "Setup with Claude Code (recommended)" section that lays out an eight-phase plan. Follow that section, not this one. Specifically:

1. Read the phases listed in `README.md` under "Setup with Claude Code".
2. Seed `TodoWrite` with one entry per phase.
3. Work phase-by-phase: do what you can directly, ask the user for browser-only inputs (Supabase URL, service-role key, Intercom token, region), verify before moving on.
4. If a phase fails, stop. Do not skip ahead.

If the user pastes the README's kickoff prompt, treat it as authoritative and start at Phase 1.

## Resuming an interrupted setup

If a session was already partway through setup, infer state before asking. Useful checks:

- `node --version` — Phase 1.
- `grep -c '^NEXT_PUBLIC_SUPABASE_URL=.\+' .env.local` — Phase 2 done.
- A `tsx -e` snippet doing `select count(*) from companies` — Phase 3 (no error) and Phase 6 (count > 0).
- `grep -c '^INTERCOM_ACCESS_TOKEN=.\+' .env.local` — Phase 4.
- `grep -E '^INTERCOM_CONNECTOR_API_KEY=[a-f0-9]{64}$' .env.local` — Phase 5.
- An Intercom `/me` call — confirms Phase 4 token + region wiring.

Resume at the first phase whose verification fails.

## Hard rules

These apply to every session, not just setup:

- **`.env.local` is write-only after creation.** Verify with `grep -c` / `grep -E`. Do not `cat` it, do not echo its contents back to the user, do not pass its values as visible shell arguments. Build secrets into shell variables inside a single command.
- **Never commit `.env.local` or any value from it.** It's gitignored; keep it that way.
- **Do not run any of these without an explicit instruction in the current session:**
  - `npm run cleanup:intercom` (deletes Intercom data)
  - `npm run reset` (truncates all four Supabase tables)
  - `git push`, `git push --force`, branch deletes
  - `vercel deploy`, `vercel --prod`, or any other deploy command
- **Do not auto-confirm `npm run sync:events`.** The script asks `y/n` because Intercom events are not deletable via API. Surface the prompt to the user. Do not pipe `yes` into it.
- **Do not guess the Intercom region.** Ask the user (US/EU/AU) and set `INTERCOM_REGION` in `.env.local`. The Intercom client (`src/lib/intercom.ts`) reads this env var; do not edit the source to change region.
- **The plan and the code ship together.** Any PR that completes a numbered phase or sub-phase must update `wobbleboard-project-plan.md` in the same branch — tick the boxes, change the heading marker (📋 → ✅), add the merged PR number to the phase note, and move the `⬅ NEXT` arrow to whatever's actually next. Don't leave the plan to drift while branches merge.

## Codebase conventions

- **Next.js 16, App Router, React 19.** Server components by default. Route handlers live in `src/app/api/**/route.ts`.
- **TypeScript strict mode.** Run `npm run lint` after non-trivial changes.
- **Supabase access is server-only.** Use `createServiceClient()` from `src/lib/supabase.ts`. The service-role key bypasses RLS — never reference it from a client component.
- **Intercom calls go through `intercomRequest()`** in `src/lib/intercom.ts`. It handles auth, region, rate-limit warnings, and the `Intercom-Version: 2.11` header. Do not call `fetch` against the Intercom API directly from new code.
- **API routes are bearer-authed** via `validateApiKey()` in `src/lib/api-auth.ts`. New routes under `/api/intercom/*` should call it first.
- **Money is GBP pence** as integers in the DB. `formatMrr()` in `src/lib/format.ts` is the only place to render it.
- **Scripts in `scripts/`** are run with `tsx` and load `.env.local` via `dotenv.config({ path: resolve(__dirname, "../.env.local") })`. Follow that pattern for any new script.

## Useful commands

| Command                   | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Dev server. Fine to run with `run_in_background: true`.          |
| `npm run lint`            | ESLint over the project.                                         |
| `npm run build`           | Production build — useful as a heavier check before declaring done. |
| `npm run seed`            | Idempotent enough for fresh DBs; will duplicate if already seeded. |
| `npm run setup:intercom`  | Idempotent. Safe to re-run.                                      |
| `npm run sync:intercom`   | Updates by external_id / email rather than duplicating.          |

## Database schema

Four tables defined in `supabase/migrations/001_initial_schema.sql`: `companies`, `contacts`, `subscriptions`, `product_events`. The README "Database" section has the field-level details. New migrations should land in the same directory as `00N_<name>.sql`.

## What not to invent

- There is no test suite yet. Don't claim tests passed unless one has been added.
- `scripts/reset.ts` calls a `truncate_table` RPC that doesn't exist in any migration; it falls back to row-by-row delete. Don't "fix" this without checking with the user first.
- The repo has no `LICENSE` or `CONTRIBUTING.md`. Don't synthesise one without being asked.
