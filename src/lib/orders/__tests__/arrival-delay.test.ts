import { describe, expect, it } from "vitest";
import { daysWaiting, delayMilestone, delayNotifications, findDue, noticeKey, type DelayOrder } from "../arrival-delay";

const NOW = new Date("2026-11-15T00:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const order = (id: string, requester: string | null, item: string, days: number, vendor: string | null = "vs팜"): DelayOrder => ({
  id,
  requester_id: requester,
  item_name: item,
  vendor_name: vendor,
  dispatched_at: ago(days),
  created_at: ago(days + 1),
});

describe("며칠째인가", () => {
  it("발주한 때부터 센다", () => {
    expect(daysWaiting(order("1", "kim", "A", 33), NOW)).toBe(33);
  });
  it("발주한 때가 없는 예전 주문은 주문한 때부터", () => {
    expect(daysWaiting({ dispatched_at: null, created_at: ago(10) }, NOW)).toBe(10);
  });
  it("날짜가 이상하면 0", () => {
    expect(daysWaiting({ dispatched_at: "이상한 값", created_at: "이상한 값" }, NOW)).toBe(0);
  });
});

describe("알림 단계", () => {
  it("7일 전에는 지연이 아니다", () => {
    expect(delayMilestone(0)).toBeNull();
    expect(delayMilestone(6)).toBeNull();
  });
  it("7일째, 그 뒤로 7일마다", () => {
    expect(delayMilestone(7)).toBe(7);
    expect(delayMilestone(13)).toBe(7);
    expect(delayMilestone(14)).toBe(14);
    expect(delayMilestone(33)).toBe(28);
  });
});

describe("지금 알려야 하는 주문", () => {
  const orders = [order("a", "kim", "오큐프록스 안연고", 33), order("b", "lee", "로니다졸", 17), order("c", "kim", "새 주문", 3), order("d", "park", "트라마돌 주", 8)];

  it("지연된 주문만, 오래된 순으로", () => {
    expect(findDue(orders, new Set(), NOW).map((d) => [d.order.id, d.days, d.milestone])).toEqual([["a", 33, 28], ["b", 17, 14], ["d", 8, 7]]);
  });
  it("그 단계의 알림을 이미 보냈으면 다시 보내지 않는다 (매일 돌아도 한 번만)", () => {
    const sent = new Set([noticeKey("a", 28), noticeKey("d", 7)]);
    expect(findDue(orders, sent, NOW).map((d) => d.order.id)).toEqual(["b"]);
  });
  it("다음 단계가 되면 다시 알린다", () => {
    const sent = new Set([noticeKey("d", 7)]);
    const later = new Date(NOW.getTime() + 6 * 86_400_000); // d 는 14일째
    expect(findDue([orders[3]], sent, later).map((d) => [d.order.id, d.milestone])).toEqual([["d", 14]]);
  });
});

describe("보낼 알림", () => {
  const due = findDue(
    [order("a", "kim", "오큐프록스 안연고", 33), order("b", "kim", "프루칼로 정", 15, "우리엔팜"), order("c", "lee", "로니다졸", 17), order("d", "admin1", "트라마돌 주", 15), order("e", null, "주문자 없음", 9, null)],
    new Set(),
    NOW,
  );
  const rows = delayNotifications(due, ["admin1", "admin2"]);

  it("주문자마다 한 통", () => {
    const kim = rows.filter((r) => r.user_id === "kim");
    expect(kim).toHaveLength(1);
    expect(kim[0].title).toBe("주문 2건의 입고가 늦어지고 있어요");
    expect(kim[0].body).toBe("오큐프록스 안연고 · 발주 33일째 · vs팜\n프루칼로 정 · 발주 15일째 · 우리엔팜\n관리자가 업체에 확인할 거예요. 급하면 관리자에게 알려 주세요.");
    expect(kim[0].link).toBe("/dashboard");

    const lee = rows.find((r) => r.user_id === "lee")!;
    expect(lee.title).toBe("'로니다졸' 입고가 늦어지고 있어요");
    expect(lee.body).toBe("발주 17일째 · vs팜\n관리자가 업체에 확인할 거예요. 급하면 관리자에게 알려 주세요.");
    expect(lee.link).toBe("/orders/c");
    expect(lee.type).toBe("arrival_delayed");
  });

  it("관리자마다 한 통 — 전체 건수와 목록", () => {
    const admins = rows.filter((r) => r.user_id.startsWith("admin"));
    expect(admins.map((r) => r.user_id)).toEqual(["admin1", "admin2"]);
    expect(admins[0].title).toBe("7일 넘게 입고 안 된 주문 5건");
    expect(admins[0].body).toBe("오큐프록스 안연고 · 발주 33일째 · vs팜\n로니다졸 · 발주 17일째 · vs팜\n프루칼로 정 · 발주 15일째 · 우리엔팜\n트라마돌 주 · 발주 15일째 · vs팜\n주문자 없음 · 발주 9일째\n업체에 확인해 보세요.");
    expect(admins[0].link).toBe("/inspection");
  });

  it("관리자가 주문자인 주문은 따로 보내지 않는다 (관리자용 한 통에 들어 있다)", () => {
    expect(rows.filter((r) => r.user_id === "admin1")).toHaveLength(1);
  });

  it("알릴 것이 없으면 아무것도 보내지 않는다", () => {
    expect(delayNotifications([], ["admin1"])).toEqual([]);
  });

  it("여섯 건 이상이면 다섯 줄 + 외 n건", () => {
    const many = findDue(Array.from({ length: 8 }, (_, i) => order(String(i), "kim", `품목${i}`, 10 + i)), new Set(), NOW);
    const body = delayNotifications(many, []).find((r) => r.user_id === "kim")!.body!;
    expect(body.split("\n")).toHaveLength(7);
    expect(body).toContain("외 3건");
  });
});
