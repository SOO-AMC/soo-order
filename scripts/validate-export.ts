/**
 * Validate exported Firebase Items JSON for migration readiness
 *
 * Input: src/data/firebase-items.json
 * Output: Console validation report with PASS/WARN/FAIL verdict
 *
 * Usage: npx tsx scripts/validate-export.ts
 * Exit code: 0 = PASS or WARN, 1 = FAIL
 */

import * as fs from "fs";
import * as path from "path";

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

const PREVIOUS_COUNT = 9378;
const INPUT_PATH = path.resolve(process.cwd(), "src/data/firebase-items.json");

function pct(count: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((count / total) * 100).toFixed(1) + "%";
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`File not found: ${INPUT_PATH}`);
    console.error("Run export-items.ts first.");
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  const items: FirebaseItem[] = JSON.parse(raw);

  console.log("=== Firebase Items Export Validation Report ===\n");

  // 1. Total count and comparison
  const currentCount = items.length;
  const diff = currentCount - PREVIOUS_COUNT;
  const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
  console.log(`1. Total Count`);
  console.log(`   Previous: ${PREVIOUS_COUNT.toLocaleString()}`);
  console.log(`   Current:  ${currentCount.toLocaleString()}`);
  console.log(`   Diff:     ${diffStr}\n`);

  // 2. Required field presence rates
  const fieldChecks: Array<{
    field: string;
    count: number;
    required: boolean;
  }> = [
    {
      field: "id",
      count: items.filter((i) => i.id).length,
      required: true,
    },
    {
      field: "name",
      count: items.filter((i) => i.name && i.name.trim().length > 0).length,
      required: true,
    },
    {
      field: "type",
      count: items.filter((i) => i.type !== null).length,
      required: true,
    },
    {
      field: "createdAt",
      count: items.filter((i) => i.createdAt !== null).length,
      required: false,
    },
    {
      field: "requester",
      count: items.filter((i) => i.requester !== null).length,
      required: false,
    },
    {
      field: "requestQty",
      count: items.filter((i) => i.requestQty !== null).length,
      required: false,
    },
    {
      field: "progress",
      count: items.filter((i) => i.progress !== null).length,
      required: false,
    },
  ];

  console.log("2. Field Presence Rates");
  for (const fc of fieldChecks) {
    const rate = pct(fc.count, currentCount);
    const marker = fc.required ? " (REQUIRED)" : "";
    console.log(
      `   ${fc.field.padEnd(12)} ${fc.count.toLocaleString().padStart(6)} / ${currentCount.toLocaleString()} = ${rate}${marker}`
    );
  }
  console.log("");

  // 3. Type distribution
  const typeDist = new Map<string, number>();
  for (const item of items) {
    const key = item.type ?? "(null)";
    typeDist.set(key, (typeDist.get(key) ?? 0) + 1);
  }
  console.log("3. Type Distribution");
  for (const [type, count] of [...typeDist.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`   ${type.padEnd(8)} ${count.toLocaleString()} (${pct(count, currentCount)})`);
  }
  console.log("");

  // 4. Progress distribution
  const progressDist = new Map<string, number>();
  for (const item of items) {
    const key = item.progress !== null ? String(item.progress) : "null";
    progressDist.set(key, (progressDist.get(key) ?? 0) + 1);
  }
  const progressLabels: Record<string, string> = {
    "0": "pending",
    "1": "ordered",
    "2": "inspecting",
    null: "(null)",
  };
  console.log("4. Progress Distribution");
  for (const [prog, count] of [...progressDist.entries()].sort()) {
    const label = progressLabels[prog] ?? prog;
    console.log(
      `   ${prog.padEnd(6)} (${label.padEnd(12)}) ${count.toLocaleString()} (${pct(count, currentCount)})`
    );
  }
  console.log("");

  // 5. Date range
  const withDate = items.filter((i) => i.createdAt);
  if (withDate.length > 0) {
    const timestamps = withDate.map((i) => new Date(i.createdAt!).getTime());
    const minDate = new Date(Math.min(...timestamps))
      .toISOString()
      .slice(0, 10);
    const maxDate = new Date(Math.max(...timestamps))
      .toISOString()
      .slice(0, 10);
    console.log("5. Date Range (createdAt)");
    console.log(`   Earliest: ${minDate}`);
    console.log(`   Latest:   ${maxDate}`);
    console.log(`   Records with date: ${withDate.length} (${pct(withDate.length, currentCount)})\n`);
  }

  // 6. Top 10 vendors (companyNm)
  const vendorDist = new Map<string, number>();
  for (const item of items) {
    if (item.companyNm) {
      vendorDist.set(
        item.companyNm,
        (vendorDist.get(item.companyNm) ?? 0) + 1
      );
    }
  }
  const sortedVendors = [...vendorDist.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`6. Top 10 Vendors (companyNm) — ${vendorDist.size} unique`);
  for (const [vendor, count] of sortedVendors.slice(0, 10)) {
    console.log(`   ${vendor.padEnd(20)} ${count.toLocaleString()}`);
  }
  console.log("");

  // 7. Missing data warnings
  const emptyNameCount = items.filter(
    (i) => !i.name || i.name.trim().length === 0
  ).length;
  const nullCreatedAt = items.filter((i) => i.createdAt === null).length;
  const nullProgress = items.filter((i) => i.progress === null).length;
  const nullProgressPct =
    currentCount > 0 ? (nullProgress / currentCount) * 100 : 0;

  console.log("7. Missing Data Warnings");
  if (emptyNameCount > 0) {
    console.log(`   WARNING: ${emptyNameCount} items with empty name`);
  }
  if (nullCreatedAt > 0) {
    console.log(`   WARNING: ${nullCreatedAt} items with null createdAt`);
  }
  if (nullProgress > 0) {
    console.log(
      `   WARNING: ${nullProgress} items with null progress (${pct(nullProgress, currentCount)})`
    );
  }
  if (emptyNameCount === 0 && nullCreatedAt === 0 && nullProgress === 0) {
    console.log("   No warnings.");
  }
  console.log("");

  // 8. Migration readiness verdict
  const idPresent = fieldChecks.find((f) => f.field === "id");
  const namePresent = fieldChecks.find((f) => f.field === "name");
  const typePresent = fieldChecks.find((f) => f.field === "type");

  const hasIdGap = idPresent && idPresent.count < currentCount;
  const hasNameGap =
    namePresent && namePresent.count < currentCount;
  const hasTypeGap = typePresent && typePresent.count < currentCount;

  let verdict: "PASS" | "WARN" | "FAIL";
  let reason: string;

  if (hasIdGap || hasNameGap) {
    verdict = "FAIL";
    reason = "id or name field has missing values";
  } else if (hasTypeGap) {
    verdict = "FAIL";
    reason = "type field has missing values";
  } else if (nullProgressPct >= 20) {
    verdict = "WARN";
    reason = `progress null rate ${pct(nullProgress, currentCount)} >= 20%`;
  } else if (nullProgressPct >= 5) {
    verdict = "WARN";
    reason = `progress null rate ${pct(nullProgress, currentCount)} is between 5-20%`;
  } else {
    verdict = "PASS";
    reason =
      "id/name/type 100% present, progress null < 5%";
  }

  console.log("8. Migration Readiness");
  console.log(`   Verdict: ${verdict}`);
  console.log(`   Reason:  ${reason}`);
  console.log("");

  if (verdict === "FAIL") {
    process.exit(1);
  }
}

main();
