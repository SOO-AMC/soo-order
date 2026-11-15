import type { PaperCardContent } from "./schema";

/** briefing_issues 한 줄 = 날짜별 발행 묶음 */
export type IssueStatus = "draft" | "scheduled" | "published";

export interface BriefingIssue {
  id: string;
  issue_date: string; // KST "YYYY-MM-DD"
  status: IssueStatus;
  scheduled_at: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 어떻게 만들었나: none=아직 안 만듦, rule=규칙 정리(AI 미사용), ai=AI, failed=마지막 시도가 실패 */
export type GenerationStatus = "none" | "rule" | "ai" | "failed";
export type ReviewStatus = "draft" | "reviewed";

/** briefing_papers 한 줄 = 논문 1건 = 카드 1장 */
export interface BriefingPaper {
  id: string;
  issue_id: string;
  display_order: number;
  raw_summary_text: string;
  raw_text_hash: string | null;
  headline: string | null;
  card_content: PaperCardContent | null;
  previous_card_content: PaperCardContent | null;
  layout_variant: string | null;
  category: string | null;
  source_url: string | null;
  doi: string | null;
  admin_memo: string | null;
  generation_status: GenerationStatus;
  ai_provider_info: { provider: string; model?: string; generatedAt: string; note?: string } | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IssueWithPapers extends BriefingIssue {
  papers: BriefingPaper[];
}

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  draft: "초안",
  scheduled: "발행 예약",
  published: "발행 완료",
};

/** 하루 운영량 — 예전 고정 규칙(3~4건). 배치 기능(migrate-briefing-planner.sql)을 켜기 전에만 쓴다 */
export const MIN_PAPERS = 3;
export const MAX_PAPERS = 4;

/** 발행 조건의 건수 범위 */
export type PublishLimits = { min: number; max: number };
export const LEGACY_LIMITS: PublishLimits = { min: MIN_PAPERS, max: MAX_PAPERS };

/**
 * 올리기 설정 (briefing_settings). perDay = 올리기 화면에 처음 열어 두는 논문 칸 수(기본 3).
 * 그날 몇 건이 나갈지는 그날 올린 논문 수가 정한다 — 이 값은 기본 칸 수일 뿐이다. (표의 min_papers 칸은 쓰지 않는다)
 */
export type PlanSettings = { perDay: number };
export const DEFAULT_PLAN_SETTINGS: PlanSettings = { perDay: 3 };
export const PER_DAY_RANGE = { min: 1, max: 6 } as const;
/** 날짜 묶음 방식의 발행 조건: 1건 이상이면 되고(최소 건수 없음), 하루 6건까지 */
export const PLAN_LIMITS: PublishLimits = { min: 1, max: PER_DAY_RANGE.max };

/** 날짜 미정: 날짜가 이 값인 묶음 하나. 날짜에서 뺀 논문이 머문다. 절대 발행되지 않고, 날짜로 다루지 않는다 */
export const QUEUE_DATE = "9999-12-31";
