"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/supabase/server";
import type { ExtractedInvoice } from "@/lib/types/invoice";

const OCR_MODEL = "claude-sonnet-4-6";

const RULES = `규칙:
- vendorName: 공급자(상호/업체명). 받는 쪽이 아니라 물건을 공급한 도매업체 이름.
- invoiceDate: 거래일자. YYYY-MM-DD 형식으로. 연도가 없으면 보이는 그대로.
- items: 품목 표의 각 행. 합계/소계/세액 행은 제외.
  - name: 품목명(규격 포함, 보이는 그대로).
  - quantity: 수량(숫자만). 콤마 제거.
  - listPrice: 단가(unit price)의 숫자만. '원', 콤마 제거. 이는 한 개당 가격이며, 라인 합계(공급가액/금액)가 아님.
- 숫자는 반드시 number 타입. 읽기 애매하면 가장 가능성 높은 값으로.`;

const SYSTEM_SINGLE = `당신은 한국 의약품 도매업체의 거래명세서(인보이스)를 정확히 읽어내는 OCR 전문가입니다.
이 파일은 하나의 거래명세서입니다(여러 페이지여도 한 건). 표를 한 줄도 빠뜨리지 말고 정확히 추출하세요.

${RULES}`;

const SYSTEM_MULTI = `당신은 한국 의약품 도매업체의 거래명세서(인보이스)를 정확히 읽어내는 OCR 전문가입니다.
이 파일에는 여러 거래명세서가 합쳐져 있을 수 있습니다(같은 업체의 여러 건이거나 서로 다른 업체).
헤더/공급자/거래일자/합계가 새로 시작되면 별개의 명세서로 보고 invoices 배열로 나누세요.
한 건짜리면 invoices에 1개만 넣으면 됩니다. 각 명세서의 표를 한 줄도 빠뜨리지 마세요.
- pageStart/pageEnd: 각 명세서가 이 파일에서 차지하는 페이지 번호(1부터). 한 페이지짜리면 둘이 같음. 여러 페이지면 시작·끝 페이지.

${RULES}`;

const INVOICE_PROPS = {
  vendorName: { type: "string" },
  invoiceDate: { type: "string" },
  items: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        quantity: { type: "number" },
        listPrice: { type: "number" },
      },
      required: ["name", "quantity", "listPrice"],
      additionalProperties: false,
    },
  },
} as const;

const SCHEMA_SINGLE = {
  type: "object",
  properties: INVOICE_PROPS,
  required: ["vendorName", "invoiceDate", "items"],
  additionalProperties: false,
} as const;

const INVOICE_PROPS_MULTI = {
  ...INVOICE_PROPS,
  pageStart: { type: "number" },
  pageEnd: { type: "number" },
} as const;

const SCHEMA_MULTI = {
  type: "object",
  properties: {
    invoices: {
      type: "array",
      items: {
        type: "object",
        properties: INVOICE_PROPS_MULTI,
        required: ["vendorName", "invoiceDate", "items", "pageStart", "pageEnd"],
        additionalProperties: false,
      },
    },
  },
  required: ["invoices"],
  additionalProperties: false,
} as const;

type ImageMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function sourceKind(path: string): { kind: "pdf" } | { kind: "image"; mediaType: ImageMedia } {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return { kind: "pdf" };
  if (ext === "png") return { kind: "image", mediaType: "image/png" };
  if (ext === "webp") return { kind: "image", mediaType: "image/webp" };
  if (ext === "gif") return { kind: "image", mediaType: "image/gif" };
  return { kind: "image", mediaType: "image/jpeg" };
}

/**
 * 명세서 파일(Storage의 `invoices` 버킷 경로)을 Claude Vision으로 읽어
 * 명세서 배열을 반환한다. 관리자 전용.
 * - mode "single": 파일 전체를 1건으로 (배열 길이 1)
 * - mode "multi": 합쳐진 여러 명세서를 분리해 배열로
 */
