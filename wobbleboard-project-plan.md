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

## Phase 3d: Subscription Update Connector (POST) ⬅️ NEXT UP
*Branch: `phase-3d-subscription-updates`*

**Goal:** Enable Fin to autonomously update subscriptions (plan tier changes + cancellations) via a POST Data Connector. Validates the direct-POST path so we capture every Intercom POST bug as consulting material.

**Architecture:** Supabase-first writes — API mutates Supabase, then pushes attribute updates to Intercom. Supabase remains source of truth.

### 3d.1 — Supabase mutation layer
- [ ] `POST /api/intercom/subscriptions` endpoint
- [ ] Accepts: `company_id` (UUID), `action` (`change_plan` | `cancel`), `new_plan_tier` (optional, required when action is `change_plan`)
- [ ] Updates Supabase `subscriptions` table first
- [ ] Pushes updated company attributes to Intercom (`plan_tier`, `subscription_status`)
- [ ] Bearer token auth (reuse `src/lib/api-auth.ts`)
- [ ] Validation: reject invalid plan tiers, reject cancel-on-already-cancelled, reject unknown company UUIDs
- [ ] Returns structured success/error response Fin can render to the customer
- [ ] Tests: success cases, validation failures, auth failures, Intercom sync failure handling

### 3d.2 — Intercom Data Connector configuration
- [ ] Configure POST connector in Intercom UI
- [ ] **Document every POST bug encountered** (Content-Type defaulting, JSON body double-encoding, URL mangling) — this is consulting gold and feeds directly into the paid email sequence
- [ ] Configure Fin to call connector autonomously on plan-change / cancellation requests
- [ ] Fin guardrails: confirmation step before executing cancellation (irreversible action best practice)
- [ ] Decision point: if direct POST is unworkable, pivot to Cloudflare Worker proxy as fallback

### 3d.3 — Demo script + test cases
- [ ] End-to-end test: customer asks to upgrade → Fin executes → Supabase + Intercom both reflect change
- [ ] End-to-end test: customer asks to cancel → Fin confirms intent → executes → both systems updated
- [ ] Test: invalid plan tier requested → Fin handles error gracefully
- [ ] Test: already-cancelled subscription → Fin handles error gracefully
- [ ] Reset script verified to restore demo state cleanly between runs
- [ ] Document the demo narrative for sales calls

## Phase 3e: Frontend Edit Functionality 📋
- [ ] Edit company/contact data from the frontend
- [ ] Push edits to Intercom via API
- [ ] Event trigger panel — fire custom events from the UI
- [ ] Sync status indicators

## Phase 3f: Intercom Messenger Embed 📋
- [ ] Embed Intercom messenger in Wobbleboard frontend
- [ ] Allows demoing the end-user support experience
- [ ] Fin answers questions and executes subscription updates using Data Connector data in real time

## Phase 4: Polish & Demo Readiness 📋
- [ ] Merge all branches to main
- [ ] End-to-end demo walkthrough test
- [ ] README with setup instructions (for future reference)
- [ ] Consider: custom domain (e.g. demo.wobbleboard.example)

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
- **Intercom Data Connector POST bugs** — Phase 3d will validate the direct-POST path and document every failure mode encountered. Cloudflare Worker proxy is the fallback if direct POST is unworkable.
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
