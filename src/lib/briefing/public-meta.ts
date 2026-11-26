import type { Metadata } from "next";
import { CATEGORY_LABEL, type CategoryKey } from "./schema";

/**
 * 공개 브리핑(/b) 링크 미리보기 — 네이버웍스·카카오톡 등은 <title> 이 아니라 og 태그를 읽는다.
 * 이게 없으면 앱 전체 기본값("수오더 / 의약품 주문 및 검수 관리")이 미리보기에 나온다.
 * openGraph 는 위 레이아웃 값과 합쳐지지 않고 통째로 바뀌므로 그림까지 매번 넣는다.
 */
export const PUBLIC_SITE_TITLE = "수의학 논문 브리핑";
export const PUBLIC_SITE_DESCRIPTION = "최신 수의학 논문을 한국어 카드로 요약해 매일 08:30에 올려요.";

export function publicMetadata(title: string, description: string, opts: { absoluteTitle?: boolean } = {}): Metadata {
  const desc = description.length > 160 ? `${description.slice(0, 159).trimEnd()}…` : description;
  return {
    title: opts.absoluteTitle ? { absolute: title } : title,
    description: desc,
    openGraph: {
      type: "article",
      siteName: "수오더",
      title,
      description: desc,
      images: [{ url: "/sooorder-brand/og-image.png", width: 1200, height: 630 }],
    },
  };
}

/**
 * 밖에서(휴대폰 데이터로도) 열리는 앱 주소 — 라운딩 화면 QR 에 넣는다.
 * TV 가 연 주소(내부 IP·Vercel 배포별 주소 등)를 그대로 쓰면 휴대폰에서 안 열릴 수 있어 운영 주소로 고정한다.
 * BRIEFING_APP_URL → NAVERWORKS_REDIRECT_BASE (https 만) → Vercel 이 넣어 주는 운영 도메인 → 없으면 null(화면 주소를 쓴다).
 */
export function publicAppUrl(env: Record<string, string | undefined> = process.env): string | null {
  for (const raw of [env.BRIEFING_APP_URL, env.NAVERWORKS_REDIRECT_BASE]) {
    const v = (raw ?? "").trim().replace(/\/+$/, "");
    if (/^https:\/\/[^\s/]+$/i.test(v)) return v;
  }
  const host = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
}

const SHARE_ICON: Partial<Record<CategoryKey, string>> = { internal: "🩺", surgery: "✂️", imaging: "🩻", emergency: "🚑" };
const SHARE_LABEL: Partial<Record<CategoryKey, string>> = { emergency: "응급" };

/**
 * 단체방에 붙여넣을 브리핑 메시지 (Aside 루틴이 /b/날짜/message 에서 그대로 복사한다 — 사람이·AI 가 다시 쓰지 않게 모양을 여기서 정한다).
 *
 *   📚 수의학 논문 브리핑 · 11월 26일(목)
 *
 *   🩺 내과
 *   카드 제목
 *   …
 *   👉 카드·해설 보기 (로그인 없이 열려요)
 *   https://…/b/2026-11-26
 */
export function buildShareMessage(date: string, papers: { headline: string; category: string | null; priority?: boolean }[], baseUrl: string): string {
  const [, m, d] = date.split("-").map(Number);
  const wd = "일월화수목금토"[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const blocks = papers.map((p) => {
    const key = p.category && p.category in CATEGORY_LABEL ? (p.category as CategoryKey) : null;
    const label = key ? (SHARE_LABEL[key] ?? CATEGORY_LABEL[key].ko) : "논문";
    const icon = (key && SHARE_ICON[key]) || "📄";
    return `${icon} ${label}${p.priority ? " · ⭐ 꼭 확인" : ""}\n${p.headline}`;
  });
  return [`📚 수의학 논문 브리핑 · ${m}월 ${d}일(${wd})`, ...blocks, `👉 카드·해설 보기 (로그인 없이 열려요)\n${baseUrl.replace(/\/+$/, "")}/b/${date}`].join("\n\n");
}

/** 그날 묶음 미리보기 제목: "11.26 수의학 논문 브리핑" (네이버웍스 미리보기 카드가 좁아 짧게) */
export function issueTitle(date: string): string {
  const [, m, d] = date.split("-");
  return `${m}.${d} ${PUBLIC_SITE_TITLE}`;
}

/** 그날 묶음 미리보기 설명: "내과·외과·영상·응급 논문 4편" */
export function issueDescription(papers: { headline: string; category: string | null }[]): string {
  const cats = [...new Set(papers.map((p) => (p.category && p.category in CATEGORY_LABEL ? (SHARE_LABEL[p.category as CategoryKey] ?? CATEGORY_LABEL[p.category as CategoryKey].ko) : null)).filter((c): c is string => !!c))];
  return `${cats.length > 0 ? `${cats.join("·")} ` : ""}논문 ${papers.length}편`;
}
