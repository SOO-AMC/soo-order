"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  FileText,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Smartphone,
  Sparkles,
  Trash2,
  Tv,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { PaperCard, type CardVariant } from "@/components/briefing/paper-card";
import { CardEditDialog } from "@/components/briefing/admin/card-edit-dialog";
import { FitWidth } from "@/components/briefing/fit-width";
import { PublishPanel } from "@/components/briefing/admin/publish-panel";
import {
  addPaper,
  deletePaper,
  generatePaperCard,
  reorderPapers,
  restorePreviousCard,
  saveCardEdit,
  setPaperReviewed,
  updatePaperMeta,
  updatePaperRaw,
} from "@/lib/actions/briefing-admin-actions";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { checkPublishable, progressLabel } from "@/lib/briefing/publish-rules";
import { addDays, formatIssueDate } from "@/lib/briefing/kst";
import { CATEGORY_KEYS, CATEGORY_LABEL, type PaperCardContent } from "@/lib/briefing/schema";
import { ISSUE_STATUS_LABEL, QUEUE_DATE, type BriefingPaper, type BriefingIssue, type IssueStatus, type IssueWithPapers, type PublishLimits } from "@/lib/briefing/types";

const NEW = "__new__";
type Meta = { category: string; sourceUrl: string; doi: string; adminMemo: string };
const metaOf = (p?: BriefingPaper): Meta => ({
  category: p?.category ?? "",
  sourceUrl: p?.source_url ?? "",
  doi: p?.doi ?? "",
  adminMemo: p?.admin_memo ?? "",
});

/**
 * 논문 브리핑 관리 — 날짜별 작업 화면.
 *
 * 핵심 흐름: 큰 글상자 하나에 요약을 붙여넣기 → "AI 카드뉴스 만들기" → 오른쪽에 그 논문의 카드 1장.
 * 필수 입력은 요약 글뿐이다(분야·링크 등은 접힌 고급 설정).
 * "새 논문 추가" = 논문 1건(글상자 1개) 추가. 같은 논문에 장을 더하는 기능은 없다.
 * 아래 썸네일은 그날의 서로 다른 논문이다.
 *
 * 자동 예약(planReady)일 때:
 *  - 그날 논문이 전부 검수되면 서버가 08:30 발행을 예약한다 → 예약·예약 취소 버튼이 없다.
 *  - 날짜가 QUEUE_DATE 이면 "날짜 미정" 논문 — 발행 패널이 없다. 날짜는 관리 첫 화면에서 정한다.
 *  - 발행된 논문도 카드의 글은 고칠 수 있다(오타).
 */
