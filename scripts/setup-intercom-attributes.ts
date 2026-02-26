import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { intercomRequest } from "../src/lib/intercom";

const attributes = [
  { name: "is_demo", model: "contact", data_type: "boolean" },
  { name: "is_demo", model: "company", data_type: "boolean" },
  { name: "company_role", model: "contact", data_type: "string" },
  { name: "plan_tier", model: "company", data_type: "string" },
  { name: "subscription_status", model: "company", data_type: "string" },
  { name: "billing_cycle", model: "company", data_type: "string" },
];

async function setupAttributes() {
  console.log("🔧 Creating Intercom custom data attributes...\n");

  for (const attr of attributes) {
    try {
      await intercomRequest("POST", "/data_attributes", {
        name: attr.name,
        model: attr.model,
        data_type: attr.data_type,
      });
      console.log(`  ✓ ${attr.model}.${attr.name} (${attr.data_type}) — created`);
    } catch (err: unknown) {
      const error = err as Error & { status?: number; body?: { errors?: { code?: string }[] } };
      // Handle "already exists" gracefully
      if (
        error.status === 409 ||
        error.status === 422 ||
        error.body?.errors?.[0]?.code === "attribute_already_exists" ||
        error.message?.includes("already have") ||
        error.message?.includes("already exists")
      ) {
        console.log(`  ✓ ${attr.model}.${attr.name} (${attr.data_type}) — already exists`);
      } else {
        console.error(`  ✗ ${attr.model}.${attr.name} — ${error.message}`);
      }
    }
  }

  console.log("\n✅ Attribute setup complete");
}

setupAttributes().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
