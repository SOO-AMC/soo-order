import type { CardSource, CategoryKey } from "../schema";

/**
 * 논문 자동 찾기 — 검색 조건과 결과 다듬기 (순수 함수, 테스트 대상).
 *
 * 논문은 PubMed(미국 국립의학도서관의 무료 논문 데이터베이스)에서 찾는다.
 * AI 가 인터넷을 검색하면 없는 논문·틀린 DOI 를 지어낼 수 있어서, 실제로 등록된 논문만 후보로 쓰고
 * 카드의 출처는 AI 가 아니라 여기서 만든 값(데이터베이스 값)으로 채운다.
 */

/** 날마다 1건씩 찾는 분야 (이 순서로 카드가 놓인다) */
export const FIND_CATEGORIES = ["internal", "surgery", "imaging", "emergency"] as const satisfies readonly CategoryKey[];
export type FindCategory = (typeof FIND_CATEGORIES)[number];
export const isFindCategory = (v: unknown): v is FindCategory => typeof v === "string" && (FIND_CATEGORIES as readonly string[]).includes(v);

/** "최신" = 최근 며칠 안에 처음 나온 논문 */
export const RECENT_DAYS = 60;

/** 개·고양이 논문만 (말·소만 다룬 논문 제외) */
const SMALL_ANIMAL = "(dogs[mh] OR cats[mh] OR dog[tiab] OR dogs[tiab] OR canine[tiab] OR cat[tiab] OR cats[tiab] OR feline[tiab])";
/** 논문이 아닌 것 (정정·댓글·사설 등) */
const NOT_ARTICLE = '(comment[pt] OR letter[pt] OR editorial[pt] OR erratum[pt] OR "published erratum"[pt] OR "retraction of publication"[pt] OR news[pt])';

/** 저널 묶음 (ISSN). terms 가 있으면 그 낱말이 제목·초록에 있는 논문만 */
type JournalSet = { issns: string[]; terms?: string[] };
type CategorySearch = { vet: JournalSet[]; human: JournalSet[] };

/** 수의 종합지 — 분야 낱말이 들어간 논문만 */
const VET_GENERAL = ["0003-1488" /* JAVMA */, "0022-4510" /* J Small Anim Pract */, "1098-612X" /* J Feline Med Surg */];

export const SEARCH_CONFIG: Record<FindCategory, CategorySearch> = {
  internal: {
    vet: [{ issns: ["0891-6640" /* J Vet Intern Med */] }, { issns: VET_GENERAL, terms: ["internal medicine", "endocrin*", "nephro*", "renal", "gastro*", "hepat*", "cardio*", "oncolog*"] }],
    human: [{ issns: ["0028-4793" /* NEJM */, "0140-6736" /* Lancet */, "0098-7484" /* JAMA */, "0003-4819" /* Ann Intern Med */] }],
  },
  surgery: {
    vet: [{ issns: ["0161-3499" /* Vet Surg */, "0932-0814" /* Vet Comp Orthop Traumatol */] }, { issns: VET_GENERAL, terms: ["surgery", "surgical", "postoperative", "laparoscop*"] }],
    human: [{ issns: ["2168-6254" /* JAMA Surg */, "0003-4932" /* Ann Surg */, "0007-1323" /* Br J Surg */] }],
  },
  imaging: {
    vet: [{ issns: ["1058-8183" /* Vet Radiol Ultrasound */] }, { issns: VET_GENERAL, terms: ["radiograph*", "ultrasonograph*", "computed tomography", "magnetic resonance", "echocardiograph*"] }],
    human: [{ issns: ["0033-8419" /* Radiology */, "0938-7994" /* Eur Radiol */] }],
  },
  emergency: {
    vet: [{ issns: ["1479-3261" /* J Vet Emerg Crit Care */] }, { issns: VET_GENERAL, terms: ["emergency", "critical care", "trauma", "shock", "sepsis", "resuscitation"] }],
    human: [{ issns: ["0196-0644" /* Ann Emerg Med */, "0090-3493" /* Crit Care Med */, "0342-4642" /* Intensive Care Med */] }],
  },
};

