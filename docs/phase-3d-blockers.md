# Phase 3d.1 — Blockers

Stopping per the "hard rules" in the overnight brief. Two genuine blockers — both are
missing-dependency / ambiguous-requirement issues I can't resolve from the code without
guessing at meaningful infrastructure decisions.

## Blocker 1 — No test framework is installed

The brief mandates "All tests must pass before opening the PR" and lists 8 specific
test cases. The repo has **no test infrastructure**:

- `package.json` has no `test` script.
- No `vitest`, `jest`, `@testing-library/*`, or similar in `dependencies` /
  `devDependencies`.
- No `*.test.ts` / `*.spec.ts` files anywhere in `src/` or `scripts/`.
- No `vitest.config.*`, `jest.config.*`, or equivalent.

Adding test infra is a meaningful decision (framework choice, mocking strategy for
Supabase + Intercom, where tests live, whether they run in CI). The brief explicitly
says "Do not guess."

**Question for Conor:**

1. Should I add **Vitest** (recommended — best Next.js 16 / TS / ESM ergonomics) or
   Jest? Or do you have a preference I should know about?
2. Mocking approach for Supabase: hand-rolled mock of the `createServiceClient`
   chain, or pull in something like `@supabase/supabase-js` mock helpers? My default
   would be a small hand-rolled mock since the surface area is tiny.
3. Mocking approach for Intercom: stub `intercomRequest` via `vi.mock('@/lib/intercom')`?
4. Are tests expected to live next to the route (`route.test.ts`) or under a
   `__tests__` / `tests/` directory?
5. Should `npm test` be wired into anything (CI, pre-commit) as part of this PR, or
   purely local?

Once you answer these I can proceed with the rest of the brief end-to-end.

## Blocker 2 — `wobbleboard-project-plan.md` does not exist in the repo

The brief refers to this file three times as the source of truth for Phase 3d scope
and asks me to update it in Step 7 (mark 3d.1 sub-tasks `[x]`, leave 3d.2/3d.3
unchecked). It is not present:

```
$ find . -maxdepth 3 -iname '*project-plan*' -o -iname '*phase-3*' \
    | grep -v node_modules
(no results)
```

Repo root only contains `README.md` and `CHANGELOG.md`.

**Questions for Conor:**

1. Is the plan stored elsewhere (Notion, a private gist, a sibling repo) and you
   meant to commit it here first? If so, please drop it in the repo root before the
   next overnight run.
2. The "Phase 3d.1 sub-tasks" the brief asks me to tick off — what are they? The
   brief implies a specific checklist that exists in the plan file. Without the
   file I'd be inventing a structure to tick off, which is exactly what the
   "do not guess" rule prohibits.
3. Should I create `wobbleboard-project-plan.md` from scratch as part of this work,
   inferring structure from the existing phase 3a/3b/3c commit history? If yes,
   please confirm — I didn't want to fabricate a project-management artefact under
   your name without sign-off.

## What I did before stopping

I completed enough of Step 1 (Discovery) to write a useful blocker doc. None of this
required code changes; capturing it here so the next session doesn't redo it.

### Existing Intercom client (`src/lib/intercom.ts`)

- Single generic helper `intercomRequest<T>(method, path, body?)`. No dedicated
  "update company attributes" function.
- Uses Intercom API version `2.11`.
- Throws an `Error & { status, body }` on non-2xx; the `errors[0].message` is
  surfaced where Intercom returns one.
- Handles 429 explicitly (throws with reset time) and warns when remaining < 50.
- Returns `{}` for 202 Accepted (events).
- **Reusable pattern for company updates:** `POST /companies` with a `company_id`
  field is upsert in Intercom. `scripts/sync-to-intercom.ts:61` already uses this
  to set `custom_attributes.plan_tier` / `subscription_status`. Phase 3d.1 should
  reuse the same call shape via `intercomRequest`.

### Existing Supabase access (`src/lib/supabase.ts`)

- Only one helper: `createServiceClient()` (service-role key, no session
  persistence). Server-side only. We reuse this for the new POST endpoint's
  writes. There is no separate "writes" client.
- `subscriptions` table consumers today: `src/app/api/intercom/subscriptions/route.ts`
  (GET) and the read-only dashboard pages.

### `subscriptions` table schema (`supabase/migrations/001_initial_schema.sql`)

```sql
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_tier text NOT NULL,        -- 'starter', 'growth', 'enterprise'
  status text NOT NULL,            -- 'active', 'churned', 'trial', 'past_due'
  billing_cycle text,              -- 'monthly', 'annual'
  renewal_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- `plan_tier` and `status` are `text` with comment-only enum hints — **no DB-level
  CHECK constraint**. Validation must live entirely in the route handler.
- `company_id` is `UNIQUE` (one subscription per company) — simplifies lookup.
- No `updated_at` column. We may want to add one as part of 3d.1, or skip it; flag
  for plan review.

### Existing API route patterns (`src/app/api/intercom/*`)

All three current GETs follow the same shape:

1. `validateApiKey(request)` from `@/lib/api-auth` → returns `{ valid, response? }`,
   401 with `{ error: 'Unauthorised' }` on failure.
2. Read query params, return 400 with `{ error: '<param> ... is required' }` if
   missing.
3. `createServiceClient()` for DB access.
4. 404 with `{ error: 'X not found' }` on missing rows.
5. 500 with `{ error: 'Failed to ...' }` on unexpected DB errors (logged via
   `console.error`).
6. Success: bare JSON object (no envelope), e.g.
   `{ company_name, subscription: {...} }`.

### Validation surface for 3d.1

- Valid `plan_tier`: `'starter' | 'growth' | 'enterprise'` (from migration comment).
  No constant exported anywhere — Phase 3d.1 should introduce one (likely in
  `src/lib/subscriptions.ts` or inline in the route, TBD in plan).
- Valid `status`: `'active' | 'churned' | 'trial' | 'past_due'`. Cancellation
  semantics — does "cancel" set status to `'churned'`? The brief doesn't say
  explicitly. **Plan needs to decide.**

### Test patterns

None exist. See Blocker 1.

## Why I'm not proceeding

The brief is unambiguous: "If anything is genuinely blocked (missing dependency,
ambiguous requirement you can't resolve from existing code), stop and write your
question into `docs/phase-3d-blockers.md` on the branch, commit it, and stop. Do
not guess."

I could plausibly press on by (a) installing Vitest with reasonable defaults and
(b) creating the project plan file from inferred structure. Both are guesses about
infrastructure and process you have opinions on — the kind of "do not guess" the
rule is aimed at. Better to wait 8 hours than to land a PR you'll have to undo.

Branch state: `phase-3d-subscription-updates` off `main`, this file is the only
change.
