# Handoff readiness audit — Wobbleboard for external consultants

**Audit date:** 2026-05-01
**Auditor:** Claude (Sonnet 4.6) via the docs/3d-3-progress-and-handoff PR
**Audit scope:** what does a non-Conor Intercom Fin consultant need, in
order to clone this repo cold and reach a working demo without asking
questions?

This doc is **not** the handoff documentation. It's a scoping report
that becomes the next phase's todo list. It records what's already
adequate, what's missing, and where each gap belongs in the plan.

The audit was done by reading every file in `docs/`, `README.md`,
`CLAUDE.md`, `CHANGELOG.md`, `.env.example`, and the project plan.
Findings are grouped into three layers (setup → operational →
architectural), then collected into a flat gap list at the end.

---

## Layer 1 — Setup

The path from `git clone` to a populated dashboard.

### What's there

- `README.md` — comprehensive. Two parallel paths: a "Setup with Claude
  Code" 8-phase script, and a "Manual setup" longhand version. Both
  cover Node version, Supabase project provisioning, schema apply
  (Option A: SQL editor / Option B: Supabase CLI), Intercom developer
  app creation, scope grant, region selection, connector key
  generation, and per-script verification.
- `.env.example` — template with five variables documented inline.
- The `Setup with Claude Code` section's "Quick checklist (for the
  human)" is the single best artefact in the repo for a first-time
  setup — it tells a consultant exactly what they have to do
  themselves vs. what gets automated.

### What works well

- The README's two-path approach (Claude Code vs. manual) means
  consultants without Claude Code installed are not blocked.
- Intercom region handling is called out explicitly with hostnames per
  region — this is the failure mode that's hardest to diagnose without
  guidance, and it's covered.
- The "Failure recovery" notes in each Claude Code phase translate
  obvious errors back to a specific cause (e.g. `Resource Not Found`
  → region mismatch).

### What's missing or broken

- **`INTERCOM_WORKSPACE_ID` is required by `scripts/cleanup-intercom.ts`
  but is not in `.env.example`, not in `README.md`, and not in the
  `Setup with Claude Code` env-var list.** The cleanup script errors
  out at start with a workspace-id-missing message, but a fresh
  consultant won't have run cleanup yet — they'll find out the hard
  way, days into using the repo. Critical gap. (See "Gaps identified"
  below — `gap-1`.)
- **No guidance on finding the Intercom workspace ID.** It's the
  `app_id` returned by `GET /me` (e.g. `uq9fbojb`), but README doesn't
  point at that. Also visible in dashboard URLs.
- **Vercel deployment runbook is one section of README, very thin.**
  It says "deploy cleanly to Vercel" and "add the same environment
  variables" — but doesn't cover Vercel-specific concerns: project
  settings (build command, output dir — both should be defaults),
  Preview vs. Production env scopes, custom domain attachment,
  environment-variable auditing if rotated. A consultant deploying
  for a client will need more than this.
- **No "I'm using a fresh Intercom workspace, what should it look
  like before I start?" guidance.** Consultants demoing for clients
  may want to use a clean trial workspace; the README assumes
  workspace setup is invisible.
- **Token rotation is intentionally undocumented (see anti-gaps).**
- **Manual setup section is missing the "test the API" cross-link to
  the Setup-with-Claude-Code Phase 8 smoke test** — Phase 8's
  smoke-test curl is correct and well-explained, but the manual
  walkthrough's parallel section just has the curl with less guidance.

### What a consultant has to know that's not in the repo

- They have Vercel access and an Intercom workspace already (these are
  pre-conditions, not described).
- Their Intercom workspace's region.
- That Supabase free-tier projects are paused after a week of inactivity
  — a consultant returning to a demo from cold will hit this.

---

## Layer 2 — Operational

Day-to-day operations once the demo is running.

### What's there

- `npm run reset` + `npm run seed` + `npm run sync:intercom` chain is
  documented in README. PRs #11/#12 made it deterministic and
  idempotent — same five companies, same thirty contacts, same
  Intercom IDs every reseed.
