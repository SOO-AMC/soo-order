"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/utils/activity-log";
import { designCard } from "@/lib/briefing/designer";
import { checkFidelity, type FidelityWarning } from "@/lib/briefing/fidelity";
import { checkPublishable } from "@/lib/briefing/publish-rules";
import { CATEGORY_KEYS, parseCard, type CategoryKey, type PaperCardContent } from "@/lib/briefing/schema";
import { MAX_PAPERS, type BriefingIssue, type BriefingPaper, type IssueWithPapers } from "@/lib/briefing/types";

/**
 * 논문 브리핑 관리자 액션. 전부 requireAdmin() — 일반 직원은 서버에서 막힌다(RLS도 관리자만 쓰기).
 *
 * 규칙:
 *  - 저장에 필요한 값은 요약 글(raw_summary_text) 하나뿐.
 *  - 논문 1건에 카드는 1장. 다시 만들면 이전 카드를 previous_card_content 에 한 번 보관한다.
 *  - 만들기가 실패해도 원본 글과 기존 카드는 그대로 둔다.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAPER_COLS =
  "id, issue_id, display_order, raw_summary_text, raw_text_hash, headline, card_content, previous_card_content, layout_variant, category, source_url, doi, admin_memo, generation_status, ai_provider_info, review_status, reviewed_by, reviewed_at, created_by, created_at, updated_at";

const hashOf = (text: string) => createHash("sha256").update(text).digest("hex");
const isCategory = (v: unknown): v is CategoryKey => typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
const cleanUrl = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  if (!t) return null;
  return /^https?:\/\/[^\s<>"']+$/i.test(t) ? t : undefined; // undefined = 형식 오류
};

type Sb = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadPaper(supabase: Sb, paperId: string): Promise<BriefingPaper | null> {
  const { data } = await supabase.from("briefing_papers").select(PAPER_COLS).eq("id", paperId).maybeSingle();
  return (data as BriefingPaper | null) ?? null;
}

/** 예약해 둔 묶음인데 조건(검수 완료 3~4건)이 깨졌으면 초안으로 되돌린다. 발행 완료는 그대로 둔다. */
async function syncIssueState(supabase: Sb, issueId: string): Promise<boolean> {
  const { data: issue } = await supabase.from("briefing_issues").select("id, status").eq("id", issueId).maybeSingle();
  if (!issue || issue.status !== "scheduled") return false;
  const { data: papers } = await supabase.from("briefing_papers").select("review_status, card_content").eq("issue_id", issueId);
  if (checkPublishable((papers ?? []) as Pick<BriefingPaper, "review_status" | "card_content">[]).ok) return false;
  await supabase.from("briefing_issues").update({ status: "draft", scheduled_at: null }).eq("id", issueId);
  return true;
}

function touch(issueDate?: string) {
  revalidatePath("/briefing/admin");
  if (issueDate) revalidatePath(`/briefing/admin/${issueDate}`);
}

/** 날짜 묶음 + 논문들 (없으면 null — 첫 논문을 넣을 때 만든다) */
export async function fetchIssueByDate(issueDate: string): Promise<IssueWithPapers | null> {
  const { supabase } = await requireAdmin();
  if (!DATE_RE.test(issueDate)) return null;
  const { data: issue } = await supabase.from("briefing_issues").select("*").eq("issue_date", issueDate).maybeSingle();
  if (!issue) return null;
  const { data: papers } = await supabase.from("briefing_papers").select(PAPER_COLS).eq("issue_id", issue.id).order("display_order");
  return { ...(issue as BriefingIssue), papers: (papers as BriefingPaper[] | null) ?? [] };
}

export type IssueSummary = BriefingIssue & { paperCount: number; reviewedCount: number; headlines: string[] };

