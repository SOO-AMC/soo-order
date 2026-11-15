import { describe, expect, it } from "vitest";
import { extractDois, findDuplicate, nextFreeDate, planChanges, settlePlan, splitSummaries, stockDays, type DupItem, type PlanPaper } from "../planner";
import { checkPublishable, rangeLabel } from "../publish-rules";
import { PLAN_LIMITS, QUEUE_DATE } from "../types";

/** 2026-11-16 07:00 KST (08:30 전) */
const BEFORE = new Date("2026-11-15T22:00:00Z");
/** 2026-11-16 10:00 KST (08:30 뒤) */
const AFTER = new Date("2026-11-16T01:00:00Z");

const undated = (id: string, order: number, reviewed = true, hasCard = true): PlanPaper => ({ id, issueDate: QUEUE_DATE, order, reviewed, hasCard });
const on = (id: string, issueDate: string, order: number, reviewed = true, hasCard = true): PlanPaper => ({ id, issueDate, order, reviewed, hasCard });
const layout = (plan: ReturnType<typeof settlePlan>) => plan.days.map((d) => `${d.date}:${d.paperIds.join(",")}:${d.status}`);

describe("날짜 묶음: 올린 날짜에 그대로 있고, 다 검수되면 예약", () => {
  it("날마다 건수가 달라도 되고, 전부 검수된 날은 08:30 예약된다 (최소 건수 없음)", () => {
    const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-17", 1), on("c", "2026-11-17", 2), on("d", "2026-11-17", 3), on("e", "2026-11-17", 4)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a:scheduled", "2026-11-17:b,c,d,e:scheduled"]);
    expect(plan.days[0].scheduledAt).toBe("2026-11-15T23:30:00.000Z"); // 11-16 08:30 KST
    expect(stockDays(plan.days)).toBe(2);
  });

  it("검수가 덜 됐거나 카드가 없는 논문이 있으면 그날은 예약하지 않는다", () => {
    const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-16", 2, false), on("c", "2026-11-17", 1, true, false), on("d", "2026-11-18", 1)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b:draft", "2026-11-17:c:draft", "2026-11-18:d:scheduled"]);
    expect(plan.days[0].blocked).toBe("unreviewed");
    expect(plan.days[0].scheduledAt).toBeNull();
  });

  it("논문을 당겨 채우지 않는다: 빈 날은 빈 채로, 건수가 줄어든 날도 그대로", () => {
    // 11-16 에 1건만 남고 11-17 은 비었고 11-18 에 3건 — 아무것도 옮기지 않는다
    const papers = [on("a", "2026-11-16", 2), on("x", "2026-11-18", 1), on("y", "2026-11-18", 2), on("z", "2026-11-18", 3)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a:scheduled", "2026-11-18:x,y,z:scheduled"]);
    // 자리 번호만 1부터 다시 매긴다
    expect(plan.items.find((i) => i.id === "a")).toEqual({ id: "a", date: "2026-11-16", ord: 1 });
  });

  it("발행하지 못하고 지난 날의 논문은 그 날짜에 그대로 있고, 예약되지 않는다", () => {
    const papers = [on("old", "2026-11-14", 1), on("new", "2026-11-17", 1)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-14:old:draft", "2026-11-17:new:scheduled"]);
    expect(plan.days[0].blocked).toBe("past-time");
  });

  it("08:30이 지난 오늘 날짜는 예약하지 않는다 (지금 발행으로만)", () => {
    const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-17", 1)];
    expect(layout(settlePlan({ papers, now: BEFORE }))).toEqual(["2026-11-16:a:scheduled", "2026-11-17:b:scheduled"]);
    const after = settlePlan({ papers, now: AFTER });
    expect(layout(after)).toEqual(["2026-11-16:a:draft", "2026-11-17:b:scheduled"]);
    expect(after.days[0].blocked).toBe("past-time");
  });

  it("날짜 미정 논문은 검수돼 있어도 날짜에 들어가지 않는다", () => {
    const papers = [undated("u1", 3), undated("u2", 7, false), on("a", "2026-11-16", 1)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a:scheduled"]);
    expect(plan.queueIds).toEqual(["u1", "u2"]);
    expect(plan.items.filter((i) => i.date === QUEUE_DATE)).toEqual([
      { id: "u1", date: QUEUE_DATE, ord: 1 },
      { id: "u2", date: QUEUE_DATE, ord: 2 },
    ]);
  });

  it("발행 조건: 1건 이상이면 된다 (최대 6건)", () => {
    const reviewed = { review_status: "reviewed" as const, card_content: {} as never };
    expect(checkPublishable([reviewed], PLAN_LIMITS).ok).toBe(true);
    expect(checkPublishable([], PLAN_LIMITS).ok).toBe(false);
    expect(checkPublishable(Array.from({ length: 6 }, () => reviewed), PLAN_LIMITS).ok).toBe(true);
    expect(checkPublishable(Array.from({ length: 7 }, () => reviewed), PLAN_LIMITS).ok).toBe(false);
    expect(rangeLabel(PLAN_LIMITS)).toBe("1~6건");
    // 범위를 안 주면 예전 규칙(3~4건) 그대로
    expect(checkPublishable([reviewed]).ok).toBe(false);
  });
});

describe("옮기기 (관리자가 시켰을 때만)", () => {
  const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-16", 2), on("c", "2026-11-16", 3), on("d", "2026-11-17", 1), undated("u", 1)];

  it("다른 날짜로: 그날의 맨 뒤에 붙고, 원래 날은 건수가 줄어든다", () => {
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "a", date: "2026-11-17" }] });
    expect(layout(plan)).toEqual(["2026-11-16:b,c:scheduled", "2026-11-17:d,a:scheduled"]);
  });

  it("아직 묶음이 없는 날짜로도 옮길 수 있다", () => {
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "d", date: "2026-11-20" }] });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:scheduled", "2026-11-20:d:scheduled"]);
  });

  it("같은 날짜 안에서 자리 바꾸기", () => {
    expect(layout(settlePlan({ papers, now: BEFORE, moves: [{ id: "c", date: "2026-11-16", index: 0 }] }))[0]).toBe("2026-11-16:c,a,b:scheduled");
    expect(layout(settlePlan({ papers, now: BEFORE, moves: [{ id: "a", date: "2026-11-16", index: 1 }] }))[0]).toBe("2026-11-16:b,a,c:scheduled");
    expect(layout(settlePlan({ papers, now: BEFORE, moves: [{ id: "a", date: "2026-11-16", index: 99 }] }))[0]).toBe("2026-11-16:b,c,a:scheduled");
  });

  it("다른 날짜의 특정 자리로 끌어다 놓기", () => {
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "b", date: "2026-11-17", index: 0 }] });
    expect(layout(plan)).toEqual(["2026-11-16:a,c:scheduled", "2026-11-17:b,d:scheduled"]);
  });

  it("날짜 미정으로 빼기 / 날짜 미정에서 날짜 정하기", () => {
    const out = settlePlan({ papers, now: BEFORE, moves: [{ id: "d", date: QUEUE_DATE }] });
    expect(layout(out)).toEqual(["2026-11-16:a,b,c:scheduled"]);
    expect(out.queueIds).toEqual(["u", "d"]);
    const into = settlePlan({ papers, now: BEFORE, moves: [{ id: "u", date: "2026-11-17" }] });
    expect(layout(into)).toEqual(["2026-11-16:a,b,c:scheduled", "2026-11-17:d,u:scheduled"]);
    expect(into.queueIds).toEqual([]);
  });

  it("모르는 논문을 옮기라는 요청은 무시한다 (논문을 잃지 않는다)", () => {
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "ghost", date: "2026-11-17" }] });
    expect(plan.items).toHaveLength(5);
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:scheduled", "2026-11-17:d:scheduled"]);
  });
});

