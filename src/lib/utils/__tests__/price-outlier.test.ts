import { describe, expect, it } from "vitest";
import { averageIntervalDays, flagOutliers, isSuspectChange, median, priceNear } from "../price-outlier";

describe("보통 값(중앙값)", () => {
  it("홀수·짝수·빈 값", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([0, -5])).toBeNull();
  });
});

describe("이상한 단가 가리기", () => {
  it("실제 기록: 노바스크 181,521 사이에 낀 11,008", () => {
    const prices = [181521, 181521, 11008, 182487, 181521, 181521, 181521, 182487];
    expect(flagOutliers(prices)).toEqual([false, false, true, false, false, false, false, false]);
  });
  it("두 배 넘게 뛴 값", () => {
    expect(flagOutliers([590909, 590909, 1181818, 600000])).toEqual([false, false, false, false]); // 정확히 2배는 넘지 않음
    expect(flagOutliers([590909, 590909, 1300000, 600000])).toEqual([false, false, true, false]);
  });
  it("보통의 인상은 이상값이 아니다", () => {
    expect(flagOutliers([74375, 74375, 82323, 82323])).toEqual([false, false, false, false]);
  });
  it("값이 3개 미만이면 판단하지 않는다", () => {
    expect(flagOutliers([100, 100000])).toEqual([false, false]);
    expect(flagOutliers([])).toEqual([]);
  });
  it("0원은 이상값", () => {
    expect(flagOutliers([100, 100, 0, 100])).toEqual([false, false, true, false]);
  });
});

describe("두 기간 사이의 급변", () => {
  it("2배 이상·절반 이하는 확인 필요", () => {
    expect(isSuspectChange(590909, 1181818)).toBe(true);
    expect(isSuspectChange(181521, 11008)).toBe(true);
    expect(isSuspectChange(9317, 15189)).toBe(false); // +63% 는 실제 인상일 수 있다
    expect(isSuspectChange(100, 100)).toBe(false);
  });
  it("값이 없으면 판단하지 않는다", () => {
    expect(isSuspectChange(null, 100)).toBe(false);
    expect(isSuspectChange(0, 100)).toBe(false);
  });
});

describe("평균 주문 간격", () => {
  it("첫 주문부터 마지막 주문까지를 간격 수로 나눈다", () => {
    expect(averageIntervalDays(["2026-09-01T03:00:00Z", "2026-09-11T00:00:00Z", "2026-10-01T00:00:00Z"])).toBe(15);
  });
  it("같은 날 여러 건은 한 번으로", () => {
    expect(averageIntervalDays(["2026-09-01T01:00:00Z", "2026-09-01T09:00:00Z", "2026-09-08T00:00:00Z"])).toBe(7);
  });
  it("한 건뿐이면 없음", () => {
    expect(averageIntervalDays(["2026-09-01T00:00:00Z"])).toBeNull();
    expect(averageIntervalDays([])).toBeNull();
  });
});

describe("주문한 날의 단가", () => {
  const points = [
    { date: "2026-08-05", unitPrice: 79900 },
    { date: "2026-10-04", unitPrice: 82000 },
    { date: null, unitPrice: 1 },
  ];
  it("그날 또는 그 전의 가장 가까운 명세서", () => {
    expect(priceNear("2026-09-20T05:00:00Z", points)?.unitPrice).toBe(79900);
    expect(priceNear("2026-10-04", points)?.unitPrice).toBe(82000);
    expect(priceNear("2026-12-01", points)?.unitPrice).toBe(82000);
  });
  it("그 전 기록이 없으면 45일 안의 다음 명세서", () => {
    expect(priceNear("2026-07-20", points)?.unitPrice).toBe(79900);
    expect(priceNear("2026-03-01", points)).toBeNull();
  });
  it("기록이 없으면 없음", () => {
    expect(priceNear("2026-09-20", [])).toBeNull();
  });
});
