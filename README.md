# Wobbleboard

Wobbleboard is a Next.js application that provides a dashboard for managing employee wellness and benefits engagement. It integrates with Intercom for event tracking and uses Supabase for data persistence.

This README is written so that a new person, on a new machine, can clone the repo and get a fully working dashboard without any extra help. If you hit a step that doesn't work, the README is wrong — please open an issue or PR.

## What you'll end up with

- A local Next.js dev server on `http://localhost:3000` showing a populated dashboard.
- A Supabase project with four tables (companies, contacts, subscriptions, product_events) and ~30 demo records.
- An Intercom workspace with the same demo companies/contacts/events synced over, plus custom attributes for filtering.
- Three authenticated API endpoints under `/api/intercom/*` that an external system (e.g. Intercom Data Connector) can call.

Estimated time end-to-end: **30–45 minutes**, most of it waiting on Supabase project provisioning.

## Prerequisites

- **Node.js 20.9 or newer.** Next.js 16 will not run on Node 18. Check with `node --version`. If you use `nvm`, run `nvm install 20 && nvm use 20`.
- **npm 10+** (ships with Node 20).
- **Git.**
- A free [**Supabase**](https://supabase.com) account.
- An [**Intercom**](https://www.intercom.com) account where you have admin rights (a free trial workspace works). Your Intercom workspace must be in the **US region** by default — see [Intercom region](#intercom-region-eu--au-workspaces) below if yours is EU or AU.

## 1. Clone and install

```bash
git clone https://github.com/conorpendergrast/wobbleboard.git
cd wobbleboard
npm install
```

## 2. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and click **New project**. Pick any name and region; the free tier is fine.
2. Wait for provisioning to finish (~2 minutes).
3. In **Project Settings → API**, copy:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`.
   - **service_role** secret (under "Project API keys") → this is `SUPABASE_SERVICE_ROLE_KEY`. Keep it private — never commit it or expose it in client-side code.

### Apply the database schema

The schema lives in [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql). You have two options:

**Option A — Supabase SQL Editor (easiest, no extra tools).**

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Copy the full contents of `supabase/migrations/001_initial_schema.sql` into the editor.
3. Click **Run**. You should see "Success. No rows returned."
4. Verify under **Table Editor** that you now have `companies`, `contacts`, `subscriptions`, and `product_events`.

**Option B — Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # the 20-char ID in your dashboard URL
npx supabase db push
```

## 3. Create an Intercom developer app and access token

`INTERCOM_ACCESS_TOKEN` is a server-side token that lets the sync scripts and (future) API code call Intercom. Get it like this:

1. Go to <https://app.intercom.com/a/developer-signup> and create a developer workspace, **or** use an existing workspace where you're an admin.
2. In Intercom, open **Settings → Integrations → Developer Hub → New app**.
3. Name the app something like "Wobbleboard local" and pick your workspace as the home workspace.
4. Open the new app's **Authentication** tab and copy the **Access Token**. This is `INTERCOM_ACCESS_TOKEN`.
5. Under the app's **Permissions** tab, grant at least: read/write contacts, read/write companies, write events, read/write data attributes.

### Intercom region (EU / AU workspaces)

`src/lib/intercom.ts` hardcodes `https://api.intercom.io`, which is the **US** region. If your workspace is in the EU or Australia, edit that constant before running any sync scripts:

- EU: `https://api.eu.intercom.io`
- AU: `https://api.au.intercom.io`

## 4. Generate your connector API key

`INTERCOM_CONNECTOR_API_KEY` is **not** issued by Intercom — it's a secret you generate and share with any external system that calls the `/api/intercom/*` endpoints (e.g. Intercom's Data Connector). Generate one with:

```bash
openssl rand -hex 32
```

Save the output. You'll paste it into `.env.local` next.

## 5. Configure environment variables

Copy the template and fill in the four values you collected above:

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret from step 2>
INTERCOM_ACCESS_TOKEN=<access token from step 3>
INTERCOM_CONNECTOR_API_KEY=<the openssl output from step 4>
```

`.env.local` is gitignored — never commit it. All four variables are required; missing any of them will cause the dev server or scripts to fail with a non-null-assertion error at startup.

## 6. Seed the database with demo data

```bash
npm run seed
```

You should see five companies, ~30 contacts, and ~100 product events inserted. If this fails with an auth error, your `SUPABASE_SERVICE_ROLE_KEY` is wrong (you may have copied the `anon` key by mistake).

## 7. Set up Intercom custom attributes and sync

Run these in order — `setup:intercom` must finish before any `sync:*` script, because the sync writes into custom attributes that don't exist yet.

```bash
npm run setup:intercom    # creates is_demo, plan_tier, etc. on contacts and companies
npm run sync:intercom     # uploads companies and contacts, attaches contacts to companies
npm run sync:events       # uploads product events (asks for confirmation; events are not deletable)
```

Re-running `setup:intercom` is safe — already-existing attributes are skipped. Re-running `sync:intercom` updates existing records by email/external_id rather than creating duplicates.

To wipe everything you uploaded to Intercom (only deletes records tagged `is_demo` / `is_demo_company`):

```bash
npm run cleanup:intercom
```

> Note: Intercom's API does not support deleting companies. The cleanup script will warn for any companies that need to be removed manually from the Intercom dashboard.

## 8. Start the dev server

```bash
npm run dev
```

Open <http://localhost:3000>. You should see:

- The Dashboard page with stat cards showing 5 companies, ~30 contacts, ~100 events, and a non-zero MRR figure.
- A "Recent activity" feed populated with events.
- Working `/companies` and `/contacts` pages in the sidebar.

### Smoke-test the API

In a second terminal, with the dev server running:

```bash
# Pick any company UUID from your Supabase companies table
COMPANY_ID=<paste-uuid-here>
KEY=<your INTERCOM_CONNECTOR_API_KEY>

curl -s -H "Authorization: Bearer $KEY" \
  "http://localhost:3000/api/intercom/subscriptions?company_id=$COMPANY_ID" | jq
```

A 200 response with a `subscription` object means the full stack is wired up correctly. A 401 means your bearer token doesn't match the env variable. A 404 means the company UUID is wrong or has no subscription row.

## Project structure

```
src/
  app/               Next.js App Router pages and API routes
  components/        Reusable UI components (sidebar, cards, badges, shadcn/ui primitives)
  lib/               Utilities (Supabase client, Intercom client, formatting, API auth)
supabase/
  migrations/        Database schema — apply manually to a new Supabase project
scripts/             One-off TypeScript scripts run with tsx (seed, reset, Intercom sync/cleanup)
public/              Static assets
```

## Database

All four tables live in `supabase/migrations/001_initial_schema.sql`:

- **companies** — employers subscribing to Wobbleboard.
- **contacts** — people at those companies, with roles `hr_admin`, `wellness_champion`, or `employee`.
- **subscriptions** — one per company. Plan tiers: `starter`, `growth`, `enterprise`. Statuses: `active`, `churned`, `trial`, `past_due`.
- **product_events** — user activity (`login`, `challenge_created`, `report_exported`, etc.) with JSONB metadata.

All monetary values (`companies.mrr`) are in **GBP pence**. £1,499/month is stored as `149900`.

## API routes

All three routes require a `Authorization: Bearer <INTERCOM_CONNECTOR_API_KEY>` header.

### `GET /api/intercom/subscriptions`

Fetches subscription information for a company.

| Param        | Type | Required | Description           |
| ------------ | ---- | -------- | --------------------- |
| `company_id` | UUID | yes      | UUID of the company.  |

Response (200):
```json
{
  "company_name": "Acme Corp",
  "subscription": {
    "plan_tier": "growth",
    "status": "active",
    "billing_cycle": "monthly",
    "renewal_date": "2026-03-27"
  }
}
```

Errors: `400` missing `company_id`, `401` bad/missing auth, `404` no subscription for that company.

### `GET /api/intercom/contact-activity`

Fetches a contact's recent product activity.

| Param   | Type   | Required | Description                                |
| ------- | ------ | -------- | ------------------------------------------ |
| `email` | string | yes      | Email address of the contact in Wobbleboard. |

Response (200):
```json
{
  "contact_name": "Charlotte Davies",
  "company_name": "Pennine Financial Services",
  "role": "hr_admin",
  "last_active_at": "2026-04-25T10:13:00.000Z",
  "total_events": 14,
  "recent_events": [
    { "event_name": "challenge_created", "timestamp": "2026-04-25T10:13:00.000Z", "metadata": { "challenge_type": "steps", "duration_days": 14 } }
  ]
}
```

Errors: `400` missing `email`, `401` bad/missing auth, `404` contact or company not found, `500` query error.

### `GET /api/intercom/company-engagement`

Fetches 30-day engagement stats for a company.

| Param        | Type | Required | Description           |
| ------------ | ---- | -------- | --------------------- |
| `company_id` | UUID | yes      | UUID of the company.  |

Response (200):
```json
{
  "company_name": "Pennine Financial Services",
  "total_contacts": 7,
  "active_contacts_30d": 5,
  "total_events_30d": 22,
  "last_event_at": "2026-04-25T10:13:00.000Z",
  "top_events": [
    { "event_name": "login", "count": 9 },
    { "event_name": "challenge_completed", "count": 6 },
    { "event_name": "wellness_check_completed", "count": 4 }
  ]
}
```

Errors: `400` missing `company_id`, `401` bad/missing auth, `404` company not found, `500` query error.

## Scripts

| Command                     | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `npm run dev`               | Start the Next.js dev server on port 3000.                    |
| `npm run build`             | Production build.                                             |
| `npm run start`             | Run the production build (after `npm run build`).             |
| `npm run lint`              | Run ESLint.                                                   |
| `npm run seed`              | Insert demo companies, contacts, subscriptions, and events into Supabase. |
| `npm run reset`             | Delete all rows from the four tables, then re-seed.           |
| `npm run setup:intercom`    | Create the custom data attributes the sync scripts depend on. |
| `npm run sync:intercom`     | Push companies and contacts to Intercom.                      |
| `npm run sync:events`       | Push product events to Intercom (interactive confirmation; events cannot be deleted via API). |
| `npm run cleanup:intercom`  | Delete demo contacts and (where possible) companies from Intercom. |

## Troubleshooting

- **`Cannot find module 'tsx'` when running scripts.** You skipped `npm install`, or installed against a different Node version. Re-run `npm install` after switching to Node 20+.
- **`SUPABASE_SERVICE_ROLE_KEY is not set` or `process.env.X!` non-null errors.** `.env.local` is missing or one of the four variables is blank. Compare your file against `.env.example`.
- **Seed script reports `relation "companies" does not exist`.** You haven't applied the migration in step 2. Open the SQL editor and run `001_initial_schema.sql`.
- **`npm run reset` logs a `truncate_table does not exist` error before each table.** Harmless. The script falls back to row-by-row delete when the optional `truncate_table` Postgres function isn't installed. Reset still works.
- **Intercom sync fails with 401.** Your `INTERCOM_ACCESS_TOKEN` is wrong, or the developer-hub app doesn't have the required scopes (read/write contacts, companies, events, data attributes).
- **Intercom sync fails with `Resource Not Found` from `api.intercom.io`.** Your workspace is in the EU or AU region. See [Intercom region](#intercom-region-eu--au-workspaces).
- **API route returns 401 even with the key.** The header must be exactly `Authorization: Bearer <key>` (not `Token <key>`, not `apikey`).

## Security notes

- The `service_role` Supabase key bypasses Row Level Security. Only ever use it server-side. The current codebase only references it from server components, route handlers, and Node scripts — keep it that way.
- `INTERCOM_CONNECTOR_API_KEY` protects the public API routes. Treat it like a password, rotate it if leaked, and never check `.env.local` into git.

## Deployment

The app is a standard Next.js 16 application and deploys cleanly to Vercel. After importing the repo:

1. Add the same four environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERCOM_ACCESS_TOKEN`, `INTERCOM_CONNECTOR_API_KEY`) in the Vercel project settings.
2. Deploy. The schema and seed scripts are not run automatically — apply the migration to your production Supabase project manually, and only run `npm run seed` against production if you actually want demo data there.
