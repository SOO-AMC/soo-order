/**
 * 논문 브리핑 날짜·시각 규칙 (전부 한국시간 Asia/Seoul).
 * 서버가 UTC로 돌아도 같은 결과가 나오게 문자열 "+09:00"으로만 계산한다.
 */
export const BRIEFING_TZ = "Asia/Seoul";
/** 매일 발행 시각 (주말 포함) */
export const PUBLISH_HOUR = 8;
export const PUBLISH_MINUTE = 30;

const pad = (n: number) => String(n).padStart(2, "0");

/** 한국시간 날짜 "YYYY-MM-DD" */
export function kstDate(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: BRIEFING_TZ });
}

/** 한국시간 시·분 */
export function kstHourMinute(now: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BRIEFING_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour") % 24, minute: get("minute") };
}

/** 날짜 더하기 (문자열 유지) */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 그 날짜의 발행 예약 시각 (08:30 KST)을 UTC ISO로 */
export function scheduledAtFor(issueDate: string): string {
  return new Date(`${issueDate}T${pad(PUBLISH_HOUR)}:${pad(PUBLISH_MINUTE)}:00+09:00`).toISOString();
}

/** 지금 08:30(KST)이 지났는가 */
export function isPastPublishTime(issueDate: string, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(scheduledAtFor(issueDate)).getTime();
}

/**
 * 새 논문을 등록할 때 기본 발행일.
 * 오늘 08:30 전이면 오늘, 지났으면 내일.
 */
export function defaultIssueDate(now: Date = new Date()): string {
  const today = kstDate(now);
  return isPastPublishTime(today, now) ? addDays(today, 1) : today;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026.11.14 (토)" */
export function formatIssueDate(issueDate: string): string {
  const [y, m, d] = issueDate.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${pad(m)}.${pad(d)} (${wd})`;
}

/** "11월 14일 토요일" */
export function formatIssueDateLong(issueDate: string): string {
  const [y, m, d] = issueDate.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${wd}요일`;
}

/** 시각을 "11.14 08:30 (KST)" 로 */
export function formatKstDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: BRIEFING_TZ });
  const { hour, minute } = kstHourMinute(d);
  const [, m, day] = date.split("-");
  return `${Number(m)}.${Number(day)} ${pad(hour)}:${pad(minute)} (KST)`;
}
