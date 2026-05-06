# Phase 3g — Supabase exposure audit

**Audit date:** 2026-05-06
**Auditor:** Claude (Opus 4.7) via the `phase-3g-discovery` branch
**Trigger:** Supabase security email warning that all four tables in
the Wobbleboard project are "publicly accessible" because Row Level
Security is not enabled.

This is a read-only static audit. No code, config, or Supabase
settings were changed. The single question being answered: **is the
Supabase anon key reachable from client-side / browser-side code, and
if so, where?**

## Executive summary

- **No.** The Supabase anon key is not reachable from any client-side
  code path in this repo. It is not configured as an env var, not
  referenced in any source file, and no Supabase client is
  instantiated with it.
- **Recommended remediation: Degree 1.** Enable RLS on all four
  tables in the Supabase dashboard. No code changes required.
- **Risk if Degree 1 ships alone:** effectively zero. Service-role
  client bypasses RLS, so every existing API route, server component,
  and script keeps working. Anon-key access is blocked by RLS, which
  is moot because nothing in this repo issues anon-key requests
  anyway. Degree 1 closes the warning Supabase emailed about and
  costs one dashboard toggle per table.

## Client-side Supabase usage inventory

Every "use client" component in the codebase, with their relationship
to Supabase:

| File | Type | Supabase client | What it queries |
| --- | --- | --- | --- |
| `src/components/sidebar-nav.tsx` | "use client" | none | nothing — pure UI |
| `src/components/ui/table.tsx` | "use client" | none | nothing — shadcn/ui table primitives |

**Findings:** Two client components exist. Neither imports
`@supabase/supabase-js`, neither imports `@/lib/supabase`, neither
references any `SUPABASE_*` env var. There is zero client-side
Supabase surface area.

## Server-side Supabase usage inventory

Every file that instantiates a Supabase client, plus every server
component that queries one:

| File | Type | Client | Key used |
| --- | --- | --- | --- |
| `src/lib/supabase.ts` | server-only factory | `createServiceClient()` exports | `SUPABASE_SERVICE_ROLE_KEY` |
| `src/app/page.tsx` | server component (default) | via `createServiceClient()` | service-role |
| `src/app/companies/page.tsx` | server component | via `createServiceClient()` | service-role |
| `src/app/companies/[id]/page.tsx` | server component | via `createServiceClient()` | service-role |
| `src/app/contacts/page.tsx` | server component | via `createServiceClient()` | service-role |
| `src/app/contacts/[id]/page.tsx` | server component | via `createServiceClient()` | service-role |
| `src/app/api/intercom/subscriptions/route.ts` | route handler (GET + POST) | via `createServiceClient()` | service-role |
| `src/app/api/intercom/contact-activity/route.ts` | route handler (GET) | via `createServiceClient()` | service-role |
| `src/app/api/intercom/company-engagement/route.ts` | route handler (GET) | via `createServiceClient()` | service-role |
| `scripts/seed.ts` | Node script (tsx) | direct `createClient()` | service-role |
| `scripts/reset.ts` | Node script (tsx) | direct `createClient()` | service-role |
| `scripts/sync-to-intercom.ts` | Node script (tsx) | direct `createClient()` | service-role |
| `scripts/sync-events-to-intercom.ts` | Node script (tsx) | direct `createClient()` | service-role |

All four API routes use the service-role client. All five page
components are server components (no "use client" directive) and
query Supabase server-side via `createServiceClient()`. All four
scripts run under Node via `tsx` and use the service-role key
directly.

## Configuration audit

### NEXT_PUBLIC_* env vars touching Supabase

Only one: `NEXT_PUBLIC_SUPABASE_URL`.

