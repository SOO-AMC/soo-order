import { createAdminClient } from "@/lib/supabase/admin";
import { aiModel } from "./ai-designer";
import { configuredProvider } from "./designer";
import { runDuePublish, warnIfTodayMissing, type DueRunResult, type EngineOptions } from "./publish-engine";
import { createSupabasePublishStore } from "./supabase-publish-store";

/**
 * 발행 엔진을 서버에서 돌리는 입구 ("use server" 밖 — 액션과 크론이 같이 쓴다).
 *
 * 환경변수 (모두 서버 전용, 없어도 안전하게 동작):
 *  - BRIEFING_INTERNAL_NOTIFY=on : 발행 때 직원 알림함에 실제로 알림을 넣는다.
 *      꺼져 있으면(기본) 내용만 기록하고 넣지 않는다 — 개발 PC가 운영 DB에 붙어 있을 때 직원에게 알림이 가지 않게 하는 안전장치.
 *  - BRIEFING_APP_URL : 네이버웍스 메시지에 넣을 앱 주소 (예: https://…). 없으면 경로만.
 *  - BRIEFING_AI_PROVIDER=anthropic (+ ANTHROPIC_API_KEY) : 카드를 실제 AI로 만든다. 없으면 규칙 정리. BRIEFING_AI_MODEL 로 모델 변경.
 *  - 네이버웍스 자격 증명은 아직 읽지 않는다 (연결 전 — 보낼 내용 기록만).
 */
export type BriefingRuntimeConfig = {
  internalLive: boolean;
  baseUrl: string | null;
  /** 네이버웍스: 아직 연결하지 않음 */
  naverWorks: "not-connected";
  ai: "rule" | "anthropic";
  /** AI를 켰을 때 쓰는 모델 이름 (꺼져 있으면 null) */
  aiModel: string | null;
};

export function briefingRuntimeConfig(): BriefingRuntimeConfig {
  const url = (process.env.BRIEFING_APP_URL ?? "").trim();
  return {
    internalLive: process.env.BRIEFING_INTERNAL_NOTIFY === "on",
    baseUrl: /^https?:\/\//i.test(url) ? url : null,
    naverWorks: "not-connected",
    ai: configuredProvider(),
    aiModel: configuredProvider() === "anthropic" ? aiModel() : null,
  };
}

export function engineOptions(now: Date = new Date()): EngineOptions {
  const c = briefingRuntimeConfig();
  return { now, internalLive: c.internalLive, baseUrl: c.baseUrl };
}

export function publishStore() {
  return createSupabasePublishStore(createAdminClient());
}

/** 예약 시각이 지난 묶음을 발행 완료로 (첫 조회 때 · 크론 공통). 여러 번 불러도 결과는 같다 */
export async function runDueNow(): Promise<DueRunResult> {
  return runDuePublish(publishStore(), engineOptions());
}

/** 크론 전용: 발행 + 오늘 발행이 없으면 관리자 경고 */
export async function runDailyCron(): Promise<DueRunResult & { warned: string | null }> {
  const store = publishStore();
  const opts = engineOptions();
  const due = await runDuePublish(store, opts);
  const warned = await warnIfTodayMissing(store, opts);
  return { ...due, warned };
}