- `npm run cleanup:intercom` is documented. Post-PR #10, output is
  honest about what Intercom won't actually delete (companies are
  soft-deleted; LIST endpoint hides them; manual UI cleanup or support
  ticket are the only recoveries).
- `docs/security-advisories.md` records the one known unfixed npm
  audit advisory (postcss XSS) with exposure analysis.
- `docs/phase-3d-4-reseed-audit.md` is a thorough forensic record of
  why the seed/sync/cleanup chain behaves the way it does.

### What works well

- The standing-rule section of the project plan (just updated in this
  PR) names the canonical pre-demo reset chain.
- The CHANGELOG-style ordering of phase docs gives a consultant
  archaeology — they can read the audit doc and understand what was
  tried and why.

### What's missing or broken

- **Intercom Data Connector configuration in the Intercom UI is
  undocumented.** The repo provides three GET endpoints
  (`subscriptions`, `contact-activity`, `company-engagement`) and one
  POST (`subscriptions`) — but how to wire each one into Intercom as a
  Data Connector (URL field, auth header field, body template, test
  procedure) only exists as the half-finished
  `docs/intercom-api-gotchas.md` template. Phase 3c plan note "TODO:
  Configure 2 new Data Connectors in Intercom + test with Fin" is the
  visible reflection of this gap. Critical for handoff (`gap-2`).
- **Fin procedure configuration in the Intercom UI is undocumented.**
  Configured manually on 2026-05-01 (3d.3 just landed). A consultant
  setting up a demo won't be able to recreate the procedure without
  asking Conor. Critical for handoff (`gap-3`).
- **`docs/intercom-api-gotchas.md` is still the old bug-capture
  template, not the actual gotchas content.** The rename happened in
  3d.4a but the content rewrite is scoped to 3d.4d. A consultant
  opening this file today expects gotchas and finds an empty form
  with placeholder fields. (`gap-4`)
