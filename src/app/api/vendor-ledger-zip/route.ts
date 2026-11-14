// 거래처원장 "업체별 PDF · ZIP" 다운로드 — 스트리밍 응답.
//
// 이전 버전은 모든 vendor를 다 처리한 뒤에야 최종 ZIP을 한꺼번에 보내려고 했는데,
// 43초 동안 응답 헤더조차 안 나가서 브라우저/네트워크가 연결을 끊었다("Failed to fetch").
// → JSZip 스트리밍 + 파일을 promise로 추가 → 첫 vendor 처리 직후 헤더와 첫 바이트가 흘러가
//   계속 데이터가 오므로 연결이 유지되고 메모리도 vendor 1개분만 들고 있게 된다.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { chunk } from "@/lib/supabase/paginate";

export const runtime = "nodejs"; // mupdf(WASM)는 Node 전용
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  vendor_name: string;
  invoice_date: string | null;
  image_urls: string[] | null;
  page_start: number | null;
  page_end: number | null;
  vendors: { name: string } | null;
};

/** vendor 안의 한 명세서 = 한 파일 경로 + (옵션) 그 파일에서의 페이지 범위 (1-indexed, inclusive) */
type InvoiceItem = { path: string; date: string; pageStart: number | null; pageEnd: number | null };

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    // form POST(native 다운로드용) 또는 JSON body 둘 다 허용
    const ct = req.headers.get("content-type") ?? "";
    let docIds: string[] = [];
    let filename: string | undefined;
    if (ct.includes("application/json")) {
      const body = (await req.json()) as { docIds: string[]; filename?: string };
      docIds = body.docIds;
      filename = body.filename;
    } else {
      const form = await req.formData();
      const idsRaw = form.get("docIds");
      if (typeof idsRaw === "string") {
        try { docIds = JSON.parse(idsRaw) as string[]; } catch { docIds = []; }
      }
      const fn = form.get("filename");
      if (typeof fn === "string") filename = fn;
    }
    if (!Array.isArray(docIds) || docIds.length === 0) {
      return NextResponse.json({ error: "다운로드할 명세서가 지정되지 않았습니다." }, { status: 400 });
    }

    // id를 수백 개 한 번에 보내면 주소가 길어져 요청이 실패한다 → 100개씩 나눠 읽는다
    const rows: InvoiceRow[] = [];
    for (const ids of chunk(docIds, 100)) {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor_name, invoice_date, image_urls, page_start, page_end, vendors(name)")
        .in("id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows.push(...((data ?? []) as unknown as InvoiceRow[]));
    }

    // 업체별로 명세서 항목(파일+페이지범위)을 모음. 합본 PDF면 같은 파일 + 다른 페이지 범위.
    // 단일 invoice는 page_start/page_end = NULL → 파일 전체 사용.
    type VGroup = { vname: string; items: InvoiceItem[] };
    const groupMap = new Map<string, VGroup>();
    for (const r of rows) {
      // 같은 업체가 명세서마다 다른 글자로 찍혀도 한 파일로 묶이도록 연결된 업체 이름을 쓴다
      const k = r.vendors?.name || r.vendor_name || "(미지정)";
      const entry = groupMap.get(k) ?? { vname: k, items: [] };
      for (const path of r.image_urls ?? []) {
        if ((path.toLowerCase().split(".").pop() ?? "") !== "pdf") continue;
        entry.items.push({
          path,
          date: r.invoice_date ?? "",
          pageStart: r.page_start,
          pageEnd: r.page_end,
        });
      }
      groupMap.set(k, entry);
    }
    // 날짜 오름차순 정렬
    for (const g of groupMap.values()) g.items.sort((a, b) => a.date.localeCompare(b.date));
    const groups = [...groupMap.values()].filter((g) => g.items.length > 0);
    if (groups.length === 0) {
      return NextResponse.json({ error: "다운로드할 PDF가 없습니다." }, { status: 422 });
    }

    console.log(`[vendor-ledger-zip] 시작 — ${groups.length}개 업체, 총 ${groups.reduce((s, g) => s + g.items.length, 0)}개 명세서`);
    const mupdf = await import("mupdf");
    const JSZipMod = (await import("jszip")).default;
    const zip = new JSZipMod();
    const used = new Set<string>();

    // 한 vendor의 PDF들을 하나로 합쳐 Node Buffer로 반환. 실패해도 throw하지 않음
    // (JSZip이 reject 시 스트림 자체를 error로 끝내버리므로 빈 Buffer로 대체).
    const mergeVendor = async (g: VGroup): Promise<Buffer> => {
      const t0 = Date.now();
      console.log(`[vendor-ledger-zip] "${g.vname}" 시작 (${g.items.length}개 명세서)`);
      let dst: InstanceType<typeof mupdf.PDFDocument> | null = null;
      // 같은 합본 PDF가 여러 명세서에서 참조될 수 있어 vendor 내에서 캐시 → 중복 다운로드/파싱 절약
      const fileCache = new Map<string, InstanceType<typeof mupdf.PDFDocument>>();
      try {
        dst = new mupdf.PDFDocument();
        for (const item of g.items) {
          try {
            let src = fileCache.get(item.path);
            if (!src) {
              const { data: blob } = await supabase.storage.from("invoices").download(item.path);
              if (!blob) continue;
              const bytes = new Uint8Array(await blob.arrayBuffer());
              src = mupdf.PDFDocument.openDocument(bytes, "application/pdf") as InstanceType<typeof mupdf.PDFDocument>;
              fileCache.set(item.path, src);
            }
            const total = src.countPages();
            // page_start/page_end는 1-indexed inclusive. NULL이면 전체 페이지.
            const startIdx = Math.max(0, (item.pageStart ?? 1) - 1);
            const endIdx = Math.min(total, item.pageEnd ?? total); // inclusive 1-indexed = exclusive 0-indexed
            for (let i = startIdx; i < endIdx; i++) dst.graftPage(-1, src, i);
          } catch (err) {
            console.error(`[vendor-ledger-zip] open/graft "${item.path}" (${item.pageStart}~${item.pageEnd}) 실패:`, err);
          }
        }
        if (dst.countPages() === 0) {
          console.log(`[vendor-ledger-zip] "${g.vname}" 완료 — 0 페이지 (스킵)`);
          return Buffer.alloc(0);
        }
        const mb = dst.saveToBuffer("compress");
        const out = Buffer.from(mb.asUint8Array());
        mb.destroy();
        console.log(`[vendor-ledger-zip] "${g.vname}" 완료 — ${dst.countPages()}p, ${(out.length / 1024).toFixed(0)}KB, ${Date.now() - t0}ms`);
        return out;
      } catch (err) {
        console.error(`[vendor-ledger-zip] "${g.vname}" 병합 실패:`, err);
        return Buffer.alloc(0);
      } finally {
        for (const src of fileCache.values()) src.destroy();
        dst?.destroy();
      }
    };

    // ⚠️ mupdf-wasm은 병렬 호출에 안전하지 않다.
    // `zip.file(name, mergeVendor(g))`로 promise를 등록하면 모든 mergeVendor가 즉시 시작돼
    // WASM 메모리를 동시에 만지면서 vendor A의 dst에 vendor B의 src 페이지가 grafted되는 식으로
    // 결과 PDF가 섞인다. → 순차 처리(await)로 vendor 하나가 끝난 뒤에 다음 시작.
    for (const g of groups) {
      const data = await mergeVendor(g);
      if (data.length === 0) continue;
      const base = (g.vname || "미지정").replace(/[\\/:*?"<>|]/g, " ").trim() || "미지정";
      let n = base;
      let i = 2;
      while (used.has(n)) n = `${base} ${i++}`;
      used.add(n);
      zip.file(`${n}.pdf`, data); // 실제 Buffer (promise 아님) → 스트림 중 추가 await 없음
      // vendor 사이 이벤트 루프 양보 → WASM/GC 정리 시간
      await new Promise<void>((r) => setImmediate(r));
    }
    if (used.size === 0) {
      return NextResponse.json({ error: "다운로드할 PDF가 없습니다." }, { status: 422 });
    }

    // PDF는 이미 압축돼 있어 ZIP 압축은 STORE — CPU/메모리 절약.
    // streamFiles:true → data descriptor로 파일 크기를 미리 안 적어도 됨(스트리밍 가능).
    // JSZip의 StreamHelper는 paused 상태로 시작 — 명시적으로 resume()해야 데이터가 흐름.
    // Readable.toWeb()은 이걸 자동 트리거하지 않아 스트림이 멈춰있게 됨 →
    // ReadableStream을 직접 만들어 events를 controller에 브리지하고 resume() 호출.
    type JSZipStream = {
      on: (event: string, listener: (...args: unknown[]) => void) => JSZipStream;
      resume: () => void;
    };
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const helper = zip.generateNodeStream({
          type: "nodebuffer",
          streamFiles: true,
          compression: "STORE",
        }) as unknown as JSZipStream;
        // JSZip이 'end' 후에도 추가 'data'를 emit하는 케이스가 있음.
        // 닫힌 controller에 enqueue하면 uncaughtException → response stream이 망가져
        // 브라우저가 "Failed to fetch"를 보게 됨. 닫힘 상태를 추적해 후행 이벤트를 안전 폐기.
        let closed = false;
        helper.on("data", (chunk: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(new Uint8Array(chunk as Buffer));
          } catch (err) {
            // controller가 이미 닫혀 enqueue 실패 → 후속도 폐기
            console.warn("[vendor-ledger-zip] 후행 data 폐기:", err);
            closed = true;
          }
        });
        helper.on("end", () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch {}
        });
        helper.on("error", (err: unknown) => {
          if (closed) return;
          closed = true;
          try { controller.error(err); } catch {}
        });
        helper.resume();
      },
    });
    const fname = (filename || "명세서원본.zip").replace(/[\\/:*?"<>|]/g, "_");
    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
      },
    });
  } catch (e) {
    console.error("[vendor-ledger-zip] 처리 실패:", e);
    const msg = e instanceof Error ? e.message : "서버 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
