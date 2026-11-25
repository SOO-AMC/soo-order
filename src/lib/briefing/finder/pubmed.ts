import { buildQuery, parsePmcBody, parsePubmedXml, type Candidate, type FindCategory } from "./sources";

/**
 * PubMed 검색 (서버 전용). NCBI E-utilities — 무료·키 없음(초당 3번까지).
 * 보내는 것은 검색식과 날짜뿐이다. 사용자·병원 정보는 보내지 않는다.
 * https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
const TOOL = "briefing-finder";

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class FinderSearchError extends Error {
  constructor(readonly status: string) {
    super(`pubmed: ${status}`);
    this.name = "FinderSearchError";
  }
}

const ymd = (d: string) => d.replace(/-/g, "/");

async function get(doFetch: FetchLike, url: string): Promise<string> {
  // 초당 횟수 제한(429)·일시 오류는 한 번 쉬었다 다시
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(url, { signal: AbortSignal.timeout(20_000) });
    } catch {
      if (attempt === 0) continue;
      throw new FinderSearchError("network");
    }
    if (res.ok) return res.text();
    if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    throw new FinderSearchError(String(res.status));
  }
  throw new FinderSearchError("network");
}

/** 한 분야·한 종류(수의학/사람 의학)의 최근 논문 후보. 최근 순 */
export async function searchCandidates(
  category: FindCategory,
  kind: "vet" | "human",
  range: { from: string; to: string },
  opts: { max?: number; fetchImpl?: FetchLike } = {}
): Promise<Candidate[]> {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const search = new URLSearchParams({
    db: "pubmed",
    term: buildQuery(category, kind),
    retmode: "json",
    retmax: String(opts.max ?? 15),
    sort: "pub_date",
    datetype: "edat",
    mindate: ymd(range.from),
    maxdate: ymd(range.to),
    tool: TOOL,
  });
  let ids: string[];
  try {
    const json = JSON.parse(await get(doFetch, `${EUTILS}esearch.fcgi?${search}`)) as { esearchresult?: { idlist?: unknown } };
    const list = json.esearchresult?.idlist;
    ids = Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && /^\d+$/.test(v)) : [];
  } catch (e) {
    if (e instanceof FinderSearchError) throw e;
    throw new FinderSearchError("bad-response");
  }
  if (ids.length === 0) return [];
  const fetchParams = new URLSearchParams({ db: "pubmed", id: ids.join(","), retmode: "xml", tool: TOOL });
  const xml = await get(doFetch, `${EUTILS}efetch.fcgi?${fetchParams}`);
  return parsePubmedXml(xml, kind, ids);
}

/** 무료 원문(PubMed Central) 본문 발췌. 못 받거나 출판사가 본문을 막았으면 null — 그때는 초록만으로 요약한다 */
export async function fetchFullText(pmcid: string, opts: { fetchImpl?: FetchLike } = {}): Promise<string | null> {
  const id = pmcid.replace(/^PMC/i, "");
  if (!/^\d+$/.test(id)) return null;
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  try {
    const xml = await get(doFetch, `${EUTILS}efetch.fcgi?${new URLSearchParams({ db: "pmc", id, retmode: "xml", tool: TOOL })}`);
    return parsePmcBody(xml);
  } catch {
    return null;
  }
}
