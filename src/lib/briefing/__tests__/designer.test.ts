import { describe, expect, it } from "vitest";
import { designCardByRules, splitSentences } from "../rule-designer";
import { parseCard, paperCardSchema, cardTexts } from "../schema";
import { checkFidelity, numberTokens } from "../fidelity";

/**
 * 테스트용 예시 글. 실제 논문이 아니라 형식만 흉내 낸 가짜 요약이다(수치·이름 모두 지어낸 테스트 값).
 */
const PROSE = `가상 약물 A와 B의 효과를 비교한 무작위 대조 연구이다. 총 40마리를 두 군으로 나누어 12주간 치료하였다.
12주 시점의 점수 감소율은 Alphadrug 61.5%, Betadrug 64.0%로 두 군 사이에 유의한 차이가 없었다. 부작용은 Betadrug 군에서 더 흔했다.
표본 수가 작아 결과 해석에 주의가 필요하다. 임상에서는 환자 상태에 따라 두 약물 모두 고려할 수 있다.`;

const BULLETS = `만성 질환 관리 리뷰
- 식이 조절이 증상 개선에 도움이 되었다
- 장기 추적 자료는 부족하다
- 보호자 교육이 중요하다`;

const LABELED = `제목: 가상 수술 후 재활 프로그램의 효과
배경: 수술 후 회복 기간을 줄이는 방법이 필요하다.
방법: 가상 환자 30마리를 대상으로 한 전향 연구.
결과: 재활군의 회복 기간이 평균 14일 짧았다.
결론: 표준 재활 프로그램이 회복을 앞당겼다.
한계: 단일 기관 연구이다.
출처: Imaginary Vet J 2031
doi: 10.1234/fake.2031.001`;

const NO_NUMBERS = `어떤 질환에서 조기 진단이 중요하다는 점을 강조한 종설이다. 진단이 늦어지면 예후가 나빠질 수 있다. 정기 검진을 권장한다.`;

const MIXED = `Feline 가상 증후군에서 Gammavir 치료 반응을 본 case series. 고양이 9마리 중 7마리가 호전되었다. However, 대조군이 없어 further study가 필요하다.`;

describe("줄글 1개 → 카드 1장", () => {
  it.each([
    ["문단형", PROSE],
    ["불릿형", BULLETS],
    ["구역 제목형", LABELED],
    ["숫자 없는 글", NO_NUMBERS],
    ["한글·영문 혼합", MIXED],
  ])("%s 요약도 카드 하나가 나온다", (_name, raw) => {
    const card = designCardByRules(raw);
    // 배열이 아니라 카드 객체 하나
    expect(Array.isArray(card)).toBe(false);
    expect(card.schemaVersion).toBe(1);
    expect(card.headline.length).toBeGreaterThan(0);
    // 규격을 다시 통과한다
    expect(parseCard(card).ok).toBe(true);
    // 여러 장 구조가 없다
    expect(card).not.toHaveProperty("slides");
    expect(card).not.toHaveProperty("pages");
    expect(card.blocks.length).toBeLessThanOrEqual(6);
  });

  it("제목·방법·결과 같은 칸이 없어도 된다 (필수는 글뿐)", () => {
    const card = designCardByRules("한 문장만 있는 아주 짧은 요약입니다.");
    expect(card.headline).toContain("한 문장만 있는");
  });

  it("아주 긴 글도 한 장이다", () => {
    const long = Array.from({ length: 60 }, (_, i) => `문장 번호 ${i + 1}은 테스트를 위한 내용이다.`).join(" ");
    const card = designCardByRules(long);
    expect(parseCard(card).ok).toBe(true);
    expect(card.blocks.length).toBeLessThanOrEqual(6);
    expect(card.flags).toContain("long-source-condensed");
  });
});