export async function scanInvoice(
  storagePath: string,
  mode: "single" | "multi" = "single",
): Promise<ExtractedInvoice[]> {
  const { supabase } = await requireAdmin();

  const { data: blob, error } = await supabase.storage.from("invoices").download(storagePath);
  if (error || !blob) throw new Error("명세서 파일을 불러오지 못했습니다.");

  const fileBytes = new Uint8Array(await blob.arrayBuffer());
  const base64 = Buffer.from(fileBytes).toString("base64");
  const src = sourceKind(storagePath);

  const sourceBlock: Anthropic.ContentBlockParam =
    src.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: src.mediaType, data: base64 } };

  const isMulti = mode === "multi";
  const client = new Anthropic();
  const res = await client.messages.create({
    model: OCR_MODEL,
    max_tokens: 16000,
    system: isMulti ? SYSTEM_MULTI : SYSTEM_SINGLE,
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          {
            type: "text",
            text: isMulti
              ? "이 파일의 모든 거래명세서를 분리해 스키마(invoices 배열)에 맞는 JSON으로 추출하세요."
              : "이 거래명세서를 읽고 스키마에 맞는 JSON으로 추출하세요.",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: isMulti ? SCHEMA_MULTI : SCHEMA_SINGLE } },
  });

  const textBlock = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("명세서 추출 결과가 비어 있습니다.");

  let invoices: ExtractedInvoice[];
  try {
    if (isMulti) {
      const parsed = JSON.parse(textBlock.text) as { invoices: ExtractedInvoice[] };
      invoices = parsed.invoices ?? [];
    } else {
      return [JSON.parse(textBlock.text) as ExtractedInvoice];
    }
  } catch {
    throw new Error("명세서 추출 결과를 해석하지 못했습니다.");
  }

  // PDF 합본 분리 시 Claude가 명세서 사이 페이지를 빠뜨리거나 마지막 pageEnd를 짧게 잡는
  // 경우가 있어 누락 페이지가 생긴다 → 총 페이지 수 기준으로 범위를 정규화해 모든 페이지가
  // 어떤 명세서에든 속하게 보정.
  if (src.kind === "pdf" && invoices.length > 0) {
    const total = await countPdfPages(fileBytes);
    if (total > 0) normalizePdfPageRanges(invoices, total);
  }
  return invoices;
}

/** PDF 총 페이지 수를 mupdf로 읽음 (실패 시 0). */
async function countPdfPages(bytes: Uint8Array): Promise<number> {
  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as InstanceType<typeof mupdf.PDFDocument>;
    try {
      return doc.countPages();
    } finally {
      doc.destroy();
    }
  } catch {
    return 0;
  }
}

/**
 * OCR 결과 명세서들의 pageStart/pageEnd를 정규화 (in-place 수정).
 * - 시작 1, 끝 total을 커버
 * - 명세서 사이 갭은 앞쪽 invoice의 pageEnd를 확장해 채움 (누락 방지)
 * - 겹침은 앞쪽 invoice의 pageEnd를 줄여 해결
 */
function normalizePdfPageRanges(invoices: ExtractedInvoice[], total: number): void {
  // pageStart 오름차순 정렬
  invoices.sort((a, b) => (a.pageStart ?? 1) - (b.pageStart ?? 1));
  // 기본 범위 클램프 + 결측 보정
  for (const inv of invoices) {
    const ps = Math.max(1, Math.min(total, inv.pageStart ?? 1));
    const pe = Math.max(ps, Math.min(total, inv.pageEnd ?? ps));
    inv.pageStart = ps;
    inv.pageEnd = pe;
  }
  // 첫 명세서는 1부터, 마지막은 total까지 커버
  invoices[0].pageStart = 1;
  invoices[invoices.length - 1].pageEnd = total;
  // 인접 명세서 사이 갭 채우기 + 겹침 해소
  for (let i = 0; i < invoices.length - 1; i++) {
    const cur = invoices[i];
    const next = invoices[i + 1];
    const curEnd = cur.pageEnd ?? cur.pageStart ?? 1;
    const nextStart = next.pageStart ?? curEnd + 1;
    if (nextStart <= curEnd) {
      // 겹침 → 현재의 pageEnd를 next 직전까지 축소
      cur.pageEnd = Math.max(cur.pageStart ?? 1, nextStart - 1);
    } else if (nextStart > curEnd + 1) {
      // 갭 → 현재를 next 직전까지 확장 (누락 페이지를 현재 명세서로 흡수)
      cur.pageEnd = nextStart - 1;
    }
  }
}

/** PDF의 특정 페이지 범위를 PNG(data URL) 배열로 렌더. PDF 아니거나 실패 시 []. 관리자 전용.
 *  pageStart/pageEnd는 1부터. scale은 렌더 배율(썸네일 0.4, 확대 1.2 등). */
export async function renderInvoicePages(
  storagePath: string,
  pageStart = 1,
  pageEnd = 1,
  scale = 0.4,
): Promise<string[]> {
  const { supabase } = await requireAdmin();
  if ((storagePath.toLowerCase().split(".").pop() ?? "") !== "pdf") return [];
  const { data: blob } = await supabase.storage.from("invoices").download(storagePath);
  if (!blob) return [];
  try {
    const mupdf = await import("mupdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as InstanceType<typeof mupdf.PDFDocument>;
    const total = doc.countPages();
    const start = Math.max(1, Math.min(pageStart || 1, total));
    const end = Math.max(start, Math.min(pageEnd || start, total));
    const out: string[] = [];
    const matrix = mupdf.Matrix.scale(scale, scale);
    for (let p = start; p <= end; p++) {
      const page = doc.loadPage(p - 1);
      const pix = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
      out.push(`data:image/png;base64,${Buffer.from(pix.asPNG()).toString("base64")}`);
    }
    return out;
  } catch {
    return [];
  }
}

/** 특정 페이지 1장 썸네일 (편의). */
export async function renderInvoiceThumbnail(storagePath: string, page = 1): Promise<string | null> {
  const pages = await renderInvoicePages(storagePath, page, page, 0.7);
  return pages[0] ?? null;
}
