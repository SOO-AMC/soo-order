import { isPastPublishTime, kstDate } from "./kst";
import { buildInternalNotification, buildMissedWarning, buildNaverWorksMessage, buildStockLowWarning, deliveryKey, stockLowKey, warningKey, type Channel, type DeliveryState, type NaverWorksMessage, type NotifyPaper } from "./notify";
import { checkPublishable } from "./publish-rules";
import { QUEUE_DATE, type BriefingIssue, type BriefingPaper, type PublishLimits } from "./types";

/**
 * 발행 엔진.
 *
 * 저장소(PublishStore)만 바꿔 끼우면 실제 DB로도, 테스트용 메모리로도 똑같이 돈다.
 *
 * 지키는 것:
 *  - 그날 논문이 전부 검수돼 있고 건수가 범위(opts.limits — 날짜 묶음 방식은 1~6건, 없으면 예전 규칙 3~4건) 안일 때만 발행한다. 조건이 안 맞으면 골라서 내보내지 않고 이유를 돌려준다.
 *  - 같은 날짜는 한 번만 발행된다 (상태를 조건부로 바꾼다 — 먼저 바꾼 쪽만 "내가 발행했다").
 *  - 알림은 채널마다 하루 한 번 (delivery_key 유니크). 여러 번·동시에 돌려도 한 번만 나간다.
 *  - 발행이 끝난 뒤에만 알림을 만든다.
 *  - 네이버웍스: opts.naverWorksSend 가 있을 때만 실제로 보낸다(단체방 1건). 없으면 보낼 내용과 "보내지 않음(mock)" 기록만 — 외부 호출 없음.
 */

export type EnginePaper = Pick<BriefingPaper, "id" | "headline" | "review_status" | "card_content" | "display_order">;
export type EngineIssue = Pick<BriefingIssue, "id" | "issue_date" | "status" | "scheduled_at" | "published_at">;

export type NotificationRow = { user_id: string; type: string; title: string; body: string; link: string };

export interface PublishStore {
  getIssue(issueId: string): Promise<EngineIssue | null>;
  getIssueByDate(issueDate: string): Promise<EngineIssue | null>;
  /** 예약 상태이고 예약 시각이 지난 묶음 */
  listDueScheduled(nowIso: string): Promise<EngineIssue[]>;
  listPapers(issueId: string): Promise<EnginePaper[]>;
  /** 초안·예약 → 발행 완료. 이 호출이 상태를 바꿨을 때만 true (이미 발행됐으면 false) */
  markPublished(issueId: string, nowIso: string): Promise<boolean>;
  /** 예약 → 초안 (조건이 깨진 예약을 되돌릴 때) */
  revertScheduledToDraft(issueId: string): Promise<void>;
  /** 이 발송을 내가 맡는다. claimed = 지금 보내도 됨, done = 이미 끝남, busy = 다른 실행이 보내는 중 */
  claimDelivery(key: string, issueId: string, channel: Channel, now: Date): Promise<"claimed" | "done" | "busy">;
  finishDelivery(key: string, result: { state: DeliveryState; nowIso: string; errorCode?: string | null; errorMessage?: string | null; payloadPreview?: unknown }): Promise<void>;
  /** 알림을 받을 직원(재직 중, 세미나실 화면 계정 제외) */
  listRecipientIds(): Promise<string[]>;
  listAdminIds(): Promise<string[]>;
  /** 그 날짜 뒤로 예약돼 있는 묶음 수 (= 앞으로 며칠치가 준비됐나) */
  countScheduledAfter(issueDate: string): Promise<number>;
  insertNotifications(rows: NotificationRow[]): Promise<void>;
}

export type EngineOptions = {
  now: Date;
  /** 수오더 안 알림을 실제로 넣을지. false면 내용만 기록한다(테스트 모드) */
  internalLive: boolean;
  /** 네이버웍스 메시지 링크에 쓸 앱 주소. 없으면 경로만 */
  baseUrl?: string | null;
  /** 발행 조건의 건수 범위. 없으면 예전 규칙(3~4건) */
  limits?: PublishLimits;
  /**
   * 네이버웍스 단체방에 실제로 보내는 함수. 없으면 보내지 않고 기록(mock)만 남긴다.
   * 실패하면 throw — 기록이 failed 로 남고, 쉬었다가 다음 실행에서 다시 시도한다.
   */
  naverWorksSend?: ((msg: NaverWorksMessage) => Promise<void>) | null;
  /** 실제로 보내지 않는 이유 (기록에 남길 문구). naverWorksSend 가 없을 때만 쓴다 */
  naverWorksMockNote?: string;
};

export type DeliveryResult = { channel: Channel; key: string; outcome: "sent" | "mock" | "failed" | "already-done" | "in-progress"; recipients?: number; error?: string };

export type PublishOutcome =
  | { ok: false; reasons: string[] }
  | { ok: true; issueDate: string; paperCount: number; /** 이번 호출이 발행했는가 (false면 이미 발행돼 있었음) */ newlyPublished: boolean; deliveries: DeliveryResult[] };

