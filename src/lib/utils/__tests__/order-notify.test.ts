import { describe, expect, it } from "vitest";
import {
  arrivalNotifications,
  dispatchNotifications,
  editNotificationBody,
  needsChangeReason,
  outOfStockNotifications,
  partialNotifications,
} from "../order-notify";

const ADMIN = "admin";
const o = <E extends object = object>(id: string, requester: string | null, item: string, extra?: E) => ({ id, requester_id: requester, item_name: item, ...(extra ?? ({} as E)) });

describe("주문자 알림 묶기", () => {
  it("처리한 사람 본인의 주문·주문자 없는 주문에는 보내지 않는다", () => {
    expect(dispatchNotifications([o("1", ADMIN, "A"), o("2", null, "B")], ADMIN)).toEqual([]);
  });

  it("주문자마다 한 통으로 묶는다", () => {
    const rows = dispatchNotifications(
      [o("1", "kim", "메로페넴 주", { vendor_name: "우리엔팜" }), o("2", "lee", "NS 500ml", { vendor_name: "vs팜" }), o("3", "kim", "물티슈", { vendor_name: "쿠팡" })],
      ADMIN,
    );
    expect(rows).toHaveLength(2);
    const kim = rows.find((r) => r.user_id === "kim")!;
    expect(kim.title).toBe("주문 2건을 발주했어요");
    expect(kim.body).toBe("메로페넴 주 · 우리엔팜\n물티슈 · 쿠팡");
    expect(kim.link).toBe("/dashboard");
    expect(kim.order_id).toBeNull();
    const lee = rows.find((r) => r.user_id === "lee")!;
    expect(lee.title).toBe("'NS 500ml' 발주했어요");
    expect(lee.body).toBe("업체: vs팜\n들어오면 다시 알려 드려요.");
    expect(lee.link).toBe("/orders/2");
    expect(lee.order_id).toBe("2");
  });

  it("여섯 건 이상이면 다섯 줄 + 외 n건", () => {
    const many = Array.from({ length: 8 }, (_, i) => o(String(i), "kim", `품목${i}`));
    const body = dispatchNotifications(many, ADMIN)[0].body!;
    expect(body.split("\n")).toEqual(["품목0", "품목1", "품목2", "품목3", "품목4", "외 3건"]);
  });
});

describe("들어왔어요", () => {
  it("한 건: 받은 수량과 검수 비고", () => {
    const [n] = arrivalNotifications([o("1", "kim", "펙시온 정", { quantity: 2, unit: "개", note: "유통기한 짧음" })], ADMIN);
    expect(n.title).toBe("'펙시온 정' 들어왔어요");
    expect(n.body).toBe("받은 수량: 2 개\n검수 비고: 유통기한 짧음");
    expect(n.link).toBe("/inspection/1");
    expect(n.type).toBe("inspection_completed");
  });
  it("수량도 비고도 없으면 본문 없이", () => {
    expect(arrivalNotifications([o("1", "kim", "A", { quantity: 0 })], ADMIN)[0].body).toBeNull();
  });
  it("여러 건", () => {
    const [n] = arrivalNotifications([o("1", "kim", "A", { quantity: 1, unit: "박스" }), o("2", "kim", "B", { quantity: 3, note: "1개 파손" })], ADMIN);
    expect(n.title).toBe("주문 2건이 들어왔어요");
    expect(n.body).toBe("A 1 박스\nB 3 (1개 파손)");
  });
});

describe("일부만 들어왔어요", () => {
  it("얼마 중 얼마 받았는지", () => {
    const [n] = partialNotifications([o("1", "kim", "NS 500ml", { received: 2, quantity: 5, unit: "박스" })], ADMIN);
    expect(n.title).toBe("'NS 500ml' 일부만 들어왔어요");
    expect(n.body).toBe("5 박스 중 2 받음\n나머지가 들어오면 다시 알려 드려요.");
    expect(n.type).toBe("partial_received");
  });
});

describe("품절이에요", () => {
  it("사유를 함께 보낸다", () => {
    const [n] = outOfStockNotifications([o("9", "kim", "넥시움주")], ADMIN, " 생산 중단 ");
    expect(n.title).toBe("'넥시움주' 품절이에요");
    expect(n.body).toBe("사유: 생산 중단\n다른 품목이 필요하면 다시 주문해 주세요.");
    expect(n.link).toBe("/out-of-stock/9");
    expect(n.type).toBe("out_of_stock");
  });
  it("여러 건을 한꺼번에 품절 처리해도 사유가 간다", () => {
    const [n] = outOfStockNotifications([o("1", "kim", "A"), o("2", "kim", "B")], ADMIN, "업체 재고 없음");
    expect(n.title).toBe("주문 2건이 품절이에요");
    expect(n.body).toBe("A\nB\n사유: 업체 재고 없음\n다른 품목이 필요하면 다시 주문해 주세요.");
  });
  it("사유가 없으면 없다고 적는다", () => {
    expect(outOfStockNotifications([o("1", "kim", "A")], ADMIN, "")[0].body).toContain("사유는 적혀 있지 않아요.");
  });
});

describe("관리자가 바꿨어요", () => {
  it("바뀐 내용 뒤에 이유", () => {
    expect(editNotificationBody(["수량: 3 박스 → 2 박스"], "재고가 남아 있어요")).toBe("수량: 3 박스 → 2 박스\n사유: 재고가 남아 있어요");
    expect(editNotificationBody(["긴급 해제"], "")).toBe("긴급 해제");
    expect(editNotificationBody([], "")).toBe("주문 정보가 수정되었습니다.");
  });
  it("수량·단위·품목이 바뀌면 이유가 필요하다", () => {
    const base = { item_name: "NS 500ml", quantity: 4, unit: "박스" };
    expect(needsChangeReason(base, { ...base })).toBe(false);
    expect(needsChangeReason(base, { ...base, quantity: 2 })).toBe(true);
    expect(needsChangeReason(base, { ...base, unit: "개" })).toBe(true);
    expect(needsChangeReason(base, { ...base, item_name: "NS 1L" })).toBe(true);
    expect(needsChangeReason(base, { ...base, item_name: " NS 500ml " })).toBe(false);
  });
});
