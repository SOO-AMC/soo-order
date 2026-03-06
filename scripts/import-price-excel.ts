/**
 * 단가비교 엑셀 파일을 Supabase에 마이그레이션하는 스크립트
 *
 * 사용법: pnpm tsx scripts/import-price-excel.ts
 *
 * 엑셀 구조:
 *   약품 시트: Row 1 헤더, Row 2~ 데이터
 *     Col A: 제품명, Col B: 수량, Col C: 기본공급가
 *     Col E: 우리엔팜(85%), Col F: 우리엔팜(87%), Col G: vs팜, Col H: 화영, Col I: 라라엠케어
 *
 *   약국 시트: Row 2 헤더, Row 3~ 데이터
 *     Col A: 제품명, Col B: 수량, Col C: 기본공급가
 *     Col E: 우리엔팜, Col F: vs팜, Col G: 화영, Col H: 라라엠케어
 *
 * 통합 제품: 양 시트의 모든 제품명을 unified_products에 등록
 * 업체 제품: 각 업체별 단가가 있는 행만 vendor_products에 등록 + unified_product 매핑
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXCEL_PATH = "/Users/jungyunseong/Downloads/단가비교_240613.xlsx";

function getCellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return Math.round(r);
  }
  return null;
}

interface ProductRow {
  name: string;
  quantity: string;
  basePrice: number | null;
  category: string; // 약품 or 약국
  vendorPrices: Map<string, number>; // vendorName -> price
}

async function main() {
  console.log("📊 단가비교 엑셀 마이그레이션 시작...\n");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  const allProducts: ProductRow[] = [];

  // --- 약품 시트 파싱 ---
  const drugSheet = wb.getWorksheet("약품");
  if (!drugSheet) throw new Error("약품 시트를 찾을 수 없습니다");

  // 약품: E=우리엔팜(85%), F=우리엔팜(87%), G=vs팜, H=화영, I=라라엠케어
  // 우리엔팜은 col E (85%)만 사용
  const drugVendorCols: [string, number][] = [
    ["우리엔팜", 5],
    ["vs팜", 7],
    ["화영", 8],
    ["라라엠케어", 9],
  ];

  for (let r = 2; r <= drugSheet.rowCount; r++) {
    const row = drugSheet.getRow(r);
    const name = row.getCell(1).value;
    if (!name || typeof name !== "string") continue;

    const qty = row.getCell(2).value;
    const basePrice = getCellNumber(row.getCell(3));

    const vendorPrices = new Map<string, number>();
    for (const [vendor, col] of drugVendorCols) {
      const price = getCellNumber(row.getCell(col));
      if (price && price > 0) {
        vendorPrices.set(vendor, price);
      }
    }

    allProducts.push({
      name: name.trim(),
      quantity: qty != null ? String(qty) : "",
      basePrice,
      category: "약품",
      vendorPrices,
    });
  }

  console.log(`✅ 약품 시트: ${allProducts.length}개 제품 파싱`);

  // --- 약국 시트 파싱 ---
  const pharmacySheet = wb.getWorksheet("약국");
  if (!pharmacySheet) throw new Error("약국 시트를 찾을 수 없습니다");

  // 약국: E=우리엔팜, F=vs팜, G=화영, H=라라엠케어
  const pharmacyVendorCols: [string, number][] = [
    ["우리엔팜", 5],
    ["vs팜", 6],
    ["화영", 7],
    ["라라엠케어", 8],
  ];

  const pharmacyCount = allProducts.length;
  for (let r = 3; r <= pharmacySheet.rowCount; r++) {
    const row = pharmacySheet.getRow(r);
    const name = row.getCell(1).value;
    if (!name || typeof name !== "string") continue;

    const qty = row.getCell(2).value;
    const basePrice = getCellNumber(row.getCell(3));

    const vendorPrices = new Map<string, number>();
    for (const [vendor, col] of pharmacyVendorCols) {
      const price = getCellNumber(row.getCell(col));
      if (price && price > 0) {
        vendorPrices.set(vendor, price);
      }
    }

    allProducts.push({
      name: name.trim(),
      quantity: qty != null ? String(qty) : "",
      basePrice,
      category: "약국",
      vendorPrices,
    });
  }

  console.log(`✅ 약국 시트: ${allProducts.length - pharmacyCount}개 제품 파싱`);
  console.log(`📦 총 ${allProducts.length}개 제품\n`);

  // --- 기존 데이터 정리 ---
  console.log("🗑️  기존 데이터 정리...");
  await supabase.from("vendor_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("unified_products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("vendors").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("✅ 기존 데이터 삭제 완료\n");

  // --- 업체 생성 ---
  const vendorNames = ["우리엔팜", "vs팜", "화영", "라라엠케어"];
  const vendorMap = new Map<string, string>(); // name -> id

  for (const name of vendorNames) {
    const { data, error } = await supabase
      .from("vendors")
      .insert({ name })
      .select("id")
      .single();

    if (error) {
      console.error(`❌ 업체 "${name}" 생성 실패:`, error.message);
      return;
    }
    vendorMap.set(name, data.id);
    console.log(`✅ 업체: ${name} (${data.id})`);
  }

  // --- 통합 제품 생성 ---
  console.log("\n📝 통합 제품 생성...");
  const unifiedMap = new Map<string, string>(); // productName -> unified_product_id

  const BATCH = 500;
  for (let i = 0; i < allProducts.length; i += BATCH) {
    const batch = allProducts.slice(i, i + BATCH).map((p, idx) => ({
      name: p.name,
      quantity: p.quantity,
      notes: p.category,
      sort_order: i + idx + 1,
    }));

    const { data, error } = await supabase
      .from("unified_products")
      .insert(batch)
      .select("id, name");

    if (error) {
      console.error(`❌ 통합 제품 생성 실패 (batch ${i}):`, error.message);
      return;
    }

    for (const row of data) {
      unifiedMap.set(row.name, row.id);
    }
  }

  console.log(`✅ 통합 제품 ${unifiedMap.size}개 생성\n`);

  // --- 업체별 제품 생성 ---
  console.log("📝 업체별 제품 생성...");

  const vendorProductRows: {
    vendor_id: string;
    product_name: string;
    unit_price: number;
    category: string;
    unified_product_id: string | null;
  }[] = [];

  for (const product of allProducts) {
    const unifiedId = unifiedMap.get(product.name) ?? null;

    for (const [vendorName, price] of product.vendorPrices) {
      const vendorId = vendorMap.get(vendorName);
      if (!vendorId) continue;

      vendorProductRows.push({
        vendor_id: vendorId,
        product_name: product.name,
        unit_price: price,
        category: product.category,
        unified_product_id: unifiedId,
      });
    }
  }

  // Insert in batches
  for (let i = 0; i < vendorProductRows.length; i += BATCH) {
    const batch = vendorProductRows.slice(i, i + BATCH);
    const { error } = await supabase.from("vendor_products").insert(batch);
    if (error) {
      console.error(`❌ 업체 제품 생성 실패 (batch ${i}):`, error.message);
      return;
    }
  }

  // Per-vendor count
  for (const [name, id] of vendorMap) {
    const count = vendorProductRows.filter((r) => r.vendor_id === id).length;
    console.log(`  ${name}: ${count}개`);
  }

  console.log(`\n🎉 마이그레이션 완료!`);
  console.log(`   - 업체: ${vendorMap.size}개`);
  console.log(`   - 통합 제품: ${unifiedMap.size}개`);
  console.log(`   - 업체 제품: ${vendorProductRows.length}개 (매핑 포함)`);
}

main().catch(console.error);
