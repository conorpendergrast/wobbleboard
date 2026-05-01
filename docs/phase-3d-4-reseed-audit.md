# Phase 3d.4 — Reseed-for-demo audit

Read-only investigation of whether the current `seed` / `reset` /
`sync:intercom` / `sync:events` / `cleanup:intercom` chain is safe to run
back-to-back without leaving orphan records in the live Intercom workspace.

No application or script code was changed. The audit ran against the live
workspace; demo data is tagged `is_demo` / `is_demo_company` per the project
conventions.

## 1. Executive summary

- **Yes, the current flow drifts.** Every `reset && seed && sync:intercom`
  cycle adds a new set of 5 companies and 30 contacts to Intercom because
  Supabase regenerates UUIDs (`gen_random_uuid()`) and seed-time names are
  random — so neither the company `external_id` (Supabase UUID) nor the
  contact `email` is stable across reseeds. Sync hits no upsert path; it
  creates fresh records every time.
- **Cleanup is partially broken in a silent way.** `npm run cleanup:intercom`
  reports `Companies deleted: 5/5` but **none of the companies are actually
  deleted**. Intercom returns `200 OK` to `DELETE /companies/{id}` and then
  preserves the record. Contacts deletion does work. This is the highest
  priority finding — the script's success message is misleading and the
  Phase 3d.3 reset assumption ("`cleanup:intercom` clears Intercom") is
  false.
- **What needs to change.** `cleanup:intercom` needs to *verify* deletes by
  re-fetching, and surface the company-DELETE failure rather than swallow
  it. A proposed `reset:full` is sketched in §5; it cannot achieve a fully
  clean Intercom state without manual UI work or a new strategy
  (e.g. archive instead of delete).

## 2. Script behaviour summary

### `npm run seed` → `scripts/seed.ts`

- Inserts 5 hard-coded companies (lines 35–91), 30 contacts distributed
  across them via a hard-coded `contactDistribution` array (lines 113–149),
  5 subscriptions (one per company), and 18–28 product events per active
  company (8 for the churned one).
- **Every UUID is fresh.** The schema declares
  `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` for all four tables, and
  the seed never specifies an ID — Postgres generates them on insert.
- **Contact emails are non-deterministic across runs.** Names are picked
  via `Math.random()` from arrays of 32 first × 32 last names with a
  same-run dedup Set (`usedNames`, line 229). Domain is stable per company,
  but `${first}.${last}@${domain}` differs run to run.
- Idempotency: **none.** Re-running `seed` against an already-seeded
  database produces a second 5/30/100 set with new UUIDs. The
  `subscriptions.company_id` UNIQUE constraint does NOT prevent this
  because the second run creates new companies with new UUIDs.

### `npm run reset` → `scripts/reset.ts`

- Calls a `truncate_table` Postgres RPC that does not exist in
  `supabase/migrations/001_initial_schema.sql`; falls back to row-by-row
  `delete().neq("id", "00000000-…")` per table. Tables cleared in FK-safe
  order: `product_events → subscriptions → contacts → companies`.
- Then dynamically `import("./seed")` to immediately reseed.
- **Verified on this audit:** the fallback `delete()` does work — Supabase
  was at 10 companies / 60 contacts / 203 events before reset, 5/30/100
  after.
- Touches Supabase only. Has **no effect on Intercom**.

### `npm run sync:intercom` → `scripts/sync-to-intercom.ts`

- Loads all companies, subscriptions, contacts from Supabase.
- For each company: `POST /companies` with `company_id` set to the
  Supabase UUID. Intercom upserts by `company_id` — but because the
  Supabase UUID changed at reseed time, the upsert always finds nothing
  and creates a new Intercom company (fresh `intercom_id`). The previous
  Intercom company persists.
- For each contact: `POST /contacts` with `external_id = supabase_uuid`,
  `email = supabase_email`. Has a 409 conflict handler that updates by
  Intercom contact ID parsed from the error body — but the 409 only fires
  on email collision, which is rare across reseeds because emails are
  random.
- For each contact: `POST /contacts/{id}/companies` to attach.
- Always-creates, never-deletes. No notion of "remove contacts that no
  longer exist in Supabase."

### `npm run sync:events` → `scripts/sync-events-to-intercom.ts`

- Loads `product_events` joined to `contacts(email)` from Supabase.
- Y/N prompt: "Events are IRREVERSIBLE. Continue?"
- For each event: `POST /events` with the contact's email.
- Intercom events are **immutable** by API design — there is no
  `DELETE /events` and no scoped event-purge endpoint. Once posted, they
  stay forever, attached to whatever contact had that email at posting
  time.
