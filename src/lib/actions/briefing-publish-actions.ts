"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { formatIssueDate, isPastPublishTime, scheduledAtFor } from "@/lib/briefing/kst";
import { buildNaverWorksMessage } from "@/lib/briefing/notify";
import { publishIssue, type DeliveryResult } from "@/lib/briefing/publish-engine";
import { checkPublishable } from "@/lib/briefing/publish-rules";
import { loadPlanConfig, syncPlan } from "@/lib/briefing/plan-sync";
import { briefingRuntimeConfig, engineOptionsLive, publishStore, type BriefingRuntimeConfig } from "@/lib/briefing/run-publish";
import { QUEUE_DATE, type BriefingIssue, type BriefingPaper, type PlanSettings } from "@/lib/briefing/types";

/**
 * 논문 브리핑 발행 액션 (관리자 전용).
 *
 * 상태: 초안 → (08:30 예약) → 발행 완료.  알림 상태는 따로(발송 기록) 관리한다.
 * 실제 네이버웍스 전송은 하지 않는다 — 보낼 내용 미리보기와 기록만.
 */
export type PublishActionResult<T> = { ok: true; data: T } | { ok: false; error: string; reasons?: string[] };

export type NotificationLog = {
  id: string;
  issue_id: string;
  channel_type: "internal" | "naverworks-group";
  delivery_key: string;
  state: "pending" | "sent" | "mock" | "failed" | "skipped";
  attempt_count: number;
  sent_at: string | null;
  error_code: string | null;
  error_message: string | null;
  payload_preview: { title?: string; body?: string; text?: string; recipientCount?: number; itemCount?: number; messageCount?: number; note?: string } | null;
  created_at: string;
  updated_at: string;
};

const ISSUE_COLS = "id, issue_date, status, scheduled_at, published_at, created_by, created_at, updated_at";
const LOG_COLS = "id, issue_id, channel_type, delivery_key, state, attempt_count, sent_at, error_code, error_message, payload_preview, created_at, updated_at";
type Sb = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadIssue(supabase: Sb, issueId: string) {
  const { data } = await supabase.from("briefing_issues").select(ISSUE_COLS).eq("id", issueId).maybeSingle();
  return (data as BriefingIssue | null) ?? null;
}
async function loadPapers(supabase: Sb, issueId: string) {
  const { data } = await supabase.from("briefing_papers").select("id, headline, review_status, card_content, display_order").eq("issue_id", issueId).order("display_order");
  return (data as Pick<BriefingPaper, "id" | "headline" | "review_status" | "card_content" | "display_order">[] | null) ?? [];
}
function touch(issueDate: string) {
  revalidatePath("/briefing/admin");
  revalidatePath(`/briefing/admin/${issueDate}`);
  revalidatePath("/briefing");
}

/** 08:30 발행 예약. 검수 완료 3~4건일 때만. 이미 지난 시각으로는 예약하지 않는다(대신 "지금 발행"). */
export async function scheduleIssue(issueId: string): Promise<PublishActionResult<BriefingIssue>> {
  const { supabase, userId, userName } = await requireAdmin();
  const issue = await loadIssue(supabase, issueId);
  if (!issue) return { ok: false, error: "발행 묶음을 찾지 못했어요." };
  if (issue.status === "published") return { ok: false, error: "이미 발행된 묶음이에요." };
  if (issue.issue_date === QUEUE_DATE) return { ok: false, error: "대기함은 발행할 수 없어요." };
  const check = checkPublishable(await loadPapers(supabase, issueId), (await loadPlanConfig(supabase)).limits);
  if (!check.ok) return { ok: false, error: "아직 발행할 수 없어요.", reasons: check.reasons };
  if (isPastPublishTime(issue.issue_date)) {
    return { ok: false, error: `${formatIssueDate(issue.issue_date)} 08:30은 이미 지났어요. 바로 내보내려면 "지금 발행"을 눌러 주세요.` };
  }

  const { data, error } = await supabase
    .from("briefing_issues")
    .update({ status: "scheduled", scheduled_at: scheduledAtFor(issue.issue_date) })
    .eq("id", issueId)
    .in("status", ["draft", "scheduled"])
    .select(ISSUE_COLS)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "예약하지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  void logActivity({ userId, userName, category: "briefing", action: "schedule_issue", description: `${issue.issue_date} 브리핑 08:30 발행 예약 (논문 ${check.paperCount}건)` });
  touch(issue.issue_date);
  return { ok: true, data: data as BriefingIssue };
}

/** 예약 취소 → 초안 */
export async function cancelSchedule(issueId: string): Promise<PublishActionResult<BriefingIssue>> {
  const { supabase, userId, userName } = await requireAdmin();
  const { data, error } = await supabase.from("briefing_issues").update({ status: "draft", scheduled_at: null }).eq("id", issueId).eq("status", "scheduled").select(ISSUE_COLS).maybeSingle();
  if (error) return { ok: false, error: "예약을 취소하지 못했어요." };
  if (!data) return { ok: false, error: "예약 상태가 아니에요. 화면을 새로 고쳐 주세요." };
  const issue = data as BriefingIssue;
  void logActivity({ userId, userName, category: "briefing", action: "cancel_schedule", description: `${issue.issue_date} 브리핑 발행 예약 취소` });
  touch(issue.issue_date);
  return { ok: true, data: issue };
}

