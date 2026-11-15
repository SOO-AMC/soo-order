import { describe, expect, it } from "vitest";
import { buildPlan, extractDois, findDuplicate, moveBefore, moveInOrder, moveToDay, nthOpenDate, planChanges, splitSummaries, stockDays, type DupItem, type PlanPaper } from "../planner";
import { checkPublishable, rangeLabel } from "../publish-rules";
import { limitsOf, QUEUE_DATE } from "../types";

/** 2026-11-16 07:00 KST (08:30 전) */
const BEFORE = new Date("2026-11-15T22:00:00Z");
/** 2026-11-16 10:00 KST (08:30 뒤) */
const AFTER = new Date("2026-11-16T01:00:00Z");
const NONE = new Set<string>();
const S3 = { perDay: 3, min: 3 };

const queued = (id: string, order: number, reviewed = true, hasCard = true): PlanPaper => ({ id, issueDate: QUEUE_DATE, order, reviewed, hasCard });
const placed = (id: string, issueDate: string, order: number, reviewed = true): PlanPaper => ({ id, issueDate, order, reviewed, hasCard: true });
const layout = (plan: ReturnType<typeof buildPlan>) => plan.days.map((d) => `${d.date}:${d.paperIds.join(",")}:${d.status}`);

describe("배치: 검수한 논문을 하루 N건씩 차례로", () => {
  it("대기함의 검수 완료 논문을 시작일부터 3건씩 채우고 예약한다", () => {
    const papers = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:scheduled", "2026-11-17:d,e,f:scheduled", "2026-11-18:g:draft"]);
    expect(plan.days[2].blocked).toBe("short");
    expect(plan.days[0].scheduledAt).toBe("2026-11-15T23:30:00.000Z"); // 11-16 08:30 KST
    expect(plan.queueIds).toEqual([]);
    expect(stockDays(plan.days)).toBe(2);
  });

  it("검수하지 않았거나 카드가 없는 논문은 대기함에 남는다", () => {
    const papers = [queued("a", 1), queued("b", 2, false), queued("c", 3, true, false), queued("d", 4)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,d:draft"]);
    expect(plan.queueIds).toEqual(["b", "c"]);
    expect(plan.items.filter((i) => i.date === QUEUE_DATE)).toEqual([
      { id: "b", date: QUEUE_DATE, ord: 1 },
      { id: "c", date: QUEUE_DATE, ord: 2 },
    ]);
  });

  it("이미 자리 잡은 논문이 앞, 새로 검수한 논문은 맨 뒤", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), queued("z", 1), queued("y", 2)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,z:scheduled", "2026-11-17:y:draft"]);
  });

  it("앞의 논문이 빠지면 뒤의 논문이 당겨진다", () => {
    const papers = [placed("b", "2026-11-16", 2), placed("c", "2026-11-16", 3), placed("d", "2026-11-17", 1), placed("e", "2026-11-17", 2), placed("f", "2026-11-17", 3)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:b,c,d:scheduled", "2026-11-17:e,f:draft"]);
    expect(plan.items.find((i) => i.id === "b")).toEqual({ id: "b", date: "2026-11-16", ord: 1 });
  });

  it("지난 날짜에 남은(발행 못 한) 논문은 시작일로 넘어온다", () => {
    const papers = [placed("old1", "2026-11-14", 1), placed("old2", "2026-11-14", 2), placed("n1", "2026-11-16", 1), placed("n2", "2026-11-16", 2)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:old1,old2,n1:scheduled", "2026-11-17:n2:draft"]);
  });

  it("자리 잡은 논문은 검수가 풀려도 자리를 지키고, 그날은 예약되지 않는다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2, false), placed("c", "2026-11-16", 3), placed("d", "2026-11-17", 1), placed("e", "2026-11-17", 2), placed("f", "2026-11-17", 3)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:draft", "2026-11-17:d,e,f:scheduled"]);
    expect(plan.days[0].blocked).toBe("unreviewed");
    expect(plan.days[0].scheduledAt).toBeNull();
  });

  it("발행된 날·이미 보이는 날은 건너뛴다", () => {
    const papers = ["a", "b", "c", "d"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: new Set(["2026-11-16", "2026-11-18"]), now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-17:a,b,c:scheduled", "2026-11-19:d:draft"]);
    expect(nthOpenDate("2026-11-16", 0, new Set(["2026-11-16"]))).toBe("2026-11-17");
  });

  it("08:30이 지난 오늘 날짜는 예약하지 않는다 (지금 발행으로만)", () => {
    const papers = ["a", "b", "c", "d", "e", "f"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: AFTER });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:draft", "2026-11-17:d,e,f:scheduled"]);
    expect(plan.days[0].blocked).toBe("past-time");
  });
});

