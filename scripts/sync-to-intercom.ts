import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { intercomRequest } from "../lib/intercom";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

async function sync() {
  console.log("🔄 Syncing Wobbleboard data to Intercom...\n");

  // ─── Load data from Supabase ─────────────────────────────

  const { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .order("created_at");
  if (compErr) throw new Error(`Failed to load companies: ${compErr.message}`);

  const { data: subscriptions, error: subErr } = await supabase
    .from("subscriptions")
    .select("*");
  if (subErr) throw new Error(`Failed to load subscriptions: ${subErr.message}`);

  const { data: contacts, error: conErr } = await supabase
    .from("contacts")
    .select("*")
    .order("signed_up_at");
  if (conErr) throw new Error(`Failed to load contacts: ${conErr.message}`);

  // Index subscriptions by company_id
  const subByCompany = new Map<string, typeof subscriptions[0]>();
  for (const sub of subscriptions!) {
    subByCompany.set(sub.company_id, sub);
  }

  console.log(`Loaded: ${companies!.length} companies, ${contacts!.length} contacts, ${subscriptions!.length} subscriptions\n`);

  // ─── Step 1: Sync companies ──────────────────────────────

  console.log("── Companies ──────────────────────────────");

  // Map: Supabase company UUID → Intercom company ID
  const companyIdMap = new Map<string, string>();
  let companiesSynced = 0;

  for (const company of companies!) {
    const sub = subByCompany.get(company.id);

    try {
      const result = await intercomRequest<{ id: string }>("POST", "/companies", {
        company_id: company.id,
        name: company.name,
        industry: company.industry,
        monthly_spend: company.mrr / 100,
        size: company.employee_count,
        remote_created_at: toUnix(company.created_at),
        custom_attributes: {
          is_demo_company: true,
          ...(sub
            ? {
                plan_tier: sub.plan_tier,
                subscription_status: sub.status,
                billing_cycle: sub.billing_cycle,
              }
            : {}),
        },
      });

      companyIdMap.set(company.id, result.id);
      companiesSynced++;
      console.log(`  ✓ ${company.name} → ${result.id}`);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`  ✗ ${company.name} — ${error.message}`);
    }
  }

  console.log(`\n  Synced: ${companiesSynced}/${companies!.length}\n`);

  // ─── Step 2: Sync contacts ───────────────────────────────

  console.log("── Contacts ───────────────────────────────");

  // Map: Supabase contact UUID → Intercom contact ID
  const contactIdMap = new Map<string, string>();
  let contactsSynced = 0;

  for (const contact of contacts!) {
    const contactPayload = {
      role: "user",
      external_id: contact.id,
      email: contact.email,
      name: `${contact.first_name} ${contact.last_name}`,
      signed_up_at: toUnix(contact.signed_up_at),
      ...(contact.last_active_at
        ? { last_seen_at: toUnix(contact.last_active_at) }
        : {}),
      custom_attributes: {
        is_demo: true,
        company_role: contact.role,
      },
    };

    try {
      const result = await intercomRequest<{ id: string }>("POST", "/contacts", contactPayload);
      contactIdMap.set(contact.id, result.id);
      contactsSynced++;
      console.log(`  ✓ ${contact.first_name} ${contact.last_name} (${contact.email}) → ${result.id}`);
    } catch (err: unknown) {
      const error = err as Error & { status?: number; body?: { errors?: { code?: string; message?: string }[] } };

      // Handle 409 conflict — contact already exists, update instead
      if (error.status === 409) {
        const existingId = error.body?.errors?.[0]?.message?.match(/id=(\w+)/)?.[1];
        if (existingId) {
          try {
            await intercomRequest("PUT", `/contacts/${existingId}`, contactPayload);
            contactIdMap.set(contact.id, existingId);
            contactsSynced++;
            console.log(`  ✓ ${contact.first_name} ${contact.last_name} (${contact.email}) → ${existingId} (updated)`);
            continue;
          } catch (updateErr: unknown) {
            console.error(`  ✗ ${contact.first_name} ${contact.last_name} — update failed: ${(updateErr as Error).message}`);
            continue;
          }
        }
      }

      console.error(`  ✗ ${contact.first_name} ${contact.last_name} — ${error.message}`);
    }
  }

  console.log(`\n  Synced: ${contactsSynced}/${contacts!.length}\n`);

  // ─── Step 3: Attach contacts to companies ────────────────

  console.log("── Attachments ────────────────────────────");

  let attachmentsMade = 0;

  for (const contact of contacts!) {
    const intercomContactId = contactIdMap.get(contact.id);
    const intercomCompanyId = companyIdMap.get(contact.company_id);

    if (!intercomContactId) {
      console.log(`  ⊘ ${contact.first_name} ${contact.last_name} — no Intercom contact ID, skipping`);
      continue;
    }
    if (!intercomCompanyId) {
      console.log(`  ⊘ ${contact.first_name} ${contact.last_name} — no Intercom company ID, skipping`);
      continue;
    }

    try {
      await intercomRequest("POST", `/contacts/${intercomContactId}/companies`, {
        id: intercomCompanyId,
      });
      attachmentsMade++;
      console.log(`  ✓ ${contact.first_name} ${contact.last_name} → ${companyNameFor(contact.company_id)}`);
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`  ✗ ${contact.first_name} ${contact.last_name} — ${error.message}`);
    }
  }

  function companyNameFor(companyId: string): string {
    return companies!.find((c) => c.id === companyId)?.name || companyId;
  }

  console.log(`\n  Attached: ${attachmentsMade}/${contacts!.length}\n`);

  // ─── Summary ─────────────────────────────────────────────

  console.log("── Summary ────────────────────────────────");
  console.log(`  Companies:   ${companiesSynced}/${companies!.length}`);
  console.log(`  Contacts:    ${contactsSynced}/${contacts!.length}`);
  console.log(`  Attachments: ${attachmentsMade}/${contacts!.length}`);
  console.log("\n✅ Sync complete");
}

sync().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
