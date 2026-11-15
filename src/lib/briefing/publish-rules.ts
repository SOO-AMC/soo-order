import { LEGACY_LIMITS, type BriefingIssue, type BriefingPaper, type PublishLimits } from "./types";

/**
 * 발행 조건.
 * 검수 완료한 논문이 정해진 건수 범위일 때만 발행(예약)할 수 있다 (범위를 안 주면 예전 규칙 3~4건).
 * 모자라거나 넘치면 조용히 골라서 내보내지 않고, 이유를 돌려줘서 관리자에게 보여 준다.
 */
export type PublishCheck = { ok: true; paperCount: number } | { ok: false; paperCount: number; reasons: string[] };

type PaperLike = Pick<BriefingPaper, "review_status" | "card_content">;

/** "3~4건" 또는 "3건" */
export const rangeLabel = (l: PublishLimits) => (l.min === l.max ? l.min + "건" : l.min + "~" + l.max + "건");

export function checkPublishable(papers: PaperLike[], limits: PublishLimits = LEGACY_LIMITS): PublishCheck {
  const reasons: string[] = [];
  const total = papers.length;
  const noCard = papers.filter((p) => !p.card_content).length;
  const notReviewed = papers.filter((p) => p.card_content && p.review_status !== "reviewed").length;

  if (total < limits.min) reasons.push(`논문이 ${total}건이에요. ${rangeLabel(limits)}이어야 발행할 수 있어요.`);
  if (total > limits.max) reasons.push(`논문이 ${total}건이에요. 하루 ${limits.max}건까지만 발행해요. 넘는 논문은 다른 날짜로 옮겨 주세요.`);
  if (noCard > 0) reasons.push(`카드를 아직 만들지 않은 논문이 ${noCard}건 있어요.`);
  if (notReviewed > 0) reasons.push(`검수하지 않은 논문이 ${notReviewed}건 있어요.`);

  return reasons.length === 0 ? { ok: true, paperCount: total } : { ok: false, paperCount: total, reasons };
}

/**
 * 일반 직원에게 보여도 되는 묶음인가.
 * DB 함수 briefing_issue_visible() 과 같은 규칙: 발행 완료, 또는 예약 시각이 지난 예약 상태.
 */
export function isIssueVisible(issue: Pick<BriefingIssue, "status" | "scheduled_at">, now: Date = new Date()): boolean {
  if (issue.status === "published") return true;
  return issue.status === "scheduled" && !!issue.scheduled_at && new Date(issue.scheduled_at).getTime() <= now.getTime();
}

/** 장 번호 "02 / 04" — 항상 실제 논문 수로 계산한다 (시안의 02/05 금지) */
export function progressLabel(index: number, total: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(index + 1)} / ${pad(total)}`;
}
