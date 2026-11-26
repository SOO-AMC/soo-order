import { describe, expect, it } from "vitest";
import { buildShareMessage, issueDescription, issueTitle, publicAppUrl, publicMetadata } from "../public-meta";

describe("publicAppUrl (라운딩 QR 주소)", () => {
  it("BRIEFING_APP_URL 이 https 면 그것", () => {
    expect(publicAppUrl({ BRIEFING_APP_URL: "https://order.example.com/", VERCEL_PROJECT_PRODUCTION_URL: "soo-order.vercel.app" })).toBe("https://order.example.com");
  });
  it("http·경로 붙은 값은 건너뛰고 다음 값", () => {
    expect(publicAppUrl({ BRIEFING_APP_URL: "http://192.168.0.37:3001", NAVERWORKS_REDIRECT_BASE: "https://a.example.com/x" , VERCEL_PROJECT_PRODUCTION_URL: "soo-order.vercel.app" })).toBe("https://soo-order.vercel.app");
  });
  it("Vercel 운영 도메인", () => {
    expect(publicAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "soo-order.vercel.app" })).toBe("https://soo-order.vercel.app");
  });
  it("아무것도 없으면 null (화면 주소를 쓴다)", () => {
    expect(publicAppUrl({})).toBeNull();
  });
});

describe("공개 링크 미리보기", () => {
  it("og 제목·설명이 들어간다", () => {
    const m = publicMetadata("2026.11.26 (목) 수의학 논문 브리핑 · 2건", "x".repeat(300), { absoluteTitle: true });
    expect(m.title).toEqual({ absolute: "2026.11.26 (목) 수의학 논문 브리핑 · 2건" });
    expect(m.openGraph?.title).toBe("2026.11.26 (목) 수의학 논문 브리핑 · 2건");
    expect((m.description ?? "").length).toBeLessThanOrEqual(160);
  });
  it("묶음 제목·설명은 짧게: 날짜 + 수의학 논문 브리핑 / 분야 + 편수", () => {
    expect(issueTitle("2026-11-26")).toBe("11.26 수의학 논문 브리핑");
    expect(issueDescription([{ headline: "가", category: "internal" }, { headline: "나", category: "emergency" }, { headline: "다", category: null }])).toBe("내과·응급 논문 3편");
    expect(issueDescription([{ headline: "가", category: null }])).toBe("논문 1편");
  });
});

describe("단체방 메시지", () => {
  it("날짜·분야·제목·링크 모양", () => {
    const text = buildShareMessage(
      "2026-11-26",
      [
        { headline: "가 했습니다", category: "internal" },
        { headline: "나 했습니다", category: "emergency", priority: true },
        { headline: "다 했습니다", category: null },
      ],
      "https://soo-order.vercel.app/"
    );
    expect(text).toBe(
      [
        "📚 수의학 논문 브리핑 · 11월 26일(목)",
        "🩺 내과\n가 했습니다",
        "🚑 응급 · ⭐ 꼭 확인\n나 했습니다",
        "📄 논문\n다 했습니다",
        "👉 카드·해설 보기 (로그인 없이 열려요)\nhttps://soo-order.vercel.app/b/2026-11-26",
      ].join("\n\n")
    );
  });
});
