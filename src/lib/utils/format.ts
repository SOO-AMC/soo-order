/** "YYYY. MM. DD." 형식 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** "YYYY. MM. DD. HH:mm:ss" 형식 */
export function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const date = d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}
