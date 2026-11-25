import type { CardSource, CategoryKey, DetailAuthor } from "../schema";

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

/**
 * 저널 묶음. issns(ISSN) 또는 titles(PubMed 저널 약어)로 고른다. terms 가 있으면 그 낱말이 제목·초록에 있는 논문만.
 * 저널을 더할 때는 PubMed 에서 최근 60일 개·고양이 논문이 실제로 잡히는지 먼저 확인할 것 (J Am Anim Hosp Assoc 는 0건이라 뺐다).
 */
type JournalSet = { issns?: string[]; titles?: string[]; terms?: string[] };
type CategorySearch = { vet: JournalSet[]; human: JournalSet[] };

/** 수의 종합지 — 분야 낱말이 들어간 논문만 */
const VET_GENERAL: JournalSet = {
  issns: ["0003-1488" /* JAVMA */, "0022-4510" /* J Small Anim Pract */, "1098-612X" /* J Feline Med Surg */],
  titles: ["Vet J", "Vet Rec", "Front Vet Sci", "BMC Vet Res", "Can Vet J", "Top Companion Anim Med"],
};
const TERMS = {
  internal: ["internal medicine", "endocrin*", "nephro*", "renal", "gastro*", "hepat*", "cardio*", "oncolog*"],
  surgery: ["surgery", "surgical", "postoperative", "laparoscop*"],
  imaging: ["radiograph*", "ultrasonograph*", "computed tomography", "magnetic resonance", "echocardiograph*"],
  emergency: ["emergency", "critical care", "trauma", "shock", "sepsis", "resuscitation"],
};

export const SEARCH_CONFIG: Record<FindCategory, CategorySearch> = {
  internal: {
    vet: [{ issns: ["0891-6640" /* J Vet Intern Med */], titles: ["J Vet Cardiol", "Vet Comp Oncol"] }, { ...VET_GENERAL, terms: TERMS.internal }],
    human: [{ issns: ["0028-4793" /* NEJM */, "0140-6736" /* Lancet */, "0098-7484" /* JAMA */, "0003-4819" /* Ann Intern Med */] }],
  },
  surgery: {
    vet: [{ issns: ["0161-3499" /* Vet Surg */, "0932-0814" /* Vet Comp Orthop Traumatol */], titles: ["J Vet Dent"] }, { ...VET_GENERAL, terms: TERMS.surgery }],
    human: [{ issns: ["2168-6254" /* JAMA Surg */, "0003-4932" /* Ann Surg */, "0007-1323" /* Br J Surg */] }],
  },
  imaging: {
    vet: [{ issns: ["1058-8183" /* Vet Radiol Ultrasound */] }, { titles: ["J Vet Cardiol"], terms: TERMS.imaging }, { ...VET_GENERAL, terms: TERMS.imaging }],
    human: [{ issns: ["0033-8419" /* Radiology */, "0938-7994" /* Eur Radiol */] }],
  },
  emergency: {
    vet: [{ issns: ["1479-3261" /* J Vet Emerg Crit Care */] }, { titles: ["Vet Anaesth Analg"], terms: TERMS.emergency }, { ...VET_GENERAL, terms: TERMS.emergency }],
    human: [{ issns: ["0196-0644" /* Ann Emerg Med */, "0090-3493" /* Crit Care Med */, "0342-4642" /* Intensive Care Med */] }],
  },
};

const journalClause = (set: JournalSet) => {
  const names = [...(set.issns ?? []).map((i) => `"${i}"[is]`), ...(set.titles ?? []).map((t) => `"${t}"[ta]`)];
  const journals = `(${names.join(" OR ")})`;
  if (!set.terms) return journals;
  const words = set.terms.map((w) => (w.includes(" ") ? `"${w}"[tiab]` : `${w}[tiab]`)).join(" OR ");
  return `(${journals} AND (${words}))`;
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
  /** PubMed Central 번호 (예: "PMC123") — 있으면 무료 원문을 받아 본문으로 요약한다 */
  pmcid: string | null;
  /** 해설 페이지에 적을 저자 — PubMed 가 교신저자로 표시한 사람(이메일이 붙은 소속), 없으면 제1저자 */
  contact: DetailAuthor | null;
  url: string;
};