describe("바꿀 것만 고르기", () => {
  it("이미 그대로면 아무것도 보내지 않는다", () => {
    const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-16", 2)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(planChanges(papers, [{ date: "2026-11-16", status: "scheduled", scheduledAt: "2026-11-15T23:30:00+00:00" }], plan)).toEqual({ items: [], days: [] });
  });

  it("검수가 끝난 날만 예약으로 바꾼다", () => {
    const papers = [on("a", "2026-11-16", 1), on("b", "2026-11-17", 1, false)];
    const plan = settlePlan({ papers, now: BEFORE });
    const changes = planChanges(papers, [{ date: "2026-11-16", status: "draft", scheduledAt: null }, { date: "2026-11-17", status: "draft", scheduledAt: null }], plan);
    expect(changes).toEqual({ items: [], days: [{ date: "2026-11-16", status: "scheduled", scheduled_at: "2026-11-15T23:30:00.000Z" }] });
  });

  it("옮긴 논문과 달라진 날만 보낸다. 새 날짜 묶음은 만들고, 비게 된 예약은 초안으로", () => {
    const papers = [on("a", "2026-11-16", 1)];
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "a", date: "2026-11-20" }] });
    const changes = planChanges(papers, [{ date: "2026-11-16", status: "scheduled", scheduledAt: "2026-11-15T23:30:00Z" }], plan);
    expect(changes.items).toEqual([{ id: "a", date: "2026-11-20", ord: 1 }]);
    expect(changes.days).toEqual([
      { date: "2026-11-20", status: "scheduled", scheduled_at: "2026-11-19T23:30:00.000Z" },
      { date: "2026-11-16", status: "draft", scheduled_at: null },
    ]);
  });

  it("검수가 풀리면 예약을 되돌린다", () => {
    const papers = [on("a", "2026-11-16", 1, false)];
    const plan = settlePlan({ papers, now: BEFORE });
    expect(planChanges(papers, [{ date: "2026-11-16", status: "scheduled", scheduledAt: "2026-11-15T23:30:00Z" }], plan).days).toEqual([{ date: "2026-11-16", status: "draft", scheduled_at: null }]);
  });

  it("날짜 미정 묶음이 없는데 그리로 갈 논문이 있으면 만들라고 한다", () => {
    const papers = [on("a", "2026-11-16", 1)];
    const plan = settlePlan({ papers, now: BEFORE, moves: [{ id: "a", date: QUEUE_DATE }] });
    expect(planChanges(papers, [{ date: "2026-11-16", status: "draft", scheduledAt: null }], plan).days).toEqual([{ date: QUEUE_DATE, status: "draft", scheduled_at: null }]);
  });
});