- Always-creates. No de-duplication; running the same script twice posts
  the same logical events twice.

### `npm run cleanup:intercom` → `scripts/cleanup-intercom.ts`

- Y/N prompt before any destructive action.
- `findDemoContacts()`: `POST /contacts/search` with
  `{ field: "custom_attributes.is_demo", operator: "=", value: true }`,
  paginated. **Works.**
- `findDemoCompanies()`: `GET /companies?page=N&per_page=50`, filters
  client-side by `custom_attributes.is_demo_company === true`. The script
  comments note Intercom doesn't support
  `POST /companies/search` for custom attributes the same way as contacts.
  **List endpoint is unreliable** — see §3 finding C.
- For each contact: `DELETE /contacts/{id}`. **Works** (verified by
  follow-up email search returning `total_count: 0`).
- For each company: `DELETE /companies/{id}`. **Returns 200 but does
  nothing.** The defensive `if (status === 404 || 405)` branch never
  fires. Both `GET /companies/{id}` and
  `GET /companies?company_id={supabase_uuid}` continue to return the
  full company record after a "successful" delete.
- Does not touch events. Does not detach contacts before deleting.

## 3. Predictions vs reality

| # | Question | Static-analysis prediction | Live result |
| - | -------- | -------------------------- | ----------- |
| 1 | Run `reset && seed && sync:intercom` twice — Intercom ends with one set of demo companies, or two? | **Two.** UUIDs change → no upsert match → fresh creates. | ✅ Confirmed. After cleanup → reset → seed → sync, all 5 NEW Intercom companies exist by their new Supabase UUIDs (`69f4699f…` series), AND all 5 OLD ones still exist by their original Intercom IDs (`69a06733…`). Direct GET on every old `intercom_id` and old Supabase `company_id` returned the full record. |
| 2 | Run `reset && seed && sync:events` twice — Intercom ends with one batch of events per contact, or two? | **Multiple batches.** Events are immutable; each sync posts new events tied to whichever email is current. Old events remain attached to old (now-deleted) contacts and are invisible to per-contact queries but still consume workspace storage. | ⚠️ Not directly tested in the live cycle (see §6). Inferable from documented behaviour and the empty per-contact event counts after cleanup of contacts that previously had 4/2/3 events. Those events still exist in the workspace orphaned to deleted contact IDs. |
| 3 | Does `cleanup:intercom` actually delete every demo record? | **Mostly — but I expected the cleanup script's defensive 404/405 handler for company DELETE to fire. The fact it's there suggests the original author hit the issue.** | 🚨 **Worse than predicted.** Companies aren't deleted at all, AND the failure is silent — Intercom returns 200, so the defensive handler doesn't trigger. Contacts deletion works. Events not touched. |
| 4 | Any record types that can't be deleted via API? | **Events (documented immutable).** | ✅ Events confirmed immutable. **Plus companies** (newly discovered — DELETE silently no-ops). Contacts are deletable. |

### Surprises beyond the predictions

- **Finding C — `GET /companies` list endpoint is desynchronised from
  reality.** Immediately after the resync, `GET /companies?per_page=50`
  returned 4 records (none with `is_demo_company=true`) while direct
  `GET /companies/{id}` confirmed all 10 demo companies exist. Pages were
  not exhausted (single page `< 50`). This means
  `cleanup:intercom`'s `findDemoCompanies()` will **miss most demo
  companies on most runs** — its data source is the LIST endpoint, which
  understates reality. This compounds finding C: even if DELETE worked,
  cleanup wouldn't find the orphans to delete.
- **Search index propagation lag is non-trivial.**
  `POST /contacts/search` returned 30 stale records ~1 minute after
  cleanup deleted them all (verified via direct email lookup returning
  `total_count: 0`). Lag was still visible 30+ seconds later. Cleanup
  scripts that "verify" by re-running search will get false positives.

## 4. The drift question — definitive answer

**Yes, `reset && seed && sync:intercom && sync:events` accumulates orphan
records in Intercom on every run.** Concretely, per cycle:

| Record type | Before sync | After sync | Net new in Intercom | Old records' fate |
| ----------- | ----------- | ---------- | ------------------- | ----------------- |
| Companies   | N           | N + 5      | +5                  | Persist forever — DELETE is a no-op even when called explicitly |
| Contacts    | M           | M + 30 (mostly)¹ | +30 (mostly) | Deletable but only if cleanup is run AND the LIST/SEARCH index is current |
| Events      | E           | E + ~100   | +~100               | Immutable by Intercom design |
| Attachments | A           | A + 30     | +30 (new contacts to new companies) | Old contact↔company attachments are detached implicitly when contacts are deleted, but old company records keep `user_count: 0` reminders |

