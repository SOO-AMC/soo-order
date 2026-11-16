import { formatIssueDate } from "./kst";
import { notificationLink } from "@/lib/naverworks/paths";

/**
 * 발행 알림 내용 만들기 (순수 함수 — 테스트 대상).
 *
 * 채널은 둘:
 *  - internal          : 수오더 안 알림함 (기존 notifications 테이블)
 *  - naverworks-group  : 네이버웍스 단체방. 발송 스위치(BRIEFING_NAVERWORKS_SEND=on)와 설정이 다 있을 때만 실제로 보내고,
 *                        아니면 보낼 내용 미리보기와 기록(mock)만 남긴다 — run-publish.ts 참고
 *
 * 어느 채널이든 "하루 1번, 한 건"이다. 논문마다 따로 보내지 않는다.
 */
export type Channel = "internal" | "naverworks-group";

export type NotifyPaper = { id: string; headline: string };

/** 같은 날짜·같은 채널은 한 번만 — DB 유니크 키 */
export function deliveryKey(channel: Channel, issueDate: string): string {
  return `${channel}:${issueDate}`;
}
/** 08:30에 발행하지 못했을 때 관리자에게 보내는 경고 (하루 1번) */
export function warningKey(issueDate: string): string {
  return `internal-warning:${issueDate}`;
}

/** 준비된 날이 모자랄 때 관리자에게 보내는 알림 (하루 1번) */
export function stockLowKey(today: string): string {
  return `internal-stock-low:${today}`;
}

const clipTitle = (t: string, max = 60) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/** 수오더 안 알림 1건 (받는 사람마다 같은 내용) */
export function buildInternalNotification(issueDate: string, papers: NotifyPaper[]) {
  return {
    type: "briefing_published",
    title: "오늘의 논문 브리핑이 올라왔어요",
    body: [`${formatIssueDate(issueDate)} · 논문 ${papers.length}건`, ...papers.map((p) => `· ${clipTitle(p.headline)}`)].join("\n"),
    link: "/briefing",
  };
}

/** 앞으로 발행할 준비분이 모자랄 때 관리자 알림 */
export function buildStockLowWarning(daysLeft: number) {
  return {
    type: "briefing_warning",
    title: daysLeft <= 0 ? "내일 나갈 논문 브리핑이 없어요" : `논문 브리핑이 ${daysLeft}일치만 남았어요`,
    body: "대기함에 논문을 올리고 검수하면 다음 날짜부터 자동으로 채워져요.",
    link: "/briefing/admin",
  };
}

/** 발행하지 못했을 때 관리자 경고 */
export function buildMissedWarning(issueDate: string, reasons: string[]) {
  return {
    type: "briefing_warning",
    title: "오늘 논문 브리핑이 발행되지 않았어요",
    body: [`${formatIssueDate(issueDate)} 08:30 발행분`, ...(reasons.length > 0 ? reasons : ["발행 예약된 논문이 없어요."])].join("\n"),
    link: `/briefing/admin/${issueDate}`,
  };
}

export type NaverWorksMessage = {
  channel: "naverworks-group";
  /** 논문이 몇 건이든 메시지는 항상 1건 */
  messageCount: 1;
  itemCount: number;
  /** 단일 텍스트 메시지 (미리보기·기록용 — 링크 줄 포함) */
  text: string;
  /** 실제 전송용 본문 (링크 줄 없음 — 링크는 버튼으로 붙는다) */
  summary: string;
  /** 오늘 브리핑 링크 (로그인해야 열림 — 토큰 없음) */
  link: string;
};

/**
 * 네이버웍스 단체방에 보낼 메시지 1건.
 * 논문 3~4건을 한 메시지에 묶는다(논문마다 따로 보내지 않는다).
 * baseUrl 이 없으면 경로만 넣는다(미리보기용). 링크는 네이버웍스 로그인 입구(notificationLink)를 거친다.
 */
export function buildNaverWorksMessage(issueDate: string, papers: NotifyPaper[], baseUrl?: string | null): NaverWorksMessage {
  // 누르면 로그인돼 있으면 바로, 아니면 네이버웍스 확인을 거쳐 오늘 브리핑으로
  const link = notificationLink("/briefing", baseUrl);
  const lines = [
    `[오늘의 수의학 논문 브리핑] ${formatIssueDate(issueDate)}`,
    `오늘 논문 ${papers.length}건이 올라왔어요.`,
    "",
    ...papers.map((p, i) => `${i + 1}. ${clipTitle(p.headline, 80)}`),
  ];
  const summary = lines.join("\n");
  return { channel: "naverworks-group", messageCount: 1, itemCount: papers.length, text: `${summary}\n\n수오더에서 보기: ${link}`, summary, link };
}

/** 발송 기록 한 줄의 상태 */
export type DeliveryState = "pending" | "sent" | "mock" | "failed" | "skipped";

/** 다른 실행이 보내는 중이라고 보고 기다려 주는 시간. 이보다 오래된 "보내는 중"은 멈춘 것으로 보고 다시 맡는다 */
export const STALE_PENDING_MS = 10 * 60_000;
/** 실패한 발송을 다시 시도하기 전 쉬는 시간 — 직원이 화면을 열 때마다 외부 API 를 두드리지 않게 */
export const RETRY_AFTER_MS = 5 * 60_000;
/** 이만큼 시도하고도 실패하면 그날은 포기한다 (기록은 failed 로 남는다) */
export const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * 이미 기록이 있을 때 다시 보내도 되는가.
 *  - sent / mock / skipped : 끝난 것 → 다시 보내지 않는다(중복 방지)
 *  - failed                : 조금 쉬었다가(RETRY_AFTER_MS) 다시 시도. MAX_DELIVERY_ATTEMPTS 번 실패하면 그날은 그만둔다
 *  - pending               : 다른 실행이 보내는 중 → 건드리지 않는다. 단, 오래 멈춰 있으면 다시 맡는다
 */
export function claimDecision(existing: { state: DeliveryState; updatedAt: string; attempts?: number } | null, now: Date): "claim" | "done" | "busy" {
  if (!existing) return "claim";
  if (existing.state === "sent" || existing.state === "mock" || existing.state === "skipped") return "done";
  if (existing.state === "failed") {
    if ((existing.attempts ?? 1) >= MAX_DELIVERY_ATTEMPTS) return "done";
    return now.getTime() - new Date(existing.updatedAt).getTime() >= RETRY_AFTER_MS ? "claim" : "busy";
  }
  return now.getTime() - new Date(existing.updatedAt).getTime() > STALE_PENDING_MS ? "claim" : "busy";
}
