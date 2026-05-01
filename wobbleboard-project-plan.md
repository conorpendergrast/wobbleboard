# Wobbleboard Demo Environment — Project Plan

## Purpose
A demo web app simulating a fictional employee wellness SaaS (Wobbleboard), used to showcase best-practice Intercom Data Connector integrations during consulting sales calls.

**Stack:** Next.js (Vercel) + Supabase (Postgres) + Intercom API

---

## Phase 1: Database & Seed Data ✅
- [x] Scaffold Next.js project
- [x] Create Supabase schema (companies, contacts, subscriptions, product_events)
- [x] Seed script with 5 companies, 30 contacts, ~100 events
- [x] Reset script for re-seeding
- [x] Safe email domains (@wobbleboard.example)

## Phase 2: Intercom Sync Layer ✅
- [x] Intercom API client (`src/lib/intercom.ts`)
- [x] Custom data attributes created in Intercom
  - Contacts: `is_demo`, `company_role`
  - Companies: `is_demo_company`, `plan_tier`, `subscription_status`, `billing_cycle`
- [x] Sync companies + contacts + attach contacts to companies
- [x] Sync product events (irreversible, separate command with confirmation)
- [x] Cleanup script (search by demo flag, delete contacts then companies)

## Phase 3a: Frontend Dashboard ✅
*Branch: `phase-3-frontend`*
- [x] shadcn/ui setup, sidebar layout, dark/light mode (system preference)
- [x] Dashboard overview (stat cards + recent activity)
- [x] Companies list + detail pages
- [x] Contacts list + detail pages
- [x] Server components with service-role Supabase client

## Phase 3b: Deploy + Data Connector ✅
- [x] API route: `GET /api/intercom/subscriptions`
- [x] Vercel deployment live at wobbleboard.vercel.app
- [x] Intercom Data Connector configured and live
- [x] Fin answering subscription questions using live data

## Phase 3c: Additional Data Connector Endpoints ✅
- [x] Contact activity endpoint (`GET /api/intercom/contact-activity?email={email}`)
- [x] Company engagement endpoint (`GET /api/intercom/company-engagement?company_id={uuid}`)
- [x] Auth helper extracted to shared `src/lib/api-auth.ts`
- [x] All 9 tests passing (auth, 404s, 400s, valid responses)
- [ ] **TODO: Configure 2 new Data Connectors in Intercom + test with Fin**
      *(2026-05-01: awaiting confirmation — were both contact-activity
      and company-engagement connectors wired up alongside the Fin
      procedure work? Tick this once both are live and tested; if only
      one was done, replace with a note naming the pending one.)*

## Phase 3d: Write-capable Data Connectors

### 3d.1 Supabase mutation layer ✅
- [x] PATCH endpoint for subscriptions (plan tier change + cancellation)
- [x] Vitest harness with hand-rolled Supabase mocks (24 tests)
- [x] PR #5 merged

