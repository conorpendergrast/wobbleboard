import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import * as readline from "readline";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { intercomRequest } from "../src/lib/intercom";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

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

async function syncEvents() {
  console.log("🔄 Syncing product events to Intercom...\n");

  // Load events joined with contact emails
  const { data: events, error } = await supabase
    .from("product_events")
    .select("id, event_name, metadata, timestamp, contacts(email)")
    .order("timestamp");

  if (error) throw new Error(`Failed to load events: ${error.message}`);

  // Filter to only events where we have a valid contact email
  const validEvents = events!.filter(
    (e) => (e.contacts as unknown as { email: string })?.email
  );

  console.log(`Total events: ${events!.length}`);
  console.log(`Events with valid contact email: ${validEvents.length}\n`);

  const proceed = await confirm(
    `About to sync ${validEvents.length} events to Intercom. Events are IRREVERSIBLE. Continue? (y/n) `
  );

  if (!proceed) {
    console.log("\n⊘ Aborted.");
    return;
  }

  console.log("\n── Syncing events ─────────────────────────\n");

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < validEvents.length; i++) {
    const event = validEvents[i];
    const email = (event.contacts as unknown as { email: string }).email;

    // Flatten metadata — ensure all values are string, number, or boolean
    const metadata: Record<string, string | number | boolean> = {};
    if (event.metadata && typeof event.metadata === "object") {
      for (const [key, value] of Object.entries(event.metadata as Record<string, unknown>)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          metadata[key] = value;
        } else {
          metadata[key] = String(value);
        }
      }
    }

    try {
      await intercomRequest("POST", "/events", {
        event_name: event.event_name,
        created_at: toUnix(event.timestamp),
        email,
        metadata,
      });
      succeeded++;

      if ((i + 1) % 10 === 0 || i === validEvents.length - 1) {
        console.log(`  [${i + 1}/${validEvents.length}] last: ${event.event_name} → ${email}`);
      }
    } catch (err: unknown) {
      failed++;
      const error = err as Error;
      console.error(`  ✗ ${event.event_name} (${email}) — ${error.message}`);
    }

    // Be kind to the API
    if (i < validEvents.length - 1) {
      await sleep(100);
    }
  }

  console.log("\n── Summary ────────────────────────────────");
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${validEvents.length}`);
  console.log("\n✅ Event sync complete");
}

syncEvents().catch((err) => {
  console.error("❌ Event sync failed:", err);
  process.exit(1);
});
