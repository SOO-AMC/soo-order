import type { FetchLike } from "./pubmed";
import { parsePdfText } from "./sources";

/**
 * Unpaywall — 논문(DOI)의 "합법적인 무료 원문" 위치를 알려 주는 무료 서비스. https://unpaywall.org/products/api
 * 요청마다 이메일 주소를 붙여야 한다(가입·키 없음). 주소는 서버 환경변수 UNPAYWALL_EMAIL — 없으면 이 단계를 건너뛴다.
 *
 * 쓰는 곳 두 가지:
 *  1. PubMed 기록에는 아직 PMC 번호가 안 붙었지만 PMC 에 이미 올라간 논문 → 그 번호로 PMC 본문을 읽는다(가장 흔함)
 *  2. 오픈액세스 저널이 PDF 를 그대로 주는 경우(Frontiers 등) → PDF 글자를 뽑는다
 * 출판사가 막는 곳(403·자바스크립트 화면)은 그냥 넘어간다 — 차단을 우회하지 않는다.
 */

export type OaHit = { pmcid: string | null; pdfUrl: string | null };

type OaLocation = { url?: string | null; url_for_pdf?: string | null; version?: string | null; host_type?: string | null };

/** Unpaywall 응답 → PMC 번호 / 받아 볼 PDF 주소. 사전 공개본(submittedVersion)은 쓰지 않는다 */
export function pickOaLocation(json: unknown): OaHit | null {
  const j = json as { is_oa?: boolean; oa_locations?: OaLocation[] } | null;
  if (!j?.is_oa || !Array.isArray(j.oa_locations)) return null;
  const locs = j.oa_locations.filter((l) => l && l.version !== "submittedVersion");
  let pmcid: string | null = null;
  for (const l of locs) {
    const m = `${l.url ?? ""} ${l.url_for_pdf ?? ""}`.match(/\b(PMC\d{4,})\b/);
    if (m) {
      pmcid = m[1];
      break;
    }
  }
  const pdf = locs.find((l) => typeof l.url_for_pdf === "string" && /^https:\/\//i.test(l.url_for_pdf));
  if (!pmcid && !pdf) return null;
  return { pmcid, pdfUrl: pdf?.url_for_pdf ?? null };
}

export function unpaywallEmail(): string | null {
  const e = (process.env.UNPAYWALL_EMAIL ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

const defaultFetch: FetchLike = (url, init) => fetch(url, { ...init, cache: "no-store" });

/** DOI → 무료 원문 위치. 실패하면 null (요약은 초록으로 계속한다) */
export async function lookupUnpaywall(doi: string, email: string, opts: { fetchImpl?: FetchLike } = {}): Promise<OaHit | null> {
  const doFetch = opts.fetchImpl ?? defaultFetch;
  try {
    const res = await doFetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return pickOaLocation(JSON.parse(await res.text()));
  } catch {
    return null;
  }
}

/** 이보다 큰 PDF 는 받지 않는다 (서버 메모리) */
const PDF_MAX_BYTES = 15 * 1024 * 1024;
/** 앞에서부터 이만큼의 쪽만 읽는다 */
const PDF_MAX_PAGES = 40;

/**
 * 무료 원문 PDF → 본문 발췌. 받기(200 + PDF 시작 표시 + 크기 제한)나 글자 뽑기에 실패하면 null.
 * mupdf 객체는 쓴 뒤 바로 destroy (WASM 메모리는 저절로 줄지 않는다).
 */
export async function fetchPdfText(url: string, opts: { email?: string | null } = {}): Promise<string | null> {
  if (!/^https:\/\//i.test(url)) return null;
  let bytes: Uint8Array;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/pdf", "User-Agent": `briefing-finder/1.0${opts.email ? ` (mailto:${opts.email})` : ""}` },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > PDF_MAX_BYTES) return null;
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.length > PDF_MAX_BYTES || bytes.length < 1000 || !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return null; // "%PDF"

  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    const parts: string[] = [];
    try {
      const n = Math.min(doc.countPages(), PDF_MAX_PAGES);
      for (let i = 0; i < n; i++) {
        const page = doc.loadPage(i);
        const st = page.toStructuredText("preserve-whitespace");
        parts.push(st.asText());
        st.destroy();
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
    return parsePdfText(parts.join("\n"));
  } catch {
    return null;
  }
}
