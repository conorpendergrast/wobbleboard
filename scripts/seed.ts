import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ─── Helpers ───────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
}

// ─── Company data ──────────────────────────────────────────

const companies = [
  {
    name: "Brightpath Logistics",
    industry: "logistics",
    employee_count: 1200,
    mrr: 249900, // £2,499/mo
    created_at: daysAgo(540),
    domain: "brightpath.wobbleboard.example",
    plan_tier: "enterprise" as const,
    status: "active" as const,
    billing_cycle: "annual" as const,
  },
  {
    name: "Fern & Oak Design Studio",
    industry: "creative_agency",
    employee_count: 28,
    mrr: 4900, // £49/mo
    created_at: daysAgo(120),
    domain: "fernandoak.wobbleboard.example",
    plan_tier: "starter" as const,
    status: "trial" as const,
    billing_cycle: "monthly" as const,
  },
  {
    name: "Pennine Financial Services",
    industry: "financial_services",
    employee_count: 450,
    mrr: 89900, // £899/mo
    created_at: daysAgo(400),
    domain: "pennine.wobbleboard.example",
    plan_tier: "growth" as const,
    status: "active" as const,
    billing_cycle: "annual" as const,
  },
  {
    name: "GreenLeaf Healthcare",
    industry: "healthcare",
    employee_count: 800,
    mrr: 149900, // £1,499/mo
    created_at: daysAgo(300),
    domain: "greenleaf.wobbleboard.example",
    plan_tier: "enterprise" as const,
    status: "past_due" as const,
    billing_cycle: "monthly" as const,
  },
  {
    name: "Mosaic Education Trust",
    industry: "education",
    employee_count: 65,
    mrr: 0,
    created_at: daysAgo(200),
    domain: "mosaic.wobbleboard.example",
    plan_tier: "starter" as const,
    status: "churned" as const,
    billing_cycle: "monthly" as const,
  },
];

// ─── Contact data ──────────────────────────────────────────

// British first/last names
const firstNames = [
  "James", "Charlotte", "Oliver", "Amelia", "George", "Isla", "Harry",
  "Emily", "Jack", "Poppy", "Thomas", "Sophia", "William", "Freya",
  "Henry", "Grace", "Edward", "Lily", "Samuel", "Mia", "Daniel",
  "Ava", "Joseph", "Ella", "Benjamin", "Ruby", "Alexander", "Hannah",
  "Matthew", "Chloe", "Priya", "Aisha",
];

const lastNames = [
  "Thompson", "Clarke", "Patel", "Wilson", "Davies", "Brown", "Evans",
  "Roberts", "Johnson", "Walker", "Wright", "Robinson", "Hall", "Green",
  "Adams", "Mitchell", "Campbell", "Phillips", "Carter", "Morris",
  "Turner", "Parker", "Hughes", "Foster", "Bennett", "Gray",
  "Khan", "Ali", "Singh", "O'Brien", "Murphy", "Walsh",
];

// Distribute contacts across companies: larger companies get more
const contactDistribution: { companyIdx: number; role: string }[] = [
  // Brightpath Logistics (1200 employees) — 10 contacts
  { companyIdx: 0, role: "hr_admin" },
  { companyIdx: 0, role: "hr_admin" },
  { companyIdx: 0, role: "wellness_champion" },
  { companyIdx: 0, role: "wellness_champion" },
  { companyIdx: 0, role: "wellness_champion" },
  { companyIdx: 0, role: "employee" },
  { companyIdx: 0, role: "employee" },
  { companyIdx: 0, role: "employee" },
  { companyIdx: 0, role: "employee" },
  { companyIdx: 0, role: "employee" },
  // Fern & Oak (28 employees) — 3 contacts
  { companyIdx: 1, role: "hr_admin" },
  { companyIdx: 1, role: "wellness_champion" },
  { companyIdx: 1, role: "employee" },
  // Pennine FS (450 employees) — 7 contacts
  { companyIdx: 2, role: "hr_admin" },
  { companyIdx: 2, role: "wellness_champion" },
  { companyIdx: 2, role: "wellness_champion" },
  { companyIdx: 2, role: "employee" },
  { companyIdx: 2, role: "employee" },
  { companyIdx: 2, role: "employee" },
  { companyIdx: 2, role: "employee" },
  // GreenLeaf Healthcare (800 employees) — 7 contacts
  { companyIdx: 3, role: "hr_admin" },
  { companyIdx: 3, role: "hr_admin" },
  { companyIdx: 3, role: "wellness_champion" },
  { companyIdx: 3, role: "wellness_champion" },
  { companyIdx: 3, role: "employee" },
  { companyIdx: 3, role: "employee" },
  { companyIdx: 3, role: "employee" },
  // Mosaic Education (65 employees, churned) — 3 contacts
  { companyIdx: 4, role: "hr_admin" },
  { companyIdx: 4, role: "wellness_champion" },
  { companyIdx: 4, role: "employee" },
];