/** 최근 묶음 목록 (관리자 첫 화면) */
export async function fetchIssueSummaries(limit = 30): Promise<IssueSummary[]> {
  const { supabase } = await requireAdmin();
  const { data: issues } = await supabase.from("briefing_issues").select("*").order("issue_date", { ascending: false }).limit(limit);
  const list = (issues as BriefingIssue[] | null) ?? [];
  if (list.length === 0) return [];
  const { data: papers } = await supabase
    .from("briefing_papers")
    .select("issue_id, display_order, headline, review_status")
    .in("issue_id", list.map((i) => i.id))
    .order("display_order");
  const by = new Map<string, { headline: string | null; review_status: string }[]>();
  for (const p of papers ?? []) {
    const arr = by.get(p.issue_id as string) ?? [];
    arr.push({ headline: p.headline as string | null, review_status: p.review_status as string });
    by.set(p.issue_id as string, arr);
  }
  return list.map((i) => {
    const ps = by.get(i.id) ?? [];
    return {
      ...i,
      paperCount: ps.length,
      reviewedCount: ps.filter((p) => p.review_status === "reviewed").length,
      headlines: ps.map((p) => p.headline ?? "(카드 만들기 전)"),
    };
  });
}

/** 새 논문 1건 추가 = 줄글 1개. 그 날짜 묶음이 없으면 만든다. */
export async function addPaper(issueDate: string, rawText: string): Promise<ActionResult<BriefingPaper>> {
  const { supabase, userId } = await requireAdmin();
  if (!DATE_RE.test(issueDate)) return { ok: false, error: "날짜가 올바르지 않아요." };
  const raw = rawText.replace(/\r\n/g, "\n").trim();
  if (!raw) return { ok: false, error: "요약 글을 붙여넣어 주세요." };

  let { data: issue } = await supabase.from("briefing_issues").select("id, status").eq("issue_date", issueDate).maybeSingle();
  if (!issue) {
    const created = await supabase.from("briefing_issues").insert({ issue_date: issueDate, created_by: userId }).select("id, status").maybeSingle();
    issue = created.data;
    if (!issue) {
      // 동시에 다른 창에서 만들었을 수 있다(날짜 유니크) → 다시 읽기
      const again = await supabase.from("briefing_issues").select("id, status").eq("issue_date", issueDate).maybeSingle();
      issue = again.data;
    }
  }
  if (!issue) return { ok: false, error: "발행 묶음을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요." };

  const { data: existing } = await supabase.from("briefing_papers").select("display_order").eq("issue_id", issue.id).order("display_order", { ascending: false });
  const count = existing?.length ?? 0;
  if (count >= MAX_PAPERS) {
    return { ok: false, error: `하루에 논문 ${MAX_PAPERS}건까지만 넣을 수 있어요. 다른 날짜에 넣어 주세요.` };
  }
  const nextOrder = (existing?.[0]?.display_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("briefing_papers")
    .insert({ issue_id: issue.id, display_order: nextOrder, raw_summary_text: raw, raw_text_hash: hashOf(raw), created_by: userId })
    .select(PAPER_COLS)
    .single();
  if (error || !data) return { ok: false, error: "논문을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." };

  await syncIssueState(supabase, issue.id);
  touch(issueDate);
  return { ok: true, data: data as BriefingPaper };
}

/** 원본 글 고치기. 글이 바뀌면 이미 만든 카드는 남기되 검수는 다시 해야 한다. */
export async function updatePaperRaw(paperId: string, rawText: string): Promise<ActionResult<BriefingPaper>> {
  const { supabase } = await requireAdmin();
  const raw = rawText.replace(/\r\n/g, "\n").trim();
  if (!raw) return { ok: false, error: "요약 글이 비어 있어요." };
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  if (paper.raw_summary_text === raw) return { ok: true, data: paper };

  const { data, error } = await supabase
    .from("briefing_papers")
    .update({ raw_summary_text: raw, raw_text_hash: hashOf(raw), review_status: "draft", reviewed_by: null, reviewed_at: null })
    .eq("id", paperId)
    .select(PAPER_COLS)
    .single();
  if (error || !data) return { ok: false, error: "글을 저장하지 못했어요." };
  await syncIssueState(supabase, paper.issue_id);
  touch();
  return { ok: true, data: data as BriefingPaper };
}

export type GenerateResult = { paper: BriefingPaper; notice: string | null; warnings: FidelityWarning[] };

/**
 * 카드 만들기 / 다시 만들기 — 논문 1건에 카드 1장.
 * 실패하면 원본 글과 기존 카드를 건드리지 않고 "실패" 표시만 남긴다.
 */
export async function generatePaperCard(paperId: string): Promise<ActionResult<GenerateResult>> {
  const { supabase, userId, userName } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };

  try {
    const result = await designCard(paper.raw_summary_text, {
      category: isCategory(paper.category) ? paper.category : null,
      sourceUrl: paper.source_url,
      doi: paper.doi,
    });
    const { data, error } = await supabase
      .from("briefing_papers")
      .update({
        card_content: result.card,
        previous_card_content: paper.card_content ?? paper.previous_card_content, // 이전 카드 보관(되돌리기)
        headline: result.card.headline,
        layout_variant: result.card.layoutVariant,
        category: paper.category ?? result.card.category,
        generation_status: result.mode,
        ai_provider_info: result.providerInfo,
        review_status: "draft",
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", paperId)
      .select(PAPER_COLS)
      .single();
    if (error || !data) throw new Error("save-failed");

    await syncIssueState(supabase, paper.issue_id);
    logActivity({ userId, userName, category: "briefing", action: "generate_card", description: `논문 카드 만들기: ${result.card.headline}` });
    touch();
    return { ok: true, data: { paper: data as BriefingPaper, notice: result.notice, warnings: result.warnings } };
  } catch {
    // 원본·기존 카드는 그대로. 상태만 "실패"로 (카드가 있으면 그 카드는 계속 보인다)
    await supabase.from("briefing_papers").update({ generation_status: "failed" }).eq("id", paperId);
    return { ok: false, error: "카드를 만들지 못했어요. 원본 글과 이전 카드는 그대로 있어요. 다시 눌러 주세요." };
  }
}

/** 관리자가 카드 글·템플릿을 직접 고친 것 저장 */
export async function saveCardEdit(paperId: string, card: unknown): Promise<ActionResult<{ paper: BriefingPaper; warnings: FidelityWarning[] }>> {
  const { supabase, userId, userName } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  const parsed = parseCard(card);
  if (!parsed.ok) return { ok: false, error: `카드 형식이 맞지 않아요 (${parsed.error})` };

  const { data, error } = await supabase
    .from("briefing_papers")
    .update({
      card_content: parsed.card,
      previous_card_content: paper.card_content ?? paper.previous_card_content,
      headline: parsed.card.headline,
      layout_variant: parsed.card.layoutVariant,
      category: parsed.card.category ?? paper.category,
      review_status: "draft",
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", paperId)
    .select(PAPER_COLS)
    .single();
  if (error || !data) return { ok: false, error: "카드를 저장하지 못했어요." };

  await syncIssueState(supabase, paper.issue_id);
  logActivity({ userId, userName, category: "briefing", action: "edit_card", description: `논문 카드 수정: ${parsed.card.headline}` });
  touch();
  const saved = data as BriefingPaper;
  return { ok: true, data: { paper: saved, warnings: checkFidelity(saved.raw_summary_text, parsed.card, [saved.source_url ?? "", saved.doi ?? ""]) } };
}

/** 다시 만들기·수정 전 카드로 되돌리기 (지금 카드와 맞바꾼다) */
export async function restorePreviousCard(paperId: string): Promise<ActionResult<BriefingPaper>> {
  const { supabase } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  if (!paper.previous_card_content) return { ok: false, error: "되돌릴 이전 카드가 없어요." };
  const prev = paper.previous_card_content as PaperCardContent;
  const { data, error } = await supabase
    .from("briefing_papers")
    .update({
      card_content: prev,
      previous_card_content: paper.card_content,
      headline: prev.headline,
      layout_variant: prev.layoutVariant,
      review_status: "draft",
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", paperId)
    .select(PAPER_COLS)
    .single();
  if (error || !data) return { ok: false, error: "되돌리지 못했어요." };
  await syncIssueState(supabase, paper.issue_id);
  touch();
  return { ok: true, data: data as BriefingPaper };
}

/** 고급 설정(전부 선택): 분야·원문 링크·DOI·메모. 카드가 있으면 카드의 분야·출처에도 반영한다. */
export async function updatePaperMeta(
  paperId: string,
  meta: { category?: string | null; sourceUrl?: string | null; doi?: string | null; adminMemo?: string | null }
): Promise<ActionResult<BriefingPaper>> {
  const { supabase } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };

  const url = cleanUrl(meta.sourceUrl);
  if (url === undefined) return { ok: false, error: "원문 링크는 http:// 또는 https:// 로 시작해야 해요." };
  const category = meta.category ? (isCategory(meta.category) ? meta.category : undefined) : null;
  if (category === undefined) return { ok: false, error: "분야를 다시 골라 주세요." };
  const doi = (meta.doi ?? "").trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") || null;
  const memo = (meta.adminMemo ?? "").trim().slice(0, 500) || null;

  const patch: Record<string, unknown> = { category, source_url: url, doi, admin_memo: memo };
  if (paper.card_content) {
    const next = parseCard({
      ...paper.card_content,
      category: category ?? paper.card_content.category,
      source: { ...paper.card_content.source, url: url ?? paper.card_content.source.url, doi: doi ?? paper.card_content.source.doi },
    });
    if (next.ok) patch.card_content = next.card;
  }

  const { data, error } = await supabase.from("briefing_papers").update(patch).eq("id", paperId).select(PAPER_COLS).single();
  if (error || !data) return { ok: false, error: "설정을 저장하지 못했어요." };
  touch();
  return { ok: true, data: data as BriefingPaper };
}

/** 검수 완료 / 검수 취소. 카드가 있어야 검수할 수 있다. */
export async function setPaperReviewed(paperId: string, reviewed: boolean): Promise<ActionResult<BriefingPaper>> {
  const { supabase, userId, userName } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  if (reviewed && !paper.card_content) return { ok: false, error: "카드를 먼저 만들어 주세요." };

  const { data, error } = await supabase
    .from("briefing_papers")
    .update(
      reviewed
        ? { review_status: "reviewed", reviewed_by: userId, reviewed_at: new Date().toISOString() }
        : { review_status: "draft", reviewed_by: null, reviewed_at: null }
    )
    .eq("id", paperId)
    .select(PAPER_COLS)
    .single();
  if (error || !data) return { ok: false, error: "검수 상태를 바꾸지 못했어요." };
  await syncIssueState(supabase, paper.issue_id);
  if (reviewed) logActivity({ userId, userName, category: "briefing", action: "review_paper", description: `논문 검수 완료: ${paper.headline ?? ""}` });
  touch();
  return { ok: true, data: data as BriefingPaper };
}

/** 논문 1건 지우기 (그 논문의 카드 1장도 같이 사라진다) */
export async function deletePaper(paperId: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, userId, userName } = await requireAdmin();
  const paper = await loadPaper(supabase, paperId);
  if (!paper) return { ok: false, error: "논문을 찾지 못했어요." };
  const { error } = await supabase.from("briefing_papers").delete().eq("id", paperId);
  if (error) return { ok: false, error: "지우지 못했어요." };
  await syncIssueState(supabase, paper.issue_id);
  logActivity({ userId, userName, category: "briefing", action: "delete_paper", description: `논문 삭제: ${paper.headline ?? "(카드 만들기 전)"}` });
  touch();
  return { ok: true, data: { id: paperId } };
}

/** 논문 순서 바꾸기 (같은 날짜 안에서). 같은 논문 안의 "장 순서"는 없다. */
export async function reorderPapers(issueId: string, paperIds: string[]): Promise<ActionResult<{ ids: string[] }>> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("briefing_reorder_papers", { p_issue_id: issueId, p_paper_ids: paperIds });
  if (error) return { ok: false, error: "순서를 바꾸지 못했어요." };
  touch();
  return { ok: true, data: { ids: paperIds } };
}
