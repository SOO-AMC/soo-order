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

/** 하루 운영량 */
export const MIN_PAPERS = 3;
export const MAX_PAPERS = 4;
