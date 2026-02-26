import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function reset() {
  console.log("🗑️  Truncating all tables...\n");

  // Truncate in FK-safe order (children first)
  const tables = ["product_events", "subscriptions", "contacts", "companies"];

  for (const table of tables) {
    const { error } = await supabase.rpc("truncate_table", { table_name: table });
    if (error) {
      // Fallback: delete all rows if RPC doesn't exist
      const { error: delErr } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw new Error(`Failed to clear ${table}: ${delErr.message}`);
    }
    console.log(`  ✓ ${table} cleared`);
  }

  console.log("\n🌱 Re-seeding...\n");

  // Dynamically import and run seed
  await import("./seed");
}

reset().catch((err) => {
  console.error("❌ Reset failed:", err);
  process.exit(1);
});