/** 소속 글에서 이메일을 지운다 (공개 페이지에 개인 이메일을 싣지 않는다) */
export function cleanAffiliation(aff: string): string | null {
  const t = aff
    .replace(/^\s*\d+\s*/, "") // 각주 번호 ("1Gastrointestinal …")
    .replace(/Electronic address:?\s*\S+@\S+/gi, "")
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/[\s.,;]+$/, "")
    .trim();
  return t ? t.slice(0, 300) : null;
}

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

    // 이 논문 자신의 번호들 — PubmedData 의 첫 ArticleIdList. (뒤의 ReferenceList 에는 참고문헌의 DOI·PMC 번호가 있어서 거기까지 보면 안 된다)
    const ids = all(inner(inner(art, "PubmedData") ?? "", "ArticleIdList") ?? "", "ArticleId");
    const elocDoi = all(art, "ELocationID").find((e) => attr(e.attrs, "EIdType") === "doi")?.body;
    const doi = decode(ids.find((i) => attr(i.attrs, "IdType") === "doi")?.body ?? elocDoi ?? "") || null;
    const pmc = decode(ids.find((i) => attr(i.attrs, "IdType") === "pmc")?.body ?? "");
    const pmcid = /^PMC\d+$/.test(pmc) ? pmc : null;

    const authorRows = all(inner(art, "AuthorList") ?? "", "Author").map(({ body }) => {
      const last = text(body, "LastName");
      const short = last ? `${last} ${text(body, "Initials")}`.trim() : text(body, "CollectiveName");
      const full = last ? [text(body, "ForeName"), last].filter(Boolean).join(" ") : short;
      const affs = all(body, "Affiliation").map((a) => decode(a.body));
      return { short, full, affs };
    });
    const authors = authorRows.map((a) => a.short);
    // PubMed 는 교신저자의 소속에 "Electronic address: 이메일"을 붙인다 — 그 사람을 교신저자로, 없으면 제1저자
    const corr = authorRows.find((a) => a.affs.some((x) => /Electronic address|@/.test(x)));
    const who = corr ?? authorRows[0];
    const contact: DetailAuthor | null = who?.full
      ? { role: corr ? "corresponding" : "first", name: who.full.slice(0, 120), affiliation: who.affs.map(cleanAffiliation).find(Boolean) ?? null }
      : null;

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
      contact,
      pubTypes,
      pmcid,
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

/** 본문 발췌의 최대 길이 (AI 입력이 너무 길어지지 않게) */
export const FULL_TEXT_MAX = 14_000;
/** 본문 구역 우선순위: 결과·고찰·결론 → 방법 → 나머지 */
const SECTION_RANK: [RegExp, number][] = [
  [/result|finding|case (report|description|presentation)|outcome/i, 0],
  [/discussion|conclusion|clinical (relevance|significance|importance)|limitation/i, 1],
  [/method|material|animal|patient|design|statistic/i, 2],
];

/**
 * PMC 원문(JATS XML) → 본문 발췌. 표·그림·참고문헌은 빼고, 결과·고찰부터 FULL_TEXT_MAX 글자까지.
 * 본문을 주지 않는 논문(출판사가 막음)이면 null.
 */
