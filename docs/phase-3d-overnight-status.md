# Phase 3d.1 — Overnight Status

**PR:** https://github.com/conorpendergrast/wobbleboard/pull/5
**Branch:** `phase-3d-subscription-updates`
**Status:** Ready for review. Tests passing (24/24), lint and build clean.

## What was completed

- Discovery (Step 1, from the prior session): captured in `docs/phase-3d-blockers.md`.
- Implementation plan (Step 2): `docs/phase-3d-plan.md`. Reviewed by sub-agent
  before writing any code.
- `POST /api/intercom/subscriptions` (Step 3): full handler with validation,
  pre-flight conflict checks, status-guarded UPDATE, best-effort Intercom push
  with a 5-second timeout, partial-success response shape per Conor's
  rollback decision. Lives next to the existing GET in
  `src/app/api/intercom/subscriptions/route.ts`.
- Vitest test runner installed: `vitest` devDep, `test` and `test:watch`
  scripts, `vitest.config.ts`, `vitest.setup.ts` for env-var defaults.
- 24 tests in `src/app/api/intercom/subscriptions/route.test.ts` covering all
  cases from the plan (auth, content negotiation, body validation, lookup,
  both happy paths with exact Intercom payload assertions, conflicts including
  both zero-row UPDATE shapes, partial-success with no-rollback verification),
  plus 4 GET smoke tests added during the diff review.
- Small refactor of `src/lib/api-auth.ts` to read
  `INTERCOM_CONNECTOR_API_KEY` per call rather than caching at module load.
  Existing GET behaviour unchanged.
- `wobbleboard-project-plan.md` updated: all seven 3d.1 sub-task bullets
  ticked. 3d.2 and 3d.3 left unchecked as instructed.
- PR opened against `main` with full description, sub-agent findings summary,
  and curl-based testing instructions for every error case.

## Sub-agent reviews and how they were addressed

### Plan review (before implementation)

Adopted: drop the redundant `success: true` envelope; add a Fin-renderable
`message` field; no-op `change_plan` returns 200 idempotent (not 409);
status-guarded UPDATE with `PGRST116` → 409 mapping; 415 for non-JSON
Content-Type; 5-second timeout on the Intercom push; expanded test set to
include the exact Intercom payload, env-unset 401, and the concurrency guard.

Skipped: an explicit body-size limit (over-engineered for a known
single-caller demo endpoint), and a `__tests__/` directory move
(`route.test.ts` co-located is safe — Next.js 16 only treats `route.ts` as a
route handler, confirmed by `npm run build`).

### Diff review (before opening PR)

Caught two **real bugs**:

1. **Zero-row UPDATE crash.** `supabase-js` sometimes signals zero-row
   UPDATE as `{ data: null, error: null }` rather than `PGRST116`. The
   original handler would have accessed `updated.plan_tier` and surfaced as
   an opaque 500 TypeError. Now both branches map to 409 with an explicit
   test for the null/null case.
2. **`setTimeout` leak in `Promise.race`.** The 5-second timeout timer was
   never cleared when `intercomRequest` resolved first. In a serverless
   invocation that can hold the function billable until the timer fires.
   Wrapped in `try/finally` with `clearTimeout`.

Also addressed:
- Strengthened the partial-success test to assert exactly one `.update()`
  call and exactly two `from()` accesses (closing the loophole that the
  previous "no rollback" assertion was vacuous).
- Tightened the `patch` type so a typo'd column name fails to compile.
- Added 4 GET smoke tests since the GET handler's `companies` extraction
  was de-`any`'d for lint.
- Fixed a plan / contract drift (test case 9 in the plan said 409; contract
  and code say 200 idempotent).
- Trimmed two stale comments.

Skipped one nit (defensive array branch in `extractCompanyName` is dead
against this schema's many-to-one FK, but harmless and preserves
robustness if someone later changes the join shape).

## Blockers encountered

Two blockers were surfaced in the **previous** session's
`docs/phase-3d-blockers.md` (no test infra installed; `wobbleboard-project-plan.md`
not in the repo). Both were resolved by Conor before this session resumed.

No new blockers in this session.

## Things Conor should know before reviewing

1. **`api-auth.ts` change is intentional, not drift.** The previous
   `const API_KEY = process.env.INTERCOM_CONNECTOR_API_KEY` pattern only
   reads at module-load. The new per-call read makes the env-unset auth
   path testable and slightly more resilient. No behavioural change for
   the existing GET endpoints, which is locked in by the new GET smoke
   tests.
2. **The route file now has a header comment** explaining why 409 and 415
   are deliberate departures from the GET endpoints' status-code surface.
   Future contributors copying the GET pattern won't accidentally remove
   them.
3. **No live Intercom calls were made** in any of this work. Tests mock
   `intercomRequest` via `vi.mock('@/lib/intercom')`. No ad-hoc curl
   scripts were run against the live workspace. The hard rule held.
4. **Sub-task delivery is honest.** All seven 3d.1 bullets are genuinely
   delivered — the `message` field added during plan review specifically
   addresses bullet 6 ("structured success/error response Fin can render").
5. **PGRST116 mapping is unverified against live Postgres.** The diff
   review flagged this; we now defend against both PGRST116 *and* the
   `data: null, error: null` shape, so behaviour is correct regardless of
   which form supabase-js returns. First time you exercise the
   concurrency case in 3d.2/3d.3 against the live DB, worth confirming
   you see the 409 message.
6. **Existing seed.ts lint warnings predate this work.** They're not
   blocking; flagged in case you want to clean them up separately.
7. **`vitest` install pulled in 9 transitive vulnerability advisories**
   (per `npm install` output). Standard test-tooling dep tree noise; not
   in any production code path. Not addressed tonight.

## Files changed

```
docs/phase-3d-blockers.md                        | (kept from prior session)
docs/phase-3d-plan.md                            | new
docs/phase-3d-overnight-status.md                | new (this file)
package.json + package-lock.json                 | vitest + scripts
vitest.config.ts                                 | new
vitest.setup.ts                                  | new
src/lib/api-auth.ts                              | per-call env read
src/app/api/intercom/subscriptions/route.ts      | POST handler + helpers
src/app/api/intercom/subscriptions/route.test.ts | new (24 tests)
wobbleboard-project-plan.md                      | 3d.1 bullets ticked
```

PR has not been merged. Awaiting your review.
