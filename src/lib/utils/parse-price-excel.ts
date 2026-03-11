/**
 * 통합 가격비교 엑셀 파서
 * 양식: A=구분(약품/약국), B=제품명, C=수량, D=비고, E~=업체별 단가
 */

interface ParsedProduct {
  category: string;
  name: string;
  quantity: string;
  remarks: string;
  vendorPrices: Map<string, number | null>;
}

export interface ParsedPriceExcel {
  vendorNames: string[];
  products: ParsedProduct[];
}

export async function parsePriceExcel(file: File): Promise<ParsedPriceExcel> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("시트를 찾을 수 없습니다.");

  // 헤더 행 자동 감지: B열이 "제품명"인 행을 찾고, 없으면 E열에 값이 2개 이상인 첫 행
  let headerRowNum = 0;
  for (let rowNum = 1; rowNum <= Math.min(sheet.rowCount, 5); rowNum++) {
    const row = sheet.getRow(rowNum);
    const colB = String(row.getCell(2).value ?? "").trim();
    if (colB === "제품명") {
      headerRowNum = rowNum;
      break;
    }
    // E열부터 값이 2개 이상이면 헤더 행으로 간주
    let vendorCount = 0;
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber >= 5) vendorCount++;
    });
    if (vendorCount >= 2 && headerRowNum === 0) {
      headerRowNum = rowNum;
    }
  }
  if (headerRowNum === 0) headerRowNum = 1;

  const headerRow = sheet.getRow(headerRowNum);
  const vendorNames: string[] = [];
  const vendorColIndices: number[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const val = String(cell.value ?? "").trim();
    // E열(5)부터 업체명
    if (colNumber >= 5 && val) {
      vendorNames.push(val);
      vendorColIndices.push(colNumber);
    }
  });

  if (vendorNames.length === 0) {
    throw new Error("E열부터 업체명 헤더를 찾을 수 없습니다.");
  }

  // 데이터 행 파싱 (헤더 다음 행부터)
  const products: ParsedProduct[] = [];

  for (let rowNum = headerRowNum + 1; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const name = String(row.getCell(2).value ?? "").trim();
    if (!name) continue;

    const category = String(row.getCell(1).value ?? "").trim();
    const quantity = String(row.getCell(3).value ?? "").trim();
    const remarks = String(row.getCell(4).value ?? "").trim();

    const vendorPrices = new Map<string, number | null>();
    for (let i = 0; i < vendorColIndices.length; i++) {
      const cellValue = row.getCell(vendorColIndices[i]).value;
      const price = parsePrice(cellValue);
      vendorPrices.set(vendorNames[i], price);
    }

    products.push({ category, name, quantity, remarks, vendorPrices });
  }

  return { vendorNames, products };
}

function parsePrice(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : parseInt(String(value).replace(/[^0-9.-]/g, ""), 10);
  return isNaN(num) ? null : num;
}