### 3d.2 Intercom POST connector + bug capture ✅
- [x] POST connector configured in Intercom UI
- [x] All happy paths verified end-to-end
- [x] All error paths verified (400, 404, 409, idempotent no-op)
- [x] Direct POST works — no Cloudflare Worker fallback needed
- [x] Bug capture template committed (PR #6)
- **Finding:** Direct POST to a third-party API now works cleanly in 2026.
  Worth one entry in `docs/intercom-api-gotchas.md` under
  "Surprises that aren't bugs".

### 3d.3 Fin wiring + demo script + e2e tests ✅
Fin procedure configured in Intercom UI 2026-05-01, tested and live.
- [x] Wire Fin to call the POST connector autonomously on plan-change
      and cancel intents
- [x] Cancellation-confirmation guardrail (Fin must confirm before posting)
- [x] Rehearsed demo script
- [x] E2E test pass against the live workspace

### 3d.4a Fix cleanup:intercom silent failure ✅
PR #10 merged.
- [x] Add verify-after-delete to `cleanup:intercom`
- [x] Surface honest output (no false "5/5 ✓" when DELETE no-ops)
- [x] Output lists undeletable company IDs + dashboard URLs for
      manual cleanup
- [x] Tests covering the 200-but-not-deleted case
- [ ] Manual UI cleanup of current 10 orphan companies — moved to
      support-ticket territory (Intercom soft-delete + LIST visibility
      filter prevent recovery via API)
- [ ] Document the manual UI click-path in
      `docs/intercom-api-gotchas.md` — deferred to 3d.4d

### 3d.4b Stable UUIDs/emails in seed.ts ✅
PR #11 merged. Per-company `remote_created_at` ladder follow-up tracked
separately as 3d.4b.1.
- [x] Switch `companies.id` to stable values (hardcoded UUIDs or
      deterministic from company name)
- [x] Switch contact emails to deterministic
      (`role-N@domain.wobbleboard.example`)
- [x] Verify Intercom `company_id`-based upsert actually updates in place
- [x] Verify the existing 409 contact handler kicks in on email collision
- [x] Test: 3 back-to-back reseed cycles → zero orphan growth in Intercom
      *(ran 2 cycles, not 3 — same 5 Intercom IDs both times, 30/30
      contacts updated in place; close enough)*

### 3d.4b.1 Per-company tenure ladder for remote_created_at ✅
PR #12 merged.
- [x] Restore per-company deterministic `remote_created_at` values
      (fixed ISO dates, anchored to a stable past date — not relative
      `daysAgo()` that creeps forward)
- [x] Tests asserting distinct values per company + stable across
      reseeds + ordering invariant locking the
      Brightpath > Pennine > GreenLeaf > Mosaic > Fern & Oak ladder

### 3d.4c reset:full command ⬅ NEXT
- [ ] Build on top of 3d.4a (honest cleanup) + 3d.4b (no orphans by design)
- [ ] Detach contacts from companies before deleting contacts
- [ ] Retry-with-backoff for search-index propagation lag (up to 60s)
- [ ] Skip company DELETE entirely — rely on upserts from 3d.4b
- [ ] Events: skip by default, separate explicit y/n prompt
      (per CLAUDE.md hard rule)

### 3d.4d Intercom API gotchas doc 📋
Interim stub landed via the docs/handoff-readiness-fixes branch
(PR #14): `docs/intercom-api-gotchas.md` now contains a one-paragraph
intro plus brief findings for all four entries below. The bug-capture
template that previously occupied this filename is preserved at
`docs/archive/intercom-api-gotchas-template.md`. Full version with
reproduction steps, examples, and additional findings is still owed.
- [x] Rename `docs/phase-3d-intercom-post-bugs.md` →
      `docs/intercom-api-gotchas.md`
- [x] Stub entry: `DELETE /companies/{id}` archives rather than
      hard-deletes (documented soft-delete behaviour)
- [x] Stub entry: `GET /companies` LIST excludes companies with
      `user_count == 0` or null `remote_created_at` (documented
      visibility filter)
- [x] Stub entry: search-index propagation lag of 60+ seconds after
      writes
- [x] Stub entry: Surprises — direct POST works cleanly in 2026
- [ ] Expand each stub entry with reproduction steps and example
      payloads
- [ ] Add load-bearing "why direct POST, not proxy" architectural note
      (gap-9 from handoff audit)
- [ ] Add one-way sync invariant note (gap-11)
- **Consulting use:** these four findings are the spine of the
  "5 mistakes" Bento email sequence.

## Phase 3e: Frontend Edit Functionality 📋
- [ ] Edit company/contact data from the frontend
- [ ] Push edits to Intercom via API
- [ ] Event trigger panel — fire custom events from the UI
- [ ] Sync status indicators

## Phase 3f: Intercom Messenger Embed 📋
- [ ] Embed Intercom messenger in Wobbleboard frontend
- [ ] Allows demoing the end-user support experience
- [ ] Fin answers questions and executes subscription updates using Data Connector data in real time

## Phase 3g: Supabase API auth hardening 📋
- [ ] Replace service-role-key Supabase client in API routes with
      scoped access (anon key + RLS, or per-request scoped JWTs)
- [ ] RLS policies on companies, contacts, subscriptions, product_events
- [ ] Migration plan: route-by-route swap, tests covering every endpoint
- [ ] Decision needed: anon key + RLS vs custom JWT per request
- **Framing:** clean migration. Not a demo-able before/after — once it's
  done it's done.

## Phase 4: Polish & Demo Readiness 📋
- [ ] Final repository tidy (prune merged branches, archive any
      abandoned ones)
- [ ] End-to-end demo walkthrough test
- [ ] README with setup instructions (for future reference)
- [ ] Consider: custom domain (e.g. demo.wobbleboard.example)
- [x] `docs/archive/` established (PR #14) for working notes kept for
      provenance — `phase-3d-blockers.md`,
      `phase-3d-overnight-status.md`, `phase-3d-plan.md`, and the
      bug-capture template. New historical notes go here, not in
      `docs/` root.

## Standing rule: pre-demo reset

Reseed produces stable Intercom records via deterministic UUIDs and
upsert (3d.4b). Standard pre-demo reset:

```
npm run reset && npm run seed && npm run sync:intercom
```

This is idempotent — same five companies, same thirty contacts, same
Intercom IDs every time. No orphan accumulation. After 3d.4c lands,
this becomes `npm run reset:full` with retries and event-skip default.

---

## Available Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Local development server |
| `npm run seed` | Populate Supabase with demo data |
| `npm run reset` | Wipe and re-seed Supabase |
| `npm run setup:intercom` | Create custom attributes in Intercom |
| `npm run sync:intercom` | Push companies + contacts to Intercom |
| `npm run sync:events` | Push events to Intercom (with confirmation) |
| `npm run cleanup:intercom` | Delete all demo data from Intercom |

## Live URLs
| URL | Purpose |
|---|---|
| wobbleboard.vercel.app | Frontend dashboard + API endpoints |
| wobbleboard.vercel.app/api/intercom/subscriptions | Subscription data connector (GET read, POST write) |
| wobbleboard.vercel.app/api/intercom/contact-activity | Contact activity data connector |
| wobbleboard.vercel.app/api/intercom/company-engagement | Company engagement data connector |

## Key Constraints
- **Live Intercom workspace** — all demo data tagged with `is_demo` / `is_demo_company` for safe cleanup
- **Intercom Data Connector POST behaviour** — Phase 3d.2 verified that direct POST to a third-party API works cleanly in 2026. No proxy layer needed. The historical bugs (URL mangling, JSON double-encoding, default Content-Type issues) did not reproduce.
- **Events are immutable** — cannot be deleted from Intercom once synced
- **Custom attribute names must be unique across models** — hence `is_demo` (contacts) vs `is_demo_company` (companies)
- **Fin executing irreversible actions** — cancellation flow includes a confirmation step before execution. This models best practice for consulting clients rather than maximum demo flash.

## Intercom Data Connectors
| Connector | Method | Status | Endpoint |
|---|---|---|---|
| Get company subscription info | GET | ✅ Live | `/api/intercom/subscriptions?company_id={uuid}` |
| Contact activity | GET | ⏳ Needs Intercom config | `/api/intercom/contact-activity?email={email}` |
| Company engagement | GET | ⏳ Needs Intercom config | `/api/intercom/company-engagement?company_id={uuid}` |
| Update subscription (plan change / cancel) | POST | 📋 Phase 3d | `/api/intercom/subscriptions` |
