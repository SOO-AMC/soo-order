import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCEL_PATH = "/Users/jungyunseong/Downloads/단가비교_240613.xlsx";

function getCellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return Math.round(r);
  }
  return null;
}

interface ProductRow {
  name: string;
  category: string;
  basePrice: number | null;
  vendorPrices: Record<string, number | null>;
  notes: string;
}

async function main() {
  console.log("1. Clearing existing data...");
  await supabase.from("vendor_products").delete().gte("created_at", "2000-01-01");
  await supabase.from("unified_products").delete().gte("created_at", "2000-01-01");
  await supabase.from("vendors").delete().gte("created_at", "2000-01-01");
  console.log("   Done.");

  console.log("2. Creating vendors...");
  const vendorNames = ["우리엔팜", "vs팜", "화영", "라라엠케어"];
  const { data: vendors, error: vendorError } = await supabase
    .from("vendors")
    .insert(vendorNames.map((name) => ({ name })))
    .select();

  if (vendorError || !vendors) {
    console.error("Failed to create vendors:", vendorError);
    return;
  }
  const vendorMap = new Map(vendors.map((v) => [v.name, v.id]));
  console.log("   Created:", vendorNames.join(", "));

  console.log("3. Parsing Excel...");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  const allProducts: ProductRow[] = [];

  // 약국 sheet: header at row 2, data from row 3
  // Cols: 1=제품명, 2=수량, 3=기본공급가, 4=null, 5=우리엔팜, 6=vs팜, 7=화영, 8=라라엠케어
  const pharmacySheet = wb.getWorksheet("약국");
  if (pharmacySheet) {
    for (let i = 3; i <= pharmacySheet.rowCount; i++) {
      const row = pharmacySheet.getRow(i);
      const name = row.getCell(1).value?.toString()?.trim();
      if (!name) continue;

      allProducts.push({
        name,
        category: "약국",
        basePrice: getCellNumber(row.getCell(3)),
        vendorPrices: {
          우리엔팜: getCellNumber(row.getCell(5)),
          vs팜: getCellNumber(row.getCell(6)),
          화영: getCellNumber(row.getCell(7)),
          라라엠케어: getCellNumber(row.getCell(8)),
        },
        notes: row.getCell(9).value?.toString()?.trim() ?? "",
      });
    }
  }
  console.log(`   약국: ${allProducts.length} products`);

  // 약품 sheet: header at row 1, data from row 2
  // Cols: 1=제품명, 2=수량, 3=기본공급가, 4=null, 5=우리엔팜(85%), 6=우리엔팜(실제), 7=vs팜, 8=화영, 9=라라엠케어
  // Use col 5 for 우리엔팜 (the 85% formula), col 6 is secondary
  const drugSheet = wb.getWorksheet("약품");
  const drugStart = allProducts.length;
  if (drugSheet) {
    for (let i = 2; i <= drugSheet.rowCount; i++) {
      const row = drugSheet.getRow(i);
      const name = row.getCell(1).value?.toString()?.trim();
      if (!name) continue;

      // For 우리엔팜, prefer col 6 (actual quote) over col 5 (formula estimate)
      const uriPrice6 = getCellNumber(row.getCell(6));
      const uriPrice5 = getCellNumber(row.getCell(5));

      allProducts.push({
        name,
        category: "약품",
        basePrice: getCellNumber(row.getCell(3)),
        vendorPrices: {
          우리엔팜: uriPrice6 ?? uriPrice5,
          vs팜: getCellNumber(row.getCell(7)),
          화영: getCellNumber(row.getCell(8)),
          라라엠케어: getCellNumber(row.getCell(9)),
        },
        notes: row.getCell(10).value?.toString()?.trim() ?? "",
      });
    }
  }
  console.log(`   약품: ${allProducts.length - drugStart} products`);
  console.log(`   Total: ${allProducts.length} products`);

  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  const uniqueProducts: ProductRow[] = [];
  for (const p of allProducts) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    uniqueProducts.push(p);
  }
  console.log(`   Unique: ${uniqueProducts.length} products`);

  console.log("4. Inserting unified products...");
  const BATCH = 500;
  const unifiedIds: string[] = [];

  for (let i = 0; i < uniqueProducts.length; i += BATCH) {
    const batch = uniqueProducts.slice(i, i + BATCH).map((p, idx) => ({
      name: p.name,
      mg: "",
      tab: "",
      notes: p.notes,
      sort_order: i + idx,
    }));
    const { data, error } = await supabase
      .from("unified_products")
      .insert(batch)
      .select("id");

    if (error) {
      console.error(`   Batch ${i} error:`, error.message);
      return;
    }
    for (const d of data!) unifiedIds.push(d.id);
    process.stdout.write(`   ${Math.min(i + BATCH, uniqueProducts.length)}/${uniqueProducts.length}\r`);
  }
  console.log(`\n   Inserted ${unifiedIds.length} unified products.`);

  console.log("5. Inserting vendor products...");
  const vendorProductRows: {
    vendor_id: string;
    product_name: string;
    unit_price: number | null;
    category: string;
    unified_product_id: string;
    manufacturer: string;
    spec: string;
    ingredient: string;
  }[] = [];

  for (let i = 0; i < uniqueProducts.length; i++) {
    const p = uniqueProducts[i];
    const unifiedId = unifiedIds[i];

    for (const [vendorName, price] of Object.entries(p.vendorPrices)) {
      if (price == null || price <= 0) continue;
      vendorProductRows.push({
        vendor_id: vendorMap.get(vendorName)!,
        product_name: p.name,
        unit_price: price,
        category: p.category,
        unified_product_id: unifiedId,
        manufacturer: "",
        spec: "",
        ingredient: "",
      });
    }
  }

  console.log(`   Total vendor products to insert: ${vendorProductRows.length}`);

  for (let i = 0; i < vendorProductRows.length; i += BATCH) {
    const batch = vendorProductRows.slice(i, i + BATCH);
    const { error } = await supabase.from("vendor_products").insert(batch);
    if (error) {
      console.error(`   Batch ${i} error:`, error.message);
      return;
    }
    process.stdout.write(`   ${Math.min(i + BATCH, vendorProductRows.length)}/${vendorProductRows.length}\r`);
  }
  console.log(`\n   Inserted ${vendorProductRows.length} vendor products.`);

  // Stats
  for (const name of vendorNames) {
    const count = vendorProductRows.filter((r) => r.vendor_id === vendorMap.get(name)).length;
    console.log(`   ${name}: ${count} products`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
