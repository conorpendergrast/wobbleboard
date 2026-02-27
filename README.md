Wobbleboard is a Next.js application that provides a dashboard for managing employee wellness and benefits engagement. It integrates with Intercom for event tracking and uses Supabase for data persistence.

## Setup

### Prerequisites
- Node.js 18+
- Supabase account and project
- Intercom account with API access

### Environment Variables

Create a `.env.local` file with the following variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
INTERCOM_ACCESS_TOKEN=your-intercom-access-token
INTERCOM_CONNECTOR_API_KEY=your-connector-api-key
```

See `.env.local` for current values.

### Installation & Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
  app/               # Next.js App Router pages and API routes
  components/        # Reusable UI components
  lib/              # Utilities (Supabase, Intercom, formatting)
supabase/
  migrations/       # Database schema and migrations
scripts/            # One-off scripts (seeding, sync, cleanup)
```

## Database

The database contains four main tables:
- **companies** — employers subscribing to Wobbleboard
- **contacts** — people at those companies (with roles: hr_admin, wellness_champion, employee)
- **subscriptions** — one per company (plan tier, billing info, status)
- **product_events** — user activity within the application

All monetary values are in GBP pence. Run `npm run seed` to populate test data.

## API Routes

### GET /api/intercom/subscriptions

Fetches subscription information for a company. Requires authentication via `INTERCOM_CONNECTOR_API_KEY`.

**Query Parameters:**
- `company_id` (required) — UUID of the company

**Request:**
```
GET /api/intercom/subscriptions?company_id=abc123 HTTP/1.1
Authorization: Bearer <INTERCOM_CONNECTOR_API_KEY>
```

**Response (200):**
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

**Error Responses:**
- `400` — Missing or invalid `company_id`
- `401` — Invalid or missing authorization
- `404` — No subscription found for this company

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run seed` — Seed database with test data
- `npm run reset` — Reset database to empty state
- `npm run setup:intercom` — Configure Intercom custom attributes
- `npm run sync:intercom` — Sync companies and contacts to Intercom
- `npm run sync:events` — Sync product events to Intercom
- `npm run cleanup:intercom` — Remove Wobbleboard test data from Intercom