| Var | Used in | Bundled to client? | Sensitivity |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/supabase.ts`, `scripts/seed.ts`, `scripts/reset.ts`, `scripts/sync-to-intercom.ts`, `scripts/sync-events-to-intercom.ts` | yes (Next.js inlines all `NEXT_PUBLIC_*` into client bundles at build time) | not a credential — public-facing project URL like `https://xxxx.supabase.co` |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is **not** present in `.env.example`,
not in any source file, not in `README.md` setup, not in
`CLAUDE.md`'s setup verifications, not in
`wobbleboard-project-plan.md`. The anon key is mentioned only twice
in docs, both as warnings about pasting it into the wrong field by
mistake — never as a configured value.

`SUPABASE_SERVICE_ROLE_KEY` is **not** prefixed with `NEXT_PUBLIC_`,
so Next.js does not bundle it into client code. It is only available
to server components, route handlers, and Node scripts.

### Build-output exposure

I did not run `npm run build` (out of scope for read-only discovery).
The static evidence is sufficient: Next.js's documented behaviour is
that only `NEXT_PUBLIC_*`-prefixed vars are inlined into client
bundles. Since no anon-key var is configured at all, there is nothing
for the build to expose. The URL is bundled but is not a credential.

### What gets shipped to the browser

Pages render server-side, so the Supabase responses (rows from
`companies`, `contacts`, etc.) reach the browser as already-rendered
HTML/RSC payloads — not as queryable Supabase clients. There is no
way for a browser-side script in this app to construct a Supabase
client and issue a query, because the codebase never sets up the
machinery to do so.

## Recommended remediation

**Degree 1: Enable RLS on all four tables in the Supabase dashboard.
No code changes.**

Justification:
1. The Supabase warning is correct in principle (RLS is off) but
   describes a risk that is not exercised by this app. There is no
   anon-key code path, so "publicly accessible via anon" is a
   theoretical attack surface, not an actual one.
2. The service-role client bypasses RLS unconditionally. Enabling
   RLS without writing any policies will not break a single query
   in this codebase, because every query goes through service-role.
3. Degree 2 (RLS + policies) and Degree 3 (anon + RLS + scoped JWTs)
   are the right destinations eventually — Degree 3 is already
   tracked as the rest of Phase 3g — but they are not what closes
   this Supabase warning. Degree 1 closes it with a one-click change
   per table.

Degree 1 is the minimum that makes Supabase's warning go away
honestly (RLS is now on, the dashboard reflects it, the warning
condition is resolved) without inviting code changes that risk
breaking working paths under demo time pressure.

## Risks and unknowns

- **Build output not inspected.** I did not run `npm run build` to
  grep the resulting `.next/` chunks for any leaked secret string.
  The static evidence is strong enough that I expect a build grep to
  confirm "service-role key not present in client chunks", but I
  cannot prove that without running the build. Treat as a final
  verification step before/after enabling RLS.
- **Supabase dashboard state not inspected.** I did not log into
  Supabase to confirm RLS is in fact disabled on all four tables, or
  to confirm no other policies / triggers / functions are quietly
  granting anon access. The audit assumes the warning email is
  accurate.
- **No migration tracks RLS state.** The schema migration at
  `supabase/migrations/001_initial_schema.sql` does not enable RLS.
  When Phase 3g actually lands, the RLS-enable should be captured as
  a numbered migration so a fresh consultant cloning the repo gets
  the same security posture as production. (This is not blocking for
  Degree 1; the dashboard toggle fixes prod, and a follow-up
  migration can codify it.)
- **Future client components could regress this.** Today, no client
  component touches Supabase. A consultant adding interactive UI
  (Phase 3e: frontend edit functionality) might reach for
  `createBrowserClient()` with an anon key, which would re-open the
  exposure that Degree 1 papers over. Worth noting in `CLAUDE.md`
  before Phase 3e starts.
- **`NEXT_PUBLIC_SUPABASE_URL` is bundled to the client.** It is not
  a credential, but it does identify the Supabase project. Combined
  with a leaked anon key from any source (a future regression, a
  consultant's local `.env.local`, etc.), it would be enough to
  query the project. This is the standard Supabase setup and not
  worth changing — just worth knowing it is the case.