describe("원문에 없는 것을 만들지 않는다", () => {
  it("숫자를 바꾸지 않는다 (카드의 모든 숫자가 원문에 있다)", () => {
    const card = designCardByRules(PROSE);
    const rawNums = new Set(numberTokens(PROSE));
    for (const { text } of cardTexts(card)) {
      for (const n of numberTokens(text)) expect(rawNums.has(n)).toBe(true);
    }
    expect(checkFidelity(PROSE, card)).toEqual([]);
  });

  it("비교 연구는 두 값을 원문 그대로 싣는다", () => {
    const card = designCardByRules(PROSE);
    const cmp = card.blocks.find((b) => b.kind === "comparison");
    expect(cmp).toBeDefined();
    if (cmp?.kind === "comparison") {
      expect(cmp.leftValue).toBe("61.5%");
      expect(cmp.rightValue).toBe("64.0%");
    }
    expect(card.layoutVariant).toBe("comparison");
  });

  it("\"49%에서 25%로\" 처럼 값이 바뀐 문장은 비교로 만들지 않는다 (\"에서\"를 무리 이름으로 읽지 않는다)", () => {
    const raw = [
      "고양이 비대성 심근병증에서 클로피도그렐의 혈전 예방 효과",
      "동맥 혈전색전증은 고양이 비대성 심근병증의 주요 합병증이다.",
      "고양이 60마리를 클로피도그렐군과 아스피린군으로 나눠 12개월 추적했다.",
      "클로피도그렐군의 혈전 재발률이 49%에서 25%로 낮았다.",
    ].join("\n");
    const card = designCardByRules(raw);
    expect(card.blocks.some((b) => b.kind === "comparison")).toBe(false);
    expect(cardTexts(card).some(({ text }) => / vs |vs 에서/.test(text))).toBe(false);
    expect(checkFidelity(raw, card)).toEqual([]);
  });

  it("두 무리 비교는 한글 이름이어도 그대로 비교로 만든다", () => {
    const raw = "개 아토피 피부염 비교\n가려움 점수 감소율은 치료군 61.5%, 대조군 34.0%였다.";
    const cmp = designCardByRules(raw).blocks.find((b) => b.kind === "comparison");
    expect(cmp).toBeDefined();
    if (cmp?.kind === "comparison") {
      expect([cmp.leftValue, cmp.rightValue]).toEqual(["61.5%", "34.0%"]);
      expect(cmp.leftLabel).not.toBe(cmp.rightLabel);
    }
  });

  it("숫자가 없는 글에서는 숫자·비교 구역을 만들지 않는다", () => {
    const card = designCardByRules(NO_NUMBERS);
    expect(card.blocks.some((b) => b.kind === "metric" || b.kind === "comparison")).toBe(false);
    const allText = cardTexts(card).map((t) => t.text).join(" ");
    expect(numberTokens(allText)).toEqual([]);
  });

  it("출처가 없으면 비워 두고 표시만 한다", () => {
    const card = designCardByRules(NO_NUMBERS);
    expect(card.source).toEqual({ journal: null, year: null, studyType: null, title: null, doi: null, url: null });
    expect(card.flags).toContain("missing-source-metadata");
  });

  it("출처·DOI는 원문에 적힌 것만 가져온다", () => {
    const card = designCardByRules(LABELED);
    expect(card.source.doi).toBe("10.1234/fake.2031.001");
    expect(card.source.journal).toBe("Imaginary Vet J 2031");
    expect(card.source.year).toBe("2031");
    expect(card.headline).toBe("가상 수술 후 재활 프로그램의 효과");
    expect(checkFidelity(LABELED, card)).toEqual([]);
  });

  it("한계·주의 문장을 빼먹지 않는다", () => {
    expect(designCardByRules(PROSE).blocks.some((b) => b.kind === "caution")).toBe(true);
    expect(designCardByRules(LABELED).blocks.some((b) => b.kind === "caution")).toBe(true);
  });
});

describe("원문 대조 검사가 바뀐 값을 잡는다", () => {
  it("숫자가 바뀌면 경고", () => {
    const card = designCardByRules(PROSE);
    const tampered = { ...card, lead: "점수 감소율은 71.5%였다." };
    const warns = checkFidelity(PROSE, tampered);
    expect(warns.some((w) => w.type === "number" && w.token === "71.5")).toBe(true);
  });

  it("원문에 없는 약물명이 들어가면 경고", () => {
    const card = designCardByRules(PROSE);
    const tampered = { ...card, headline: "Deltadrug가 더 효과적이었다" };
    expect(checkFidelity(PROSE, tampered).some((w) => w.type === "term" && w.token === "Deltadrug")).toBe(true);
  });

  it("지어낸 출처는 경고", () => {
    const card = designCardByRules(NO_NUMBERS);
    const tampered = { ...card, source: { ...card.source, journal: "Made Up Journal", year: "2030" } };
    const warns = checkFidelity(NO_NUMBERS, tampered);
    expect(warns.filter((w) => w.type === "source").length).toBe(2);
  });

  it("관리자가 직접 넣은 링크는 근거로 인정", () => {
    const url = "https://example.org/paper/1";
    const card = designCardByRules(NO_NUMBERS, { sourceUrl: url });
    expect(card.source.url).toBe(url);
    expect(checkFidelity(NO_NUMBERS, card, [url])).toEqual([]);
  });
});

describe("카드 규격", () => {
  const base = designCardByRules(PROSE);

  it("slides / pages 같은 여러 장 구조는 거절", () => {
    expect(paperCardSchema.safeParse({ ...base, slides: [base] }).success).toBe(false);
    expect(paperCardSchema.safeParse({ ...base, pages: [] }).success).toBe(false);
  });

  it("구역은 최대 6개", () => {
    const many = Array.from({ length: 7 }, () => ({ kind: "keyPoint" as const, label: "요약", text: "내용" }));
    expect(paperCardSchema.safeParse({ ...base, blocks: many }).success).toBe(false);
  });

  it("HTML 태그는 지운다", () => {
    const res = parseCard({ ...base, headline: '<script>alert(1)</script>제목<b>굵게</b>' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.card.headline).toBe("alert(1)제목굵게");
  });

  it("javascript: 주소는 거절", () => {
    expect(parseCard({ ...base, source: { ...base.source, url: "javascript:alert(1)" } }).ok).toBe(false);
    expect(parseCard({ ...base, source: { ...base.source, url: "https://doi.org/10.1/x" } }).ok).toBe(true);
  });

  it("모르는 구역 종류는 거절", () => {
    expect(parseCard({ ...base, blocks: [{ kind: "html", text: "<div/>" }] }).ok).toBe(false);
  });
});

describe("문장 나누기", () => {
  it("소수점에서 나누지 않는다", () => {
    expect(splitSentences("감소율은 65.4%였다. 차이는 없었다.")).toEqual(["감소율은 65.4%였다.", "차이는 없었다."]);
  });
});
