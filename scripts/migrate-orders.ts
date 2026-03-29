/**
 * Firebase Items -> Supabase orders migration (re-migration)
 *
 * Usage:
 *   pnpm tsx scripts/migrate-orders.ts --dry-run   (default, report only)
 *   pnpm tsx scripts/migrate-orders.ts --live       (execute INSERT + verify)
 *
 * Reads: src/data/firebase-items.json (9,697 records exported in Phase 2)
 * Target: Supabase orders table via service_role client
 *
 * Field mapping follows Cloud Functions (functions/src/index.ts) with one
 * documented deviation:
 *   - mapStatus is type-aware for return items (반품 + progress=1 -> return_completed
 *     instead of "ordered"). There is exactly 1 such edge case.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const LIVE_MODE = process.argv.includes("--live");
const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FirebaseItem {
  id: string;
  type: string | null;
  name: string;
  createdAt: string | null;
  requester: string | null;
  requestQty: string | null;
  companyNm: string | null;
  orderer: string | null;
  orderAt: string | null;
  recievedAt: string | null;
  confirmQty: string | null;
  inspector: string | null;
  progress: number | null;
  hasTS: boolean | null;
  lastEditer: string | null;
  lastEdited: string | null;
}

// ---------------------------------------------------------------------------
// Field transformation helpers (matching Cloud Functions logic)
// ---------------------------------------------------------------------------

/**
 * Parse "2박스" -> { quantity: 2, unit: "박스" }
 * Non-numeric prefix -> { quantity: 0, unit: raw }
 */
function parseQuantityAndUnit(raw: string | null): {
  quantity: number;
  unit: string;
} {
  if (raw == null || raw.trim() === "") return { quantity: 0, unit: "" };
  const str = raw.trim();
  const match = str.match(/^(\d+)\s*(.*)$/);
  if (match) {
    return { quantity: parseInt(match[1], 10), unit: match[2].trim() };
  }
  return { quantity: 0, unit: str };
}

/**
 * Parse confirmed quantity: extract leading integer, null if empty/unparseable.
 */
function parseNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const match = raw.trim().match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Type-aware status mapping.
 *
 * Deviates from Cloud Functions parseStatus for return+progress=1 edge case
 * (1 item) -- using return_completed instead of "ordered" because "ordered"
 * is semantically invalid for a return item.
 */
