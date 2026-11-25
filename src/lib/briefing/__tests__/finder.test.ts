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
      <AuthorList><Author><LastName>Park</LastName><ForeName>Ji Eun</ForeName><Initials>JE</Initials><AffiliationInfo><Affiliation>Seoul Animal Hospital, Seoul, Korea.</Affiliation></AffiliationInfo></Author><Author><LastName>Kim</LastName><ForeName>Su</ForeName><Initials>S</Initials><AffiliationInfo><Affiliation>Dept of Surgery, Vet School, Davis, CA. Electronic address: kim@vet.edu.</Affiliation></AffiliationInfo></Author></AuthorList>
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
    <ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.9/ref</ArticleId><ArticleId IdType="pmc">PMC999</ArticleId></ArticleIdList></Reference></ReferenceList>
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
  pmcid: null,
  contact: null,
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
    expect(c.pmcid).toBe("PMC123");
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
    const src = candidateSource(cand({ pmcid: "PMC1" }), "retrospective study", true);
    expect(src).toMatchObject({ journal: "J Vet Intern Med", year: "2026", doi: "10.1/a", authors: "Park JE 외", basis: "무료 원문 기준 요약", studyType: "retrospective study" });
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

describe("영어 숫자 낱말", () => {
  it("초록의 five 는 카드의 5마리 근거가 된다", async () => {
    const { checkFidelity, numberWordTokens } = await import("../fidelity");
    expect(numberWordTokens("Five dogs and twelve cats; one hundred")).toEqual(["5", "12", "1", "100"]);
    const card = parseCard({ schemaVersion: 1, category: "internal", headline: "개 5마리 증례", lead: null, layoutVariant: "minimal", blocks: [], source: {} });
    if (!card.ok) throw new Error(card.error);
    expect(checkFidelity("Five dogs were treated.", card.card).filter((w) => w.type === "number")).toEqual([]);
    expect(checkFidelity("Dogs were treated.", card.card).filter((w) => w.type === "number")).toHaveLength(1);
  });
});

describe("참고문헌·무료 원문", () => {
  it("참고문헌의 DOI·PMC 번호를 이 논문 것으로 보지 않는다", () => {
    const [c] = parsePubmedXml(xmlOf(article({ pmid: "7", doi: null })), "vet");
    expect(c.doi).toBeNull();
    expect(c.pmcid).toBeNull();
  });
  it("PMC 본문에서 표·그림·참고문헌을 빼고 결과·고찰을 먼저 담는다", async () => {
    const { parsePmcBody } = await import("../finder/sources");
    const long = (w: string, n = 60) => Array.from({ length: n }, () => w).join(" ");
    const xml = `<article><front><title>front</title></front><body>
      <sec><title>Introduction</title><p>${long("intro")}</p></sec>
      <sec><title>Results</title><p>Survival was 94.9% <xref ref-type="bibr">12</xref>.</p><p>${long("result", 100)}</p>
        <table-wrap><table><tr><td>TABLE CELL</td></tr></table></table-wrap><fig><caption>FIGURE</caption></fig></sec>
      <sec><title>Discussion</title><p>${long("discussion")}</p></sec>
    </body><back><ref-list><ref>REF</ref></ref-list></back></article>`;
    const all = parsePmcBody(xml);
    expect(all).toContain("[Results]");
    expect(all).toContain("Survival was 94.9%");
    expect(all).not.toMatch(/TABLE CELL|FIGURE|REF|12./);
    const small = parsePmcBody(xml, 1000);
    expect(small).toContain("[Results]");
    expect(small).not.toContain("[Introduction]");
    expect(parsePmcBody("<article><front/></article>")).toBeNull();
  });
  it("본문이 있으면 원문에 함께 넣는다", () => {
    const raw = candidateRawText(cand(), "Results text 123");
    expect(raw).toContain("FULL TEXT (excerpt)");
    expect(raw).toContain("Results text 123");
  });
});

