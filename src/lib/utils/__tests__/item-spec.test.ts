import { describe, expect, it } from "vitest";
import { bestMatchSameSpec, doseConflict, packConflict, specsOf } from "../item-spec";
import { bestMatch } from "../item-match";
import { normalizeItemName } from "../normalize-item-name";

describe("이름에서 용량·포장 읽기", () => {
  it("용량과 포장을 나눠 읽는다", () => {
    const s = specsOf("메로페넴주500mg 10V");
    expect(s.dose.get("mass")).toEqual([500]);
    expect(s.pack.get("v")).toEqual([10]);
  });
  it("단위를 맞춘다 (g → mg, L → ml, cc → ml, mcg → mg)", () => {
    expect(specsOf("세파졸린 1g").dose.get("mass")).toEqual([1000]);
    expect(specsOf("메디락스 4L").dose.get("volume")).toEqual([4000]);
    expect(specsOf("주사기 50cc").dose.get("volume")).toEqual([50]);
    expect(specsOf("네스프 60mcg").dose.get("mass")).toEqual([0.06]);
  });
  it("여러 값·한글 단위·쉼표·전각", () => {
    const s = specsOf("(냉장)독소루빈주사0.2%/25ML 1바이알");
    expect(s.dose.get("pct")).toEqual([0.2]);
    expect(s.dose.get("volume")).toEqual([25]);
    expect(s.pack.get("v")).toEqual([1]);
    expect(specsOf("공캡슐 1,000T").pack.get("t")).toEqual([1000]);
    expect(specsOf("아목시실린 ２５０㎎ 100정").dose.get("mass")).toEqual([250]);
    expect(specsOf("아목시실린 ２５０㎎ 100정").pack.get("t")).toEqual([100]);
    expect(specsOf("가바펜틴 300캡슐").pack.get("c")).toEqual([300]);
  });
  it("단위가 아닌 글자는 읽지 않는다", () => {
    expect(specsOf("5gel").dose.size).toBe(0);
    expect(specsOf("타다라필 정").pack.size).toBe(0);
    expect(specsOf("Ecg 패드").dose.size + specsOf("Ecg 패드").pack.size).toBe(0);
  });
});

describe("용량이 다른가", () => {
  it("같은 약, 다른 용량", () => {
    expect(doseConflict("가바펜틴캡슐100mg 300C", "가바펜틴캡슐300mg 300C")).toBe(true);
    expect(doseConflict("노바스크정5mg", "노바스크정10mg")).toBe(true);
    expect(doseConflict("NS 500ml", "NS 1L")).toBe(true);
    expect(doseConflict("니들26G", "니들22G")).toBe(true);
  });
  it("표기만 다른 같은 용량", () => {
    expect(doseConflict("세파졸린 1g", "세파졸린주 1000mg")).toBe(false);
    expect(doseConflict("메로페넴 주 500mg", "메로페넴주500mg 10V")).toBe(false);
    expect(doseConflict("주사기 50cc", "주사기50ml 25EA")).toBe(false);
  });
  it("한쪽에만 적혀 있으면 다르다고 보지 않는다", () => {
    expect(doseConflict("메로페넴 주", "메로페넴주500mg 10V")).toBe(false);
    expect(doseConflict("가바펜틴", "가바펜틴캡슐300mg 300C")).toBe(false);
  });
  it("종류가 다른 값끼리는 비교하지 않는다", () => {
    expect(doseConflict("빈크리스틴 1mg", "빈크리스틴황산염주 1ml/5V")).toBe(false);
  });
});

describe("포장이 다른가", () => {
  it("같은 약, 다른 포장", () => {
    expect(packConflict("메로페넴주500mg 10V", "메로페넴주500mg 1V")).toBe(true);
    expect(packConflict("노바스크정5mg 500T", "노바스크정5mg 100정")).toBe(true);
  });
  it("표기만 다르거나 한쪽에만 있음", () => {
    expect(packConflict("가바펜틴캡슐100mg 300C", "가바펜틴 100mg 300캡슐")).toBe(false);
    expect(packConflict("메로페넴 주 500mg", "메로페넴주500mg 10V")).toBe(false);
  });
});

describe("용량이 같은 후보에서만 고르기", () => {
  const products = [{ n: "가바펜틴캡슐300mg 300C" }, { n: "가바펜틴캡슐100mg 300C" }, { n: "리리카캡슐150mg" }];
  const get = (p: { n: string }) => p.n;

  it("이름 점수만으로는 용량이 다른 품목이 뽑힐 수 있다 (고치려는 문제)", () => {
    const onlyOther = products.filter((p) => !p.n.includes("100mg"));
    expect(bestMatch("가바펜틴캡슐100mg 300C", onlyOther, get, 0.55)?.item.n).toBe("가바펜틴캡슐300mg 300C");
  });
  it("용량이 다른 후보는 뽑지 않는다", () => {
    const onlyOther = products.filter((p) => !p.n.includes("100mg"));
    expect(bestMatchSameSpec("가바펜틴캡슐100mg 300C", onlyOther, get, 0.55)).toBeNull();
    expect(bestMatchSameSpec("가바펜틴캡슐100mg 300C", products, get, 0.55)?.item.n).toBe("가바펜틴캡슐100mg 300C");
  });
  it("용량을 안 적은 이름은 그대로 후보를 낸다", () => {
    expect(bestMatchSameSpec("리리카 캡슐", products, get, 0.5)?.item.n).toBe("리리카캡슐150mg");
  });
  it("단가를 다룰 때는 포장이 달라도 뽑지 않는다", () => {
    const packs = [{ n: "메로페넴주500mg 1V" }];
    expect(bestMatchSameSpec("메로페넴주500mg 10V", packs, get, 0.55)?.item.n).toBe("메로페넴주500mg 1V");
    expect(bestMatchSameSpec("메로페넴주500mg 10V", packs, get, 0.55, { pack: true })).toBeNull();
  });
});

describe("품목 이름 열쇠", () => {
  // 기대값은 DB 함수 item_key() 가 실제로 낸 값이다 (migrate-product-link.sql 을 시험용 DB에서 실행).
  const DB_KEYS: Record<string, string> = {
    "메로페넴 주 500mg": "메로페넴주500mg",
    "  NS\t500ML\n": "ns500ml",
    "NS　500ml": "ns500ml",
    "A B": "ab",
    "가바펜틴캡슐 100mg 300C": "가바펜틴캡슐100mg300c",
    "ECG 패드": "ecg패드",
    "": "",
    "100%_특수 품목": "100%_특수품목",
  };
  it("DB 함수와 같은 값을 낸다", () => {
    for (const [name, key] of Object.entries(DB_KEYS)) expect(normalizeItemName(name), JSON.stringify(name)).toBe(key);
  });
});
