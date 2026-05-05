# Intercom API gotchas

> **Status:** Stub — full version with examples, reproduction steps,
> and additional findings tracked as Phase 3d.4d in
> `wobbleboard-project-plan.md`. The original bug-capture template
> that lived under this filename is preserved at
> [`docs/archive/intercom-api-gotchas-template.md`](archive/intercom-api-gotchas-template.md).

Documented Intercom API behaviours that surprise developers building
integrations. Four findings from Wobbleboard's Phase 3d work, with
sources from Intercom's own documentation.

## 1. `DELETE /companies/{id}` archives, doesn't hard-delete

The Companies API's delete verb is a soft-delete: the record is
archived and disappears from list responses, but the ID and data are
retained. There is no public hard-delete endpoint; permanent removal
requires a support ticket.

Source: Intercom community discussion on hard-deleting companies,
[community.intercom.com](https://community.intercom.com/).

**Practical implication:** treat company DELETE as a hide operation.
If your integration may re-create a company later, use upserts keyed
on `company_id` so the archived record is reused instead of
duplicated.

## 2. `GET /companies` LIST hides companies failing visibility filters

The list endpoint silently excludes companies where `user_count == 0`
or where `remote_created_at` is null. The records exist and are
reachable by direct GET on the ID, but they will not appear in any
LIST response or in the dashboard's Companies index.

Source: Intercom Help Center, ["People list and company list
explained"](https://www.intercom.com/help/).

**Practical implication:** every company created via API must have
`remote_created_at` set and at least one contact attached, or it
becomes invisible to your own tooling. Wobbleboard's seed sets both
in the same pass for this reason.

## 3. Search-index propagation lag of 60+ seconds

After a successful POST to create or update a contact or company, the
record may not appear in `/contacts/search` or `/companies/search`
results for up to ~60 seconds. A direct GET on the returned ID
succeeds immediately; the search index is eventually consistent.

Source: Wobbleboard's own audit —
[`docs/phase-3d-4-reseed-audit.md`](phase-3d-4-reseed-audit.md).

**Practical implication:** verify writes via direct GET on the ID
returned by the POST, not via search. If you must use search (e.g.
look-up by external_id), retry with backoff up to ~60s before
treating the record as missing.

## 4. Direct POST works cleanly in 2026 (the surprise)

Community posts from 2023–2024 warned that Intercom's Data Connector
POSTs needed a proxy layer to fix URL mangling, double-JSON-encoded
bodies, or missing `Content-Type` headers. None of those failure
modes reproduced during Phase 3d.2's direct POST connector work.

Source: Wobbleboard's Phase 3d.2 verification (no Cloudflare Worker
proxy was added; the connector against `/api/intercom/subscriptions`
works end-to-end).

**Practical implication:** new integrations don't need a proxy by
default. Reach for a Cloudflare Worker only if you hit a specific
reproducible failure on a current Intercom version — and please open
an issue against this repo so this list can be updated.