describe("한 문단형 카드", () => {
  it("초록 모드 응답을 제목·요약·임상적 의미·주의·근거 수준·꼭 확인으로 바꾼다", async () => {
    const { abstractToCard, PRIORITY_FLAG } = await import("../ai-designer");
    const card = parseCard(
      abstractToCard(
        { headline: "개 6마리에서 중증 호중구감소증이 보고됐습니다", summary: "요약 문단입니다.", clinical: "임상적 의미입니다.", caution: null, evidence: "다기관 후향 증례군(개 6마리)", priority: true, attribution: [] },
        { category: "internal" }
      )
    );
    if (!card.ok) throw new Error(card.error);
    expect(card.card.layoutVariant).toBe("brief");
    expect(card.card.blocks.map((b) => b.kind)).toEqual(["keyPoint", "clinical"]);
    expect(card.card.source.studyType).toBe("다기관 후향 증례군(개 6마리)");
    expect(card.card.flags).toEqual([PRIORITY_FLAG]);
  });
  it("한국어 근거 수준은 글자 대조 없이 숫자만 본다", async () => {
    const { checkFidelity } = await import("../fidelity");
    const card = parseCard({ schemaVersion: 1, category: null, headline: "제목", lead: null, layoutVariant: "brief", blocks: [], source: { studyType: "후향 증례군(개 7마리)" } });
    if (!card.ok) throw new Error(card.error);
    const w = checkFidelity("six dogs were included", card.card);
    expect(w.map((x) => `${x.type}:${x.token}`)).toEqual(["number:7"]);
  });
});

describe("해설의 저자", () => {
  it("PubMed 에서 이메일이 붙은 저자를 교신저자로, 이메일은 지운다", () => {
    const [c] = parsePubmedXml(xmlOf(article({ pmid: "3" })), "vet");
    expect(c.contact).toEqual({ role: "corresponding", name: "Su Kim", affiliation: "Dept of Surgery, Vet School, Davis, CA" });
  });
  it("PMC 원문의 교신저자와 소속", async () => {
    const { parsePmcCorresp } = await import("../finder/sources");
    const xml = `<article><front><article-meta><contrib-group>
      <contrib contrib-type="author"><name><surname>Lee</surname><given-names>A</given-names></name><xref ref-type="aff" rid="a1"/></contrib>
      <contrib contrib-type="author" corresp="yes"><name><surname>Choi</surname><given-names>Min</given-names></name><xref ref-type="aff" rid="a2"/></contrib>
      </contrib-group><aff id="a1"><label>1</label>Univ A</aff><aff id="a2"><label>2</label>Univ B, Seoul. min@b.ac.kr</aff></article-meta></front><body/></article>`;
    expect(parsePmcCorresp(xml)).toEqual({ role: "corresponding", name: "Min Choi", affiliation: "Univ B, Seoul" });
    expect(parsePmcCorresp("<article><front></front></article>")).toBeNull();
  });
});

describe("공개 카드", () => {
  it("원문 인용(attribution)과 내부 표시는 빼고 꼭 확인만 남긴다", async () => {
    const { toPublicCard } = await import("../public-reader");
    const card = parseCard({
      schemaVersion: 1, category: "internal", headline: "제목", lead: null, layoutVariant: "brief", blocks: [], source: {},
      attribution: [{ displayText: "카드 문구", sourceExcerpt: "abstract sentence" }],
      flags: ["ai-designed", "priority", "source-fields-removed"],
    });
    if (!card.ok) throw new Error(card.error);
    const pub = toPublicCard(card.card);
    expect(pub.attribution).toEqual([]);
    expect(pub.flags).toEqual(["priority"]);
  });
});

describe("해설 숫자 검사", () => {
  it("원문에 없는 숫자가 든 해설 문단만 뺀다", async () => {
    const { dropUnverifiedDetail } = await import("../ai-designer");
    const { cleanAffiliation } = await import("../finder/sources");
    const card = parseCard({
      schemaVersion: 1, category: null, headline: "제목", lead: null, layoutVariant: "brief", blocks: [], source: {},
      detail: { paragraphs: ["개 6마리를 봤습니다.", "생존율은 42%였습니다."], clinical: "3일 안에 확인합니다.", author: null },
    });
    if (!card.ok) throw new Error(card.error);
    const out = dropUnverifiedDetail("Six dogs were included.", card.card);
    expect(out.detail?.paragraphs).toEqual(["개 6마리를 봤습니다."]);
    expect(out.detail?.clinical).toBeNull();
    expect(cleanAffiliation("1Gastrointestinal Laboratory, Texas A&M University")).toBe("Gastrointestinal Laboratory, Texas A&M University");
  });
});

