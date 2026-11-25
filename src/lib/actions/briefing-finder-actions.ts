"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { configuredProvider } from "@/lib/briefing/designer";
import { findPaper } from "@/lib/briefing/finder/find-paper";
import { RECENT_DAYS, autoMemo, isFindCategory, parseAutoMemo } from "@/lib/briefing/finder/sources";
import { formatIssueDate, kstDate } from "@/lib/briefing/kst";
import { ensureIssue, loadPlanConfig, syncPlan } from "@/lib/briefing/plan-sync";
import { isIssueVisible } from "@/lib/briefing/publish-rules";
import { CATEGORY_LABEL } from "@/lib/briefing/schema";
import { PER_DAY_RANGE, QUEUE_DATE, type BriefingPaper } from "@/lib/briefing/types";

/**
 * 논문 자동 찾기 (관리자 전용).
 *
 * 분야 1개 = 호출 1번: PubMed 에서 최근 논문을 찾고 → AI 가 1건을 골라 → 초록을 한국어 카드로 요약해 그 날짜에 넣는다.
 * 화면이 분야마다 차례로 부른다(진행을 보여 줄 수 있고, 한 번의 호출이 길어지지 않는다).
 *
 * 검수 없음(2026-11-25 사용자 결정): AI 가 만든 카드는 바로 "검수 완료"로 넣어 08:30 발행이 예약된다.
 * 단 AI 가 꺼져 있거나 실패해 규칙 정리(초록 문장 그대로)로 만든 카드는 초안으로 남겨 발행되지 않게 한다.
 */

export type FinderResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type FoundPaper = {
  paper: BriefingPaper;
  /** 수의학 / 사람 의학 */
  kind: "vet" | "human";
  journal: string;
  title: string;
  /** AI 가 고른 이유 (AI 를 안 썼으면 null) */
  reason: string | null;
  /** true = 바로 발행 대상, false = AI 없이 만들어 초안으로 남음 */
  ready: boolean;
};

const PAPER_COLS =
  "id, issue_id, display_order, raw_summary_text, raw_text_hash, headline, card_content, previous_card_content, layout_variant, category, source_url, doi, admin_memo, generation_status, ai_provider_info, review_status, reviewed_by, reviewed_at, created_by, created_at, updated_at";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY = "아직 준비되지 않았어요. supabase/migrate-briefing-planner.sql 을 먼저 실행해 주세요.";
const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * 한 분야의 논문을 찾아 그 날짜에 넣는다. replacePaperId 가 있으면 그 논문을 다른 논문으로 바꾼다(같은 자리).
 */