export function IssueWorkspace({
  issueDate,
  initialIssue,
  startNew,
  selectPaperId,
  limits,
  planReady,
}: {
  issueDate: string;
  initialIssue: IssueWithPapers | null;
  startNew?: boolean;
  /** 처음에 열어 둘 논문 */
  selectPaperId?: string;
  /** 하루 건수 범위 (설정) */
  limits: PublishLimits;
  /** 대기함·자동 배정을 쓰는 중인가 */
  planReady: boolean;
}) {
  const isQueue = issueDate === QUEUE_DATE;
  const [issue, setIssue] = useState<BriefingIssue | null>(initialIssue);
  const [papers, setPapers] = useState<BriefingPaper[]>(initialIssue?.papers ?? []);
  const [selected, setSelected] = useState<string>(() => {
    const list = initialIssue?.papers ?? [];
    if (startNew || list.length === 0) return NEW;
    return list.some((p) => p.id === selectPaperId) ? selectPaperId! : list[0].id;
  });
  /** 글상자 내용 (논문 id → 글). 저장 전 편집 중인 값 */
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [metas, setMetas] = useState<Record<string, Meta>>({});
  const [viewport, setViewport] = useState<CardVariant>("desktop");
  const [busy, setBusy] = useState<string | null>(null); // 진행 중인 일의 이름
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const current = papers.find((p) => p.id === selected) ?? null;
  const isNew = selected === NEW;
  const text = texts[selected] ?? current?.raw_summary_text ?? "";
  const meta = metas[selected] ?? metaOf(current ?? undefined);
  const textDirty = isNew ? text.trim().length > 0 : !!current && text.trim() !== current.raw_summary_text;
  const metaDirty = !!current && JSON.stringify(meta) !== JSON.stringify(metaOf(current));
  const canAddMore = isQueue || papers.length < limits.max;
  const total = papers.length;
  const index = current ? papers.findIndex((p) => p.id === current.id) : -1;
  const dateLabel = isQueue ? "발행일 미정" : formatIssueDate(issueDate);

  const card = current?.card_content ?? null;
  const warnings = useMemo(
    () => (current && card ? checkFidelity(current.raw_summary_text, card, [current.source_url ?? "", current.doi ?? ""]) : []),
    [current, card]
  );
  const publish = useMemo(() => checkPublishable(papers, limits), [papers, limits]);

  const replacePaper = (p: BriefingPaper) => setPapers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
  const clearDraft = (id: string) => {
    setTexts((t) => {
      const n = { ...t };
      delete n[id];
      return n;
    });
    setMetas((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  };

  /** 공통 실행기: 한 번에 하나만, 실패하면 안내만 하고 입력은 그대로 둔다 */
  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch {
      setError("처리하지 못했어요. 붙여넣은 글은 그대로 있어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  /** 글(과 고급 설정)을 저장하고, 저장된 논문을 돌려준다. 새 논문이면 여기서 만들어진다. */
  const persist = async (): Promise<BriefingPaper | null> => {
    let paper = current;
    if (isNew) {
      const res = await addPaper(issueDate, text);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      paper = res.data;
      setPapers((prev) => [...prev, res.data]);
      if (!issue) setIssue({ id: res.data.issue_id, issue_date: issueDate, status: "draft", scheduled_at: null, published_at: null, created_by: null, created_at: "", updated_at: "" });
      // 새 논문에 적어 둔 고급 설정을 방금 만든 논문으로 옮긴다
      const pendingMeta = metas[NEW];
      clearDraft(NEW);
      if (pendingMeta) setMetas((m) => ({ ...m, [res.data.id]: pendingMeta }));
      setSelected(res.data.id);
    } else if (paper && text.trim() !== paper.raw_summary_text) {
      const res = await updatePaperRaw(paper.id, text);
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      paper = res.data;
      replacePaper(res.data);
      setTexts((t) => {
        const n = { ...t };
        delete n[res.data.id];
        return n;
      });
    }
    if (!paper) return null;

    const m = isNew ? metas[NEW] : metas[paper.id];
    if (m && JSON.stringify(m) !== JSON.stringify(metaOf(paper))) {
      const res = await updatePaperMeta(paper.id, { category: m.category || null, sourceUrl: m.sourceUrl || null, doi: m.doi || null, adminMemo: m.adminMemo || null });
      if (!res.ok) {
        setError(res.error);
        return paper;
      }
      paper = res.data;
      replacePaper(res.data);
      setMetas((prev) => {
        const n = { ...prev };
        delete n[res.data.id];
        return n;
      });
    }
    return paper;
  };

  const handleGenerate = () =>
    run("generate", async () => {
      if (!text.trim()) {
        setError("요약 글을 붙여넣어 주세요.");
        return;
      }
      const paper = await persist();
      if (!paper) return;
      const res = await generatePaperCard(paper.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      replacePaper(res.data.paper);
      setNotice(res.data.notice ?? "");
    });

  const handleSaveText = () =>
    run("save", async () => {
      if (!text.trim()) {
        setError("요약 글을 붙여넣어 주세요.");
        return;
      }
      const paper = await persist();
      if (paper) setNotice("글을 저장했어요.");
    });

  /** 카드가 없는 논문을 한 번에 — 논문마다 카드 1장씩 */
  const handleGenerateAll = () =>
    run("generate-all", async () => {
      const saved = textDirty || metaDirty ? await persist() : current;
      if ((textDirty || metaDirty) && !saved) return;
      // 방금 저장한 논문까지 포함한 최신 목록
      const list = saved ? (papers.some((p) => p.id === saved.id) ? papers.map((p) => (p.id === saved.id ? saved : p)) : [...papers, saved]) : papers;
      let made = 0;
      for (const p of list) {
        if (p.card_content) continue;
        const res = await generatePaperCard(p.id);
        if (!res.ok) {
          setError(res.error);
          break;
        }
        replacePaper(res.data.paper);
        made += 1;
      }
      if (made > 0) setNotice(`카드 ${made}장을 만들었어요. 논문마다 1장씩이에요.`);
    });

  const handleReview = (reviewed: boolean) =>
    run("review", async () => {
      if (!current) return;
      const res = await setPaperReviewed(current.id, reviewed);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      replacePaper(res.data);
    });

  const handleRestore = () =>
    run("restore", async () => {
      if (!current) return;
      const res = await restorePreviousCard(current.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      replacePaper(res.data);
      setNotice("이전 카드로 되돌렸어요.");
    });

  const handleSaveCard = async (next: PaperCardContent): Promise<string | null> => {
    if (!current) return "논문을 찾지 못했어요.";
    const res = await saveCardEdit(current.id, next);
    if (!res.ok) return res.error;
    replacePaper(res.data.paper);
    setNotice(res.data.paper.review_status === "reviewed" ? "카드를 고쳤어요. 직원 화면에 바로 반영돼요." : "카드를 고쳤어요. 검수를 다시 해 주세요.");
    return null;
  };

  const handleDelete = () =>
    run("delete", async () => {
      if (!current) return;
      const res = await deletePaper(current.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const rest = papers.filter((p) => p.id !== current.id);
      setPapers(rest);
      clearDraft(current.id);
      setSelected(rest[0]?.id ?? NEW);
      setDeleteOpen(false);
    });

  const handleMove = (dir: -1 | 1) =>
    run("reorder", async () => {
      if (!current || !issue) return;
      const to = index + dir;
      if (to < 0 || to >= papers.length) return;
      const next = [...papers];
      [next[index], next[to]] = [next[to], next[index]];
      const res = await reorderPapers(current.issue_id, next.map((p) => p.id));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPapers(next.map((p, i) => ({ ...p, display_order: i + 1 })));
    });

  const missingCards = papers.filter((p) => !p.card_content).length;
  const status: IssueStatus = issue?.status === "scheduled" && !publish.ok ? "draft" : (issue?.status ?? "draft");
  /** 발행된 묶음은 잠근다 (서버도 막는다) */
  const locked = status === "published";
  const blocked = !!busy || locked;
  const papersKey = papers.map((p) => `${p.id}:${p.updated_at}`).join("|");

  return (
    <>
      <PageHeader
        title="논문 브리핑 관리"
        description={isQueue ? "날짜 미정 논문" : `${dateLabel} 발행분 · ${ISSUE_STATUS_LABEL[status]}`}
        leading={<BackButton fallbackHref="/briefing/admin" />}
        action={
          isQueue ? undefined : (
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" className="size-9 rounded-lg" aria-label="전날">
              <Link href={`/briefing/admin/${addDays(issueDate, -1)}`}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="icon" className="size-9 rounded-lg" aria-label="다음 날">
              <Link href={`/briefing/admin/${addDays(issueDate, 1)}`}>
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
          )
        }
      />

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:px-6">
        {/* ───────── 왼쪽: 글 붙여넣기 ───────── */}
        <section className="flex min-w-0 flex-col gap-3">
          {/* 논문 탭 = 그날의 서로 다른 논문 */}
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={isQueue ? "날짜 미정 논문" : "이 날짜의 논문"}>
            {papers.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={selected === p.id}
                onClick={() => setSelected(p.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
                  selected === p.id ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border hover:text-foreground"
                )}
              >
                논문 {i + 1}
                {p.review_status === "reviewed" ? (
                  <CheckCircle2 className="size-3.5" aria-label="검수 완료" />
                ) : p.card_content ? (
                  <span className="size-1.5 rounded-full bg-current opacity-60" aria-label="카드 있음" />
                ) : null}
              </button>
            ))}
            {isNew && (
              <span className="inline-flex h-9 items-center rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background" role="tab" aria-selected="true">
                논문 {total + 1} (새 글)
              </span>
            )}
            {!isNew && canAddMore && !locked && (
              <button
                type="button"
                onClick={() => setSelected(NEW)}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-input px-3.5 text-[13px] font-semibold text-muted-foreground hover:border-control hover:text-foreground"
              >
                <Plus className="size-4" /> 새 논문 추가
              </button>
            )}
            {!canAddMore && <span className="px-1 text-[13px] text-muted-foreground">하루 {limits.max}건까지예요</span>}
          </div>

          <div className="rounded-xl bg-card p-5 ring-1 ring-border">
            <div className="flex items-start gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-subtle-foreground">
                <FileText className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <label htmlFor="briefing-raw" className="text-lg font-extrabold tracking-tight">
                  논문 요약 텍스트 붙여넣기
                </label>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  정리된 글을 통째로 붙여넣으세요. 제목·방법·결과를 나눠 쓰지 않아도 돼요. 이 글 하나가 카드 1장이 돼요.
                </p>
              </div>
            </div>

            <textarea
              id="briefing-raw"
              value={text}
              onChange={(e) => setTexts((t) => ({ ...t, [selected]: e.target.value }))}
              placeholder={"외부 AI 도구로 정리한 논문 요약을 여기에 붙여넣으세요.\n\n줄글, 여러 문단, 불릿, 번호 목록, 한글·영문 혼합 모두 괜찮아요."}
              spellCheck={false}
              readOnly={locked}
              className="mt-4 block min-h-[300px] w-full resize-y rounded-xl border border-input bg-background px-4 py-3.5 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[380px]"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{text.trim().length.toLocaleString()}자</span>
              <span>{textDirty || metaDirty ? "저장 전" : current ? "저장됨 · 원본 그대로 보관" : ""}</span>
            </div>

            {/* 고급 설정 (전부 선택) */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-subtle-foreground hover:text-foreground"
            >
              <ChevronRight className={cn("size-4 transition-transform", advancedOpen && "rotate-90")} />
              고급 설정 (선택)
            </button>
            {advancedOpen && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-subtle-foreground">진료 분야</span>
                  <Select value={meta.category || "auto"} onValueChange={(v) => setMetas((m) => ({ ...m, [selected]: { ...meta, category: v === "auto" ? "" : v } }))}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동으로 정하기</SelectItem>
                      {CATEGORY_KEYS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CATEGORY_LABEL[k].ko}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[13px] font-semibold text-subtle-foreground">DOI</span>
                  <Input value={meta.doi} onChange={(e) => setMetas((m) => ({ ...m, [selected]: { ...meta, doi: e.target.value } }))} placeholder="글에 없을 때만" className="h-10" />
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-[13px] font-semibold text-subtle-foreground">원문 링크</span>
                  <Input
                    value={meta.sourceUrl}
                    onChange={(e) => setMetas((m) => ({ ...m, [selected]: { ...meta, sourceUrl: e.target.value } }))}
                    placeholder="https://… (글에 없을 때만)"
                    inputMode="url"
                    className="h-10"
                  />
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-[13px] font-semibold text-subtle-foreground">메모 (관리자만 봄)</span>
                  <Input value={meta.adminMemo} onChange={(e) => setMetas((m) => ({ ...m, [selected]: { ...meta, adminMemo: e.target.value } }))} placeholder="예: 다음 주 세미나 주제와 연결" className="h-10" />
                </label>
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button onClick={handleGenerate} disabled={blocked || !text.trim()} className="h-12 flex-1 rounded-xl text-base font-bold">
                {busy === "generate" ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
                {busy === "generate" ? "카드를 만드는 중…" : card ? "AI 카드뉴스 다시 만들기" : "AI 카드뉴스 만들기"}
              </Button>
              <Button variant="outline" onClick={handleSaveText} disabled={blocked || !(textDirty || metaDirty)} className="h-12 rounded-xl px-4">
                {busy === "save" ? "저장하는 중…" : "글만 저장"}
              </Button>
            </div>
            {card && (
              <p className="mt-2 text-xs text-muted-foreground">다시 만들면 지금 카드는 한 번 보관돼요. 마음에 안 들면 &quot;이전 카드로&quot;로 되돌릴 수 있어요.</p>
            )}
          </div>

          {missingCards >= 2 && (
            <Button variant="outline" onClick={handleGenerateAll} disabled={blocked} className="h-11 rounded-xl">
              {busy === "generate-all" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy === "generate-all" ? "차례로 만드는 중…" : `전체 카드뉴스 생성 (카드 없는 논문 ${missingCards}건)`}
            </Button>
          )}

          {locked && (
            <p className="rounded-xl bg-status-done-bg px-4 py-3 text-[13px] font-medium text-status-done">
              발행된 묶음이에요. 카드의 글(오타)은 오른쪽 &quot;오타 고치기&quot;로 바로 고칠 수 있어요. 요약 글·순서를 바꾸거나 지우려면 아래에서 발행을 취소해야 해요.
            </p>
          )}

          {isQueue ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-[13px] text-subtle-foreground">
              날짜가 정해지지 않은 논문이에요. 발행하려면 <Link href="/briefing/admin" className="font-semibold text-primary hover:underline">관리 첫 화면</Link>의 &quot;날짜 미정&quot;에서 날짜를 정해 주세요.
            </p>
          ) : (
            /* 발행: 예약 · 지금 발행 · 취소 + 알림 상태 */
            <PublishPanel
              issue={issue}
              issueDate={issueDate}
              status={status}
              publish={publish}
              paperCount={total}
              papersKey={papersKey}
              disabled={!!busy || textDirty || metaDirty}
              limits={limits}
              planReady={planReady}
              onIssueChange={setIssue}
            />
          )}
        </section>

        {/* ───────── 오른쪽: 그 논문의 카드 1장 ───────── */}
        <section className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-border lg:sticky lg:top-[calc(var(--page-top)+4.5rem)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <Eye className="size-5 text-subtle-foreground" /> 카드뉴스 미리보기
            </h2>
            <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-border" role="group" aria-label="미리보기 화면">
              {(
                [
                  { v: "mobile", label: "모바일", icon: Smartphone },
                  { v: "desktop", label: "PC", icon: Monitor },
                  { v: "rounding", label: "라운딩", icon: Tv },
                ] as const
              ).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={viewport === v}
                  onClick={() => setViewport(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    viewport === v ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {notice && (
            <p role="status" className="rounded-lg bg-status-doing-bg px-3 py-2.5 text-[13px] font-medium text-status-doing">
              {notice}
            </p>
          )}

          {/* 미리보기: 지금 고른 논문의 카드 딱 1장. 탭은 화면 모양만 바꾼다 */}
          {card && current ? (
            <div className={cn("rounded-xl bg-muted p-3 lg:p-4", viewport === "mobile" && "flex justify-center")}>
              {viewport === "desktop" ? (
                // PC 폭(960px)으로 그린 뒤 이 칸에 맞게 줄여서 보여 준다
                <FitWidth width={960}>
                  <PaperCard key={current.id} card={card} variant="desktop" dateLabel={dateLabel} progress={isQueue ? undefined : progressLabel(index, total)} />
                </FitWidth>
              ) : (
                <PaperCard
                  key={`${current.id}-${viewport}`}
                  card={card}
                  variant={viewport}
                  dateLabel={dateLabel}
                  progress={isQueue ? undefined : progressLabel(index, total)}
                  rounding={{ dateLabel, index, total }}
                  className={cn(viewport === "mobile" && "w-full max-w-[380px]", viewport === "rounding" && "rounded-lg")}
                />
              )}
            </div>
          ) : (
            <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-input bg-muted/50 px-6 py-10 text-center">
              <div>
                <Sparkles className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-[15px] font-semibold">아직 카드가 없어요</p>
                <p className="mt-1 text-[13px] text-muted-foreground">왼쪽에 요약 글을 붙여넣고 &quot;AI 카드뉴스 만들기&quot;를 누르면 여기에 카드 1장이 나와요.</p>
              </div>
            </div>
          )}

          {current?.generation_status === "ai" && card && (
            <p className="text-xs text-muted-foreground">AI가 디자인한 카드예요. 검수할 때 숫자·약물명·결론을 원문과 꼭 대조해 주세요.</p>
          )}
          {current?.generation_status === "rule" && card && (
            <p className="text-xs text-muted-foreground">AI 미사용 · 규칙으로 정리한 카드예요. 원문 문장을 그대로 배치했어요.</p>
          )}
          {current?.generation_status === "failed" && (
            <p className="text-xs font-medium text-status-late">마지막 만들기가 실패했어요. {card ? "이전 카드가 그대로 보여요." : "다시 눌러 주세요."}</p>
          )}

          {/* 그날의 논문 썸네일 (논문 수만큼). 날짜 미정은 날짜 묶음이 아니라 보여 주지 않는다 */}
          {total > 0 && !isQueue && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-subtle-foreground">
                  오늘 논문 {total}건 = 카드 {total}장
                </p>
                {current && total > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-8" disabled={blocked || index <= 0} onClick={() => handleMove(-1)} aria-label="이 논문을 앞으로">
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8" disabled={blocked || index >= total - 1} onClick={() => handleMove(1)} aria-label="이 논문을 뒤로">
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {papers.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    aria-label={`논문 ${i + 1} 보기`}
                    aria-current={selected === p.id}
                    className={cn("group relative overflow-hidden rounded-lg text-left ring-2 transition-shadow", selected === p.id ? "ring-primary" : "ring-transparent hover:ring-border")}
                  >
                    {p.card_content ? (
                      <PaperCard card={p.card_content} variant="rounding" className="pointer-events-none" />
                    ) : (
                      <span className="grid aspect-video place-items-center bg-muted text-xs text-muted-foreground">카드 없음</span>
                    )}
                    <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">{progressLabel(i, total)}</span>
                    {p.review_status === "reviewed" && <CheckCircle2 className="absolute right-1 top-1 size-4 text-white drop-shadow" aria-label="검수 완료" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 원문 대조 */}
          {card && current && (
            <div className={cn("rounded-xl px-4 py-3 text-[13px]", warnings.length > 0 ? "bg-status-ask-bg" : "bg-muted")}>
              {warnings.length > 0 ? (
                <>
                  <p className="flex items-center gap-1.5 font-semibold text-status-ask">
                    <CircleAlert className="size-4" /> 원문과 다를 수 있는 곳 {warnings.length}개 — 확인해 주세요
                  </p>
                  <ul className="mt-1.5 grid gap-0.5 pl-[22px] text-foreground">
                    {warnings.slice(0, 6).map((w) => (
                      <li key={`${w.type}-${w.token}`}>
                        {w.message} <span className="text-muted-foreground">· {w.where}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-subtle-foreground">
                  <CheckCircle2 className="size-4 text-status-done" /> 카드의 숫자·영문 용어·출처가 모두 원문에 있어요.
                </p>
              )}
            </div>
          )}

          {/* 카드 다루기 */}
          {current && card && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-10 rounded-lg" disabled={!!busy} onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> {locked ? "오타 고치기" : "글·템플릿 고치기"}
              </Button>
              {current.previous_card_content && (
                <Button variant="outline" className="h-10 rounded-lg" disabled={blocked} onClick={handleRestore}>
                  <Undo2 className="size-4" /> 이전 카드로
                </Button>
              )}
              <Button variant="outline" className="h-10 rounded-lg" disabled={blocked} onClick={handleGenerate}>
                <RotateCcw className="size-4" /> 다시 만들기
              </Button>
              <Button variant="outline" className="ml-auto h-10 rounded-lg text-status-late hover:bg-status-late-bg hover:text-status-late" disabled={blocked} onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" /> 논문 지우기
              </Button>
            </div>
          )}
          {current && !card && (
            <Button variant="outline" className="h-10 self-start rounded-lg text-status-late hover:bg-status-late-bg hover:text-status-late" disabled={blocked} onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" /> 논문 지우기
            </Button>
          )}

          {/* 검수 */}
          {current && card && (
            current.review_status === "reviewed" ? (
              <div className="flex items-center gap-3 rounded-xl bg-status-done-bg px-4 py-3">
                <CheckCircle2 className="size-5 shrink-0 text-status-done" />
                <p className="min-w-0 flex-1 text-sm font-semibold text-status-done">검수를 마친 논문이에요.</p>
                <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={blocked} onClick={() => handleReview(false)}>
                  검수 취소
                </Button>
              </div>
            ) : (
              <Button className="h-12 rounded-xl text-base font-bold" disabled={blocked || textDirty} onClick={() => handleReview(true)}>
                <CheckCircle2 className="size-5" />
                {textDirty ? "글을 먼저 저장해 주세요" : "원문과 맞는지 확인했어요 · 검수 완료"}
              </Button>
            )
          )}
        </section>
      </div>

      {current && card && (
        <CardEditDialog key={`${current.id}-${current.updated_at}`} open={editOpen} onOpenChange={setEditOpen} card={card} rawText={current.raw_summary_text} onSave={handleSaveCard} />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>이 논문을 지울까요?</DialogTitle>
            <DialogDescription>붙여넣은 글과 카드 1장이 함께 지워져요. 지우면 되돌릴 수 없어요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={blocked}>
              {busy === "delete" ? "지우는 중…" : "지우기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
