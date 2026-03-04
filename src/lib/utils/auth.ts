export function nameToEmail(name: string): string {
  const encoded = Buffer.from(name, "utf-8")
    .toString("base64url")
    .replace(/=+$/, "");
  return `${encoded}@soo-order.internal`;
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) {
    return "비밀번호는 4자리 이상이어야 합니다.";
  }
  return null;
}

const PASSWORD_SUFFIX = "#Sx9";

/** Supabase 최소 6자 제한 우회를 위해 고정 접미사를 붙여 전달 */
export function padPassword(password: string): string {
  return password + PASSWORD_SUFFIX;
}