export async function findBriefingPaper(issueDate: string, category: string, replacePaperId?: string | null): Promise<FinderResult<FoundPaper>> {
  const { supabase, userId, userName } = await requireAdmin();
  if (!isFindCategory(category)) return { ok: false, error: "분야가 올바르지 않아요." };
  if (typeof issueDate !== "string" || !DATE_RE.test(issueDate) || issueDate === QUEUE_DATE) return { ok: false, error: "발행 날짜를 골라 주세요." };
  if (issueDate < kstDate()) return { ok: false, error: "지난 날짜에는 넣을 수 없어요." };
  if (!(await loadPlanConfig(supabase)).ready) return { ok: false, error: NOT_READY };
  const label = CATEGORY_LABEL[category].ko;

  const issue = await ensureIssue(supabase, issueDate, userId);
  if (!issue) return { ok: false, error: "발행 묶음을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요." };
  if (isIssueVisible(issue)) return { ok: false, error: `${formatIssueDate(issueDate)}은 이미 발행됐어요. 다른 날짜를 골라 주세요.` };

  const { data: dayRows } = await supabase.from("briefing_papers").select("id, display_order, admin_memo, card_content").eq("issue_id", issue.id);
  const day = (dayRows as { id: string; display_order: number; admin_memo: string | null; card_content: BriefingPaper["card_content"] }[] | null) ?? [];
  const old = replacePaperId ? day.find((p) => p.id === replacePaperId) : undefined;
  if (replacePaperId && !old) return { ok: false, error: "바꿀 논문을 찾지 못했어요. 화면을 새로 고쳐 주세요." };
  if (!old) {
    if (day.some((p) => parseAutoMemo(p.admin_memo)?.category === category)) return { ok: false, error: `${formatIssueDate(issueDate)}에는 이미 ${label} 논문이 있어요.` };
    if (day.length >= PER_DAY_RANGE.max) return { ok: false, error: `하루에 ${PER_DAY_RANGE.max}건까지예요. ${formatIssueDate(issueDate)}에는 이미 ${day.length}건이 있어요.` };
  }

  // 이미 브리핑에 쓴 논문은 다시 고르지 않는다 (바꾸기면 지금 논문도 빠진다)
  const { data: usedRows } = await supabase.from("briefing_papers").select("doi, stitle:card_content->source->>title").limit(5000);
  const used = (usedRows as { doi: string | null; stitle: string | null }[] | null) ?? [];

  const found = await findPaper(
    category,
    { today: kstDate(), used: { dois: used.map((u) => u.doi ?? "").filter(Boolean), titles: used.map((u) => u.stitle ?? "").filter(Boolean) } },
    { provider: configuredProvider() }
  );
  if (!found.ok) {
    const msg =
      found.reason === "no-candidates"
        ? `최근 ${RECENT_DAYS}일 안에 아직 쓰지 않은 ${label} 논문을 찾지 못했어요.`
        : found.reason === "search-failed"
          ? "논문 데이터베이스(PubMed)에 연결하지 못했어요. 잠시 뒤 다시 눌러 주세요."
          : "카드를 만들지 못했어요. 다시 눌러 주세요.";
    return { ok: false, error: msg };
  }

  // 같은 논문은 두 번 나가지 않는다: 찾는 동안(30초 안팎) 다른 창·루틴이 같은 논문을 넣었을 수 있어 저장 직전에 한 번 더 본다
  if (found.candidate.doi) {
    const { data: dup } = await supabase.from("briefing_papers").select("id").ilike("doi", found.candidate.doi).neq("id", old?.id ?? "00000000-0000-0000-0000-000000000000").limit(1);
    if (dup && dup.length > 0) return { ok: false, error: `방금 같은 ${label} 논문이 다른 곳에서 먼저 들어갔어요. 다시 눌러 주세요.` };
  }

  const ready = found.design.mode === "ai";
  const now = new Date().toISOString();
  const fields = {
    raw_summary_text: found.raw,
    raw_text_hash: hashOf(found.raw),
    headline: found.card.headline,
    card_content: found.card,
    layout_variant: found.card.layoutVariant,
    category,
    source_url: found.candidate.url,
    doi: found.candidate.doi,
    admin_memo: autoMemo(found.candidate, category),
    generation_status: found.design.mode,
    ai_provider_info: found.design.providerInfo,
    review_status: ready ? "reviewed" : "draft",
    reviewed_by: ready ? userId : null,
    reviewed_at: ready ? now : null,
  };

  const saved = old
    ? await supabase
        .from("briefing_papers")
        .update({ ...fields, previous_card_content: old.card_content })
        .eq("id", old.id)
        .select(PAPER_COLS)
        .single()
    : await supabase
        .from("briefing_papers")
        .insert({ ...fields, issue_id: issue.id, display_order: Math.max(0, ...day.map((p) => p.display_order)) + 1, created_by: userId })
        .select(PAPER_COLS)
        .single();
  if (saved.error || !saved.data) return { ok: false, error: "논문을 저장하지 못했어요. 다시 눌러 주세요." };

  // 그날 논문이 모두 준비되면 08:30 발행이 예약된다
  await syncPlan(supabase);
  logActivity({
    userId,
    userName,
    category: "briefing",
    action: old ? "replace_found_paper" : "find_paper",
    description: `${issueDate} ${label} 논문 ${old ? "바꿈" : "자동으로 찾음"}: ${found.card.headline}`,
  });
  revalidatePath("/briefing/admin");
  revalidatePath("/briefing");
  revalidatePath(`/briefing/admin/${issueDate}`);
  return {
    ok: true,
    data: {
      paper: saved.data as BriefingPaper,
      kind: found.candidate.kind,
      journal: found.candidate.journal,
      title: found.candidate.title,
      reason: found.choice.reason,
      ready,
    },
  };
}

/** 그 날짜에 이미 자동으로 찾아 넣은 분야들 (화면이 "찾기"를 누를 때 건너뛸 분야) */
export async function foundCategories(issueDate: string): Promise<FinderResult<{ category: string; paperId: string; headline: string | null; ready: boolean }[]>> {
  const { supabase } = await requireAdmin();
  if (typeof issueDate !== "string" || !DATE_RE.test(issueDate)) return { ok: false, error: "날짜가 올바르지 않아요." };
  const { data: issue } = await supabase.from("briefing_issues").select("id").eq("issue_date", issueDate).maybeSingle();
  if (!issue) return { ok: true, data: [] };
  const { data } = await supabase.from("briefing_papers").select("id, headline, admin_memo, review_status").eq("issue_id", issue.id).order("display_order");
  const rows = (data as { id: string; headline: string | null; admin_memo: string | null; review_status: string }[] | null) ?? [];
  return {
    ok: true,
    data: rows.flatMap((r) => {
      const auto = parseAutoMemo(r.admin_memo);
      return auto ? [{ category: auto.category, paperId: r.id, headline: r.headline, ready: r.review_status === "reviewed" }] : [];
    }),
  };
}