// ─── Event data ────────────────────────────────────────────

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

// ─── Main seed function ────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding Wobbleboard database...\n");

  // 1. Insert companies
  const companyRows = companies.map(({ domain, plan_tier, status, billing_cycle, ...c }) => c);
  const { data: insertedCompanies, error: compErr } = await supabase
    .from("companies")
    .insert(companyRows)
    .select();

  if (compErr) throw new Error(`Companies insert failed: ${compErr.message}`);
  console.log(`✓ ${insertedCompanies!.length} companies inserted`);

  // 2. Insert subscriptions
  const subscriptionRows = companies.map((c, i) => ({
    company_id: insertedCompanies![i].id,
    plan_tier: c.plan_tier,
    status: c.status,
    billing_cycle: c.billing_cycle,
    renewal_date:
      c.status === "churned"
        ? null
        : new Date(Date.now() + randomBetween(30, 365) * 86400000)
            .toISOString()
            .split("T")[0],
    created_at: c.created_at,
  }));

  const { data: insertedSubs, error: subErr } = await supabase
    .from("subscriptions")
    .insert(subscriptionRows)
    .select();

  if (subErr) throw new Error(`Subscriptions insert failed: ${subErr.message}`);
  console.log(`✓ ${insertedSubs!.length} subscriptions inserted`);

  // 3. Insert contacts
  const usedEmails = new Set<string>();
  const usedNames = new Set<string>();
  const contactRows = contactDistribution.map((cd) => {
    let first: string, last: string, fullKey: string;
    do {
      first = pick(firstNames);
      last = pick(lastNames);
      fullKey = `${first}.${last}`;
    } while (usedNames.has(fullKey));
    usedNames.add(fullKey);

    const company = companies[cd.companyIdx];
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@${company.domain}`;

    const signedUpAt = new Date(company.created_at);
    signedUpAt.setDate(
      signedUpAt.getDate() + randomBetween(0, 60)
    );

    return {
      company_id: insertedCompanies![cd.companyIdx].id,
      first_name: first,
      last_name: last,
      email,
      role: cd.role,
      signed_up_at: signedUpAt.toISOString(),
      last_active_at:
        company.status === "churned"
          ? daysAgo(randomBetween(60, 120))
          : daysAgo(randomBetween(0, 14)),
    };
  });

  const { data: insertedContacts, error: conErr } = await supabase
    .from("contacts")
    .insert(contactRows)
    .select();

  if (conErr) throw new Error(`Contacts insert failed: ${conErr.message}`);
  console.log(`✓ ${insertedContacts!.length} contacts inserted`);

  // 4. Insert product events
  // Group contacts by company for event distribution
  const contactsByCompany: Record<number, string[]> = {};
  contactDistribution.forEach((cd, i) => {
    if (!contactsByCompany[cd.companyIdx]) contactsByCompany[cd.companyIdx] = [];
    contactsByCompany[cd.companyIdx].push(insertedContacts![i].id);
  });

  const eventRows: Array<{
    contact_id: string;
    event_name: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }> = [];

  for (let compIdx = 0; compIdx < companies.length; compIdx++) {
    const company = companies[compIdx];
    const companyContacts = contactsByCompany[compIdx] || [];
    if (companyContacts.length === 0) continue;

    // Churned company: events clustered 60-90 days ago, then dropping off
    // Active companies: events spread over last 90 days
    const eventsForCompany =
      company.status === "churned" ? 8 : randomBetween(18, 28);

    for (let e = 0; e < eventsForCompany; e++) {
      const template = pick(eventTemplates);
      const contactId = pick(companyContacts);

      let eventDaysAgo: number;
      if (company.status === "churned") {
        // Cluster events 60-120 days ago
        eventDaysAgo = randomBetween(60, 120);
      } else {
        eventDaysAgo = randomBetween(0, 90);
      }

      eventRows.push({
        contact_id: contactId,
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
    console.log(
      `  ${c.name} — ${sub.plan_tier} (${sub.status})`
    );
  });
  console.log(`\nContacts: ${insertedContacts!.length}`);
  console.log(`Events:   ${insertedEvents!.length}`);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