describe("Unpaywall", () => {
  it("PMC 번호를 먼저, 사전 공개본은 빼고 PDF 주소를 고른다", async () => {
    const { pickOaLocation } = await import("../finder/unpaywall");
    expect(pickOaLocation({ is_oa: false, oa_locations: [] })).toBeNull();
    expect(
      pickOaLocation({
        is_oa: true,
        oa_locations: [
          { url: "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1/x", url_for_pdf: "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1/x", version: "publishedVersion" },
          { url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC13782716/", url_for_pdf: null, version: "publishedVersion" },
        ],
      })
    ).toEqual({ pmcid: "PMC13782716", pdfUrl: "https://onlinelibrary.wiley.com/doi/pdfdirect/10.1/x" });
    expect(pickOaLocation({ is_oa: true, oa_locations: [{ url: "https://ssrn.com/x", url_for_pdf: "https://ssrn.com/x.pdf", version: "submittedVersion" }] })).toBeNull();
  });
  it("PDF 글자에서 참고문헌을 버리고 결과·고찰부터 담는다", async () => {
    const { parsePdfText } = await import("../finder/sources");
    const words = (w: string, n: number) => Array.from({ length: n }, () => w).join(" ");
    const pdf = ["Title of paper", "Abstract", words("abs", 40), "Introduction", words("intro", 60), "Results", words("result", 90), "Discussion", words("disc", 60), "References", "1. Some ref"].join("\n");
    const all = parsePdfText(pdf);
    expect(all).toContain("[Results]");
    expect(all).not.toContain("Some ref");
    const small = parsePdfText(pdf, 1100);
    expect(small).toContain("[Results]");
    expect(small).not.toContain("[Introduction]");
  });
});

describe("라운딩용 짧은 글", () => {
  it("문장이 끝나는 곳까지만 남긴다", async () => {
    const { fitSentences } = await import("../schema");
    expect(fitSentences("짧은 글입니다.", 100)).toBe("짧은 글입니다.");
    expect(fitSentences("첫 문장입니다. 두 번째 문장도 있습니다. 세 번째는 아주 깁니다.", 30)).toBe("첫 문장입니다. 두 번째 문장도 있습니다.");
    expect(fitSentences("아주 긴 첫 문장 하나뿐입니다", 5)).toBe("아주 긴 첫 문장 하나뿐입니다");
    expect(fitSentences("17마리 중 15마리(88.2%)에서 찾았습니다. 그 뒤 문장은 길게 이어집니다 정말로요.", 40)).toBe("17마리 중 15마리(88.2%)에서 찾았습니다.");
  });
  it("초록 모드 응답의 핵심 한 문장과 라운딩 줄을 카드에 넣고, 긴 요약은 문장 단위로 줄인다", async () => {
    const { abstractToCard } = await import("../ai-designer");
    const long = Array.from({ length: 12 }, (_, i) => `문장 ${i} 이 내용은 충분히 길게 이어지는 요약 문장입니다.`).join(" ");
    const card = parseCard(abstractToCard({ headline: "제목", summary: long, lead: "핵심 한 문장", points: ["결과 하나", "임상: 가져올 점"], clinical: "임상", caution: null, evidence: null, priority: false, commentary: [], clinicalDetail: "" }));
    if (!card.ok) throw new Error(card.error);
    expect(card.card.lead).toBe("핵심 한 문장");
    expect(card.card.blocks.find((b) => b.kind === "bullets")).toMatchObject({ label: "라운딩", items: ["결과 하나", "임상: 가져올 점"] });
    const summary = card.card.blocks.find((b) => b.kind === "keyPoint");
    expect(summary && "text" in summary ? summary.text.length : 0).toBeLessThanOrEqual(320);
    expect(summary && "text" in summary ? summary.text.endsWith(".") : false).toBe(true);
  });
});
