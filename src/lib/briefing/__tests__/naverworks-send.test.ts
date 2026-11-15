import { describe, expect, it } from "vitest";
import { briefingAppUrl, briefingChannelBody, naverWorksMockNote, naverWorksSendStatus, naverWorksSender } from "../naverworks-send";
import { buildNaverWorksMessage } from "../notify";

const KEY = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ" + "A".repeat(200);
const full: Record<string, string> = {
  BRIEFING_NAVERWORKS_SEND: "on",
  NAVERWORKS_BRIEFING_CHANNEL_ID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  NAVERWORKS_BOT_ID: "13584696",
  NAVERWORKS_CLIENT_ID: "client",
  NAVERWORKS_CLIENT_SECRET: "secret",
  NAVERWORKS_SERVICE_ACCOUNT: "x.serviceaccount@example.com",
  NAVERWORKS_PRIVATE_KEY: KEY,
  NAVERWORKS_TENANT_ID: "300119159",
  BRIEFING_APP_URL: "https://soo-order.vercel.app/",
};
const without = (k: string) => Object.fromEntries(Object.entries(full).filter(([key]) => key !== k));

describe("네이버웍스 단체방 발송 설정", () => {
  it("스위치가 없으면 꺼짐 — 다른 설정이 다 있어도 보내지 않는다", () => {
    expect(naverWorksSendStatus(without("BRIEFING_NAVERWORKS_SEND")).state).toBe("off");
    expect(naverWorksSendStatus({ ...full, BRIEFING_NAVERWORKS_SEND: "true" }).state).toBe("off");
    expect(naverWorksSender(without("BRIEFING_NAVERWORKS_SEND"))).toBeNull();
  });

  it("다 있으면 실제 발송, 앱 주소는 https 만 (끝의 / 제거)", () => {
    expect(naverWorksSendStatus(full)).toEqual({ state: "live", channelId: full.NAVERWORKS_BRIEFING_CHANNEL_ID, botId: "13584696", appUrl: "https://soo-order.vercel.app" });
    expect(naverWorksSender(full)).toBeTypeOf("function");
  });

  it("켰지만 빠진 게 있으면 보내지 않고 무엇이 빠졌는지만 알려 준다 (값은 담지 않는다)", () => {
    const s = naverWorksSendStatus({ ...full, NAVERWORKS_BRIEFING_CHANNEL_ID: "", BRIEFING_APP_URL: "http://localhost:3002", NAVERWORKS_BOT_ID: "abc" });
    expect(s.state).toBe("misconfigured");
    if (s.state === "misconfigured") expect(s.missing).toEqual(["NAVERWORKS_BRIEFING_CHANNEL_ID", "NAVERWORKS_BOT_ID", "BRIEFING_APP_URL (https)"]);
    expect(naverWorksMockNote(s)).toContain("NAVERWORKS_BRIEFING_CHANNEL_ID");
    expect(naverWorksMockNote(s)).not.toContain("secret");
    expect(naverWorksSendStatus(without("NAVERWORKS_PRIVATE_KEY")).state).toBe("misconfigured");
  });

  it("앱 주소는 BRIEFING_APP_URL, 없으면 NAVERWORKS_REDIRECT_BASE — localhost(http)는 안 받는다", () => {
    expect(briefingAppUrl({ NAVERWORKS_REDIRECT_BASE: "https://soo-order.vercel.app" })).toBe("https://soo-order.vercel.app");
    expect(briefingAppUrl({ BRIEFING_APP_URL: "http://localhost:3002" })).toBeNull();
  });

  it("단체방 메시지: 논문 목록 글 + '오늘 논문 보기' 버튼 1개", () => {
    const msg = buildNaverWorksMessage("2026-11-16", [{ id: "1", headline: "논문 A" }, { id: "2", headline: "논문 B" }], "https://soo-order.vercel.app");
    const body = briefingChannelBody(msg) as { content: { type: string; contentText: string; actions: { type: string; label: string; uri: string }[] } };
    expect(body.content.type).toBe("button_template");
    expect(body.content.contentText).toContain("1. 논문 A");
    expect(body.content.contentText).not.toContain("http");
    expect(body.content.actions).toEqual([{ type: "uri", label: "오늘 논문 보기", uri: "https://soo-order.vercel.app/auth/naverworks/start?next=%2Fbriefing" }]);
  });
});
