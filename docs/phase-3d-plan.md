# Phase 3d.1 — Implementation Plan

Builds on the discovery in `docs/phase-3d-blockers.md`. Decisions resolved in
Conor's resume brief are reflected throughout.

## Goal

Add `POST /api/intercom/subscriptions` so Fin can mutate a company's subscription.
Supabase is the source of truth; Intercom receives a best-effort attribute push
after the Supabase write commits.

## Endpoint contract

### Request

```
POST /api/intercom/subscriptions
Authorization: Bearer ${INTERCOM_CONNECTOR_API_KEY}
Content-Type: application/json
```

Body:

```jsonc
{
  "company_id": "uuid",                            // required
  "action": "change_plan" | "cancel",              // required
  "new_plan_tier": "starter" | "growth" | "enterprise" // required iff action == "change_plan"
}
```

Drop the `success: true` envelope (redundant with HTTP status; existing GETs
return bare objects). Keep `supabase_updated` / `intercom_synced` because the
partial-success case genuinely needs them. Add a `message` string for Fin to
render to the end customer — booleans alone don't template well. Include
`company_name` to mirror the GET endpoint.

### Success response — full success

HTTP 200:

```json
{
  "supabase_updated": true,
  "intercom_synced": true,
  "message": "Plan changed to growth.",
  "company_name": "Acme",
  "subscription": {
    "plan_tier": "growth",
    "status": "active",
    "billing_cycle": "monthly",
    "renewal_date": "2026-05-12"
  }
}
```

`message` per action:
- `change_plan`: `"Plan changed to <tier>."`
- `cancel`: `"Subscription cancelled."`
- No-op `change_plan` (already on requested tier): `"Already on <tier> plan; no change made."` with `supabase_updated: false, intercom_synced: true` (no Intercom write needed).

### Success response — partial (Supabase ok, Intercom failed)

HTTP 200:

```json
{
  "supabase_updated": true,
  "intercom_synced": false,
  "intercom_error": "Intercom POST /companies failed (502): Bad Gateway",
  "message": "Plan changed to growth. Update will appear in Intercom shortly.",
  "company_name": "Acme",
  "subscription": { ... }
}
```

Per Conor's brief: log and continue. Supabase is source of truth; the next
`npm run sync:intercom` reconciles. Status 200 because the user-visible mutation
succeeded; the `message` defers the Intercom-visible delay so Fin can read it
verbatim without branching on booleans.

### Error responses

| Status | Body                                                              | When                                                                 |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| 401    | `{ "error": "Unauthorised" }`                                     | Missing/invalid bearer token (delegates to `validateApiKey`).        |
| 415    | `{ "error": "Content-Type must be application/json" }`            | `Content-Type` header missing or not `application/json` (also surfaces a known Intercom POST connector bug — useful consulting signal). |
| 400    | `{ "error": "Invalid JSON body" }`                                | Body is not parseable JSON.                                          |
| 400    | `{ "error": "company_id is required" }`                           | Missing `company_id`.                                                |
| 400    | `{ "error": "company_id must be a valid UUID" }`                  | `company_id` not UUID-shaped.                                        |
| 400    | `{ "error": "action must be 'change_plan' or 'cancel'" }`         | Missing or unrecognised `action`.                                    |
| 400    | `{ "error": "new_plan_tier is required when action is change_plan" }` | `change_plan` missing `new_plan_tier`.                          |
| 400    | `{ "error": "new_plan_tier must be one of: starter, growth, enterprise" }` | `new_plan_tier` not in the allowed set.                  |
| 404    | `{ "error": "No subscription found for this company" }`           | Company has no subscription row (mirrors GET wording).               |
| 409    | `{ "error": "Subscription is already cancelled" }`                | `cancel` against a row whose `status` is already `churned`.          |
| 409    | `{ "error": "Subscription state changed concurrently; please retry" }` | UPDATE matched zero rows (status guard tripped — concurrent mutation). |
| 500    | `{ "error": "Failed to update subscription" }`                    | Supabase write itself failed (logged via `console.error`).           |

`409` and `415` are new for this codebase. The route file will carry a brief
header comment noting they are deliberate, so future contributors copying the
GET pattern know they're allowed.

No-op `change_plan` (request matches current tier) is **not** a 409 — it's
returned as a 200 idempotent response with `supabase_updated: false`. A
no-op is satisfied, not in conflict.

## Files to create

