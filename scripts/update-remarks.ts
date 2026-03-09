/**
 * 단가비교 엑셀에서 비고 데이터를 읽어 unified_products.remarks에 업데이트
 *
 * 사용법: pnpm tsx scripts/update-remarks.ts
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

interface RemarkEntry {
  productName: string;
  category: string;
  remarks: string;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  const entries: RemarkEntry[] = [];

  // 약국 시트: header at row 2, data from row 3, remarks at col 9
  const yakguk = wb.getWorksheet("약국");
  if (yakguk) {
    for (let r = 3; r <= yakguk.rowCount; r++) {
      const row = yakguk.getRow(r);
      const name = row.getCell(1).value;
      const remark = row.getCell(9).value;
      if (name && remark && typeof remark === "string" && remark.trim()) {
        entries.push({
          productName: String(name).trim(),
          category: "약국",
          remarks: remark.trim(),
        });
      }
    }
  }

  // 약품 시트: header at row 1, data from row 2, remarks at col 10
  const yakpum = wb.getWorksheet("약품");
  if (yakpum) {
    for (let r = 2; r <= yakpum.rowCount; r++) {
      const row = yakpum.getRow(r);
      const name = row.getCell(1).value;
      const remark = row.getCell(10).value;
      if (name && remark && typeof remark === "string" && remark.trim()) {
        entries.push({
          productName: String(name).trim(),
          category: "약품",
          remarks: remark.trim(),
        });
      }
    }
  }

  console.log(`Found ${entries.length} entries with remarks:`);
  for (const e of entries) {
    console.log(`  [${e.category}] ${e.productName} → ${e.remarks}`);
  }

  // Fetch all unified products
  const { data: unified, error: fetchErr } = await supabase
    .from("unified_products")
    .select("id, name, notes");

  if (fetchErr || !unified) {
    console.error("Failed to fetch unified_products:", fetchErr);
    return;
  }

  console.log(`\nTotal unified_products: ${unified.length}`);

  let updated = 0;
  let notFound = 0;

  for (const entry of entries) {
    // Match by name (exact match first)
    let match = unified.find((u) => u.name === entry.productName);

    // If no exact match, try case-insensitive / trimmed
    if (!match) {
      match = unified.find(
        (u) => u.name.toLowerCase().trim() === entry.productName.toLowerCase().trim()
      );
    }

    if (match) {
      const { error: updateErr } = await supabase
        .from("unified_products")
        .update({ remarks: entry.remarks })
        .eq("id", match.id);

      if (updateErr) {
        console.error(`  ✗ Failed to update "${entry.productName}":`, updateErr.message);
      } else {
        console.log(`  ✓ Updated "${match.name}" → remarks: "${entry.remarks}"`);
        updated++;
      }
    } else {
      console.log(`  ✗ Not found: "${entry.productName}"`);
      notFound++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${notFound} not found`);
}

main().catch(console.error);