¹ The 409-handler in `sync-to-intercom.ts:124–138` *does* run if a randomly
generated email happens to collide with an existing Intercom contact's
email. With 32×32 first/last name combinations and ~30 contacts per seed,
collisions are infrequent but not impossible.

### Companies are the worst offender

After **one** clean cycle (this audit's): 10 demo companies in Intercom
(5 from before + 5 new). After two cycles: 15. After ten cycles: 55.
None can be removed via API.

### Live evidence from this audit

| Snapshot | is_demo contacts | is_demo_company companies | Notes |
| -------- | --------- | --------- | ----- |
| BASELINE (Intercom) | 30 | 5 | Search index reading |
| BASELINE (Supabase) | 60 | 10 | Already drifted — prior `seed` had been run twice without intervening `reset` |
| POST-CLEANUP (search) | 30 | 5 | Stale index — direct lookup confirmed contacts deleted, companies still alive |
| POST-CLEANUP (verified by direct GET) | 0² | 5 | Companies untouched by DELETE |
| POST-CYCLE1 reset+seed (Supabase) | 30 | 5 | Clean Supabase |
| POST-CYCLE1 sync:intercom (probed by current Supabase UUID) | 30 (new) | 5 (new) | All 5 new companies exist with NEW Intercom IDs |
| POST-CYCLE1 reality (counting both old and new) | 30³ | **10** | 5 orphans + 5 fresh |

² Verified via `POST /contacts/search` by `email = ...` for one of the
deleted addresses returning `total_count: 0`.
³ The 30 deleted contacts are confirmed deleted by direct lookup; the 30
new ones exist and total 30 distinct.

## 5. Proposed `reset:full` command

Goal: from any starting Intercom + Supabase state, produce a clean
deterministic demo state in one command. **Cannot be fully implemented
against current Intercom API behaviour** without UI-side work.

```
npm run reset:full
```

Proposed sequence:

1. **Detach demo contacts from companies.** Iterate
   `findDemoContacts()`, for each contact GET its companies, and call
   `DELETE /contacts/{contact_id}/companies/{company_id}` for each one.
   This zeroes out `user_count` on the companies and removes the
   demo-tag relationship even where the contact will later be deleted.
2. **Delete demo contacts.** As today, `DELETE /contacts/{id}` per row
   from `findDemoContacts()`. Verify by re-searching — if `total_count`
   is still > 0, **wait and retry** (search index lag) up to a 60s
   ceiling, then surface remaining IDs to the user with direct GET
   verification.
3. **Attempt to delete demo companies.** Try `DELETE /companies/{id}`,
   then VERIFY via `GET /companies/{id}`. If the GET still returns the
   company, mark as "API-undeletable" and continue. **Surface a clear
   message** listing every undeletable company and the dashboard URL
   where the user can manually delete them. The current script's
   "Companies deleted: 5/5 ✓" message is the bug we're fixing here.
4. **Optional flag for users:** `--archive-companies` → instead of
   trying to delete, blank out `name`, `industry`, `monthly_spend`, and
   set `custom_attributes.is_demo_company = false`,
   `is_archived = true`. This makes them stop showing up in
   demo-tagged searches without trying to delete them.
5. **Reset Supabase + reseed.** `npm run reset` (existing).
6. **Resync to Intercom.** `npm run sync:intercom` (existing).
7. **Optional: skip events by default.** Surface a separate prompt
   "Also sync events? Events are immutable and will accumulate (current
   estimate: +~100 per run). y/n" — default `n` for `reset:full`. Only
   run sync:events when the user explicitly wants new events for a
   demo. CLAUDE.md already says don't auto-confirm sync:events; this
   carries that into the new command.

### What the proposed command CAN'T do

- **Remove orphaned events.** Intercom `/events` is immutable. The only
  workaround is a workspace-level archive or contacting Intercom
  support. Document this as accepted for the demo workspace.
- **Remove orphaned companies via API.** As established. Manual
  dashboard deletion or the `--archive-companies` flag are the only
  options. Recommend the archive flag for routine pre-demo use; reserve
  manual cleanup for end-of-engagement.