function mapStatus(type: string | null, progress: number | null): string {
  if (type === "반품") {
    return progress === 0 ? "return_requested" : "return_completed";
  }
  switch (progress) {
    case 1:
      return "ordered";
    case 2:
      return "inspecting";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    LIVE_MODE
      ? "=== LIVE MODE -- will INSERT into orders ==="
      : "=== DRY RUN (default) -- no INSERT ===",
  );
  console.log();

  // ── 1. Load Firebase items ──
  const dataPath = path.resolve(process.cwd(), "src/data/firebase-items.json");
  const items: FirebaseItem[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  console.log(`Source: ${items.length} items from firebase-items.json`);

  // ── 2. Build profile name-to-id mapping ──
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role");

  if (profileError) {
    console.error("Failed to fetch profiles:", profileError.message);
    process.exit(1);
  }

  const nameToId = new Map<string, string>();
  let adminId: string | null = null;

  for (const p of profiles!) {
    if (p.full_name) {
      nameToId.set(p.full_name, p.id);
    }
    if (p.role === "admin" && !adminId) {
      adminId = p.id;
    }
  }

  console.log(
    `Profiles: ${profiles!.length} total, ${nameToId.size} name mappings`,
  );
  console.log(`Admin ID: ${adminId}`);

  if (!adminId) {
    console.error("FATAL: No admin profile found. Cannot proceed.");
    process.exit(1);
  }

  // ── 3. Transform items ──
  const unmatchedNames = new Set<string>();

  const rows = items.map((item) => {
    const { quantity, unit } = parseQuantityAndUnit(item.requestQty);

    // Requester: fallback to admin (always populated, per Cloud Functions)
    let requesterId = item.requester ? nameToId.get(item.requester) : undefined;
    if (!requesterId) {
      if (item.requester) unmatchedNames.add(`requester:${item.requester}`);
      requesterId = adminId!;
    }

    // Orderer -> updated_by: fallback to admin (per Cloud Functions)
    let updatedBy = item.orderer ? nameToId.get(item.orderer) : undefined;
    if (!updatedBy) {
      if (item.orderer) unmatchedNames.add(`orderer:${item.orderer}`);
      updatedBy = adminId!;
    }

    // Inspector -> inspected_by: null if unmatched (per Cloud Functions)
    const inspectedBy = item.inspector
      ? nameToId.get(item.inspector) ?? null
      : null;
    if (!inspectedBy && item.inspector) {
      unmatchedNames.add(`inspector:${item.inspector}`);
    }

    return {
      firebase_id: item.id,
      type: item.type === "반품" ? "return" : "order",
      item_name: item.name,
      quantity,
      unit,
      status: mapStatus(item.type, item.progress),
      vendor_name: item.companyNm ?? "",
      requester_id: requesterId,
      updated_by: updatedBy,
      inspected_by: inspectedBy,
      confirmed_quantity: parseNumber(item.confirmQty),
      invoice_received: item.hasTS === true,
      inspected_at: item.recievedAt || null,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at:
        item.lastEdited || item.createdAt || new Date().toISOString(),
      photo_urls: [],
      is_urgent: false,
      return_quantity: null,
      return_reason: null,
      return_requested_by: null,
      return_requested_at: null,
    };
  });

  // ── 4. Report ──
  console.log();
  console.log("--- Transformation Report ---");

  // Unmatched names
  const sortedUnmatched = [...unmatchedNames].sort();
  if (sortedUnmatched.length > 0) {
    console.log(`\nUnmatched names (${sortedUnmatched.length}):`);
    for (const name of sortedUnmatched) {
      console.log(`  - ${name}`);
    }
  } else {
    console.log("\nAll names matched to profiles.");
  }

  // Type distribution
  const typeCounts: Record<string, number> = {};
  for (const r of rows) {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  }
  console.log("\nType distribution:");
  for (const [t, c] of Object.entries(typeCounts).sort()) {
    console.log(`  ${t}: ${c}`);
  }

  // Status distribution
  const statusCounts: Record<string, number> = {};
  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  console.log("\nStatus distribution:");
  for (const [s, c] of Object.entries(statusCounts).sort()) {
    console.log(`  ${s}: ${c}`);
  }

  // Quantity parse failures
  const zeroQty = rows.filter((r) => r.quantity === 0).length;
  console.log(`\nQuantity=0 (parse failures or empty): ${zeroQty}`);

  // Sample rows
  console.log("\nSample rows (first 3):");
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    console.log(`  [${i + 1}]`, JSON.stringify(rows[i], null, 2));
  }

  // ── 5. Dry-run exit ──
  if (!LIVE_MODE) {
    console.log("\n=== DRY RUN complete. Use --live to execute INSERT. ===");
    return;
  }

  // ── 6. Batch INSERT ──
  console.log(`\n--- Inserting ${rows.length} rows (batch size: ${BATCH_SIZE}) ---`);
  let insertedCount = 0;
  let failedBatches = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchEnd = Math.min(i + BATCH_SIZE, rows.length);
    const { error } = await supabase.from("orders").insert(batch);

    if (error) {
      console.error(`  BATCH FAIL [${i}-${batchEnd}]: ${error.message}`);
      failedBatches++;
    } else {
      insertedCount += batch.length;
      console.log(`  inserted ${insertedCount}/${rows.length}`);
    }
  }

  console.log(`\n--- INSERT complete ---`);
  console.log(`  Inserted: ${insertedCount}`);
  console.log(`  Failed batches: ${failedBatches}`);

  // ── 7. Post-insert verification ──
  console.log("\n--- Post-insert Verification ---");

  // Check 1: Total count
  const { count: totalCount, error: countError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error(`  CHECK 1 ERROR: ${countError.message}`);
  } else {
    const pass1 = totalCount === items.length;
    console.log(
      `  CHECK 1 - Total count: ${totalCount} (expected ${items.length}) ${pass1 ? "PASS" : "FAIL"}`,
    );
  }

  // Check 2: Status distribution
  const { data: statusRows, error: statusError } = await supabase.rpc(
    "get_status_distribution",
  ).catch(() => ({ data: null, error: { message: "RPC not available" } })) as {
    data: Array<{ status: string; count: number }> | null;
    error: { message: string } | null;
  };

  if (statusError || !statusRows) {
    // Fallback: manually verify by querying each status
    console.log("  CHECK 2 - Status distribution (manual query):");
    for (const [expectedStatus, expectedCount] of Object.entries(
      statusCounts,
    ).sort()) {
      const { count, error: sErr } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", expectedStatus);

      if (sErr) {
        console.log(`    ${expectedStatus}: ERROR (${sErr.message})`);
      } else {
        const match = count === expectedCount;
        console.log(
          `    ${expectedStatus}: ${count} (expected ${expectedCount}) ${match ? "PASS" : "FAIL"}`,
        );
      }
    }
  }

  // Check 3: Null requester_ids
  const { count: nullReqCount, error: nullReqError } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .is("requester_id", null);

  if (nullReqError) {
    console.error(`  CHECK 3 ERROR: ${nullReqError.message}`);
  } else {
    const pass3 = nullReqCount === 0;
    console.log(
      `  CHECK 3 - Null requester_id: ${nullReqCount} (expected 0) ${pass3 ? "PASS" : "FAIL"}`,
    );
  }

  console.log("\n=== Migration complete ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
