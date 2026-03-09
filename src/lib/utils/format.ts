const TZ = "Asia/Seoul";

/** "YYYY. MM. DD." 형식 (KST) */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** "YYYY. MM. DD. HH:mm:ss" 형식 (KST) */
export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("ko-KR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("ko-KR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** 시간을 한국어 문자열로 변환 (예: "30분", "2.5시간", "1일 12시간") */
export function formatHours(hours: number): string {
  if (hours === 0) return "-";
  if (hours < 1) return `${Math.round(hours * 60)}분`;
  if (hours < 24) return `${hours.toFixed(1)}시간`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return `${days}일 ${remaining.toFixed(0)}시간`;
}

/** ISO 문자열 → KST 기준 "YYYY-MM-DD" (필터 비교용) */
export function toKSTDateString(isoString: string): string {
  const d = new Date(isoString);
  const year = d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric" });
  const month = d.toLocaleDateString("en-CA", { timeZone: TZ, month: "2-digit" });
  const day = d.toLocaleDateString("en-CA", { timeZone: TZ, day: "2-digit" });
  return `${year}-${month}-${day}`;
}
