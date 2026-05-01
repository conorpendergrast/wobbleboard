import { createClient } from "@supabase/supabase-js";
import { v5 as uuidv5 } from "uuid";
import * as dotenv from "dotenv";
import { resolve } from "path";

// ─── Determinism: stable IDs across reseeds ────────────────────────
//
// Company UUIDs are derived deterministically from the company name via
// UUIDv5; contact UUIDs from the contact email. This means re-running
// `npm run seed` against a clean database produces the same UUIDs every
// time, and `sync:intercom` finds and updates the existing Intercom
// records via the `company_id` upsert key (POST /companies) and the
// email-based 409-handler (POST /contacts).
//
// Without this, gen_random_uuid() + random contact emails caused every
// reseed to create fresh Intercom orphans (see
// docs/phase-3d-4-reseed-audit.md). Plus Intercom soft-deletes companies,
// so every reseed left more zombie records behind. This file is the
// canonical fix for that.
//
// Changing SEED_NAMESPACE invalidates every existing demo-state mapping —
// every reseed in every environment will produce a brand-new set of
// Intercom records. Don't change it without a deliberate plan.

export const SEED_NAMESPACE = "7c1e9e2c-2b3f-4f8a-9b5e-1d4f5e6c7a8b";

export function companyId(name: string): string {
  return uuidv5(name, SEED_NAMESPACE);
}

export function contactId(email: string): string {
  return uuidv5(email, SEED_NAMESPACE);
}

// ─── Helpers (random, used for events only) ───────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─── Company seed data ─────────────────────────────────────────────
//
// `created_at` is a single fixed date so Intercom's `remote_created_at`
// (set by sync-to-intercom.ts) is identical and stable across reseeds.

const COMPANY_CREATED_AT = "2024-01-01T00:00:00.000Z";

export interface CompanySeed {
  name: string;
  industry: string;
  employee_count: number;
  mrr: number;
  created_at: string;
  domain: string;
  plan_tier: "starter" | "growth" | "enterprise";
  status: "active" | "trial" | "past_due" | "churned";
  billing_cycle: "monthly" | "annual";
  renewal_date: string | null;
}

export const COMPANIES: CompanySeed[] = [
  {
    name: "Brightpath Logistics",
    industry: "logistics",
    employee_count: 1200,
    mrr: 249900,
    created_at: COMPANY_CREATED_AT,
    domain: "brightpath.wobbleboard.example",
    plan_tier: "enterprise",
    status: "active",
    billing_cycle: "annual",
    renewal_date: "2026-12-31",
  },
  {
    name: "Fern & Oak Design Studio",
    industry: "creative_agency",
    employee_count: 28,
    mrr: 4900,
    created_at: COMPANY_CREATED_AT,
    domain: "fernandoak.wobbleboard.example",
    plan_tier: "starter",
    status: "trial",
    billing_cycle: "monthly",
    renewal_date: "2026-08-15",
  },
  {
    name: "Pennine Financial Services",
    industry: "financial_services",
    employee_count: 450,
    mrr: 89900,
    created_at: COMPANY_CREATED_AT,
    domain: "pennine.wobbleboard.example",
    plan_tier: "growth",
    status: "active",
    billing_cycle: "annual",
    renewal_date: "2027-03-01",
  },
  {
    name: "GreenLeaf Healthcare",
    industry: "healthcare",
    employee_count: 800,
    mrr: 149900,
    created_at: COMPANY_CREATED_AT,
    domain: "greenleaf.wobbleboard.example",
    plan_tier: "enterprise",
    status: "past_due",
    billing_cycle: "monthly",
    renewal_date: "2026-09-15",
  },
  {
    name: "Mosaic Education Trust",
    industry: "education",
    employee_count: 65,
    mrr: 0,
    created_at: COMPANY_CREATED_AT,
    domain: "mosaic.wobbleboard.example",
    plan_tier: "starter",
    status: "churned",
    billing_cycle: "monthly",
    renewal_date: null,
  },
];