describe("하루 건수 조정", () => {
  it("하루 2건", () => {
    const papers = ["a", "b", "c", "d", "e"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: { perDay: 2, min: 2 }, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b:scheduled", "2026-11-17:c,d:scheduled", "2026-11-18:e:draft"]);
  });

  it("최소 건수를 낮추면 모자란 날도 예약한다", () => {
    const papers = ["a", "b", "c", "d", "e"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: { perDay: 3, min: 2 }, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c:scheduled", "2026-11-17:d,e:scheduled"]);
  });

  it("건수를 바꾸면 이미 잡힌 날짜도 다시 채운다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), placed("c", "2026-11-16", 3), placed("d", "2026-11-17", 1)];
    const plan = buildPlan({ papers, settings: { perDay: 4, min: 3 }, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a,b,c,d:scheduled"]);
  });

  it("이상한 설정값도 안전하게 (0건·최소가 더 큼)", () => {
    const papers = ["a", "b"].map((id, i) => queued(id, i + 1));
    const plan = buildPlan({ papers, settings: { perDay: 0, min: 9 }, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(layout(plan)).toEqual(["2026-11-16:a:scheduled", "2026-11-17:b:scheduled"]);
  });

  it("발행 조건의 건수 범위가 설정을 따른다", () => {
    const reviewed = { review_status: "reviewed" as const, card_content: {} as never };
    expect(checkPublishable([reviewed, reviewed], limitsOf({ perDay: 3, min: 2 })).ok).toBe(true);
    expect(checkPublishable([reviewed], limitsOf({ perDay: 3, min: 2 })).ok).toBe(false);
    expect(checkPublishable([reviewed, reviewed, reviewed, reviewed], limitsOf({ perDay: 3, min: 3 })).ok).toBe(false);
    expect(checkPublishable([reviewed, reviewed, reviewed, reviewed, reviewed], limitsOf({ perDay: 5, min: 3 })).ok).toBe(true);
    expect(rangeLabel(limitsOf({ perDay: 3, min: 3 }))).toBe("3건");
    expect(rangeLabel(limitsOf({ perDay: 4, min: 2 }))).toBe("2~4건");
    // 범위를 안 주면 예전 규칙 그대로
    expect(checkPublishable([reviewed, reviewed, reviewed, reviewed]).ok).toBe(true);
  });
});

describe("옮기기", () => {
  const order = ["a", "b", "c", "d", "e", "f", "g"];

  it("순서를 직접 정하면 그 순서대로 날짜가 정해진다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), placed("c", "2026-11-16", 3), placed("d", "2026-11-17", 1)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE, order: ["d", "a", "b", "c"] });
    expect(layout(plan)).toEqual(["2026-11-16:d,a,b:scheduled", "2026-11-17:c:draft"]);
  });

  it("직접 정한 순서에 빠진 논문·모르는 id·중복이 있어도 논문을 잃지 않는다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), queued("z", 1)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE, order: ["b", "ghost", "b"] });
    expect(plan.order).toEqual(["b", "a", "z"]);
  });

  it("한 칸 위·아래", () => {
    expect(moveInOrder(order, "c", 1)).toEqual(["a", "c", "b", "d", "e", "f", "g"]);
    expect(moveInOrder(order, "c", 3)).toEqual(["a", "b", "d", "c", "e", "f", "g"]);
    expect(moveInOrder(order, "a", -5)).toEqual(order);
    expect(moveInOrder(order, "a", 99)).toEqual(["b", "c", "d", "e", "f", "g", "a"]);
    expect(moveInOrder(order, "없음", 0)).toBe(order);
  });

  it("다른 논문 앞으로 끌어다 놓기", () => {
    expect(moveBefore(order, "f", "b")).toEqual(["a", "f", "b", "c", "d", "e", "g"]);
    expect(moveBefore(order, "a", "e")).toEqual(["b", "c", "d", "a", "e", "f", "g"]);
    expect(moveBefore(order, "a", null)).toEqual(["b", "c", "d", "e", "f", "g", "a"]);
    expect(moveBefore(order, "a", "a")).toBe(order);
  });

  it("날짜로 옮기기: 그날의 마지막 자리에 들어가고, 꽉 찬 날은 마지막 논문이 밀린다", () => {
    const day = (o: string[], id: string) => Math.floor(o.indexOf(id) / 3);
    // 뒤 → 앞 (g 를 첫날로): 첫날 마지막 자리, c 가 둘째 날로 밀림
    const up = moveToDay(order, "g", 0, 3);
    expect(up).toEqual(["a", "b", "g", "c", "d", "e", "f"]);
    expect(day(up, "g")).toBe(0);
    // 앞 → 뒤 (a 를 둘째 날로)
    const down = moveToDay(order, "a", 1, 3);
    expect(day(down, "a")).toBe(1);
    expect(down).toEqual(["b", "c", "d", "e", "f", "a", "g"]);
    // 끝보다 먼 날짜 → 맨 뒤
    expect(moveToDay(order, "a", 9, 3)).toEqual(["b", "c", "d", "e", "f", "g", "a"]);
  });
});

describe("바꿀 것만 고르기", () => {
  it("이미 계획대로면 아무것도 보내지 않는다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), placed("c", "2026-11-16", 3)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    const changes = planChanges(papers, [{ date: "2026-11-16", status: "scheduled", scheduledAt: "2026-11-15T23:30:00+00:00" }], plan);
    expect(changes).toEqual({ items: [], days: [] });
  });

  it("옮겨진 논문과 상태가 달라진 날만 보낸다", () => {
    const papers = [placed("a", "2026-11-16", 1), placed("b", "2026-11-16", 2), queued("z", 1)];
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    const changes = planChanges(papers, [{ date: "2026-11-16", status: "draft", scheduledAt: null }, { date: QUEUE_DATE, status: "draft", scheduledAt: null }], plan);
    expect(changes.items).toEqual([{ id: "z", date: "2026-11-16", ord: 3 }]);
    expect(changes.days).toEqual([{ date: "2026-11-16", status: "scheduled", scheduled_at: "2026-11-15T23:30:00.000Z" }]);
  });

  it("논문이 빠져 비게 된 예약 묶음은 초안으로 되돌린다", () => {
    const papers = [placed("a", "2026-11-14", 1)];
    const plan = buildPlan({ papers, settings: { perDay: 3, min: 1 }, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    const changes = planChanges(papers, [{ date: "2026-11-14", status: "scheduled", scheduledAt: "2026-11-13T23:30:00Z" }], plan);
    expect(changes.items).toEqual([{ id: "a", date: "2026-11-16", ord: 1 }]);
    expect(changes.days).toEqual([
      { date: "2026-11-16", status: "scheduled", scheduled_at: "2026-11-15T23:30:00.000Z" },
      { date: "2026-11-14", status: "draft", scheduled_at: null },
    ]);
  });

  it("대기함 묶음이 없는데 대기함으로 갈 논문이 있으면 만들라고 한다", () => {
    const papers = [placed("a", "2026-11-16", 1, false)].map((p) => ({ ...p, issueDate: QUEUE_DATE }));
    const plan = buildPlan({ papers, settings: S3, startDate: "2026-11-16", lockedDates: NONE, now: BEFORE });
    expect(planChanges(papers, [], plan).days).toEqual([{ date: QUEUE_DATE, status: "draft", scheduled_at: null }]);
  });
});

describe("여러 건 한 번에 붙여넣기", () => {
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