- **Debugging guidance is setup-focused, not runtime-focused.** The
  README's Troubleshooting section covers `Cannot find module 'tsx'`,
  401s on Supabase auth, etc. — but says nothing about debugging
  Fin behaviour ("Fin called the wrong endpoint", "Fin says it
  succeeded but Supabase didn't change", etc.). (`gap-5`)
- **No documentation of what state the Intercom workspace should be
  in between demos.** PR #11 made reseeds idempotent, so the answer
  is now "doesn't matter, just reseed" — but that's a non-obvious
  consequence and worth saying. (`gap-6`)
- **The `phase-3d-*.md` docs are historical work-in-progress notes
  kept for archaeology.** They're visible to a consultant reading
  `docs/`, who has no way to know they're not load-bearing.
  (`gap-7` — small)
- **No e2e test or smoke-test runbook.** The Setup Phase 8 smoke-test
  curl is the closest thing. There's no "run this script monthly to
  prove the demo is still working" artefact. (`gap-8`)

---

## Layer 3 — Architectural

Why is the codebase shaped this way? A consultant modifying things
needs to know the reasoning to avoid breaking working patterns.

### What's there

- `CLAUDE.md` documents codebase conventions (server-only Supabase
  access, server-only Intercom calls via `intercomRequest()`, GBP
  pence integers, bearer auth on routes, scripts in `scripts/`).
- `wobbleboard-project-plan.md` documents most architectural decisions
  via the phase log.
- `docs/phase-3d-4-reseed-audit.md` documents the reasoning behind
  the deterministic UUID strategy, the `remote_created_at` ladder,
  and the discovery of Intercom's soft-delete + LIST visibility
  filter.
- Inline comments in `scripts/seed.ts` explain the SEED_NAMESPACE
  constant and what changing it would do.

### What works well

- The "What this project is" / "Hard rules" / "Codebase conventions"
  structure of `CLAUDE.md` is concise and load-bearing — it's the
  best single doc to send a new consultant before they touch code.
- Inline rationale comments in `seed.ts` (UUIDv5 namespace,
  `created_at` ladder) are well-placed.

### What's missing or broken

- **The "why direct POST instead of a Cloudflare Worker proxy"
  reasoning is documented in 3d.2's plan note and the now-renamed
  gotchas template, but never as a load-bearing architectural decision
  consultants can find from the README or CLAUDE.md.** A consultant
  asked to build a similar integration for a different client will
  reach for the proxy reflexively. (`gap-9`)
- **The "why service-role Supabase client today" decision is implicit
  — only visible in CLAUDE.md as a hard rule and in 3g as a
  to-be-replaced item.** A consultant adding a route will reach for
  `createServiceClient()` without realising it's being phased out.
  (`gap-10`)
- **Sync direction is one-way (Supabase → Intercom) but never stated
  as such in CLAUDE.md or README.** A consultant adding write-back
  from Intercom won't realise they're inverting an architectural
  invariant. (`gap-11`)
- **Schema decisions are documented at the field level in the SQL
  migration but not at the design level.** Why four tables? Why is
  `subscriptions.company_id` UNIQUE (one sub per company)? Why are
  `plan_tier` and `status` text columns with comment-only enum
  hints rather than CHECK constraints? Inline migration comments
  cover the GBP-pence convention but not the broader shape.
  (`gap-12`)
- **The `wobbleboard.example` domain convention isn't called out as
  load-bearing.** A consultant could reasonably swap it for
  `acmecorp.example` to brand a demo, not realising the domain is
  also part of contact-email determinism (PR #11). (`gap-13`)

---

## Gaps identified

Flat list of concrete gaps. Effort estimates assume the work happens
inside a focused half-day session per gap; "small" = ≤30 min, "medium"
= 1–3 h, "large" = full day or multi-PR.

| ID | Gap | Why it matters | Effort | Suggested phase |
| --- | --- | --- | --- | --- |
| gap-1 | `INTERCOM_WORKSPACE_ID` missing from `.env.example`, README, and Setup-with-Claude-Code env list | Cleanup script errors out for any fresh consultant. Critical. | small | **Fast-track** — fix in next PR alongside the rest of the env doc |
| gap-2 | Intercom Data Connector UI configuration is undocumented (the four endpoints — three GET + one POST) | Consultants cannot recreate the live workspace without asking Conor | medium | New phase: 3d.4e — Intercom UI runbook |
| gap-3 | Fin procedure UI configuration is undocumented (just landed in 3d.3, manual UI work) | Consultants cannot recreate the demo's Fin behaviour | medium | New phase: 3d.4e — Intercom UI runbook (paired with gap-2) |
| gap-4 | `docs/intercom-api-gotchas.md` is the old bug-capture template, not gotchas content | Consultants opening the doc see placeholders; this is also where the soft-delete / LIST-filter / search-lag findings should land | medium | Already scoped as 3d.4d |
| gap-5 | Runtime/Fin debugging guidance is missing from README Troubleshooting | Consultants will hit Fin-side issues that look identical to setup issues, and the wrong section will mislead them | medium | New phase: 3d.4e or part of 3d.4d |
| gap-6 | "What state should the Intercom workspace be in between demos" not stated | The post-3d.4b answer is "doesn't matter, just reseed" — non-obvious and worth saying | small | 3d.4e |
| gap-7 | `docs/phase-3d-blockers.md`, `phase-3d-overnight-status.md`, `phase-3d-plan.md` are historical and confuse a fresh reader | Cosmetic, but a consultant treats `docs/` as authoritative | small | Phase 4 (archive into `docs/archive/` or prefix with date) |
| gap-8 | No e2e/smoke-test runbook independent of the README's setup script | Demos that have been quiet for a month need a "is it still working?" check | medium | Phase 4 |
| gap-9 | "Why direct POST, not proxy" architectural rationale isn't load-bearing in any doc | Consultants generalising from this repo will default to proxies unnecessarily | small | 3d.4d (one entry in the gotchas doc) |
| gap-10 | "Why service-role Supabase client today" rationale is implicit | Consultants will reach for it without seeing the 3g phase-out | small | 3g (when service-role gets replaced) |
| gap-11 | One-way sync (Supabase → Intercom) not stated as an invariant | Consultants adding write-back will invert it | small | 3d.4d or `CLAUDE.md` Codebase conventions |
| gap-12 | Schema design rationale (4 tables, UNIQUE on subs, text+comment vs CHECK) not at design level | Consultants extending the schema will hit "why was this done this way" questions | medium | Phase 4 — schema design notes in README "Database" section |
| gap-13 | `wobbleboard.example` email domain convention isn't called out as load-bearing | Consultants rebranding for a client demo could break contact UUID determinism | small | Inline comment in seed.ts + a note in 3d.4d |

### Critical-gap summary (top 3)

1. **gap-1** — `INTERCOM_WORKSPACE_ID` is required but absent from
   every consultant-facing doc. Trivial to fix; consultants will hit
   this within a week of cloning.
2. **gap-2 + gap-3** — The Intercom UI config (Data Connectors, Fin
   procedure) is the part of the demo that lives outside the repo
   entirely. Without a runbook, the demo isn't reproducible. These
   are the largest pieces of missing documentation by surface area.
3. **gap-4** — `docs/intercom-api-gotchas.md` is currently
   misleading. A consultant looking for known gotchas finds an empty
   bug-capture form. Already scoped as 3d.4d but worth fast-tracking.

Suggested fast-track for the next PR: gap-1 (env var) + gap-4 (gotchas
doc rewrite). Both are small-medium and unblock most of the rest.

---

## Anti-gaps (deliberately undocumented)

- **Intercom token rotation procedure.** Per `.env.local` hard rules
  in `CLAUDE.md`, secrets are write-only after creation. Each
  consultant generates and rotates their own token — there's no
  shared rotation procedure to document.
- **Specific Supabase project sizing / billing tier.** The free tier
  is sufficient for the demo's data volume; consultants choosing to
  put a demo on a paid tier are making a billing decision their own
  client owns.
- **CI configuration / GitHub Actions.** The repo has `npm test` and
  the test suite passes locally; there's no CI yet. Adding it is a
  deliberate Phase 4 decision, not an oversight — local-only is
  sufficient while the codebase is single-maintainer.
- **Cloudflare Worker proxy fallback.** Phase 3d.2 verified it's not
  needed. Documenting it as an option would mislead consultants into
  reaching for it for new client work.
- **Multiple-environment patterns (staging vs prod, blue-green
  deploys, etc.).** This is a sales-demo repo, not a production app.
  Documenting deploy patterns it doesn't use would be cargo culting.
- **Per-consultant `INTERCOM_CONNECTOR_API_KEY` rotation.** The key
  is per-deployment, generated once via `openssl rand -hex 32`.
  Rotation is "regenerate, paste into Vercel + the consumer system";
  not interesting enough to document beyond what `.env.example`
  already says.

---

## Surprises noted while reading docs/

- **`docs/intercom-api-gotchas.md` is misnamed-ish.** The rename
  landed in 3d.4a (PR #10) but the content is still the old
  `phase-3d-intercom-post-bugs.md` bug-capture template. Anyone
  opening it expects gotchas and finds empty placeholders. Already
  flagged as gap-4.
- **`docs/phase-3d-blockers.md`** is a 154-line forensic doc from a
  pre-3d.1 session that decided not to proceed. Useful archaeology;
  confusing to a consultant. Also flagged.
- **`docs/phase-3d-plan.md` and `phase-3d-overnight-status.md`** are
  3d.1-specific working notes. Useful provenance; not navigation.
- **README's "Manual setup" section duplicates the
  Setup-with-Claude-Code phases** with slight wording differences.
  Both are correct; the duplication risks drifting on future edits.
  Not a critical gap but worth a Phase 4 audit.
- **`CHANGELOG.md`** stops at `0.1.0` (2026-02-27) and doesn't
  reflect any of the 3d.x work. It's not load-bearing, but if it's
  going to exist it should either be kept current or be replaced by
  the project plan as the canonical record.
- **The plan's Intercom Data Connectors table** at the bottom still
  says "📋 Phase 3d" for the POST connector even though 3d.2 is ✅
  and 3d.3 is ✅. Out of scope for this PR's plan changes per the
  task spec, but worth picking up on the next plan-update PR.
