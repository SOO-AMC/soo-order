import type { SupabaseClient } from "@supabase/supabase-js";
import { claimDecision, type Channel, type DeliveryState } from "./notify";
import type { EngineIssue, EnginePaper, NotificationRow, PublishStore } from "./publish-engine";

/**
 * 발행 엔진의 실제 DB 저장소.
 *
 * service_role 클라이언트로 돈다(크론·첫 조회 때는 관리자 로그인이 없다).
 * 여기 있는 일은 "예약된 것을 발행으로 바꾸고 알림 기록을 남기는 것"뿐이라, 누가 불러도 결과가 같다.
 * 관리자 화면에서 부를 때는 액션이 먼저 requireAdmin()으로 권한을 확인한다.
 */
const ISSUE_COLS = "id, issue_date, status, scheduled_at, published_at";
const fail = (what: string, message: string) => new Error(`[briefing] ${what}: ${message}`);

export function createSupabasePublishStore(sb: SupabaseClient): PublishStore {
  return {
    async getIssue(issueId) {
      const { data, error } = await sb.from("briefing_issues").select(ISSUE_COLS).eq("id", issueId).maybeSingle();
      if (error) throw fail("묶음 조회", error.message);
      return (data as EngineIssue | null) ?? null;
    },
    async getIssueByDate(issueDate) {
      const { data, error } = await sb.from("briefing_issues").select(ISSUE_COLS).eq("issue_date", issueDate).maybeSingle();
      if (error) throw fail("묶음 조회", error.message);
      return (data as EngineIssue | null) ?? null;
    },
    async listDueScheduled(nowIso) {
      const { data, error } = await sb.from("briefing_issues").select(ISSUE_COLS).eq("status", "scheduled").lte("scheduled_at", nowIso).order("issue_date");
      if (error) throw fail("예약 조회", error.message);
      return (data as EngineIssue[] | null) ?? [];
    },
    async listPapers(issueId) {
      const { data, error } = await sb.from("briefing_papers").select("id, headline, review_status, card_content, display_order").eq("issue_id", issueId).order("display_order");
      if (error) throw fail("논문 조회", error.message);
      return (data as EnginePaper[] | null) ?? [];
    },
    async markPublished(issueId, nowIso) {
      // 조건부 전환 한 문장: 초안·예약일 때만 바뀐다. 동시에 여러 번 와도 한 번만 행이 돌아온다
      const { data, error } = await sb.from("briefing_issues").update({ status: "published", published_at: nowIso }).eq("id", issueId).in("status", ["draft", "scheduled"]).select("id");
      if (error) throw fail("발행 전환", error.message);
      return (data?.length ?? 0) > 0;
    },
    async revertScheduledToDraft(issueId) {
      const { error } = await sb.from("briefing_issues").update({ status: "draft", scheduled_at: null }).eq("id", issueId).eq("status", "scheduled");
      if (error) throw fail("예약 되돌리기", error.message);
    },
    async claimDelivery(key: string, issueId: string, channel: Channel, now: Date) {
      // 1) 새 기록 넣기 — delivery_key 유니크라 먼저 넣은 쪽만 성공한다
      const ins = await sb.from("briefing_notification_logs").insert({ issue_id: issueId, channel_type: channel, delivery_key: key, state: "pending", attempt_count: 1 }).select("id");
      if (!ins.error) return "claimed";
      if (ins.error.code !== "23505") throw fail("발송 기록", ins.error.message);

      // 2) 이미 있으면: 끝났는지, 누가 보내는 중인지, 다시 맡아도 되는지
      const { data: ex, error } = await sb.from("briefing_notification_logs").select("id, state, attempt_count, updated_at").eq("delivery_key", key).maybeSingle();
      if (error) throw fail("발송 기록", error.message);
      if (!ex) return "busy";
      const decision = claimDecision({ state: ex.state as DeliveryState, updatedAt: ex.updated_at as string, attempts: ex.attempt_count as number }, now);
      if (decision !== "claim") return decision;
      // 다시 맡기도 조건부(시도 횟수가 그대로일 때만) — 둘이 동시에 다시 맡지 못한다
      const upd = await sb
        .from("briefing_notification_logs")
        .update({ state: "pending", attempt_count: (ex.attempt_count as number) + 1, error_code: null, error_message: null })
        .eq("id", ex.id)
        .eq("attempt_count", ex.attempt_count)
        .eq("state", ex.state)
        .select("id");
      if (upd.error) throw fail("발송 기록", upd.error.message);
      return (upd.data?.length ?? 0) > 0 ? "claimed" : "busy";
    },
    async finishDelivery(key, r) {
      const { error } = await sb
        .from("briefing_notification_logs")
        .update({
          state: r.state,
          sent_at: r.state === "sent" || r.state === "mock" ? r.nowIso : null,
          error_code: r.errorCode ?? null,
          error_message: r.errorMessage ?? null,
          ...(r.payloadPreview !== undefined ? { payload_preview: r.payloadPreview } : {}),
        })
        .eq("delivery_key", key);
      if (error) throw fail("발송 기록", error.message);
    },
    async listRecipientIds() {
      const { data, error } = await sb.from("profiles").select("id, role").eq("is_active", true);
      if (error) throw fail("받는 사람 조회", error.message);
      // 세미나실 화면 전용 계정은 알림을 받지 않는다
      return (data ?? []).filter((p) => p.role !== "display").map((p) => p.id as string);
    },
    async listAdminIds() {
      const { data, error } = await sb.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
      if (error) throw fail("관리자 조회", error.message);
      return (data ?? []).map((p) => p.id as string);
    },
    async countScheduledAfter(issueDate) {
      const { count, error } = await sb.from("briefing_issues").select("id", { count: "exact", head: true }).eq("status", "scheduled").gt("issue_date", issueDate);
      if (error) throw fail("예약 수 조회", error.message);
      return count ?? 0;
    },
    async insertNotifications(rows: NotificationRow[]) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("notifications").insert(rows.slice(i, i + 500));
        if (error) throw fail("알림 넣기", error.message);
      }
    },
  };
}
