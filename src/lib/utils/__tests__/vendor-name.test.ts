import { describe, expect, it } from "vitest";
import { buildVendorIndex, looksLikeOwnHospital, suggestVendors, vendorKey } from "../vendor-name";

describe("업체 이름 열쇠", () => {
  // 기대값은 DB 함수 vendor_key() 가 실제로 낸 값이다 (migrate-vendor-unify.sql 을 시험용 DB에서 실행).
  // 앱과 DB의 규칙이 달라지면 "정리할 이름"과 자동 맞춤이 서로 어긋난다.
  const DB_KEYS: Record<string, string> = {
    "123": "123",
    "(주) 한미": "한미",
    "㈜한미": "한미",
    "주식회사 한미": "한미",
    "（주）한미": "한미",
    " vs팜": "vs팜",
    "VS팜": "vs팜",
    "브이에스팜(주)": "브이에스팜",
    "(주)디와이에스엠 (DYSVET)": "디와이에스엠dysvet",
    "GM 메디칼": "gm메디칼",
    "Gm메디컬": "gm메디컬",
    "한국베링거인겔하임동물의약품(주)": "한국베링거인겔하임동물의약품",
    "Cygni Co. Saitama logistics center": "cygnicosaitamalogisticscenter",
    "?": "",
    "": "",
    "24시수동물메디칼센터(영등포) 박수형 외 2": "24시수동물메디칼센터영등포박수형외2",
    "유한회사 데크라": "데크라",
    "프레제니우스메디칼케어(주)": "프레제니우스메디칼케어",
  };
  it("DB 함수와 같은 값을 낸다", () => {
    for (const [name, key] of Object.entries(DB_KEYS)) expect(vendorKey(name), name).toBe(key);
  });
  it("빈 값", () => {
    expect(vendorKey(null)).toBe("");
    expect(vendorKey(undefined)).toBe("");
  });
});

const vendors = [
  { id: "vs", name: "vs팜" },
  { id: "woori", name: "우리엔팜" },
  { id: "hanmi", name: "(주) 한미" },
  { id: "gm", name: "GM 메디칼" },
  { id: "f1", name: "프레제니우스 (주)" },
  { id: "f2", name: "프레제니우스" },
];
const aliases = [
  { vendorId: "vs", alias: "브이에스팜(주)" },
  { vendorId: "vs", alias: "에이원약국" },
  { vendorId: "gone", alias: "없는 업체의 이름" },
];

describe("이름으로 업체 찾기", () => {
  const idx = buildVendorIndex(vendors, aliases);
  const id = (n: string | null) => idx.resolve(n)?.id ?? null;

  it("정확히 같은 이름", () => expect(id("우리엔팜")).toBe("woori"));
  it("(주)·띄어쓰기·대소문자만 다름", () => {
    expect(id("(주)우리엔팜")).toBe("woori");
    expect(id(" VS팜 ")).toBe("vs");
    expect(id("㈜한미")).toBe("hanmi");
  });
  it("다른 이름(별칭)", () => {
    expect(id("브이에스팜 (주)")).toBe("vs");
    expect(id("에이원 약국")).toBe("vs");
  });
  it("모르는 이름·빈 값", () => {
    expect(id("한미메드")).toBeNull();
    expect(id("123")).toBeNull();
    expect(id("?")).toBeNull();
    expect(id("")).toBeNull();
    expect(id(null)).toBeNull();
  });
  it("철자가 다르면 자동으로 묶지 않는다", () => expect(id("Gm메디컬")).toBeNull());
  it("열쇠가 같은 업체가 둘이면 정확히 같은 이름만 인정", () => {
    expect(id("프레제니우스")).toBe("f2");
    expect(id("프레제니우스 (주)")).toBe("f1");
    expect(id("(주)프레제니우스")).toBeNull();
  });
  it("지워진 업체의 별칭은 무시", () => expect(id("없는 업체의 이름")).toBeNull());
  it("업체의 다른 이름 목록", () => {
    expect(idx.aliasesOf("vs")).toEqual(["브이에스팜(주)", "에이원약국"]);
    expect(idx.aliasesOf("woori")).toEqual([]);
  });
});

describe("우리 병원 이름처럼 보이는가", () => {
  it("실제로 기록된 모양들", () => {
    for (const n of [
      "24시수동물메디칼센터(영등포)",
      "24시수동굴미디컬센터",
      "24시수동풀메디칼센디(영등포)",
      "24시주동물메디칼센터",
      "24시수동물메디컬센터(선머) 박수형외 2",
      "24시수동물메디칼센터(공급자: 브이에스팜)",
    ]) expect(looksLikeOwnHospital(n), n).toBe(true);
  });
  it("업체 이름은 아니다", () => {
    for (const n of ["vs팜", "우리엔팜", "두리메디칼", "GM 메디칼", "(주)세아메디칼", "프레제니우스메디칼케어(주)", "", null]) expect(looksLikeOwnHospital(n), String(n)).toBe(false);
  });
});

describe("비슷한 업체 후보", () => {
  it("이름이 포함 관계면 후보로", () => {
    expect(suggestVendors("한미메드", vendors, aliases).map((v) => v.id)).toEqual(["hanmi"]);
    expect(suggestVendors("브이에스팜", vendors, aliases).map((v) => v.id)).toEqual(["vs"]);
  });
  it("관계없는 이름·너무 짧은 이름은 후보 없음", () => {
    expect(suggestVendors("쿠팡", vendors, aliases)).toEqual([]);
    expect(suggestVendors("1", vendors, aliases)).toEqual([]);
    expect(suggestVendors("?", vendors, aliases)).toEqual([]);
  });
});