export type PublishNowData = { issue: BriefingIssue; newlyPublished: boolean; deliveries: DeliveryResult[] };

/** 지금 발행. 직원에게 바로 보인다. 같은 날짜는 한 번만 발행되고 알림도 한 번만 나간다 */
export async function publishIssueNow(issueId: string): Promise<PublishActionResult<PublishNowData>> {
  const { supabase, userId, userName } = await requireAdmin();
  const before = await loadIssue(supabase, issueId);
  if (!before) return { ok: false, error: "발행 묶음을 찾지 못했어요." };

  let outcome;
  try {
    outcome = await publishIssue(publishStore(), issueId, (await engineOptionsLive()).opts);
  } catch {
    return { ok: false, error: "발행하지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  }
  if (!outcome.ok) return { ok: false, error: "아직 발행할 수 없어요.", reasons: outcome.reasons };

  const issue = (await loadIssue(supabase, issueId)) ?? before;
  if (outcome.newlyPublished) {
    void logActivity({ userId, userName, category: "briefing", action: "publish_issue", description: `${issue.issue_date} 브리핑 발행 (논문 ${outcome.paperCount}건)` });
  }
  touch(issue.issue_date);
  return { ok: true, data: { issue, newlyPublished: outcome.newlyPublished, deliveries: outcome.deliveries } };
}

/**
 * 발행 취소 → 초안. 직원 화면에서 바로 사라진다.
 * 이미 나간 알림은 되돌릴 수 없고, 다시 발행해도 같은 날짜 알림은 또 나가지 않는다.
 */
export async function unpublishIssue(issueId: string): Promise<PublishActionResult<BriefingIssue>> {
  const { supabase, userId, userName } = await requireAdmin();
  const { data, error } = await supabase
    .from("briefing_issues")
    .update({ status: "draft", scheduled_at: null, published_at: null })
    .eq("id", issueId)
    .eq("status", "published")
    .select(ISSUE_COLS)
    .maybeSingle();
  if (error) return { ok: false, error: "발행을 취소하지 못했어요." };
  if (!data) return { ok: false, error: "발행 상태가 아니에요. 화면을 새로 고쳐 주세요." };
  const issue = data as BriefingIssue;
  void logActivity({ userId, userName, category: "briefing", action: "unpublish_issue", description: `${issue.issue_date} 브리핑 발행 취소` });
  // 대기함 방식이면 취소한 논문들이 다음 발행일부터 다시 채워진다
  await syncPlan(supabase);
  touch(issue.issue_date);
  return { ok: true, data: issue };
}

export type PublishPanelData = {
  logs: NotificationLog[];
  config: BriefingRuntimeConfig;
  /** 네이버웍스로 보낼 메시지 미리보기 (실제 전송 없음). 논문이 없으면 null */
  naverWorksPreview: { text: string; itemCount: number; messageCount: 1 } | null;
};

/** 발행 패널에 보여 줄 것: 이 묶음의 발송 기록 + 지금 설정 + 네이버웍스 메시지 미리보기 */
export async function fetchPublishPanel(issueId: string): Promise<PublishPanelData> {
  const { supabase } = await requireAdmin();
  const config = briefingRuntimeConfig();
  const [issue, papers, logs] = await Promise.all([
    loadIssue(supabase, issueId),
    loadPapers(supabase, issueId),
    supabase.from("briefing_notification_logs").select(LOG_COLS).eq("issue_id", issueId).order("created_at"),
  ]);
  const ready = papers.filter((p) => p.card_content);
  const preview =
    issue && ready.length > 0
      ? buildNaverWorksMessage(
          issue.issue_date,
          ready.map((p) => ({ id: p.id, headline: p.headline ?? p.card_content?.headline ?? "(제목 없음)" })),
          config.baseUrl
        )
      : null;
  return {
    logs: (logs.data as NotificationLog[] | null) ?? [],
    config,
    naverWorksPreview: preview ? { text: preview.text, itemCount: preview.itemCount, messageCount: preview.messageCount } : null,
  };
}

export type BriefingSettingsData = {
  config: BriefingRuntimeConfig;
  /** 하루 발행 건수 설정. planReady=false 면 아직 바꿀 수 없다(SQL 미실행) */
  plan: PlanSettings;
  planReady: boolean;
  /** 서버가 보는 지금 시각 (ISO, UTC) */
  serverNow: string;
  logs: (NotificationLog & { issue_date: string | null })[];
};

/** 설정 화면: 지금 동작 방식 + 최근 발송 기록 */
export async function fetchBriefingSettings(): Promise<BriefingSettingsData> {
  const { supabase } = await requireAdmin();
  const { data: logs } = await supabase.from("briefing_notification_logs").select(LOG_COLS).order("created_at", { ascending: false }).limit(40);
  const list = (logs as NotificationLog[] | null) ?? [];
  const ids = [...new Set(list.map((l) => l.issue_id))];
  const { data: issues } = ids.length > 0 ? await supabase.from("briefing_issues").select("id, issue_date").in("id", ids) : { data: [] };
  const dateOf = new Map((issues ?? []).map((i) => [i.id as string, i.issue_date as string]));
  const plan = await loadPlanConfig(supabase);
  return {
    config: briefingRuntimeConfig(),
    plan: plan.settings,
    planReady: plan.ready,
    serverNow: new Date().toISOString(),
    logs: list.map((l) => ({ ...l, issue_date: dateOf.get(l.issue_id) ?? null })),
  };
}
