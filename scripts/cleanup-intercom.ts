import * as dotenv from "dotenv";
import { resolve } from "path";
import * as readline from "readline";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { intercomRequest } from "../src/lib/intercom";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

interface IntercomContact {
  id: string;
  name: string | null;
  email: string | null;
}

interface IntercomCompany {
  id: string;
  name: string;
  company_id: string;
  custom_attributes?: Record<string, unknown>;
}

interface SearchResponse {
  data: IntercomContact[];
  total_count: number;
  pages?: {
    next?: { starting_after?: string } | null;
  };
}

interface CompanyListResponse {
  data: IntercomCompany[];
  total_count: number;
  pages?: {
    next?: string | null;
  };
}

// ─── Search all demo contacts (paginated) ──────────────────

async function findDemoContacts(): Promise<IntercomContact[]> {
  const all: IntercomContact[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const body: Record<string, unknown> = {
      query: {
        field: "custom_attributes.is_demo",
        operator: "=",
        value: true,
      },
      pagination: {
        per_page: 50,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
    };

    const result = await intercomRequest<SearchResponse>("POST", "/contacts/search", body);
    all.push(...result.data);

    const next = result.pages?.next?.starting_after;
    if (!next) break;
    startingAfter = next;
  }

  return all;
}

// ─── Find demo companies ───────────────────────────────────
// Intercom doesn't support POST /companies/search with custom attributes
// in the same way as contacts. We list all and filter client-side.

async function findDemoCompanies(): Promise<IntercomCompany[]> {
  const all: IntercomCompany[] = [];
  let page = 1;

  while (true) {
    const result = await intercomRequest<CompanyListResponse>(
      "GET",
      `/companies?page=${page}&per_page=50`
    );

    const demos = result.data.filter(
      (c) => c.custom_attributes?.is_demo_company === true
    );
    all.push(...demos);

    // If we got fewer than 50, we've reached the last page
    if (result.data.length < 50) break;
    page++;
  }

  return all;
}

// ─── Main cleanup ──────────────────────────────────────────

async function cleanup() {
  console.log("🧹 Intercom cleanup — finding demo data...\n");

  const contacts = await findDemoContacts();
  const companies = await findDemoCompanies();

  console.log(`  Found ${contacts.length} contacts with is_demo = true`);
  console.log(`  Found ${companies.length} companies with is_demo_company = true\n`);

  if (contacts.length === 0 && companies.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  const proceed = await confirm(
    `Found ${contacts.length} contacts and ${companies.length} companies tagged as demo data. Delete all? This cannot be undone. (y/n) `
  );

  if (!proceed) {
    console.log("\n⊘ Aborted.");
    return;
  }

  let contactsDeleted = 0;
  let companiesDeleted = 0;
  let failures = 0;

  // ─── Delete contacts ────────────────────────────────────

  if (contacts.length > 0) {
    console.log("\n── Deleting contacts ──────────────────────");

    for (const contact of contacts) {
      try {
        await intercomRequest("DELETE", `/contacts/${contact.id}`);
        contactsDeleted++;
        console.log(`  ✓ ${contact.name || "unknown"} (${contact.email || contact.id})`);
      } catch (err: unknown) {
        failures++;
        console.error(`  ✗ ${contact.name || contact.id} — ${(err as Error).message}`);
      }
      await sleep(100);
    }
  }

  // ─── Delete companies ───────────────────────────────────

  if (companies.length > 0) {
    console.log("\n── Deleting companies ─────────────────────");

    for (const company of companies) {
      try {
        await intercomRequest("DELETE", `/companies/${company.id}`);
        companiesDeleted++;
        console.log(`  ✓ ${company.name}`);
      } catch (err: unknown) {
        const error = err as Error & { status?: number };
        if (error.status === 404 || error.status === 405) {
          // Company deletion not supported via API
          console.log(`  ⚠ ${company.name} — API deletion not supported, needs manual removal in Intercom dashboard`);
          failures++;
        } else {
          failures++;
          console.error(`  ✗ ${company.name} — ${error.message}`);
        }
      }
      await sleep(100);
    }
  }

  // ─── Summary ────────────────────────────────────────────

  console.log("\n── Summary ────────────────────────────────");
  console.log(`  Contacts deleted:  ${contactsDeleted}/${contacts.length}`);
  console.log(`  Companies deleted: ${companiesDeleted}/${companies.length}`);
  console.log(`  Failures:          ${failures}`);
  console.log("\n✅ Cleanup complete");
}

cleanup().catch((err) => {
  console.error("❌ Cleanup failed:", err);
  process.exit(1);
});