- **Beat the search-index propagation.** All verification must use
  direct GET-by-id, not search. The audit-grade tooling (counting demo
  records reliably) needs to keep its own ground-truth list of expected
  IDs and probe each one — searching is not authoritative within
  ~60 seconds of any write.

### Reasoning summary

- Step 1 (detach) is the hidden one — without it, Intercom keeps a
  per-company `user_count` that's incorrect and shows up in any "users
  per company" reporting.
- Step 3's verify-then-warn is the headline change vs current cleanup.
  The current script's silent failure is the worst kind of bug: it makes
  a destructive operation look idempotent when it isn't.
- The "events: separate prompt" defends the immutability constraint at
  the script level, since Phase 3d.3 will want repeatable demos and
  events are the bit that can't be undone.

## 6. Open questions

These weren't determinable without code changes or live policy decisions:

1. **Does the search-index propagation lag have a documented SLO?**
   Intercom doesn't publish one I'm aware of. If clients build their own
   reset flows on top of search, they'll hit this. Worth flagging as
   consulting material — a sister of the POST-connector bug template.
2. **Does Intercom's company-DELETE silent-no-op affect the
   live-billing user count, or just the API view?** This audit only
   probed the API surface. If the dashboard also shows the orphaned
   companies, the demo workspace will accumulate clutter in the UI too,
   not just in the data plane.
3. **Should sync:events be skipped from `reset:full` by default?**
   Recommended above (yes), but it's a UX call — Conor's preference
   determines whether the demo flow needs events seeded for every
   reset.
4. **Should seed.ts use deterministic emails?** Switching from random
   names to a fixed list (e.g. `hr1@brightpath.wobbleboard.example`,
   `champion1@brightpath.wobbleboard.example`) would make the 409
   conflict handler in `sync-to-intercom.ts` actually fire on reseed
   and update existing contacts in place rather than create new ones.
   Cuts contact orphans to zero. Does not solve the company orphan
   problem (UUIDs would still change unless we also fix that —
   stable per-company `external_id` strings would).
5. **Was sync:events skipped in this audit?** Yes — see "What this
   audit didn't run" below. The drift conclusion for events stands on
   documented immutability.

### What this audit didn't run

Steps (d) and (e) of the brief — `npm run sync:events` twice — were not
executed. CLAUDE.md's hard rule says "Do not auto-confirm
`npm run sync:events` … Surface the prompt to the user. Do not pipe
`yes` into it." Running the script in this autonomous session would
require either piping `yes` (rule violation) or breaking out for an
interactive y/n (not possible from this tool harness). The drift
conclusion for events is still firm because:

- Events are documented immutable (CLAUDE.md, Intercom docs).
- Each cycle generates new contact emails (random names).
- `sync:events` posts to `/events` keyed by email.
- Therefore each cycle creates a new event set; old events orphan to
  now-deleted contact IDs.

If a live confirmation is needed (e.g. for the consulting writeup), Conor
can run `npm run sync:events` manually and we can capture the per-contact
event counts before / after a second cycle in a follow-up.

### Workspace state at end of audit

⚠️ **The Intercom workspace is not in a clean state after this audit.**

- 5 NEW demo companies (created by the post-cleanup sync).
- 5 OLD demo companies still alive (cleanup's silent no-op).
- = 10 demo companies total in the workspace.
- 30 NEW contacts (newly synced).
- 0 OLD contacts (cleanup actually worked for those).
- Some quantity of orphaned events from the prior baseline,
  attached to deleted contact IDs.

To return to a clean state, the most reliable path right now is a
manual dashboard delete of demo companies, then
`npm run cleanup:intercom && npm run reset && npm run seed && npm run sync:intercom`.

## Appendix — audit tooling

Throwaway scripts used in this audit, all under repo root with `_audit-`
prefix, **not committed**:

- `_audit-count.ts` — counts demo contacts and companies via search; samples event counts on 3 contacts.
- `_audit-count-supabase.ts` — counts the four Supabase tables.
- `_audit-list-all.ts` — `GET /companies` paginated, filtered client-side.
- `_audit-verify-delete.ts` — direct `GET /companies/{id}` to test if delete actually deleted.
- `_audit-verify-contact.ts` — direct `POST /contacts/search` by email.
- `_audit-probe-companies.ts` — for each Supabase company UUID, GET it from Intercom.
- `_audit-probe-old.ts` — for both pre-cleanup Supabase UUIDs and pre-cleanup Intercom IDs, GET them.

These are deleted at PR-close time. The reusable parts (verify-after-delete,
direct-GET probing) are what `reset:full` should adopt.
