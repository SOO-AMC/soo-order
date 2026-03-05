import type { VendorProductRow } from "@/lib/types/price-compare";

interface ColumnMapping {
  productName: number;
  manufacturer: number;
  spec: number;
  unitPrice: number;
  ingredient: number;
}

const HEADER_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  productName: ["제품명", "품목명", "상품명", "약품명"],
  unitPrice: ["단가", "가격", "금액", "약가"],
  manufacturer: ["제조사", "제조원", "업체", "생산"],
  spec: ["규격", "포장", "단위", "용량"],
  ingredient: ["성분", "주성분", "성분명"],
};

function findHeaderRow(
  rows: (string | number | null | undefined)[][],
  maxScan = 20
): { headerIndex: number; columns: ColumnMapping } | null {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const row = rows[i];
    if (!row) continue;

    const cells = row.map((c) => String(c ?? "").trim());

    let productNameCol = -1;
    let unitPriceCol = -1;
    let manufacturerCol = -1;
    let specCol = -1;
    let ingredientCol = -1;

    for (let j = 0; j < cells.length; j++) {
      const cell = cells[j];
      if (!cell) continue;

      if (productNameCol === -1 && HEADER_KEYWORDS.productName.some((k) => cell.includes(k))) {
        productNameCol = j;
      }
      if (unitPriceCol === -1 && HEADER_KEYWORDS.unitPrice.some((k) => cell.includes(k))) {
        unitPriceCol = j;
      }
      if (manufacturerCol === -1 && HEADER_KEYWORDS.manufacturer.some((k) => cell.includes(k))) {
        manufacturerCol = j;
      }
      if (specCol === -1 && HEADER_KEYWORDS.spec.some((k) => cell.includes(k))) {
        specCol = j;
      }
      if (ingredientCol === -1 && HEADER_KEYWORDS.ingredient.some((k) => cell.includes(k))) {
        ingredientCol = j;
      }
    }

    // 최소 제품명 + 단가 필요
    if (productNameCol !== -1 && unitPriceCol !== -1) {
      return {
        headerIndex: i,
        columns: {
          productName: productNameCol,
          unitPrice: unitPriceCol,
          manufacturer: manufacturerCol,
          spec: specCol,
          ingredient: ingredientCol,
        },
      };
    }
  }

  return null;
}

export async function parseVendorExcel(file: File): Promise<VendorProductRow[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const products: VendorProductRow[] = [];

  workbook.eachSheet((sheet) => {
    const sheetName = sheet.name;
    const rows: (string | number | null | undefined)[][] = [];

    sheet.eachRow((row) => {
      const values = row.values as (string | number | null | undefined)[];
      // ExcelJS row.values is 1-indexed, shift to 0-indexed
      rows.push(values.slice(1));
    });

    const result = findHeaderRow(rows);
    if (!result) return; // skip sheet without valid headers

    const { headerIndex, columns } = result;

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const productName = String(row[columns.productName] ?? "").trim();
      if (!productName) continue;

      // skip category-like rows (single cell with no price)
      const priceRaw = row[columns.unitPrice];
      const unitPrice = typeof priceRaw === "number"
        ? Math.round(priceRaw)
        : priceRaw
          ? parseInt(String(priceRaw).replace(/[^0-9.-]/g, ""), 10) || null
          : null;

      products.push({
        product_name: productName,
        manufacturer: columns.manufacturer >= 0 ? String(row[columns.manufacturer] ?? "").trim() : "",
        spec: columns.spec >= 0 ? String(row[columns.spec] ?? "").trim() : "",
        unit_price: unitPrice,
        ingredient: columns.ingredient >= 0 ? String(row[columns.ingredient] ?? "").trim() : "",
        category: sheetName,
      });
    }
  });

  return products;
}
