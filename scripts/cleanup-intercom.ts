import * as dotenv from "dotenv";
import { resolve } from "path";
import * as readline from "readline";

import { intercomRequest } from "../src/lib/intercom";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === "y");
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
  pages?: { next?: { starting_after?: string } | null };
}

interface CompanyListResponse {
  data: IntercomCompany[];
  total_count: number;
  pages?: { next?: string | null };
}

// ─── Search all demo contacts (paginated) ──────────────────────────

export async function findDemoContacts(): Promise<IntercomContact[]> {
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

// ─── Find demo companies ───────────────────────────────────────────
//
// Intercom doesn't support POST /companies/search with custom attributes
// the same way as contacts. We list all and filter client-side.
// The LIST endpoint is known to be desynchronised from direct GET reality;
// see docs/phase-3d-4-reseed-audit.md §3 finding C. Fixing that is out of
// scope for this PR (3d.4a) — this PR only fixes the lying-about-success
// problem on company DELETE.

export async function findDemoCompanies(): Promise<IntercomCompany[]> {
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

    if (result.data.length < 50) break;
    page++;
  }

  return all;
}

// ─── Verify-after-delete for a single company ──────────────────────
//
// Intercom's `DELETE /companies/{id}` returns 200 OK but does NOT
// actually delete the company. The follow-up direct GET reveals the
// truth. See docs/intercom-api-gotchas.md.

export type CompanyDeleteOutcome =
  | { status: "verified-gone"; id: string; name: string }
  | { status: "undeletable"; id: string; name: string }
  | { status: "delete-error"; id: string; name: string; error: string };

export async function deleteAndVerifyCompany(
  company: Pick<IntercomCompany, "id" | "name">
): Promise<CompanyDeleteOutcome> {
  try {
    await intercomRequest("DELETE", `/companies/${company.id}`);
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 404) {
      return { status: "verified-gone", id: company.id, name: company.name };
    }
    return {
      status: "delete-error",
      id: company.id,
      name: company.name,
      error: error.message,
    };
  }

  try {
    await intercomRequest("GET", `/companies/${company.id}`);
    return { status: "undeletable", id: company.id, name: company.name };
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 404) {
      return { status: "verified-gone", id: company.id, name: company.name };
    }
    return { status: "undeletable", id: company.id, name: company.name };
  }
}

// ─── Batch processors ──────────────────────────────────────────────

export interface CompanyDeleteResult {
  apiDeleted: number;
  verifiedGone: number;
  undeletable: { id: string; name: string }[];
  errors: { id: string; name: string; error: string }[];
}

export async function processCompanyDeletes(
  companies: Pick<IntercomCompany, "id" | "name">[],
  opts: { delayMs?: number; onProgress?: (msg: string) => void } = {}
): Promise<CompanyDeleteResult> {
  const result: CompanyDeleteResult = {
    apiDeleted: 0,
    verifiedGone: 0,
    undeletable: [],
    errors: [],
  };

  for (const c of companies) {
    const outcome = await deleteAndVerifyCompany(c);
    if (outcome.status === "verified-gone") {
      result.apiDeleted++;
      result.verifiedGone++;
      opts.onProgress?.(`  ✓ ${c.name} (verified gone)`);
    } else if (outcome.status === "undeletable") {
      result.apiDeleted++;
      result.undeletable.push({ id: c.id, name: c.name });
      opts.onProgress?.(`  ⚠ ${c.name} — API returned 200 but company still exists`);
    } else {
      result.errors.push({ id: c.id, name: c.name, error: outcome.error });
      opts.onProgress?.(`  ✗ ${c.name} — ${outcome.error}`);
    }
    if (opts.delayMs) await sleep(opts.delayMs);
  }
  return result;
}

export interface ContactDeleteResult {
  deleted: number;
  failures: { id: string; identifier: string; error: string }[];
}

export async function processContactDeletes(
  contacts: IntercomContact[],
  opts: { delayMs?: number; onProgress?: (msg: string) => void } = {}
): Promise<ContactDeleteResult> {
  const result: ContactDeleteResult = { deleted: 0, failures: [] };
  for (const contact of contacts) {
    const identifier = contact.email || contact.id;
    try {
      await intercomRequest("DELETE", `/contacts/${contact.id}`);
      result.deleted++;
      opts.onProgress?.(`  ✓ ${contact.name || "unknown"} (${identifier})`);
    } catch (err: unknown) {
      const error = err as Error & { status?: number };
      if (error.status === 404) {
        result.deleted++;
        opts.onProgress?.(`  ✓ ${contact.name || identifier} (already gone)`);
      } else {
        result.failures.push({ id: contact.id, identifier, error: error.message });
        opts.onProgress?.(`  ✗ ${contact.name || identifier} — ${error.message}`);
      }
    }
    if (opts.delayMs) await sleep(opts.delayMs);
  }
  return result;
}

