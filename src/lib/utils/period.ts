/**
 * 기간 빠른 선택(거래처원장·단가 분석 공용). 모두 KST 날짜 문자열 "YYYY-MM-DD".
 * 렌더 중 new Date()를 쓰지 않도록, 오늘 날짜는 호출하는 쪽이 useState(() => kstToday())로 한 번만 얻어 넘긴다.
 */
export type DateRange = { start: string; end: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function parse(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** y년 m월(1~12)에서 delta개월 이동 */
function shiftMonth(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function monthRange(y: number, m: number): DateRange {
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
}

/** 오늘 기준 N개월 전 날짜(같은 일, 그 달에 없으면 말일) */
function monthsAgo(today: string, n: number): string {
  const t = parse(today);
  const s = shiftMonth(t.y, t.m, -n);
  return `${s.y}-${pad(s.m)}-${pad(Math.min(t.day, lastDay(s.y, s.m)))}`;
}

export type PeriodPreset = "thisMonth" | "lastMonth" | "last3" | "thisYear" | "lastYear" | "all";

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  thisMonth: "이번 달",
  lastMonth: "지난달",
  last3: "최근 3개월",
  thisYear: "올해",
  lastYear: "작년",
  all: "전체 기간",
};

export function presetRange(preset: PeriodPreset, today: string): DateRange {
  const t = parse(today);
  switch (preset) {
    case "thisMonth":
      return { start: `${t.y}-${pad(t.m)}-01`, end: today };
    case "lastMonth": {
      const p = shiftMonth(t.y, t.m, -1);
      return monthRange(p.y, p.m);
    }
    case "last3":
      return { start: monthsAgo(today, 3), end: today };
    case "thisYear":
      return { start: `${t.y}-01-01`, end: today };
    case "lastYear":
      return { start: `${t.y - 1}-01-01`, end: `${t.y - 1}-12-31` };
    case "all":
      return { start: "", end: "" };
  }
}

/** 지금 start/end가 어느 빠른 선택과 같은지 (없으면 null = 직접 입력) */
export function matchPreset(range: DateRange, today: string, presets: PeriodPreset[]): PeriodPreset | null {
  return presets.find((p) => {
    const r = presetRange(p, today);
    return r.start === range.start && r.end === range.end;
  }) ?? null;
}

/** 단가 분석용 두 기간 묶음 */
export type ComparePreset = "mom" | "yoyMonth" | "ytd" | "q";

export const COMPARE_LABEL: Record<ComparePreset, string> = {
  mom: "지난달 → 이번 달",
  yoyMonth: "작년 이번 달 → 이번 달",
  ytd: "작년 같은 기간 → 올해",
  q: "그전 3개월 → 최근 3개월",
};

export function compareRanges(preset: ComparePreset, today: string): { a: DateRange; b: DateRange } {
  const t = parse(today);
  const thisMonthStart = `${t.y}-${pad(t.m)}-01`;
  switch (preset) {
    case "mom": {
      const p = shiftMonth(t.y, t.m, -1);
      return { a: monthRange(p.y, p.m), b: { start: thisMonthStart, end: today } };
    }
    case "yoyMonth": {
      const sameDay = `${t.y - 1}-${pad(t.m)}-${pad(Math.min(t.day, lastDay(t.y - 1, t.m)))}`;
      return { a: { start: `${t.y - 1}-${pad(t.m)}-01`, end: sameDay }, b: { start: thisMonthStart, end: today } };
    }
    case "ytd": {
      const sameDay = `${t.y - 1}-${pad(t.m)}-${pad(Math.min(t.day, lastDay(t.y - 1, t.m)))}`;
      return { a: { start: `${t.y - 1}-01-01`, end: sameDay }, b: { start: `${t.y}-01-01`, end: today } };
    }
    case "q": {
      const bStart = monthsAgo(today, 3);
      const aStart = monthsAgo(today, 6);
      // A는 B 시작 전날까지
      const d = new Date(`${bStart}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      return { a: { start: aStart, end: d.toISOString().slice(0, 10) }, b: { start: bStart, end: today } };
    }
  }
}

/** 화면 표시용 "2026.11.01 ~ 11.14" */
export function rangeText(r: DateRange): string {
  if (!r.start && !r.end) return "전체 기간";
  const s = r.start ? r.start.replace(/-/g, ".") : "처음";
  if (!r.end) return `${s} ~`;
  const e = r.start && r.start.slice(0, 4) === r.end.slice(0, 4) ? r.end.slice(5).replace(/-/g, ".") : r.end.replace(/-/g, ".");
  return `${s} ~ ${e}`;
}
