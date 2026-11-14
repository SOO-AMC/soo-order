import type { NotificationLog } from "@/lib/actions/briefing-publish-actions";

const STATE_TEXT: Record<NotificationLog["state"], string> = {
  pending: "보내는 중",
  sent: "보냄",
  mock: "기록만 남김 (보내지 않음)",
  failed: "실패",
  skipped: "건너뜀",
};

/** 발송 기록 한 줄을 사람 말로 */
export function describeLog(log: Pick<NotificationLog, "channel_type" | "delivery_key" | "state" | "payload_preview" | "error_message">): { label: string; text: string; bad: boolean } {
  const isWarning = log.delivery_key.startsWith("internal-warning:");
  const label = log.channel_type === "naverworks-group" ? "네이버웍스 단체방" : isWarning ? "관리자 경고 알림" : "직원 알림 (수오더)";
  const n = log.payload_preview?.recipientCount;
  const who = typeof n === "number" ? ` · ${n}명${log.state === "sent" ? "" : " 대상"}` : "";
  const text = log.state === "failed" ? `실패 — ${log.error_message ?? "원인을 알 수 없어요"}` : `${STATE_TEXT[log.state]}${log.channel_type === "internal" ? who : ""}`;
  return { label, text, bad: log.state === "failed" };
}