1. **`src/app/api/intercom/subscriptions/route.test.ts`** — Vitest suite.
2. **`vitest.config.ts`** — Minimal config: `path` alias for `@/*`, node
   environment, globals on so `describe/it/expect/vi` are ambient. No setup
   files needed.
3. **`docs/phase-3d-plan.md`** — this file.
4. **`docs/phase-3d-overnight-status.md`** — Step 7 deliverable.

## Files to modify

1. **`src/app/api/intercom/subscriptions/route.ts`** — add `POST` handler
   alongside the existing `GET`. The two share no logic worth extracting; keep
   them in the same file as the route file owns the URL.
2. **`package.json`** — add `vitest` to `devDependencies`, add
   `"test": "vitest run"` and `"test:watch": "vitest"` scripts.
3. **`wobbleboard-project-plan.md`** — Step 7: tick the seven 3d.1 sub-bullets
   under "3d.1 — Supabase mutation layer". Leave 3d.2 / 3d.3 alone.

## Sub-agent review applied

Plan reviewed by `code-reviewer` sub-agent. Adopted: drop `success` envelope;
add `message` field for Fin; document deliberate 409/415; no-op `change_plan`
returns 200 not 409; status-guarded UPDATE with `PGRST116` mapped to 409;
415 for non-JSON Content-Type; 5s timeout on Intercom call; expanded test set
(payload assertion, env-unset 401, concurrency guard); idempotency comment in
route header. Skipped: explicit body size cap (over-engineered for a
single-known-caller demo endpoint) and `__tests__/` directory move (Next.js 16
only treats `route.ts` as a route handler, so co-location is safe — will
verify with `npm run build` before opening the PR).

No new lib files. The plan-tier and status enums live as `const` arrays at the
top of the route file. They're small, only used in one place, and exporting them
from `src/lib/subscriptions.ts` would be premature — if 3e or another phase
needs them, it can extract then.

No DB migration. No `updated_at` column (per Conor).

## Validation rules

```ts
const PLAN_TIERS = ['starter', 'growth', 'enterprise'] as const;
const STATUSES = ['active', 'churned', 'trial', 'past_due'] as const;
const ACTIONS = ['change_plan', 'cancel'] as const;
```

