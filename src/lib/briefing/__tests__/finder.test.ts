import { describe, expect, it } from "vitest";
import { chooseByRule, chooseCandidate } from "../finder/choose";
import { findPaper } from "../finder/find-paper";
import type { FetchLike } from "../finder/pubmed";
import { autoMemo, buildQuery, candidateRawText, candidateSource, excludeUsed, parseAutoMemo, parsePubmedXml, shortAuthors, type Candidate } from "../finder/sources";
import { parseCard } from "../schema";

const ABSTRACT =
  "This retrospective study evaluated 177 dogs with hemoperitoneum due to a ruptured splenic mass. Dogs that underwent surgery within 6 hours were compared with dogs that underwent surgery after 6 hours. Survival to discharge was 94.9% and did not differ between groups. Early surgery dogs received more transfusions.";

const article = (o: { pmid: string; title?: string; abstract?: string; doi?: string | null; pmc?: boolean; types?: string[]; journal?: string }) => `
<PubmedArticle>
  <MedlineCitation>
    <PMID Version="1">${o.pmid}</PMID>
    <Article>
      <Journal>
        <JournalIssue><PubDate><Year>2026</Year><Month>Nov</Month></PubDate></JournalIssue>
        <Title>Journal of the American Veterinary Medical Association</Title>
        <ISOAbbreviation>${o.journal ?? "J Am Vet Med Assoc"}</ISOAbbreviation>
      </Journal>
      <ArticleTitle>${o.title ?? "Delayed surgery &amp; <i>splenic</i> masses in dogs."}</ArticleTitle>
      <Abstract>
        <AbstractText Label="OBJECTIVE">${o.abstract ?? ABSTRACT}</AbstractText>
      </Abstract>
      <AuthorList><Author><LastName>Park</LastName><Initials>JE</Initials></Author><Author><LastName>Kim</LastName><Initials>S</Initials></Author></AuthorList>
      <PublicationTypeList>${(o.types ?? ["Journal Article"]).map((t) => `<PublicationType UI="D1">${t}</PublicationType>`).join("")}</PublicationTypeList>
    </Article>
  </MedlineCitation>
  <PubmedData>
    <History><PubMedPubDate PubStatus="pubmed"><Year>2026</Year><Month>11</Month><Day>3</Day></PubMedPubDate></History>
    <ArticleIdList>
      <ArticleId IdType="pubmed">${o.pmid}</ArticleId>
      ${o.doi === null ? "" : `<ArticleId IdType="doi">${o.doi ?? `10.2460/javma.${o.pmid}`}</ArticleId>`}
      ${o.pmc ? `<ArticleId IdType="pmc">PMC123</ArticleId>` : ""}
    </ArticleIdList>
  </PubmedData>
</PubmedArticle>`;
const xmlOf = (...arts: string[]) => `<?xml version="1.0"?><PubmedArticleSet>${arts.join("")}</PubmedArticleSet>`;

const cand = (o: Partial<Candidate> = {}): Candidate => ({
  kind: "vet",
  pmid: "1",
  doi: "10.1/a",
  title: "A study",
  abstract: ABSTRACT,
  journal: "J Vet Intern Med",
  journalFull: null,
  year: "2026",
  date: "2026-11-03",
  authors: "Park JE 외",
  pubTypes: ["Journal Article"],
  openAccess: false,
  url: "https://doi.org/10.1/a",
  ...o,
});

