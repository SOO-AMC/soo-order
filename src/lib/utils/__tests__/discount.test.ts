import { describe, expect, it } from "vitest";
import { applyDiscount, parsePriceInput, priceToSave, reverseDiscount } from "../discount";

describe("할인율 계산", () => {
  it("할인전 → 할인후", () => {
    expect(applyDiscount(3315, 15)).toBe(2818);
    expect(applyDiscount(3154, 17)).toBe(2618);
    expect(applyDiscount(1000, 0)).toBe(1000);
    expect(applyDiscount(null, 15)).toBeNull();
  });

  it("할인후 → 할인전", () => {
    expect(reverseDiscount(2818, 15)).toBe(3315);
    expect(reverseDiscount(2618, 17)).toBe(3154);
    expect(reverseDiscount(1000, 0)).toBe(1000);
    expect(reverseDiscount(null, 15)).toBeNull();
  });

  it("저장값을 정가로 바꿨다가 다시 저장해도 원래 값 그대로", () => {
    for (const rate of [5, 10, 15, 17, 20, 33, 50]) {
      for (let stored = 1; stored <= 5000; stored += 7) {
        expect(applyDiscount(reverseDiscount(stored, rate), rate)).toBe(stored);
      }
      for (const stored of [79900, 181521, 1181818, 10966560]) {
        expect(applyDiscount(reverseDiscount(stored, rate), rate)).toBe(stored);
      }
    }
  });

  it("입력칸 글자 → 숫자", () => {
    expect(parsePriceInput("3,315")).toBe(3315);
    expect(parsePriceInput(" 3315원 ")).toBe(3315);
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("-")).toBeNull();
    expect(parsePriceInput(undefined)).toBeNull();
  });
});

describe("수정 화면 저장값", () => {
  it("손대지 않은 칸은 저장하지 않는다 (할인이 두 번 적용되던 문제)", () => {
    expect(priceToSave("3315", "3315", 15)).toEqual({ changed: false });
    expect(priceToSave("", "", 15)).toEqual({ changed: false });
    expect(priceToSave(" 3,315 ", "3315", 15)).toEqual({ changed: false });
  });

  it("바꾼 칸은 할인율을 한 번만 적용한다", () => {
    expect(priceToSave("4000", "3315", 15)).toEqual({ changed: true, price: 3400 });
    expect(priceToSave("4000", "", 0)).toEqual({ changed: true, price: 4000 });
  });

  it("값을 지우면 가격 없음으로 저장한다", () => {
    expect(priceToSave("", "3315", 15)).toEqual({ changed: true, price: null });
  });
});