describe("올리기 화면의 기본 날짜", () => {
  it("다음 빈 날짜", () => {
    expect(nextFreeDate("2026-11-16", new Set())).toBe("2026-11-16");
    expect(nextFreeDate("2026-11-16", new Set(["2026-11-16", "2026-11-17"]))).toBe("2026-11-18");
    expect(nextFreeDate("2026-11-30", new Set(["2026-11-30"]))).toBe("2026-12-01");
  });
});

describe("한 칸에 여러 건을 붙여넣었을 때", () => {
  it("구분선으로 나눈다", () => {
    expect(splitSummaries("첫 논문\n둘째 줄\n---\n둘째 논문\n\n===\n\n셋째 논문")).toEqual(["첫 논문\n둘째 줄", "둘째 논문", "셋째 논문"]);
  });
  it("구분선이 없으면 한 건", () => {
    expect(splitSummaries("  한 건짜리 글\r\n- 불릿 하나\n-- 대시 두 개  ")).toEqual(["한 건짜리 글\n- 불릿 하나\n-- 대시 두 개"]);
  });
  it("빈 덩어리는 버리고, 긴 구분선·공백 섞인 구분선도 받는다", () => {
    expect(splitSummaries("---\n\nA\n  ----------  \n\n\n***\nB\n___")).toEqual(["A", "B"]);
    expect(splitSummaries("   \n\n")).toEqual([]);
  });
  it("문장 속의 --- 는 구분선이 아니다", () => {
    expect(splitSummaries("A --- B\n값: 10---20")).toEqual(["A --- B\n값: 10---20"]);
  });
});

describe("중복 올림 찾기", () => {
  const item = (id: string, over: Partial<DupItem> = {}): DupItem => ({ id, hash: null, dois: [], headline: null, where: "11.13 발행분", ...over });

  it("DOI 를 글에서 찾는다 (끝의 문장부호 제거, 대소문자 무시)", () => {
    expect(extractDois("출처: https://doi.org/10.1111/JVIM.12345. 그리고 (10.2460/javma.21.03.0123)")).toEqual(["10.1111/jvim.12345", "10.2460/javma.21.03.0123"]);
    expect(extractDois("DOI 없음")).toEqual([]);
    expect(extractDois(null)).toEqual([]);
  });

  it("같은 글 > 같은 DOI > 같은 제목 순으로 찾는다", () => {
    const others = [item("o1", { headline: "개의 만성 신장병에서 텔미사르탄의 효과" }), item("o2", { dois: ["10.1111/jvim.1"] }), item("o3", { hash: "h" })];
    expect(findDuplicate(item("t", { hash: "h", dois: ["10.1111/jvim.1"] }), others)).toEqual({ otherId: "o3", where: "11.13 발행분", reason: "same-text" });
    expect(findDuplicate(item("t", { dois: ["10.1111/jvim.1"] }), others)?.reason).toBe("same-doi");
    expect(findDuplicate(item("t", { headline: "개의 만성 신장병에서  텔미사르탄의 효과!" }), others)?.reason).toBe("same-title");
  });

  it("자기 자신·짧은 제목·빈 값끼리는 중복으로 보지 않는다", () => {
    expect(findDuplicate(item("a", { hash: "h" }), [item("a", { hash: "h" })])).toBeNull();
    expect(findDuplicate(item("t", { headline: "신장병" }), [item("o", { headline: "신장병" })])).toBeNull();
    expect(findDuplicate(item("t"), [item("o")])).toBeNull();
  });
});
