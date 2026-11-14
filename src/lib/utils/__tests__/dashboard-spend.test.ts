import { describe, expect, it } from "vitest";
import { computeInvoiceSpend, spendMonthLabels, type SpendLine } from "../dashboard-extras";

const line = (invoiceId: string, invoiceDate: string | null, amount: number, vendorId: string | null = "v1", vendorName = "브이에스팜(주)"): SpendLine => ({
  invoiceId,
  invoiceDate,
  amount,
  vendorId,
  vendorName,
});
const vendors = new Map([["v1", "vs팜"], ["v2", "우리엔팜"]]);

describe("지출 달 목록", () => {
  it("기준일을 포함해 과거 6개월", () => {
    expect(spendMonthLabels("2026-11-14", 6)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });
  it("해가 바뀌어도 맞다", () => {
    expect(spendMonthLabels("2027-02-03", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(spendMonthLabels("2027-01-31", 2)).toEqual(["2026-12", "2027-01"]);
  });
});

describe("명세서 기준 지출", () => {
  const lines: SpendLine[] = [
    line("a", "2026-11-02", 100_000),
    line("a", "2026-11-02", 50_000),
    line("b", "2026-11-14", 30_000, "v2", "(주)우리엔팜"),
    line("c", "2026-11-10", 20_000, "v1", "에이원약국"), // 같은 업체, 명세서에는 다른 이름
    line("d", "2026-11-05", -8_000, null, "주식회사 프로벳"), // 마일리지 차감 같은 음수 줄
    line("e", "2026-10-03", 70_000),
    line("f", "2026-10-14", 10_000),
    line("g", "2026-10-15", 500_000), // 지난달 15일 → "같은 날짜까지" 비교에서는 빠진다
    line("h", "2026-05-31", 999_999), // 6개월 밖
    line("i", null, 999_999), // 날짜 없는 명세서
  ];
  const s = computeInvoiceSpend(lines, vendors, "2026-11-14", 6);

  it("달별 합계", () => {
    expect(s.thisMonthAmount).toBe(192_000);
    expect(s.lastMonthAmount).toBe(580_000);
    expect(s.monthly.map((m) => m.amount)).toEqual([0, 0, 0, 0, 580_000, 192_000]);
  });

  it("지난달은 같은 날짜까지만 따로 계산한다", () => {
    expect(s.lastMonthToDateAmount).toBe(80_000);
  });

  it("업체는 명세서 글자가 아니라 연결된 업체 이름으로 묶는다", () => {
    expect(s.byVendorThisMonth).toEqual([
      { vendor: "vs팜", amount: 170_000 },
      { vendor: "우리엔팜", amount: 30_000 },
      { vendor: "주식회사 프로벳", amount: -8_000 },
    ]);
  });

  it("이번 달 명세서 장수", () => {
    expect(s.invoiceCountThisMonth).toBe(4);
    expect(s.asOf).toBe("2026-11-14");
  });

  it("31일인 날 — 지난달에 31일이 없어도 지난달 전체가 잡힌다", () => {
    const r = computeInvoiceSpend([line("x", "2026-09-30", 5), line("y", "2026-10-31", 7)], vendors, "2026-10-31", 2);
    expect(r.lastMonthToDateAmount).toBe(5);
    expect(r.thisMonthAmount).toBe(7);
  });
});