const journalClause = (set: JournalSet) => {
  const issn = `(${set.issns.map((i) => `"${i}"[is]`).join(" OR ")})`;
  if (!set.terms) return issn;
  const words = set.terms.map((w) => (w.includes(" ") ? `"${w}"[tiab]` : `${w}[tiab]`)).join(" OR ");
  return `(${issn} AND (${words}))`;
};

/** PubMed 검색식 (날짜는 검색 요청의 mindate/maxdate 로 따로 건다) */
export function buildQuery(category: FindCategory, kind: "vet" | "human"): string {
  const sets = SEARCH_CONFIG[category][kind];
  const parts = [`(${sets.map(journalClause).join(" OR ")})`, "hasabstract"];
  if (kind === "vet") parts.push(SMALL_ANIMAL);
  return `${parts.join(" AND ")} NOT ${NOT_ARTICLE}`;
}

/** 후보 논문 1건 */
export type Candidate = {
  kind: "vet" | "human";
  pmid: string | null;
  doi: string | null;
  title: string;
  abstract: string;
  journal: string;
  journalFull: string | null;
  year: string | null;
  /** 처음 나온 날 YYYY-MM-DD */
  date: string | null;
  authors: string | null;
  pubTypes: string[];
  openAccess: boolean;
  url: string;
};

/** 논문이 아닌 것(정정·댓글·사설 등)은 후보에서 뺀다 — 검색식에서도 빼지만 한 번 더 */
const SKIP_TYPES = /erratum|correction|comment|letter|editorial|retract|news|expression of concern/i;

const decode = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** 태그 하나의 안쪽 글 (첫 번째) */
const inner = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
};
const all = (xml: string, tag: string): { attrs: string; body: string }[] =>
  [...xml.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => ({ attrs: m[1] ?? "", body: m[2] }));
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
const text = (xml: string, tag: string) => decode(inner(xml, tag) ?? "");

