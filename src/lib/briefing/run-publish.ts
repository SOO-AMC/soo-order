import { createAdminClient } from "@/lib/supabase/admin";
import { aiModel } from "./ai-designer";
import { configuredProvider } from "./designer";
import { naverWorksMockNote, naverWorksSendStatus, naverWorksSender } from "./naverworks-send";
import { loadPlanConfig } from "./plan-sync";
import { runDuePublish, warnIfStockLow, warnIfTodayMissing, type DueRunResult, type EngineOptions } from "./publish-engine";
import { createSupabasePublishStore } from "./supabase-publish-store";

/**
 * 발행 엔진을 서버에서 돌리는 입구 ("use server" 밖 — 액션과 크론이 같이 쓴다).
 *
 * 환경변수 (모두 서버 전용, 없어도 안전하게 동작):
 *  - BRIEFING_INTERNAL_NOTIFY=on : 발행 때 직원 알림함에 실제로 알림을 넣는다.
 *      꺼져 있으면(기본) 내용만 기록하고 넣지 않는다 — 개발 PC가 운영 DB에 붙어 있을 때 직원에게 알림이 가지 않게 하는 안전장치.
 *  - BRIEFING_APP_URL : 네이버웍스 메시지에 넣을 앱 주소 (예: https://…). 없으면 경로만.
 *  - BRIEFING_AI_PROVIDER=anthropic (+ ANTHROPIC_API_KEY) : 카드를 실제 AI로 만든다. 없으면 규칙 정리. BRIEFING_AI_MODEL 로 모델 변경.
 *  - 네이버웍스 단체방 발송: BRIEFING_NAVERWORKS_SEND=on + 단체방 Channel ID 등 — naverworks-send.ts 참고.
 *      스위치가 꺼져 있거나 설정이 하나라도 빠지면 보낼 내용 기록(mock)만 남긴다.
 */
export type BriefingRuntimeConfig = {
  internalLive: boolean;
  baseUrl: string | null;
  /** 네이버웍스 단체방 발송: off(꺼짐) · misconfigured(켰지만 설정이 덜 됨 — 보내지 않음) · live(실제로 보냄) */
  naverWorks: "off" | "misconfigured" | "live";
  /** misconfigured 일 때 빠진 설정 이름 (값은 담지 않는다) */
  naverWorksMissing: string[];
  ai: "rule" | "anthropic";
  /** AI를 켰을 때 쓰는 모델 이름 (꺼져 있으면 null) */
  aiModel: string | null;
};

export function briefingRuntimeConfig(): BriefingRuntimeConfig {
  const url = (process.env.BRIEFING_APP_URL ?? "").trim();
  const nw = naverWorksSendStatus();
  return {
    internalLive: process.env.BRIEFING_INTERNAL_NOTIFY === "on",
    // 실제로 보낼 때는 https 주소(briefingAppUrl)를 쓴다 — 버튼이 localhost 로 나가지 않게
    baseUrl: nw.state === "live" ? nw.appUrl : /^https?:\/\//i.test(url) ? url : null,
    naverWorks: nw.state,
    naverWorksMissing: nw.state === "misconfigured" ? nw.missing : [],
    ai: configuredProvider(),
    aiModel: configuredProvider() === "anthropic" ? aiModel() : null,
  };
}

export function engineOptions(now: Date = new Date()): EngineOptions {
  const c = briefingRuntimeConfig();
  return { now, internalLive: c.internalLive, baseUrl: c.baseUrl, naverWorksSend: naverWorksSender(), naverWorksMockNote: naverWorksMockNote(naverWorksSendStatus()) };
}

export function publishStore() {
  return createSupabasePublishStore(createAdminClient());
}

/** 엔진 옵션 + 설정의 하루 건수 범위. planReady = 대기함 방식(migrate-briefing-planner.sql)을 쓰는 중인가 */
export async function engineOptionsLive(now: Date = new Date()): Promise<{ opts: EngineOptions; planReady: boolean }> {
  const config = await loadPlanConfig(createAdminClient());
  return { opts: { ...engineOptions(now), limits: config.limits }, planReady: config.ready };
}

/** 준비분이 모자라면 관리자에게 알린다. 실패해도 발행에는 영향을 주지 않는다 */
async function stockWarning(store: ReturnType<typeof publishStore>, opts: EngineOptions, planReady: boolean): Promise<number | null> {
  if (!planReady) return null;
  return warnIfStockLow(store, opts).catch((e) => {
    console.error("[briefing] 준비분 알림 실패:", e instanceof Error ? e.message : e);
    return null;
  });
}

/** 예약 시각이 지난 묶음을 발행 완료로 (첫 조회 때 · 크론 공통). 여러 번 불러도 결과는 같다 */
export async function runDueNow(): Promise<DueRunResult> {
  const store = publishStore();
  const { opts, planReady } = await engineOptionsLive();
  const due = await runDuePublish(store, opts);
  await stockWarning(store, opts, planReady);
  return due;
}

/** 크론 전용: 발행 + 오늘 발행이 없으면 관리자 경고 + 준비분이 모자라면 알림 */
export async function runDailyCron(): Promise<DueRunResult & { warned: string | null; stockLow: number | null }> {
  const store = publishStore();
  const { opts, planReady } = await engineOptionsLive();
  const due = await runDuePublish(store, opts);
  const warned = await warnIfTodayMissing(store, opts);
  const stockLow = await stockWarning(store, opts, planReady);
  return { ...due, warned, stockLow };
}