export function parsePmcBody(xml: string, max = FULL_TEXT_MAX): string | null {
  const body = inner(xml, "body");
  if (!body) return null;
  const cleaned = body
    .replace(/<(table-wrap|fig|table|disp-formula|supplementary-material|ref-list)[\s>][\s\S]*?<\/\1>/g, " ")
    .replace(/<xref[^>]*>[\s\S]*?<\/xref>/g, "")
    .replace(/<title>([\s\S]*?)<\/title>/g, (_, t: string) => `\n@@SEC@@${decode(t)}@@\n`)
    .replace(/<\/p>/g, "\n");
  const chunks = cleaned
    .split(/\n@@SEC@@/)
    .map((part, i) => {
      const m = i === 0 ? null : part.match(/^([^@]*)@@\n?([\s\S]*)$/);
      const title = m ? m[1].trim() : "";
      const textBody = (m ? m[2] : part)
        .split("\n")
        .map((line) => decode(line))
        .filter(Boolean)
        .join("\n");
      return { i, title, text: textBody };
    })
    .filter((c) => c.text.length > 0);
  if (chunks.length === 0) return null;

  const rank = (title: string) => SECTION_RANK.find(([re]) => re.test(title))?.[1] ?? 3;
  const picked = new Set<number>();
  let used = 0;
  for (const c of [...chunks].sort((a, b) => rank(a.title) - rank(b.title) || a.i - b.i)) {
    const size = c.text.length + c.title.length + 4;
    if (used + size > max) continue;
    picked.add(c.i);
    used += size;
  }
  const out = chunks
    .filter((c) => picked.has(c.i))
    .map((c) => (c.title ? `[${c.title}]\n${c.text}` : c.text))
    .join("\n\n");
  return out.length >= 500 ? out : null;
}

/** PMC 원문(JATS XML)의 교신저자 (corresp="yes" 또는 교신 표시가 붙은 저자). 없으면 null */
export function parsePmcCorresp(xml: string): DetailAuthor | null {
  const front = inner(xml, "front") ?? xml;
  const contribs = all(front, "contrib").filter((c) => /contrib-type="author"/.test(c.attrs) || !/contrib-type=/.test(c.attrs));
  const corr = contribs.find((c) => /corresp="yes"/.test(c.attrs) || /<xref[^>]*ref-type="corresp"/.test(c.body));
  if (!corr) return null;
  const nameXml = inner(corr.body, "name") ?? "";
  const name = [text(nameXml, "given-names"), text(nameXml, "surname")].filter(Boolean).join(" ") || text(corr.body, "collab");
  if (!name) return null;
  const rid = corr.body.match(/<xref[^>]*ref-type="aff"[^>]*rid="([^"]+)"/)?.[1];
  const affs = all(front, "aff");
  const aff = (rid ? affs.find((a) => attr(a.attrs, "id") === rid) : undefined) ?? affs[0];
  const affText = aff ? decode(aff.body.replace(/<label>[\s\S]*?<\/label>/g, "")) : "";
  return { role: "corresponding", name: name.slice(0, 120), affiliation: cleanAffiliation(affText) };
}

/**
 * AI(또는 규칙 정리)에 넘길 원문 = 서지 정보 + 초록 (+ 무료 원문이면 본문 발췌). 카드의 숫자는 이 글에 있는 것만 허용된다.
 */
export function candidateRawText(c: Candidate, fullText?: string | null): string {
  return [
    c.title,
    [c.journalFull && c.journalFull !== c.journal ? `${c.journalFull} (${c.journal})` : c.journal, c.date ?? c.year, c.authors].filter(Boolean).join(" · "),
    c.doi ? `DOI: ${c.doi}` : null,
    c.kind === "human" ? "(사람 의학 논문)" : null,
    "",
    "ABSTRACT",
    c.abstract,
    ...(fullText ? ["", "FULL TEXT (excerpt)", fullText] : []),
  ]
    .filter((v) => v !== null)
    .join("\n");
}

/** 카드의 출처 — 데이터베이스 값만 쓴다 (AI 가 쓴 출처는 버린다). 연구 유형만 AI 가 원문에서 읽은 값을 쓸 수 있다 */
export function candidateSource(c: Candidate, studyType: string | null, usedFullText = false): CardSource {
  return {
    journal: c.journal.slice(0, 120),
    year: c.year,
    studyType: studyType ?? null,
    title: c.title.slice(0, 300),
    doi: c.doi,
    url: c.url,
    authors: c.authors ? c.authors.slice(0, 120) : null,
    basis: usedFullText ? "무료 원문 기준 요약" : "초록 기준 요약",
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
