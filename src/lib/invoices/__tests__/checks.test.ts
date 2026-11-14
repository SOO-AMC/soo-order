import { describe, expect, it } from "vitest";
import { amountConsistent, lineIssues, totalCheck, type LineCheckInput } from "../checks";

describe("수량 × 단가 = 금액", () => {
  it("맞는 경우", () => {
    expect(amountConsistent(2, 181521, 363042, 0)).toBe(true);
  });
  it("단가 자릿수가 빠진 경우 (실제 기록: 181,521 → 11,008)", () => {
    expect(amountConsistent(1, 11008, 181521, 0)).toBe(false);
  });
  it("수량을 잘못 읽은 경우", () => {
    expect(amountConsistent(1, 590909, 1181818, 0)).toBe(false);
  });
  it("금액 칸이 할인후로 찍힌 명세서", () => {
    expect(amountConsistent(2, 3315, 5636, 15)).toBe(true); // 2 × 2,818
  });
  it("금액 칸이 부가세 포함으로 찍힌 명세서", () => {
    expect(amountConsistent(10, 1000, 11000, 0)).toBe(true);
  });
  it("금액을 읽지 못했으면 검사하지 않는다", () => {
    expect(amountConsistent(1, 1000, 0, 0)).toBeNull();
    expect(amountConsistent(1, 1000, null, 0)).toBeNull();
    expect(amountConsistent(1, 1000, undefined, 0)).toBeNull();
  });
  it("몇 원 차이(반올림)는 맞는 것으로 본다", () => {
    expect(amountConsistent(3, 3333, 10000, 0)).toBe(true);
  });
});

describe("줄 합계 = 총액", () => {
  const lines = [{ quantity: 2, listPrice: 50000 }, { quantity: 1, listPrice: 30000 }];
  it("맞는 경우", () => {
    expect(totalCheck(lines, 130000, 0).ok).toBe(true);
    expect(totalCheck(lines, 143000, 0).ok).toBe(true); // 부가세 포함
  });
  it("한 줄을 빠뜨렸거나 숫자를 잘못 읽은 경우", () => {
    const r = totalCheck(lines, 180000, 0);
    expect(r.ok).toBe(false);
    expect(r.printed).toBe(180000);
  });
  it("총액을 읽지 못했으면 검사하지 않는다", () => {
    expect(totalCheck(lines, 0, 0).ok).toBeNull();
    expect(totalCheck(lines, null, 0).ok).toBeNull();
  });
});

const ok: LineCheckInput = {
  quantity: 2,
  listPrice: 94000,
  printedAmount: 188000,
  discountRate: 15,
  computedUnitPrice: 79900,
  currentUnitPrice: 79900,
  matchSource: "memory",
  isNewProduct: false,
  leftover: 0,
  otherVendorOrders: 0,
};
const codes = (o: Partial<LineCheckInput>) => lineIssues({ ...ok, ...o }).map((i) => i.code);

describe("한 줄의 확인할 점", () => {
  it("전에 확정한 이름 · 같은 단가 · 주문과 맞음 → 문제없는 줄", () => {
    expect(lineIssues(ok)).toEqual([]);
    expect(codes({ matchSource: "alias" })).toEqual([]);
    expect(codes({ matchSource: "exact" })).toEqual([]);
  });
  it("이름을 추측해서 연결한 줄", () => {
    expect(codes({ matchSource: "guess" })).toEqual(["guess"]);
  });
  it("새 품목 (추측·단가 비교는 하지 않는다)", () => {
    expect(codes({ isNewProduct: true, matchSource: null, currentUnitPrice: null })).toEqual(["new"]);
  });
  it("보통의 단가 변화", () => {
    expect(codes({ computedUnitPrice: 82000 })).toEqual(["price-change"]);
  });
  it("단가 급변 (2배 이상·절반 이하)", () => {
    expect(codes({ currentUnitPrice: 181521, computedUnitPrice: 11008 })).toEqual(["price-jump"]);
    expect(codes({ currentUnitPrice: 590909, computedUnitPrice: 1181818 })).toEqual(["price-jump"]);
  });
  it("금액이 안 맞음", () => {
    expect(codes({ printedAmount: 1880000 })).toEqual(["amount"]);
  });
  it("주문에 못 맞춘 수량 · 다른 업체 주문 · 0 수량", () => {
    expect(codes({ leftover: 1 })).toEqual(["leftover"]);
    expect(codes({ leftover: -1 })).toEqual(["leftover"]);
    expect(codes({ otherVendorOrders: 1 })).toEqual(["other-vendor"]);
    expect(codes({ quantity: 0, printedAmount: null })).toEqual(["zero"]);
  });
  it("여러 문제가 겹치면 모두 알려 준다", () => {
    expect(codes({ matchSource: "guess", currentUnitPrice: 181521, computedUnitPrice: 11008, leftover: 2 })).toEqual(["guess", "price-jump", "leftover"]);
  });
});