/** 저자 목록 → "첫 저자 외" (성 + 이니셜) */
export function shortAuthors(names: string[]): string | null {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return list.length === 1 ? list[0] : `${list[0]} 외`;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const month2 = (v: string) => MONTHS[v.slice(0, 3).toLowerCase()] ?? v.padStart(2, "0");

/** PubMed efetch(XML) → 후보 목록. 제목·초록이 없거나 논문이 아닌 것은 뺀다. 순서는 order(검색 결과 순)대로 */
export function parsePubmedXml(xml: string, kind: "vet" | "human", order: string[] = []): Candidate[] {
  const out: Candidate[] = [];
  for (const { body: art } of all(xml, "PubmedArticle")) {
    const pmid = text(art, "PMID") || null;
    const title = text(art, "ArticleTitle").replace(/\.$/, "");
    const abstract = all(inner(art, "Abstract") ?? "", "AbstractText")
      .map(({ attrs, body }) => {
        const label = attr(attrs, "Label");
        const t = decode(body);
        return label && t ? `${label}: ${t}` : t;
      })
      .filter(Boolean)
      .join("\n");
    if (!title || abstract.length < 200) continue;
    const pubTypes = all(art, "PublicationType").map((p) => decode(p.body));
    if (pubTypes.some((t) => SKIP_TYPES.test(t))) continue;

    const journalXml = inner(art, "Journal") ?? "";
    const journal = text(journalXml, "ISOAbbreviation") || text(art, "MedlineTA");
    if (!journal) continue;
    const journalFull = text(journalXml, "Title") || null;
    const pubDate = inner(journalXml, "PubDate") ?? "";
    const year = text(pubDate, "Year") || text(pubDate, "MedlineDate").slice(0, 4) || null;

    // 처음 나온 날: PubMed 에 올라온 날
    const hist = all(art, "PubMedPubDate").find((d) => /PubStatus="(pubmed|entrez)"/.test(d.attrs));
    const [y, m, d] = hist ? [text(hist.body, "Year"), text(hist.body, "Month"), text(hist.body, "Day")] : ["", "", ""];
    const date = y && m && d ? `${y}-${month2(m)}-${d.padStart(2, "0")}` : null;

    const ids = all(inner(art, "PubmedData") ?? art, "ArticleId");
    const doi = decode(ids.find((i) => attr(i.attrs, "IdType") === "doi")?.body ?? "") || null;
    const pmc = ids.some((i) => attr(i.attrs, "IdType") === "pmc");

    const authors = all(inner(art, "AuthorList") ?? "", "Author").map(({ body }) => {
      const last = text(body, "LastName");
      return last ? `${last} ${text(body, "Initials")}`.trim() : text(body, "CollectiveName");
    });

    out.push({
      kind,
      pmid,
      doi,
      title,
      abstract,
      journal,
      journalFull,
      year,
      date,
      authors: shortAuthors(authors),
      pubTypes,
      openAccess: pmc,
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid ?? ""}/`,
    });
  }
  if (order.length > 0) {
    const rank = new Map(order.map((id, i) => [id, i]));
    out.sort((a, b) => (rank.get(a.pmid ?? "") ?? 1e9) - (rank.get(b.pmid ?? "") ?? 1e9));
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");

/** 이미 브리핑에 쓴 논문(DOI·제목)과 같은 후보를 뺀다 */
export function excludeUsed(cands: Candidate[], used: { dois: Iterable<string>; titles: Iterable<string> }): Candidate[] {
  const dois = new Set([...used.dois].map((d) => d.toLowerCase().trim()).filter(Boolean));
  const titles = new Set([...used.titles].map(norm).filter((t) => t.length > 10));
  const seen = new Set<string>();
  return cands.filter((c) => {
    const key = c.doi?.toLowerCase() ?? `t:${norm(c.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (c.doi && dois.has(c.doi.toLowerCase())) return false;
    if (titles.has(norm(c.title))) return false;
    return true;
  });
}

/** AI(또는 규칙 정리)에 넘길 원문 = 서지 정보 + 초록. 카드의 숫자는 이 글에 있는 것만 허용된다 */
export function candidateRawText(c: Candidate): string {
  return [
    c.title,
    [c.journalFull ?? c.journal, c.date ?? c.year, c.authors].filter(Boolean).join(" · "),
    c.doi ? `DOI: ${c.doi}` : null,
    c.kind === "human" ? "(사람 의학 논문)" : null,
    "",
    c.abstract,
  ]
    .filter((v) => v !== null)
    .join("\n");
}

/** 카드의 출처 — 데이터베이스 값만 쓴다 (AI 가 쓴 출처는 버린다). 연구 유형만 AI 가 초록에서 읽은 값을 쓸 수 있다 */
export function candidateSource(c: Candidate, studyType: string | null): CardSource {
  return {
    journal: c.journal.slice(0, 120),
    year: c.year,
    studyType: studyType ?? null,
    title: c.title.slice(0, 300),
    doi: c.doi,
    url: c.url,
    authors: c.authors ? c.authors.slice(0, 120) : null,
    basis: c.openAccess ? "초록 기준 요약 · 무료 원문" : "초록 기준 요약",
  };
}

/** 관리자 메모에 남기는 자동 찾기 표시 (이 표시가 있는 논문 = 자동으로 찾은 논문) */
export const AUTO_MEMO_PREFIX = "자동 찾기";
export function autoMemo(c: Candidate, category: FindCategory): string {
  const id = c.pmid ? `PMID ${c.pmid}` : c.doi ? `DOI ${c.doi}` : c.url;
  return `${AUTO_MEMO_PREFIX} · ${category} · ${c.kind === "vet" ? "수의학" : "사람 의학"} · ${id}`;
}
export function parseAutoMemo(memo: string | null | undefined): { category: FindCategory } | null {
  if (!memo?.startsWith(AUTO_MEMO_PREFIX)) return null;
  const cat = memo.split(" · ")[1];
  return isFindCategory(cat) ? { category: cat } : null;
}
