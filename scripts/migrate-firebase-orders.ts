/**
 * Firebase Items → Supabase orders 마이그레이션
 * Usage: pnpm tsx scripts/migrate-firebase-orders.ts
 *
 * --dry-run 옵션으로 실제 INSERT 없이 검증만 가능
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.argv.includes("--dry-run");

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

// Parse quantity string: "2박스" → { quantity: 2, unit: "박스" }
// "한박스" → { quantity: 0, unit: "한박스" }
function parseQty(raw: string | null): { quantity: number; unit: string } {
  if (!raw || raw.trim() === "") return { quantity: 0, unit: "" };

  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)\s*(.*)/);
  if (match) {
    return { quantity: parseInt(match[1], 10), unit: match[2].trim() };
  }
  // 숫자 추출 실패 → quantity 비우고 unit에 원본
  return { quantity: 0, unit: trimmed };
}

function parseConfirmQty(raw: string | null): number | null {
  if (!raw || raw.trim() === "") return null;
  const match = raw.trim().match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function mapStatus(type: string, progress: number | null): string {
  if (type === "반품") {
    if (progress === 0) return "return_requested";
    return "return_completed"; // progress 2
  }
  // 주문
  if (progress === 0) return "pending";
  if (progress === 1) return "ordered";
  return "inspecting"; // progress 2
}

function mapType(type: string | null): string {
  return type === "반품" ? "return" : "order";
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN (INSERT 하지 않음) ===" : "=== 마이그레이션 시작 ===");

  // 1. Load Firebase items
  const dataPath = path.resolve(process.cwd(), "src/data/firebase-items.json");
  const items: FirebaseItem[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  console.log(`Firebase 데이터: ${items.length}건`);

  // 2. Load Supabase profiles for name → id mapping
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role");

  if (profileError) {
    console.error("프로필 조회 실패:", profileError.message);
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

  console.log(`Supabase 프로필: ${profiles!.length}명 (이름 매핑: ${nameToId.size}개)`);
  console.log(`Admin ID: ${adminId}`);

  if (!adminId) {
    console.error("admin 계정을 찾을 수 없습니다.");
    process.exit(1);
  }

  // 3. Transform items
  const unmatchedNames = new Set<string>();
  const rows = items.map((item) => {
    const { quantity, unit } = parseQty(item.requestQty);

    // Requester mapping
    let requesterId = item.requester ? nameToId.get(item.requester) : null;
    if (!requesterId) {
      if (item.requester) unmatchedNames.add(item.requester);
      requesterId = adminId;
    }

    // Orderer → updated_by
    let updatedBy = item.orderer ? nameToId.get(item.orderer) : null;
    if (!updatedBy && item.orderer) unmatchedNames.add(item.orderer);

    // Inspector
    let inspectedBy = item.inspector ? nameToId.get(item.inspector) : null;
    if (!inspectedBy && item.inspector) unmatchedNames.add(item.inspector);

    return {
      type: mapType(item.type),
      item_name: item.name,
      quantity,
      unit,
      status: mapStatus(item.type ?? "주문", item.progress),
      requester_id: requesterId,
      updated_by: updatedBy || null,
      vendor_name: item.companyNm ?? "",
      confirmed_quantity: parseConfirmQty(item.confirmQty),
      invoice_received: item.hasTS ?? null,
      inspected_by: inspectedBy || null,
      inspected_at: item.recievedAt || null,
      photo_urls: [],
      is_urgent: false,
      return_quantity: null,
      return_reason: null,
      return_requested_by: null,
      return_requested_at: null,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.lastEdited || item.createdAt || new Date().toISOString(),
    };
  });

  // 4. Report unmatched names
  if (unmatchedNames.size > 0) {
    console.log(`\n매칭 실패한 이름 (${unmatchedNames.size}개):`);
    for (const name of [...unmatchedNames].sort()) {
      console.log(`  - "${name}"`);
    }
  }

  // 5. Summary
  const statusCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  rows.forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
  });
  console.log(`\ntype 분포:`, typeCounts);
  console.log(`status 분포:`, statusCounts);
  console.log(`quantity=0 (파싱 실패): ${rows.filter((r) => r.quantity === 0).length}건`);

  if (DRY_RUN) {
    console.log("\n=== DRY RUN 완료. --dry-run 없이 실행하면 INSERT 됩니다. ===");
    // Show sample rows
    console.log("\n샘플 (처음 3건):");
    rows.slice(0, 3).forEach((r, i) => {
      console.log(`  [${i + 1}]`, JSON.stringify(r, null, 2));
    });
    return;
  }

  // 6. Batch INSERT (500건씩)
  const BATCH_SIZE = 500;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("orders").insert(batch);

    if (error) {
      console.error(`배치 ${i}~${i + batch.length} 실패:`, error.message);
      errors++;
    } else {
      inserted += batch.length;
      console.log(`  ${inserted}/${rows.length} 완료`);
    }
  }

  console.log(`\n=== 마이그레이션 완료 ===`);
  console.log(`성공: ${inserted}건, 실패 배치: ${errors}개`);
}

main().catch(console.error);