// ─── Reporting ─────────────────────────────────────────────────────

export function dashboardUrl(workspaceId: string, companyId: string): string {
  return `https://app.intercom.com/a/apps/${workspaceId}/companies/${companyId}`;
}

export interface CleanupSummary {
  contactsFound: number;
  contactDeleteResult: ContactDeleteResult;
  companiesFound: number;
  companyDeleteResult: CompanyDeleteResult;
  workspaceId: string | null;
  noUrls: boolean;
}

export function formatSummary(s: CleanupSummary): string {
  const lines: string[] = [];
  lines.push("Cleanup summary:");
  lines.push(
    `  Contacts deleted:        ${s.contactDeleteResult.deleted}/${s.contactsFound} (verified)`
  );
  lines.push(
    `  Companies API-deleted:    ${s.companyDeleteResult.apiDeleted}/${s.companiesFound}`
  );
  lines.push(
    `  Companies actually gone:  ${s.companyDeleteResult.verifiedGone}/${s.companiesFound}`
  );

  if (s.companyDeleteResult.undeletable.length > 0) {
    lines.push("");
    lines.push(
      "  ⚠ Intercom DELETE returns 200 but does not actually delete companies."
    );
    lines.push("    See docs/intercom-api-gotchas.md.");
    lines.push("");
    lines.push(
      `  Manual cleanup needed for these ${s.companyDeleteResult.undeletable.length} companies:`
    );
    for (const c of s.companyDeleteResult.undeletable) {
      if (s.noUrls || !s.workspaceId) {
        lines.push(`    - ${c.id}  (${c.name})`);
      } else {
        lines.push(`    - ${c.id}  (${c.name})  ${dashboardUrl(s.workspaceId, c.id)}`);
      }
    }
  }

  if (s.contactDeleteResult.failures.length > 0 || s.companyDeleteResult.errors.length > 0) {
    lines.push("");
    lines.push("  Errors:");
    for (const f of s.contactDeleteResult.failures) {
      lines.push(`    - contact ${f.identifier} — ${f.error}`);
    }
    for (const e of s.companyDeleteResult.errors) {
      lines.push(`    - company ${e.name} (${e.id}) — ${e.error}`);
    }
  }
  return lines.join("\n");
}

export function isCleanResult(s: CleanupSummary): boolean {
  return (
    s.contactDeleteResult.failures.length === 0 &&
    s.companyDeleteResult.undeletable.length === 0 &&
    s.companyDeleteResult.errors.length === 0
  );
}

// ─── CLI entrypoint ────────────────────────────────────────────────

async function main() {
  dotenv.config({ path: resolve(__dirname, "../.env.local") });

  const args = new Set(process.argv.slice(2));
  const noUrls = args.has("--no-urls");
  const workspaceId = process.env.INTERCOM_WORKSPACE_ID ?? null;
  if (!workspaceId && !noUrls) {
    console.error(
      "❌ INTERCOM_WORKSPACE_ID is not set.\n" +
        "   Set it in .env.local to get clickable Intercom dashboard URLs in cleanup output,\n" +
        "   or run with --no-urls to suppress."
    );
    process.exit(2);
  }

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
    process.exit(2);
  }

  let contactDeleteResult: ContactDeleteResult = { deleted: 0, failures: [] };
  let companyDeleteResult: CompanyDeleteResult = {
    apiDeleted: 0,
    verifiedGone: 0,
    undeletable: [],
    errors: [],
  };

  if (contacts.length > 0) {
    console.log("\n── Deleting contacts ──────────────────────");
    contactDeleteResult = await processContactDeletes(contacts, {
      delayMs: 100,
      onProgress: (m) => console.log(m),
    });
  }

  if (companies.length > 0) {
    console.log("\n── Deleting companies (with verification) ──");
    companyDeleteResult = await processCompanyDeletes(companies, {
      delayMs: 100,
      onProgress: (m) => console.log(m),
    });
  }

  const summary: CleanupSummary = {
    contactsFound: contacts.length,
    contactDeleteResult,
    companiesFound: companies.length,
    companyDeleteResult,
    workspaceId,
    noUrls,
  };

  console.log("\n" + formatSummary(summary));

  const exitCode = isCleanResult(summary) ? 0 : 1;
  console.log(`\nExit code: ${exitCode}`);
  process.exit(exitCode);
}

// Only auto-invoke when run directly (e.g. via `tsx scripts/cleanup-intercom.ts`).
// Vitest imports this module to test exports — that path must not trigger main().
const isMainEntry =
  typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /cleanup-intercom\.(ts|js|cjs|mjs)$/.test(process.argv[1]);

if (isMainEntry) {
  main().catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  });
}