UUID check: a regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`)
is enough — we're not generating UUIDs, just rejecting obvious garbage before
hitting Supabase. (Postgres would otherwise return `22P02 invalid input syntax`
which surfaces as a generic PostgREST error, not a clean 404.)

For `change_plan`:
- `new_plan_tier` must be in `PLAN_TIERS`.
- If `new_plan_tier === current.plan_tier`, return 200 idempotent (no Supabase
  or Intercom write needed).
- Concurrency guard: scope the UPDATE with `.neq('status', 'churned')` so a
  cancel that lands between SELECT and UPDATE doesn't get clobbered into a
  churned-but-different-plan row. Zero rows affected → 409 conflict.

For `cancel`:
- If `current.status === 'churned'`, return 409.
- Otherwise set `status = 'churned'`. `plan_tier` is left as-is so the demo can
  show what plan they were on when they churned.
- Concurrency guard: `.neq('status', 'churned')` on the UPDATE. Zero rows
  affected → 409.

## Order of operations inside the handler

1. `validateApiKey(request)` → 401 if invalid.
2. Reject if `Content-Type` header isn't `application/json` → 415.
3. Parse JSON body (catch `SyntaxError` → 400).
4. Validate body shape: `company_id` UUID, `action` in set, conditional
   `new_plan_tier`.
5. `createServiceClient()`.
6. SELECT current subscription row + company name by `company_id` → 404 if
   missing.
7. Reject conflicting state pre-flight:
   - `cancel` on already-churned → 409.
   - `change_plan` to current tier → 200 idempotent return (no writes).
8. Compute the patch:
   - `change_plan` → `{ plan_tier: new_plan_tier }`.
   - `cancel` → `{ status: 'churned' }`.
9. UPDATE `subscriptions` with status guard:
   `.update(patch).eq('company_id', id).neq('status', 'churned').select().single()`.
   - On `PGRST116` (no rows): 409 — concurrent mutation.
   - On any other error: 500.
10. Push to Intercom (best effort, 5s timeout via `Promise.race`):
    `intercomRequest('POST', '/companies', { company_id, custom_attributes: { plan_tier, subscription_status } })`.
    On error or timeout: log via `console.error`, set `intercom_synced = false`
    and `intercom_error = err.message`. Do **not** roll back Supabase.
11. Return the success body (full or partial) per the contract above.

### Race conditions considered

- **Concurrent cancel + change_plan to the same company.** Without a guard,
  cancel could land first (status → churned), then change_plan would clobber
  the plan_tier on a churned row. The `.neq('status', 'churned')` guard on the
  UPDATE prevents this — change_plan against an already-churned row affects
  zero rows and returns 409. Two simultaneous cancels: both pass step 7, the
  second's UPDATE matches zero rows (status now churned), returns 409. The
  customer sees one success, one "please retry" — accurate.
- **Intercom drift if push fails after Supabase write.** Intentional, per the
  rollback decision. `npm run sync:intercom` reconciles.
- **Subscription row deleted between SELECT and UPDATE.** No delete path in
  this app. If it ever exists, zero-rows UPDATE → 409 surfaces correctly.

### Idempotency

`change_plan` and `cancel` are state-setting operations: re-running them
against the same final state is a no-op (cancel on churned → 409 is
informative; change_plan to current tier → 200 idempotent). No idempotency
key is needed; Fin retries are safe by construction. Documented in the route
header.

## Test plan (`route.test.ts`)

Mocking strategy:
- `vi.mock('@/lib/intercom', () => ({ intercomRequest: vi.fn() }))`
- `vi.mock('@/lib/supabase', () => ({ createServiceClient: vi.fn() }))` — each
  test composes the mock chain it needs (`from().select().eq().single()` for
  reads, `from().update().eq().select().single()` for writes).
- Auth: tests pass a `Bearer ${INTERCOM_CONNECTOR_API_KEY}` header where the
  env var is set in a `beforeAll`. One negative test omits/garbles it.

Cases — every one in the brief, plus a few drawn from the contract:

1. **`change_plan` happy path** — Supabase update called with `plan_tier`,
   Intercom called with merged custom_attributes, response shape is full
   success.
2. **`cancel` happy path** — Supabase update called with `status: 'churned'`,
   Intercom called, response shape full success.
3. **Invalid plan tier** (`new_plan_tier: 'platinum'`) → 400 with the listed
   message; no Supabase write; no Intercom call.
4. **Cancel on already-cancelled subscription** → 409 "Subscription is already
   cancelled"; no Supabase write; no Intercom call.
5. **Unknown company UUID** (Supabase select returns null) → 404; no Intercom
   call.
6. **Missing/invalid bearer token** → 401, no DB or Intercom calls.
7. **Missing `action`** → 400.
8. **`change_plan` without `new_plan_tier`** → 400.
9. **No-op `change_plan` (same tier)** → 409.
10. **Malformed JSON body** → 400 "Invalid JSON body".
11. **Non-UUID `company_id`** → 400.
12. **Intercom push fails after Supabase succeeds** — Supabase write completes,
    `intercomRequest` rejects, response is 200 partial-success with
    `intercom_synced: false` and `intercom_error` populated. **Verify Supabase
    is NOT rolled back** (no second call to revert).
13. **Supabase update itself fails** → 500 "Failed to update subscription".
14. **Missing/invalid Content-Type** → 415.
15. **Intercom payload assertion** — within case 1 and case 2, assert the
    exact body sent to `intercomRequest`: `{ company_id, custom_attributes: { plan_tier, subscription_status } }`. This is the bug surface that
    matters for the consulting-material angle.
16. **`INTERCOM_CONNECTOR_API_KEY` env var unset** → 401 (production failure
    mode where the deploy is misconfigured).
17. **Concurrent-cancel race / status guard** — simulate the UPDATE returning
    `PGRST116` (zero rows). Expect 409 "Subscription state changed
    concurrently".

(Cases 7, 9, 10, 11, 13–17 go beyond the brief's 8 minimums — they cover the
extra error paths the contract introduces and were called out by the
sub-agent review. Skipping them would leave the contract under-tested.)

## Commit ordering

Targeting roughly:

1. `chore: add vitest test runner` — package.json + vitest.config.ts.
2. `feat: add POST handler for /api/intercom/subscriptions` — the route changes
   only.
3. `test: cover POST /api/intercom/subscriptions` — the test file.
4. `docs: mark phase 3d.1 complete in project plan` — Step 7 (final commit on
   the PR).

Each carries the `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
trailer.

## Out of scope (deliberately)

- Intercom Data Connector configuration (Phase 3d.2, manual).
- End-to-end Fin tests (Phase 3d.3).
- `updated_at` column / migration.
- Extracting plan/status enums to a shared module.
- CI wiring for the new test script.
