import { botId, buttonMessage, sendToChannel } from "@/lib/naverworks/bot";
import { directoryConfig } from "@/lib/naverworks/directory";
import type { NaverWorksMessage } from "./notify";

/**
 * 논문 브리핑 → 네이버웍스 단체방 발송 설정 ("use server" 밖 — 크론과 액션이 같이 쓴다).
 *
 * 실제로 보내려면 아래가 **전부** 있어야 한다. 하나라도 빠지면 보내지 않고 기록(mock)만 남긴다.
 *  - BRIEFING_NAVERWORKS_SEND=on      : 발송 스위치. 기본은 꺼짐 — 개발 PC(.env.local)에서는 켜지 않는다
 *  - NAVERWORKS_BRIEFING_CHANNEL_ID   : 보낼 단체방의 Channel ID (메시지방 메뉴 → Channel ID)
 *  - NAVERWORKS_BOT_ID + 서비스 계정 값(CLIENT_ID/SECRET, SERVICE_ACCOUNT, PRIVATE_KEY, TENANT_ID)
 *  - 앱 주소 https://… (BRIEFING_APP_URL, 없으면 NAVERWORKS_REDIRECT_BASE) — 버튼 링크가 localhost 로 나가지 않게 https 만 받는다
 *
 * 네이버웍스 쪽 준비: Developer Console 에서 Bot 정책을 "1:N 메시지방 참여 가능"으로 바꾸고,
 * Admin 에서 봇을 공개·사용 권한 전체로 바꾼 뒤 그 단체방에 봇을 초대한다.
 */
type Env = Record<string, string | undefined>;

export type NaverWorksSendStatus =
  | { state: "off" }
  | { state: "misconfigured"; missing: string[] }
  | { state: "live"; channelId: string; botId: string; appUrl: string };

const CHANNEL_RE = /^[A-Za-z0-9-]{8,80}$/;

/** 앱 주소: https 만 (끝의 / 제거) */
export function briefingAppUrl(env: Env = process.env): string | null {
  for (const raw of [env.BRIEFING_APP_URL, env.NAVERWORKS_REDIRECT_BASE]) {
    const v = (raw ?? "").trim().replace(/\/+$/, "");
    if (/^https:\/\/[^\s/]+/i.test(v)) return v;
  }
  return null;
}

/** 지금 설정으로 실제로 보낼 수 있는가 (순수 함수 — 값은 돌려주지 않고 무엇이 빠졌는지만) */
export function naverWorksSendStatus(env: Env = process.env): NaverWorksSendStatus {
  if ((env.BRIEFING_NAVERWORKS_SEND ?? "").trim() !== "on") return { state: "off" };
  const missing: string[] = [];
  const channelId = (env.NAVERWORKS_BRIEFING_CHANNEL_ID ?? "").trim();
  if (!CHANNEL_RE.test(channelId)) missing.push("NAVERWORKS_BRIEFING_CHANNEL_ID");
  const bot = botId(env);
  if (!bot) missing.push("NAVERWORKS_BOT_ID");
  if (!directoryConfig(env)) missing.push("네이버웍스 서비스 계정 값");
  const appUrl = briefingAppUrl(env);
  if (!appUrl) missing.push("BRIEFING_APP_URL (https)");
  if (missing.length > 0 || !bot || !appUrl) return { state: "misconfigured", missing };
  return { state: "live", channelId, botId: bot, appUrl };
}

/** 단체방에 보낼 본문: 글 + "오늘 논문 보기" 버튼 1개 */
export function briefingChannelBody(msg: NaverWorksMessage) {
  return buttonMessage(msg.summary, { label: "오늘 논문 보기", url: msg.link });
}

/** 발송 함수. 실제로 보낼 수 없는 설정이면 null (엔진이 기록만 남긴다) */
export function naverWorksSender(env: Env = process.env): ((msg: NaverWorksMessage) => Promise<void>) | null {
  const status = naverWorksSendStatus(env);
  if (status.state !== "live") return null;
  const cfg = directoryConfig(env);
  if (!cfg) return null;
  return async (msg) => {
    const res = await sendToChannel(cfg, status.botId, status.channelId, briefingChannelBody(msg));
    if (!res.ok) throw new Error(`네이버웍스 ${res.status}: ${res.error.slice(0, 200)}`);
  };
}

/** 기록에 남길 "보내지 않은 이유" */
export function naverWorksMockNote(status: NaverWorksSendStatus): string {
  if (status.state === "off") return "네이버웍스 발송 꺼짐 — 실제로 보내지 않았어요";
  if (status.state === "misconfigured") return `네이버웍스 발송 설정이 덜 됨(${status.missing.join(", ")}) — 실제로 보내지 않았어요`;
  return "";
}