// ─── Contact seed data ─────────────────────────────────────────────
//
// Snapshot extracted from the live demo state on 2026-05-01: the
// canonical 30 demo contacts. Names, emails, roles, and company
// assignments are now hard-coded so reseeds produce identical contact
// records. UUIDs are derived from email via UUIDv5 (see contactId()),
// so the email-based 409-handler in sync-to-intercom.ts will fire on
// reseed and update the existing Intercom contact in place.

export interface ContactSeed {
  first_name: string;
  last_name: string;
  email: string;
  role: "hr_admin" | "wellness_champion" | "employee";
  company_name: string;
  signed_up_at: string;
  last_active_at: string;
}

export const CONTACTS: ContactSeed[] = [
  // Brightpath Logistics (10)
  { first_name: "Harry", last_name: "Ali", email: "harry.ali@brightpath.wobbleboard.example", role: "hr_admin", company_name: "Brightpath Logistics", signed_up_at: "2024-11-20T09:51:40.402Z", last_active_at: "2026-04-30T08:51:40.557Z" },
  { first_name: "Priya", last_name: "Roberts", email: "priya.roberts@brightpath.wobbleboard.example", role: "hr_admin", company_name: "Brightpath Logistics", signed_up_at: "2024-12-30T09:51:40.402Z", last_active_at: "2026-04-25T08:51:40.557Z" },
  { first_name: "Amelia", last_name: "Walsh", email: "amelia.walsh@brightpath.wobbleboard.example", role: "wellness_champion", company_name: "Brightpath Logistics", signed_up_at: "2024-11-30T09:51:40.402Z", last_active_at: "2026-04-25T08:51:40.557Z" },
  { first_name: "Joseph", last_name: "Mitchell", email: "joseph.mitchell@brightpath.wobbleboard.example", role: "wellness_champion", company_name: "Brightpath Logistics", signed_up_at: "2024-11-15T09:51:40.402Z", last_active_at: "2026-04-24T08:51:40.557Z" },
  { first_name: "Priya", last_name: "Wright", email: "priya.wright@brightpath.wobbleboard.example", role: "wellness_champion", company_name: "Brightpath Logistics", signed_up_at: "2024-11-29T09:51:40.402Z", last_active_at: "2026-04-29T08:51:40.557Z" },
  { first_name: "Aisha", last_name: "Campbell", email: "aisha.campbell@brightpath.wobbleboard.example", role: "employee", company_name: "Brightpath Logistics", signed_up_at: "2024-11-20T09:51:40.402Z", last_active_at: "2026-04-24T08:51:40.557Z" },
  { first_name: "Emily", last_name: "Gray", email: "emily.gray@brightpath.wobbleboard.example", role: "employee", company_name: "Brightpath Logistics", signed_up_at: "2024-12-01T09:51:40.402Z", last_active_at: "2026-04-28T08:51:40.557Z" },
  { first_name: "James", last_name: "Khan", email: "james.khan@brightpath.wobbleboard.example", role: "employee", company_name: "Brightpath Logistics", signed_up_at: "2024-12-27T09:51:40.402Z", last_active_at: "2026-04-26T08:51:40.557Z" },
  { first_name: "Oliver", last_name: "Foster", email: "oliver.foster@brightpath.wobbleboard.example", role: "employee", company_name: "Brightpath Logistics", signed_up_at: "2024-11-30T09:51:40.402Z", last_active_at: "2026-04-23T08:51:40.557Z" },
  { first_name: "Poppy", last_name: "Turner", email: "poppy.turner@brightpath.wobbleboard.example", role: "employee", company_name: "Brightpath Logistics", signed_up_at: "2024-11-18T09:51:40.402Z", last_active_at: "2026-04-20T08:51:40.557Z" },

  // Fern & Oak Design Studio (3)
  { first_name: "Henry", last_name: "Patel", email: "henry.patel@fernandoak.wobbleboard.example", role: "hr_admin", company_name: "Fern & Oak Design Studio", signed_up_at: "2026-01-14T09:51:40.403Z", last_active_at: "2026-04-23T08:51:40.557Z" },
  { first_name: "Hannah", last_name: "Khan", email: "hannah.khan@fernandoak.wobbleboard.example", role: "wellness_champion", company_name: "Fern & Oak Design Studio", signed_up_at: "2026-01-25T09:51:40.403Z", last_active_at: "2026-04-24T08:51:40.557Z" },
  { first_name: "James", last_name: "Bennett", email: "james.bennett@fernandoak.wobbleboard.example", role: "employee", company_name: "Fern & Oak Design Studio", signed_up_at: "2026-01-08T09:51:40.403Z", last_active_at: "2026-05-01T08:51:40.557Z" },

  // Pennine Financial Services (7)
  { first_name: "Samuel", last_name: "Roberts", email: "samuel.roberts@pennine.wobbleboard.example", role: "hr_admin", company_name: "Pennine Financial Services", signed_up_at: "2025-05-08T08:51:40.403Z", last_active_at: "2026-04-24T08:51:40.557Z" },
  { first_name: "Lily", last_name: "Campbell", email: "lily.campbell@pennine.wobbleboard.example", role: "wellness_champion", company_name: "Pennine Financial Services", signed_up_at: "2025-05-20T08:51:40.403Z", last_active_at: "2026-05-01T08:51:40.557Z" },
  { first_name: "Thomas", last_name: "Walker", email: "thomas.walker@pennine.wobbleboard.example", role: "wellness_champion", company_name: "Pennine Financial Services", signed_up_at: "2025-05-15T08:51:40.403Z", last_active_at: "2026-04-28T08:51:40.557Z" },
  { first_name: "Emily", last_name: "Carter", email: "emily.carter@pennine.wobbleboard.example", role: "employee", company_name: "Pennine Financial Services", signed_up_at: "2025-03-27T09:51:40.403Z", last_active_at: "2026-04-23T08:51:40.557Z" },
  { first_name: "Hannah", last_name: "Clarke", email: "hannah.clarke@pennine.wobbleboard.example", role: "employee", company_name: "Pennine Financial Services", signed_up_at: "2025-05-16T08:51:40.403Z", last_active_at: "2026-04-19T08:51:40.557Z" },
  { first_name: "Harry", last_name: "Phillips", email: "harry.phillips@pennine.wobbleboard.example", role: "employee", company_name: "Pennine Financial Services", signed_up_at: "2025-04-13T08:51:40.403Z", last_active_at: "2026-04-30T08:51:40.557Z" },
  { first_name: "William", last_name: "Hughes", email: "william.hughes@pennine.wobbleboard.example", role: "employee", company_name: "Pennine Financial Services", signed_up_at: "2025-05-18T08:51:40.403Z", last_active_at: "2026-04-22T08:51:40.557Z" },

  // GreenLeaf Healthcare (7)
  { first_name: "Hannah", last_name: "Turner", email: "hannah.turner@greenleaf.wobbleboard.example", role: "hr_admin", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-07-29T08:51:40.403Z", last_active_at: "2026-04-29T08:51:40.557Z" },
  { first_name: "Henry", last_name: "Hall", email: "henry.hall@greenleaf.wobbleboard.example", role: "hr_admin", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-07-05T08:51:40.403Z", last_active_at: "2026-04-19T08:51:40.557Z" },
  { first_name: "Ava", last_name: "Walker", email: "ava.walker@greenleaf.wobbleboard.example", role: "wellness_champion", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-07-19T08:51:40.403Z", last_active_at: "2026-04-24T08:51:40.557Z" },
  { first_name: "Samuel", last_name: "Campbell", email: "samuel.campbell@greenleaf.wobbleboard.example", role: "wellness_champion", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-07-17T08:51:40.403Z", last_active_at: "2026-04-17T08:51:40.557Z" },
  { first_name: "Charlotte", last_name: "Bennett", email: "charlotte.bennett@greenleaf.wobbleboard.example", role: "employee", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-08-21T08:51:40.403Z", last_active_at: "2026-04-18T08:51:40.557Z" },
  { first_name: "Ruby", last_name: "Adams", email: "ruby.adams@greenleaf.wobbleboard.example", role: "employee", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-09-01T08:51:40.403Z", last_active_at: "2026-05-01T08:51:40.557Z" },
  { first_name: "William", last_name: "Adams", email: "william.adams@greenleaf.wobbleboard.example", role: "employee", company_name: "GreenLeaf Healthcare", signed_up_at: "2025-09-01T08:51:40.403Z", last_active_at: "2026-04-28T08:51:40.557Z" },

  // Mosaic Education Trust (3, churned)
  { first_name: "Joseph", last_name: "Clarke", email: "joseph.clarke@mosaic.wobbleboard.example", role: "hr_admin", company_name: "Mosaic Education Trust", signed_up_at: "2025-11-24T09:51:40.403Z", last_active_at: "2026-01-14T09:51:40.557Z" },
  { first_name: "Hannah", last_name: "Wright", email: "hannah.wright@mosaic.wobbleboard.example", role: "wellness_champion", company_name: "Mosaic Education Trust", signed_up_at: "2025-11-27T09:51:40.403Z", last_active_at: "2026-02-19T09:51:40.557Z" },
  { first_name: "Emily", last_name: "Adams", email: "emily.adams@mosaic.wobbleboard.example", role: "employee", company_name: "Mosaic Education Trust", signed_up_at: "2025-10-26T09:51:40.403Z", last_active_at: "2026-01-21T09:51:40.557Z" },
];

// ─── Event templates (event content remains random) ───────────────
//
// Product event content is intentionally NOT deterministic — events
// are immutable in Intercom and out of scope for the reseed orphan fix
// (see project plan 3d.4b non-goals). Subscription IDs and event IDs
// continue to use gen_random_uuid() at the database default.

const eventTemplates = [
  { name: "login", metadata: () => ({}) },
  {
    name: "challenge_created",
    metadata: () => ({
      challenge_type: pick(["steps", "mindfulness", "hydration", "sleep", "cycling"]),
      duration_days: pick([7, 14, 21, 30]),
    }),
  },
  {
    name: "challenge_completed",
    metadata: () => ({
      challenge_type: pick(["steps", "mindfulness", "hydration", "sleep", "cycling"]),
      score: randomBetween(40, 100),
    }),
  },
  {
    name: "employee_invited",
    metadata: () => ({ invite_count: randomBetween(1, 10) }),
  },
  {
    name: "report_exported",
    metadata: () => ({
      report_type: pick(["engagement_summary", "wellness_trends", "challenge_leaderboard"]),
      format: pick(["pdf", "csv"]),
    }),
  },
  {
    name: "wellness_check_completed",
    metadata: () => ({
      mood_score: randomBetween(1, 10),
      energy_level: pick(["low", "moderate", "high"]),
    }),
  },
];

// ─── Main seed function ────────────────────────────────────────────

async function seed() {
  dotenv.config({ path: resolve(__dirname, "../.env.local") });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  console.log("🌱 Seeding Wobbleboard database...\n");

  // 1. Insert companies with deterministic UUIDs.
  const companyRows = COMPANIES.map((c) => ({
    id: companyId(c.name),
    name: c.name,
    industry: c.industry,
    mrr: c.mrr,
    employee_count: c.employee_count,
    created_at: c.created_at,
  }));

  const { data: insertedCompanies, error: compErr } = await supabase
    .from("companies")
    .insert(companyRows)
    .select();

  if (compErr) throw new Error(`Companies insert failed: ${compErr.message}`);
  console.log(`✓ ${insertedCompanies!.length} companies inserted`);

  // 2. Insert subscriptions.
  const subscriptionRows = COMPANIES.map((c) => ({
    company_id: companyId(c.name),
    plan_tier: c.plan_tier,
    status: c.status,
    billing_cycle: c.billing_cycle,
    renewal_date: c.renewal_date,
    created_at: c.created_at,
  }));

  const { data: insertedSubs, error: subErr } = await supabase
    .from("subscriptions")
    .insert(subscriptionRows)
    .select();

  if (subErr) throw new Error(`Subscriptions insert failed: ${subErr.message}`);
  console.log(`✓ ${insertedSubs!.length} subscriptions inserted`);

  // 3. Insert contacts with deterministic UUIDs.
  const companyByName = new Map(COMPANIES.map((c) => [c.name, c]));
  const contactRows = CONTACTS.map((c) => {
    const company = companyByName.get(c.company_name);
    if (!company) {
      throw new Error(`Unknown company in contact seed: ${c.company_name}`);
    }
    return {
      id: contactId(c.email),
      company_id: companyId(company.name),
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      role: c.role,
      signed_up_at: c.signed_up_at,
      last_active_at: c.last_active_at,
    };
  });

  const { data: insertedContacts, error: conErr } = await supabase
    .from("contacts")
    .insert(contactRows)
    .select();

  if (conErr) throw new Error(`Contacts insert failed: ${conErr.message}`);
  console.log(`✓ ${insertedContacts!.length} contacts inserted`);

  // 4. Insert product events (random, scope: out of 3d.4b).
  const contactsByCompany = new Map<string, string[]>();
  for (const c of CONTACTS) {
    const list = contactsByCompany.get(c.company_name) ?? [];
    list.push(contactId(c.email));
    contactsByCompany.set(c.company_name, list);
  }

  const eventRows: Array<{
    contact_id: string;
    event_name: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }> = [];

  for (const company of COMPANIES) {
    const ids = contactsByCompany.get(company.name) ?? [];
    if (ids.length === 0) continue;

    const eventsForCompany = company.status === "churned" ? 8 : randomBetween(18, 28);

    for (let e = 0; e < eventsForCompany; e++) {
      const template = pick(eventTemplates);
      const cid = pick(ids);
      const eventDaysAgo =
        company.status === "churned"
          ? randomBetween(60, 120)
          : randomBetween(0, 90);
      eventRows.push({
        contact_id: cid,
        event_name: template.name,
        metadata: template.metadata(),
        timestamp: daysAgo(eventDaysAgo),
      });
    }
  }

  const { data: insertedEvents, error: evtErr } = await supabase
    .from("product_events")
    .insert(eventRows)
    .select();

  if (evtErr) throw new Error(`Events insert failed: ${evtErr.message}`);
  console.log(`✓ ${insertedEvents!.length} product events inserted`);

  // Summary
  console.log("\n── Seed complete ──────────────────────────");
  console.log("\nCompanies:");
  insertedCompanies!.forEach((c, i) => {
    const sub = insertedSubs![i];
    console.log(`  ${c.name} — ${sub.plan_tier} (${sub.status}) [id ${c.id}]`);
  });
  console.log(`\nContacts: ${insertedContacts!.length}`);
  console.log(`Events:   ${insertedEvents!.length}`);
}

// Only auto-invoke when run directly via tsx — either as `npm run seed`
// (entry: scripts/seed.ts) or via `npm run reset` (entry: scripts/reset.ts,
// which `await import`s this module and relies on its top-level execution).
// Vitest imports this module to test exports — that path must not trigger
// seed().
const isMainEntry =
  typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /(seed|reset)\.(ts|js|cjs|mjs)$/.test(process.argv[1]);

if (isMainEntry) {
  seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
