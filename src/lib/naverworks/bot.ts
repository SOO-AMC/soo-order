import { getDirectoryUser, serviceToken, type DirectoryConfig } from "./directory";

/**
 * 네이버웍스 봇 메시지 보내기 (서버 전용). "use server" 파일이 아니다.
 * 서비스 계정 토큰(scope bot)으로 보낸다. 문서: https://developers.worksmobile.com/kr/docs/bot-user-message-send
 *
 * 환경변수: NAVERWORKS_BOT_ID (Developer Console 의 Bot ID) + 직원 정보 읽기와 같은 서비스 계정 값.
 * 실제 발송은 이 파일을 부르는 쪽(관리자 액션)이 정한다 — 여기는 보내는 방법만.
 */

export const botId = (env: Record<string, string | undefined> = process.env): string | null => {
  const v = (env.NAVERWORKS_BOT_ID ?? "").trim();
  return /^\d+$/.test(v) ? v : null;
};

/** 버튼 1개짜리 메시지 (button_template: 글 + 링크 버튼) */
export function buttonMessage(text: string, button: { label: string; url: string }) {
  return {
    content: {
      type: "button_template",
      contentText: text.slice(0, 1000),
      actions: [{ type: "uri", label: button.label.slice(0, 40), uri: button.url }],
    },
  };
}

export type SendResult = { ok: true } | { ok: false; status: number; error: string };

/** 한 사람에게 1:1 메시지. userIdOrEmail 이 이메일이면 직원 정보에서 구성원 ID 를 찾아 보낸다 */
export async function sendToUser(cfg: DirectoryConfig, bot: string, userIdOrEmail: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  let userId = userIdOrEmail;
  if (userIdOrEmail.includes("@")) {
    const u = await getDirectoryUser(cfg, userIdOrEmail, fetchImpl);
    if (!u?.userId) return { ok: false, status: 404, error: "user-not-found" };
    userId = u.userId;
  }
  const token = await serviceToken(cfg, "bot", fetchImpl);
  const res = await fetchImpl(`https://www.worksapis.com/v1.0/bots/${encodeURIComponent(bot)}/users/${encodeURIComponent(userId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 201 || res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, error: text.slice(0, 300) };
}
