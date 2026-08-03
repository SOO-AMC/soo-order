/**
 * 안전한 UUID v4 생성기.
 *
 * `crypto.randomUUID()`는 보안 컨텍스트(HTTPS/localhost)에서만 제공된다.
 * 개발 서버를 LAN IP(http://...)로 접속하면 `crypto.randomUUID`가 undefined라
 * 호출 즉시 throw → 호출부 전체가 중단되는 문제가 있었다.
 * 비보안 컨텍스트에서는 Math.random 기반 폴백으로 유효한 UUID v4를 만든다
 * (orders.id 같은 UUID 컬럼에 INSERT되므로 형식이 유효해야 함).
 */
export function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