const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const toNotifyPapers = (papers: EnginePaper[]): NotifyPaper[] =>
  [...papers].sort((a, b) => a.display_order - b.display_order).map((p) => ({ id: p.id, headline: p.headline ?? p.card_content?.headline ?? "(제목 없음)" }));

/** 채널별 알림. 몇 번을 불러도 채널마다 하루 한 번만 나간다. */
export async function deliverNotifications(store: PublishStore, issue: EngineIssue, papers: EnginePaper[], opts: EngineOptions): Promise<DeliveryResult[]> {
  const nowIso = opts.now.toISOString();
  const list = toNotifyPapers(papers);
  const results: DeliveryResult[] = [];

  // 1) 수오더 안 알림
  {
    const key = deliveryKey("internal", issue.issue_date);
    const claim = await store.claimDelivery(key, issue.id, "internal", opts.now);
    if (claim !== "claimed") {
      results.push({ channel: "internal", key, outcome: claim === "done" ? "already-done" : "in-progress" });
    } else {
      const n = buildInternalNotification(issue.issue_date, list);
      try {
        const recipients = await store.listRecipientIds();
        if (opts.internalLive) {
          if (recipients.length > 0) await store.insertNotifications(recipients.map((user_id) => ({ user_id, ...n })));
          await store.finishDelivery(key, { state: "sent", nowIso, payloadPreview: { title: n.title, body: n.body, link: n.link, recipientCount: recipients.length } });
          results.push({ channel: "internal", key, outcome: "sent", recipients: recipients.length });
        } else {
          await store.finishDelivery(key, {
            state: "mock",
            nowIso,
            payloadPreview: { title: n.title, body: n.body, link: n.link, recipientCount: recipients.length, note: "테스트 모드 — 직원 알림함에 넣지 않았어요" },
          });
          results.push({ channel: "internal", key, outcome: "mock", recipients: recipients.length });
        }
      } catch (e) {
        await store.finishDelivery(key, { state: "failed", nowIso, errorCode: "internal_error", errorMessage: short(e) }).catch(() => {});
        results.push({ channel: "internal", key, outcome: "failed", error: short(e) });
      }
    }
  }

  // 2) 네이버웍스 단체방 — 그날 논문을 메시지 1건에 묶는다. 보내는 함수가 없으면 기록만
  {
    const key = deliveryKey("naverworks-group", issue.issue_date);
    const claim = await store.claimDelivery(key, issue.id, "naverworks-group", opts.now);
    if (claim !== "claimed") {
      results.push({ channel: "naverworks-group", key, outcome: claim === "done" ? "already-done" : "in-progress" });
    } else {
      const live = !!opts.naverWorksSend;
      try {
        const msg = buildNaverWorksMessage(issue.issue_date, list, opts.baseUrl);
        const preview = { messageCount: msg.messageCount, itemCount: msg.itemCount, text: msg.text };
        if (opts.naverWorksSend) {
          await opts.naverWorksSend(msg);
          await store.finishDelivery(key, { state: "sent", nowIso, payloadPreview: preview });
          results.push({ channel: "naverworks-group", key, outcome: "sent" });
        } else {
          await store.finishDelivery(key, { state: "mock", nowIso, payloadPreview: { ...preview, note: opts.naverWorksMockNote ?? "네이버웍스 발송 꺼짐 — 실제로 보내지 않았어요" } });
          results.push({ channel: "naverworks-group", key, outcome: "mock" });
        }
      } catch (e) {
        await store.finishDelivery(key, { state: "failed", nowIso, errorCode: live ? "send_error" : "preview_error", errorMessage: short(e) }).catch(() => {});
        results.push({ channel: "naverworks-group", key, outcome: "failed", error: short(e) });
      }
    }
  }

  return results;
}

/** 묶음 1개 발행 (지금 발행 · 예약 시각 도달 공통) */
export async function publishIssue(store: PublishStore, issueId: string, opts: EngineOptions): Promise<PublishOutcome> {
  const issue = await store.getIssue(issueId);
  if (!issue) return { ok: false, reasons: ["발행 묶음을 찾지 못했어요."] };
  // 날짜 미정 묶음은 발행하는 묶음이 아니다
  if (issue.issue_date === QUEUE_DATE) return { ok: false, reasons: ["날짜가 정해지지 않은 논문은 발행할 수 없어요."] };
  const papers = await store.listPapers(issueId);
  const check = checkPublishable(papers, opts.limits);
  if (!check.ok) return { ok: false, reasons: check.reasons };

  // 조건부 전환: 동시에 여러 번 불려도 한 쪽만 true
  const newlyPublished = issue.status === "published" ? false : await store.markPublished(issueId, opts.now.toISOString());
  // 알림은 발행이 끝난 뒤에만. 이미 발행된 경우에도 불러서, 중간에 끊겼던 알림을 마저 보낸다(중복은 키가 막는다)
  const deliveries = await deliverNotifications(store, { ...issue, status: "published" }, papers, opts);
  return { ok: true, issueDate: issue.issue_date, paperCount: check.paperCount, newlyPublished, deliveries };
}

