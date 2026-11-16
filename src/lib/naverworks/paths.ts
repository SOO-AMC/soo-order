/**
 * 네이버웍스 로그인·알림 링크용 순수 함수.
 * 브라우저 화면 코드도 이 파일을 (간접적으로) 불러오므로 node:crypto 같은 서버 전용 모듈을 넣지 말 것 —
 * 넣으면 개발 서버(Turbopack)는 돌아가도 운영 빌드(webpack)가 실패한다. 서버 전용 로직은 oidc.ts 에.
 */

/**
 * 로그인 뒤 돌아갈 곳. 이 앱 안의 경로만 받는다(다른 사이트로 보내는 열린 리다이렉트 방지).
 * "/briefing" ○, "//evil.com" ✕, "https://evil.com" ✕, "/\\evil" ✕
 */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const v = next.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n\t]/.test(v) || v.length > 512) return fallback;
  if (v.startsWith("/auth/") || v.startsWith("/login")) return fallback;
  return v;
}

/**
 * 네이버웍스 알림 메시지에 넣는 링크.
 * 누르면: 이미 수오더에 로그인돼 있으면 바로 그 화면, 아니면 로그인 화면을 건너뛰고 네이버웍스 확인으로 간다 (start 라우트가 처리).
 * baseUrl 이 없으면 경로만 (미리보기용).
 */
export function notificationLink(path: string, baseUrl?: string | null): string {
  const origin = (baseUrl ?? "").replace(/\/+$/, "");
  return `${origin}/auth/naverworks/start?next=${encodeURIComponent(safeNext(path))}`;
}