describe("검색식", () => {
  it("수의학은 개·고양이만, 논문이 아닌 것은 뺀다", () => {
    const q = buildQuery("emergency", "vet");
    expect(q).toContain('"1479-3261"[is]');
    expect(q).toContain("dogs[mh]");
    expect(q).toContain("hasabstract");
    expect(q).toMatch(/NOT \(comment\[pt\]/);
  });
  it("사람 의학은 동물 조건이 없다", () => {
    const q = buildQuery("imaging", "human");
    expect(q).toContain('"0033-8419"[is]');
    expect(q).not.toContain("dogs[mh]");
  });
  it("종합지는 분야 낱말이 있어야 한다", () => {
    expect(buildQuery("surgery", "vet")).toMatch(/"0003-1488"\[is\].*\) AND \(surgery\[tiab\]/);
  });
});

describe("PubMed 결과 해석", () => {
  it("서지 정보와 초록을 꺼낸다", () => {
    const [c] = parsePubmedXml(xmlOf(article({ pmid: "111", pmc: true })), "vet");
    expect(c.pmid).toBe("111");
    expect(c.title).toBe("Delayed surgery & splenic masses in dogs");
    expect(c.abstract.startsWith("OBJECTIVE: This retrospective study")).toBe(true);
    expect(c.journal).toBe("J Am Vet Med Assoc");
    expect(c.year).toBe("2026");
    expect(c.date).toBe("2026-11-03");
    expect(c.doi).toBe("10.2460/javma.111");
    expect(c.url).toBe("https://doi.org/10.2460/javma.111");
    expect(c.authors).toBe("Park JE 외");
    expect(c.openAccess).toBe(true);
  });
  it("초록이 짧거나 논문이 아닌 것은 뺀다", () => {
    const list = parsePubmedXml(xmlOf(article({ pmid: "1", abstract: "Too short." }), article({ pmid: "2", types: ["Journal Article", "Comment"] }), article({ pmid: "3" })), "vet");
    expect(list.map((c) => c.pmid)).toEqual(["3"]);
  });
  it("DOI 가 없으면 PubMed 주소", () => {
    const [c] = parsePubmedXml(xmlOf(article({ pmid: "9", doi: null })), "human");
    expect(c.url).toBe("https://pubmed.ncbi.nlm.nih.gov/9/");
    expect(c.kind).toBe("human");
  });
  it("검색 결과 순서대로 놓는다", () => {
    const list = parsePubmedXml(xmlOf(article({ pmid: "1" }), article({ pmid: "2" })), "vet", ["2", "1"]);
    expect(list.map((c) => c.pmid)).toEqual(["2", "1"]);
  });
  it("저자 줄임", () => {
    expect(shortAuthors([])).toBeNull();
    expect(shortAuthors(["Kim S"])).toBe("Kim S");
    expect(shortAuthors(["Kim S", "Lee J"])).toBe("Kim S 외");
  });
});

describe("이미 쓴 논문 빼기", () => {
  it("DOI(대소문자 무시)와 제목이 같으면 뺀다", () => {
    const list = [cand({ doi: "10.1/A" }), cand({ doi: "10.1/b", title: "Same Title Here!" }), cand({ doi: "10.1/c", title: "New one" })];
    const left = excludeUsed(list, { dois: ["10.1/a"], titles: ["same title here"] });
    expect(left.map((c) => c.doi)).toEqual(["10.1/c"]);
  });
});

describe("카드 출처", () => {
  it("데이터베이스 값만 쓰고 카드 규격에 맞다", () => {
    const src = candidateSource(cand({ openAccess: true }), "retrospective study");
    expect(src).toMatchObject({ journal: "J Vet Intern Med", year: "2026", doi: "10.1/a", authors: "Park JE 외", basis: "초록 기준 요약 · 무료 원문", studyType: "retrospective study" });
    const card = parseCard({ schemaVersion: 1, category: "internal", headline: "제목", lead: null, layoutVariant: "minimal", blocks: [], source: src });
    expect(card.ok).toBe(true);
  });
  it("원문에는 서지 정보와 초록이 다 들어간다 (숫자 검사의 기준)", () => {
    const raw = candidateRawText(cand({ kind: "human" }));
    expect(raw).toContain("DOI: 10.1/a");
    expect(raw).toContain("(사람 의학 논문)");
    expect(raw).toContain("94.9%");
  });
  it("자동 찾기 표시를 읽고 쓴다", () => {
    const memo = autoMemo(cand(), "imaging");
    expect(parseAutoMemo(memo)).toEqual({ category: "imaging" });
    expect(parseAutoMemo("관리자 메모")).toBeNull();
    expect(parseAutoMemo(null)).toBeNull();
  });
});

const fakeClient = (text: string) => ({ create: async () => ({ content: [{ type: "text" as const, text, citations: null }], stop_reason: "end_turn" as const }) });

describe("고르기", () => {
  const list = [cand({ kind: "human", pmid: "h" }), cand({ pmid: "v1" }), cand({ pmid: "v2" })];
  it("AI 없이: 가장 최근 수의학 논문", () => {
    expect(chooseByRule(list)?.pmid).toBe("v1");
    expect(chooseByRule([cand({ kind: "human", pmid: "h" })])?.pmid).toBe("h");
  });
  it("AI 가 고른 번호를 쓴다", async () => {
    const r = await chooseCandidate("internal", list, { useAi: true, client: fakeClient('{"index":2,"reason":"이유"}') as never });
    expect(r).toMatchObject({ by: "ai", reason: "이유" });
    expect(r?.candidate.pmid).toBe("v2");
  });
  it("목록 밖 번호·깨진 응답이면 규칙으로", async () => {
    for (const text of ['{"index":7,"reason":"x"}', "not json"]) {
      const r = await chooseCandidate("internal", list, { useAi: true, client: fakeClient(text) as never });
      expect(r).toMatchObject({ by: "rule" });
      expect(r?.candidate.pmid).toBe("v1");
    }
  });
  it("맞는 게 없다(-1)면 고르지 않는다", async () => {
    expect(await chooseCandidate("internal", list, { useAi: true, client: fakeClient('{"index":-1,"reason":"없음"}') as never })).toBeNull();
  });
});

describe("찾기 전체 (가짜 PubMed, AI 없이)", () => {
  const fakeFetch = (pages: Record<string, string>): FetchLike => async (url) => {
    const key = url.includes("esearch") ? (url.includes("dogs%5Bmh%5D") ? "vet-search" : "human-search") : url.includes("id=") ? `fetch:${new URL(url).searchParams.get("id")}` : "";
    const body = pages[key];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => body ?? "" };
  };
  it("수의학 논문으로 카드를 만들고 출처·분야를 고정한다", async () => {
    const r = await findPaper(
      "emergency",
      { today: "2026-11-25", used: { dois: [], titles: [] } },
      {
        provider: "rule",
        fetchImpl: fakeFetch({
          "vet-search": JSON.stringify({ esearchresult: { idlist: ["5"] } }),
          "human-search": JSON.stringify({ esearchresult: { idlist: [] } }),
          "fetch:5": xmlOf(article({ pmid: "5" })),
        }),
      }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.category).toBe("emergency");
    expect(r.card.source.doi).toBe("10.2460/javma.5");
    expect(r.card.source.basis).toBe("초록 기준 요약");
    expect(r.design.mode).toBe("rule");
  });
  it("후보가 없으면 no-candidates, 검색이 실패하면 search-failed", async () => {
    const empty = await findPaper("internal", { today: "2026-11-25", used: { dois: [], titles: [] } }, { provider: "rule", fetchImpl: fakeFetch({ "vet-search": '{"esearchresult":{"idlist":[]}}', "human-search": '{"esearchresult":{"idlist":[]}}' }) });
    expect(empty).toEqual({ ok: false, reason: "no-candidates" });
    const down = await findPaper("internal", { today: "2026-11-25", used: { dois: [], titles: [] } }, { provider: "rule", fetchImpl: fakeFetch({}) });
    expect(down).toEqual({ ok: false, reason: "search-failed" });
  });
});