export type DueRunResult = { published: string[]; reverted: { issueDate: string; reasons: string[] }[] };

/**
 * 예약 시각이 지난 묶음을 발행 완료로 바꾸고 알림을 만든다.
 * 크론(매일 08:30 KST 무렵)과 "첫 조회 때"가 같이 부른다 — 누가 먼저 불러도, 여러 번 불러도 결과는 같다.
 */
export async function runDuePublish(store: PublishStore, opts: EngineOptions): Promise<DueRunResult> {
  const result: DueRunResult = { published: [], reverted: [] };
  const due = await store.listDueScheduled(opts.now.toISOString());
  for (const issue of due) {
    const outcome = await publishIssue(store, issue.id, opts);
    if (outcome.ok) {
      if (outcome.newlyPublished) result.published.push(issue.issue_date);
    } else {
      // 예약해 둔 뒤 조건이 깨진 경우: 골라서 내보내지 않고 초안으로 되돌린다
      await store.revertScheduledToDraft(issue.id);
      result.reverted.push({ issueDate: issue.issue_date, reasons: outcome.reasons });
    }
  }
  return result;
}

/**
 * 오늘 08:30이 지났는데 발행된 브리핑이 없으면 관리자에게 하루 한 번 알린다 (크론 전용).
 * 준비가 덜 된 논문을 대신 내보내지 않는다.
 */
export async function warnIfTodayMissing(store: PublishStore, opts: EngineOptions): Promise<string | null> {
  const today = kstDate(opts.now);
  if (!isPastPublishTime(today, opts.now)) return null;
  const issue = await store.getIssueByDate(today);
  if (issue?.status === "published") return null;

  const key = warningKey(today);
  // 묶음이 없으면 기록을 매달 곳이 없다 → 경고는 묶음이 있을 때만 남긴다 (없는 날은 관리 화면이 "논문 0건"으로 보여 준다)
  if (!issue) return null;
  const claim = await store.claimDelivery(key, issue.id, "internal", opts.now);
  if (claim !== "claimed") return null;

  const nowIso = opts.now.toISOString();
  const papers = await store.listPapers(issue.id);
  const check = checkPublishable(papers, opts.limits);
  const reasons = check.ok ? ["검수는 끝났지만 발행 예약이 되어 있지 않아요."] : check.reasons;
  const n = buildMissedWarning(today, reasons);
  try {
    const admins = await store.listAdminIds();
    if (opts.internalLive && admins.length > 0) await store.insertNotifications(admins.map((user_id) => ({ user_id, ...n })));
    await store.finishDelivery(key, {
      state: opts.internalLive ? "sent" : "mock",
      nowIso,
      payloadPreview: { title: n.title, body: n.body, link: n.link, recipientCount: admins.length, ...(opts.internalLive ? {} : { note: "테스트 모드 — 알림함에 넣지 않았어요" }) },
    });
    return today;
  } catch (e) {
    await store.finishDelivery(key, { state: "failed", nowIso, errorCode: "internal_error", errorMessage: short(e) }).catch(() => {});
    return null;
  }
}

/** 준비분이 이 날 수보다 적으면 알린다 */
export const STOCK_LOW_DAYS = 2;

/**
 * 내일부터 예약돼 있는 날이 STOCK_LOW_DAYS 보다 적으면 관리자에게 하루 한 번 알린다.
 * (날짜 묶음 자동 예약을 쓸 때만 부른다. 알림 기록을 매달 날짜 미정 묶음이 없으면 알리지 않는다)
 * 돌려주는 값: 알렸으면 남은 날 수, 아니면 null
 */
export async function warnIfStockLow(store: PublishStore, opts: EngineOptions): Promise<number | null> {
  const today = kstDate(opts.now);
  const left = await store.countScheduledAfter(today);
  if (left >= STOCK_LOW_DAYS) return null;
  const queue = await store.getIssueByDate(QUEUE_DATE);
  if (!queue) return null;

  const key = stockLowKey(today);
  const claim = await store.claimDelivery(key, queue.id, "internal", opts.now);
  if (claim !== "claimed") return null;

  const nowIso = opts.now.toISOString();
  const n = buildStockLowWarning(left);
  try {
    const admins = await store.listAdminIds();
    if (opts.internalLive && admins.length > 0) await store.insertNotifications(admins.map((user_id) => ({ user_id, ...n })));
    await store.finishDelivery(key, {
      state: opts.internalLive ? "sent" : "mock",
      nowIso,
      payloadPreview: { title: n.title, body: n.body, link: n.link, recipientCount: admins.length, ...(opts.internalLive ? {} : { note: "테스트 모드 — 알림함에 넣지 않았어요" }) },
    });
    return left;
  } catch (e) {
    await store.finishDelivery(key, { state: "failed", nowIso, errorCode: "internal_error", errorMessage: short(e) }).catch(() => {});
    return null;
  }
}
