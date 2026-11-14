export function nameToEmail(name: string): string {
  const encoded = Buffer.from(name, "utf-8")
    .toString("base64url")
    .replace(/=+$/, "");
  return `${encoded}@soo-order.internal`;
}

/** 비밀번호 최소 자리수. 세미나실 화면 계정(role = display)은 1자리부터 — 발행된 논문 브리핑만 볼 수 있는 계정이라 */
export function minPasswordLength(role?: string | null): number {
  return role === "display" ? 1 : 4;
}

export function validatePassword(password: string, role?: string | null): string | null {
  const min = minPasswordLength(role);
  if (password.length < min) {
    return min === 1 ? "비밀번호를 입력해주세요." : `비밀번호는 ${min}자리 이상이어야 합니다.`;
  }
  return null;
}

const PASSWORD_SUFFIX = "#Sx9";

/**
 * Supabase 최소 6자 제한 우회를 위해 고정 접미사를 붙여 전달.
 * 2자리 이상은 예전과 똑같다(기존 비밀번호가 그대로 맞아야 하므로 바꾸지 말 것).
 * 1자리(세미나실 계정)는 접미사 하나로는 5자라 모자라서 한 번 더 붙인다 — 길이로만 정해지므로 가입·로그인이 늘 같다.
 */
export function padPassword(password: string): string {
  return password.length >= 2 ? password + PASSWORD_SUFFIX : password + PASSWORD_SUFFIX + PASSWORD_SUFFIX;
}
