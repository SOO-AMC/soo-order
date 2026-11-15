"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarClock, CalendarOff, CheckCircle2, ChevronRight, CircleAlert, GripVertical, Inbox, Loader2, Newspaper, Plus, Send, Settings, Sparkles, Trash2, Undo2, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { EmptyState, ListSkeleton } from "@/components/workspace/feedback";
import { ReviewFlow } from "@/components/briefing/admin/review-flow";
import { deletePaper, generatePaperCard } from "@/lib/actions/briefing-admin-actions";
import { fetchPlanner, movePaper, reviewCleanPapers, uploadPapers, type PlannerData, type PlannerDay, type PlannerPaperRow } from "@/lib/actions/briefing-planner-actions";
import { publishIssueNow } from "@/lib/actions/briefing-publish-actions";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { addDays, formatIssueDate } from "@/lib/briefing/kst";
import { DUP_REASON_LABEL, splitSummaries } from "@/lib/briefing/planner";
import { STOCK_LOW_DAYS } from "@/lib/briefing/publish-engine";
import { PER_DAY_RANGE, QUEUE_DATE } from "@/lib/briefing/types";
import { shareInflight } from "@/lib/utils/inflight";

const MAX_PER_DAY = PER_DAY_RANGE.max;
/** "2026.11.16 (월)" → "11.16 (월)" */
const shortDate = (d: string) => formatIssueDate(d).slice(5);

/**
 * 논문 브리핑 관리 첫 화면 — 날짜를 정해 올리고, 검수하고, 날짜별로 본다.
 *
 * ① 올리기: 발행 날짜(기본은 다음 빈 날짜)를 정하고 논문 칸(탭)마다 요약을 하나씩 붙여넣는다.
 *    한 번에 올린 논문들이 그날의 브리핑이다 — 칸을 늘리면 그날 나가는 건수가 늘어난다(하루 6건까지).
 * ② 검수: 넘기면서 검수. 그날 논문이 전부 검수되면 앱이 08:30 발행을 예약한다.
 * ③ 발행 예정: 날짜별 묶음. 앱은 논문을 다른 날짜로 옮기지 않는다(지워도 당겨 채우지 않는다) — 옮기는 것은 여기서 직접.
 */
export function BriefingPlanner() {
  const [data, setData] = useState<PlannerData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** 논문 칸의 글. null = 아직 손대지 않음(설정의 기본 칸 수만큼 빈 칸) */
  const [texts, setTexts] = useState<string[] | null>(null);
  const [tab, setTab] = useState(0);
  /** 고른 발행 날짜. null = 기본(다음 빈 날짜) */
  const [date, setDate] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** 넘기면서 검수: null = 닫힘, "" = 처음부터, id = 그 논문부터 */
  const [review, setReview] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<PlannerDay | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await fetchPlanner());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    shareInflight("briefing-planner", fetchPlanner)
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch {
      setError("처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const perDay = data?.settings.perDay ?? 3;
  const slots = useMemo(() => texts ?? Array.from({ length: perDay }, () => ""), [texts, perDay]);
  const activeTab = Math.min(tab, slots.length - 1);
  /** 실제로 올라갈 논문 수 (한 칸에 --- 로 여러 건을 넣었으면 그만큼) */
  const paperCount = useMemo(() => slots.reduce((n, t) => n + splitSummaries(t).length, 0), [slots]);
  const pending = useMemo(() => data?.pending ?? [], [data]);
  /** 검수 전 논문마다 "원문과 다를 수 있는 곳" 수 (카드가 없으면 null) */
  const warningCount = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const p of pending) out.set(p.id, p.card_content ? checkFidelity(p.raw_summary_text, p.card_content, [p.source_url ?? "", p.doi ?? ""]).length : null);
    return out;
  }, [pending]);
  const noCard = pending.filter((p) => !p.card_content);
  const cleanCount = pending.filter((p) => warningCount.get(p.id) === 0).length;

  /** 카드를 차례로 만든다 (진행 상황 표시). 돌려주는 값 = 실패한 수 */
  const makeCards = async (ids: string[]) => {
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgress({ done: i, total: ids.length });
      const res = await generatePaperCard(ids[i]);
      if (!res.ok) failed += 1;
    }
    return failed;
  };

  const handleUpload = (issueDate: string) =>
    run("upload", async () => {
      const res = await uploadPapers(slots, issueDate);
      if (!res.ok) return setError(res.error);
      const ids = res.data.papers.map((p) => p.id);
      const failed = await makeCards(ids);
      setTexts(null);
      setTab(0);
      setDate(null);
      await reload();
      if (failed > 0) setError(`카드 ${failed}장을 만들지 못했어요. 아래 "카드 만들기"를 다시 눌러 주세요.`);
      else setNotice(`${formatIssueDate(issueDate)} 브리핑에 논문 ${ids.length}건을 올리고 카드를 만들었어요. 검수하면 08:30 발행이 예약돼요.`);
      // 방금 올린 논문부터 바로 검수
      if (failed < ids.length) setReview(ids[0]);
    });

  const handleMakeMissing = () =>
    run("cards", async () => {
      const failed = await makeCards(noCard.map((p) => p.id));
      await reload();
      if (failed > 0) setError(`카드 ${failed}장을 만들지 못했어요. 다시 눌러 주세요.`);
    });

  const handleReviewClean = () =>
    run("clean", async () => {
      const res = await reviewCleanPapers();
      if (!res.ok) return setError(res.error);
      await reload();
      setNotice(res.data.reviewed > 0 ? `경고 없는 논문 ${res.data.reviewed}건을 검수 완료했어요.${res.data.left > 0 ? ` 확인이 필요한 ${res.data.left}건이 남았어요.` : ""}` : "한 번에 검수할 수 있는 논문이 없어요.");
    });

  const handleDelete = (id: string) =>
    run(`delete:${id}`, async () => {
      const res = await deletePaper(id);
      if (!res.ok) return setError(res.error);
      await reload();
    });

  const handleMove = (id: string, toDate: string, index?: number) =>
    run("move", async () => {
      const res = await movePaper(id, toDate, index);
      if (!res.ok) setError(res.error);
      await reload();
      if (res.ok && toDate === QUEUE_DATE) setNotice("날짜에서 뺐어요. 아래 \"날짜 미정\"에서 다시 날짜를 정할 수 있어요.");
    });

  const handlePublish = (day: PlannerDay) =>
    run(`publish:${day.date}`, async () => {
      setConfirmPublish(null);
      const res = await publishIssueNow(day.issueId);
      if (!res.ok) {
        setError([res.error, ...(res.reasons ?? [])].join(" "));
        await reload();
        return;
      }
      await reload();
      setNotice(`${formatIssueDate(day.date)} 브리핑을 발행했어요. 직원에게 바로 보여요.`);
    });

  if (loadError && !data) {
    return (
      <Shell>
        <div className="rounded-xl bg-card ring-1 ring-border">
          <EmptyState title="불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." action={<Button size="sm" onClick={reload}>다시 불러오기</Button>} />
        </div>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <ListSkeleton rows={6} />
      </Shell>
    );
  }

  const { days, today } = data;
  const working = !!busy;
  const low = data.stock < STOCK_LOW_DAYS;
  const nextScheduled = days.find((d) => d.status === "scheduled" && d.date >= today);
  const countOn = new Map(days.map((d) => [d.date, d.papers.length]));
  const locked = new Set(data.lockedDates);

  // 올리기: 고른 날짜의 상태
  const uploadDate = date ?? data.defaultDate;
  const existing = countOn.get(uploadDate) ?? 0;
  const room = Math.max(0, MAX_PER_DAY - existing);
  const dateProblem = uploadDate < today ? "지난 날짜에는 올릴 수 없어요." : locked.has(uploadDate) ? "이미 발행된 날짜예요. 다른 날짜를 골라 주세요." : paperCount > room ? `하루 ${MAX_PER_DAY}건까지예요. 이 날짜에는 ${room}건만 더 넣을 수 있어요.` : "";
  const lateToday = uploadDate === today && data.todayPast;
  const canAddTab = slots.length < MAX_PER_DAY;

  /** 옮길 수 있는 날짜: 오늘부터 2주 (잠긴 날·꽉 찬 날 제외) */
  const moveTargets = Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter((d) => !locked.has(d) && (countOn.get(d) ?? 0) < MAX_PER_DAY);
  const moveSelect = (paper: PlannerPaperRow, from: string, label: string) => (
    <select
      aria-label={label}
      value=""
      disabled={working}
      onChange={(e) => e.target.value && handleMove(paper.id, e.target.value)}
      className="h-8 w-[92px] shrink-0 rounded-md border border-input bg-background px-1.5 text-xs text-subtle-foreground"
    >
      <option value="">{label}</option>
      {moveTargets
        .filter((d) => d !== from)
        .map((d) => (
          <option key={d} value={d}>
            {shortDate(d)}
            {countOn.get(d) ? ` · ${countOn.get(d)}건` : ""}
          </option>
        ))}
    </select>
  );

  return (
    <Shell>
      {/* 준비 상태 한 줄 */}
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm", low ? "bg-status-ask-bg text-status-ask" : "bg-status-done-bg text-status-done")}>
        {low ? <CircleAlert className="size-[18px] shrink-0" /> : <CheckCircle2 className="size-[18px] shrink-0" />}
        <b className="font-bold">{data.stock === 0 ? "예약된 브리핑이 없어요" : `앞으로 ${data.stock}일치가 예약됐어요`}</b>
        <span className="text-[13px] font-medium opacity-90">
          {nextScheduled ? `다음 발행 ${formatIssueDate(nextScheduled.date)} 08:30 · ${nextScheduled.papers.length}건` : "논문을 올리고 검수하면 08:30 발행이 예약돼요"}
        </span>
      </div>

      {data.syncError && (
        <p role="alert" className="rounded-xl bg-status-ask-bg px-4 py-3 text-[13px] font-medium text-status-ask">
          예약 상태를 맞추지 못했어요. 화면을 새로 고쳐 주세요.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-status-late-bg px-4 py-3 text-sm font-medium text-status-late">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-status-doing-bg px-4 py-3 text-sm font-medium text-status-doing">
          {notice}
        </p>
      )}

      {/* ① 올리기: 날짜 + 논문 칸(탭) */}
      <section className="rounded-xl bg-card p-4 ring-1 ring-border lg:p-5">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Upload className="size-[18px] text-subtle-foreground" /> 논문 올리기
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">논문 칸마다 요약을 하나씩 붙여넣으세요. 여기 올린 논문들이 그날의 브리핑이 돼요. 칸을 늘리면 그날 나가는 건수가 늘어나요.</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="planner-date" className="text-[13px] font-semibold text-subtle-foreground">
            발행 날짜
          </label>
          <input
            id="planner-date"
            type="date"
            value={uploadDate}
            min={today}
            disabled={working}
            onChange={(e) => setDate(e.target.value || null)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-[15px] font-semibold tabular-nums"
          />
          <span className={cn("text-[13px]", dateProblem ? "font-semibold text-status-late" : "text-muted-foreground")}>
            {dateProblem ||
              (lateToday
                ? "오늘 08:30은 지났어요. 올리고 검수한 뒤 \"지금 발행\"을 눌러야 나가요."
                : `${formatIssueDate(uploadDate)} 08:30에 나가요.${existing > 0 ? ` 이 날짜에 이미 ${existing}건이 있어요${paperCount > 0 ? ` — 더하면 ${existing + paperCount}건이 돼요` : ""}.` : ""}`)}
          </span>
          {date !== null && date !== data.defaultDate && (
            <button type="button" className="text-[13px] font-semibold text-primary hover:underline" onClick={() => setDate(null)}>
              다음 빈 날짜로
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="올릴 논문">
          {slots.map((t, i) => (
            <span key={i} className={cn("inline-flex h-9 items-center rounded-full text-[13px] font-semibold transition-colors", activeTab === i ? "bg-foreground text-background" : "bg-muted text-subtle-foreground ring-1 ring-border")}>
              <button type="button" role="tab" aria-selected={activeTab === i} onClick={() => setTab(i)} className={cn("inline-flex h-9 items-center gap-1.5 pl-3.5", slots.length > 1 ? "pr-1.5" : "pr-3.5")}>
                논문 {i + 1}
                {t.trim() && <span className="size-1.5 rounded-full bg-current opacity-70" aria-label="내용 있음" />}
              </button>
              {slots.length > 1 && (
                <button
                  type="button"
                  aria-label={`논문 ${i + 1} 칸 지우기`}
                  disabled={working}
                  onClick={() => {
                    setTexts(slots.filter((_, j) => j !== i));
                    setTab((cur) => (cur > i || cur >= slots.length - 1 ? Math.max(0, cur - 1) : cur));
                  }}
                  className="mr-1.5 grid size-6 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          {canAddTab ? (
            <button
              type="button"
              disabled={working}
              onClick={() => {
                setTexts([...slots, ""]);
                setTab(slots.length);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-input px-3.5 text-[13px] font-semibold text-muted-foreground hover:border-control hover:text-foreground"
            >
              <Plus className="size-4" /> 논문 추가
            </button>
          ) : (
            <span className="px-1 text-[13px] text-muted-foreground">하루 {MAX_PER_DAY}건까지예요</span>
          )}
        </div>

        <textarea
          id="planner-upload"
          aria-label={`논문 ${activeTab + 1} 요약`}
          value={slots[activeTab] ?? ""}
          onChange={(e) => setTexts(slots.map((t, i) => (i === activeTab ? e.target.value : t)))}
          spellCheck={false}
          disabled={working}
          placeholder={`논문 ${activeTab + 1}의 요약을 여기에 붙여넣으세요.\n\n줄글, 여러 문단, 불릿, 번호 목록, 한글·영문 혼합 모두 괜찮아요.`}
          className="mt-3 block min-h-[200px] w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[260px]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button className="h-11 rounded-xl px-5 text-[15px] font-bold" disabled={working || paperCount === 0 || !!dateProblem} onClick={() => handleUpload(uploadDate)}>
            {busy === "upload" ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {busy === "upload" ? (progress ? `카드 만드는 중 ${progress.done + 1} / ${progress.total}` : "올리는 중…") : paperCount > 0 ? `논문 ${paperCount}건 올리고 카드 만들기` : "올리고 카드 만들기"}
          </Button>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {paperCount === 0 ? "붙여넣은 칸만 올라가요. 빈 칸은 무시해요." : `${shortDate(uploadDate)} 브리핑 · 논문 ${paperCount}건${slots.some((t) => !t.trim()) ? " (빈 칸 제외)" : ""}`}
          </span>
        </div>
      </section>

      {/* ② 검수 전 */}
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Inbox className="size-[18px] text-subtle-foreground" /> 검수 기다리는 논문
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold tabular-nums text-subtle-foreground">{pending.length}</span>
          </h2>
          <div className="ml-auto flex flex-wrap gap-2">
            {noCard.length > 0 && (
              <Button variant="outline" className="h-9 rounded-lg text-[13px]" disabled={working} onClick={handleMakeMissing}>
                {busy === "cards" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy === "cards" && progress ? `${progress.done + 1} / ${progress.total}` : `카드 만들기 (${noCard.length}건)`}
              </Button>
            )}
            {cleanCount > 0 && (
              <Button variant="outline" className="h-9 rounded-lg text-[13px]" disabled={working} onClick={handleReviewClean} title="원문과 숫자·용어·출처가 모두 맞는 카드만 검수 완료해요">
                {busy === "clean" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} 경고 없는 {cleanCount}건 한 번에 검수
              </Button>
            )}
            {pending.length > 0 && (
              <Button className="h-9 rounded-lg text-[13px] font-bold" disabled={working} onClick={() => setReview("")}>
                넘기면서 검수 <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {pending.length === 0 ? (
          <EmptyState icon={Inbox} title="검수할 논문이 없어요" description="논문을 올리면 여기에 쌓여요." />
        ) : (
          <ul>
            {pending.map((p, i) => {
              const w = warningCount.get(p.id);
              const dup = data.duplicates[p.id];
              return (
                <li key={p.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-border")}>
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={working} onClick={() => setReview(p.id)}>
                    <span className="block truncate text-sm font-semibold">{p.headline ?? p.raw_summary_text.split("\n")[0].slice(0, 90)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 font-semibold tabular-nums text-subtle-foreground">{p.issue_date === QUEUE_DATE ? "날짜 미정" : shortDate(p.issue_date)}</span>
                      {w === null || w === undefined ? (
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-semibold text-subtle-foreground">카드 없음</span>
                      ) : w === 0 ? (
                        <span className="rounded-md bg-status-done-bg px-1.5 py-0.5 font-semibold text-status-done">원문과 맞아요</span>
                      ) : (
                        <span className="rounded-md bg-status-ask-bg px-1.5 py-0.5 font-semibold text-status-ask">확인할 곳 {w}개</span>
                      )}
                      {dup && (
                        <span className="rounded-md bg-status-late-bg px-1.5 py-0.5 font-semibold text-status-late">
                          중복 의심 · {dup.where} ({DUP_REASON_LABEL[dup.reason]})
                        </span>
                      )}
                    </span>
                  </button>
                  <Button asChild variant="ghost" className="h-8 shrink-0 px-2 text-[13px] text-muted-foreground">
                    <Link href={`/briefing/admin/${p.issue_date}?paper=${p.id}`}>글 고치기</Link>
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-status-late" disabled={working} onClick={() => handleDelete(p.id)} aria-label="이 논문 지우기">
                    {busy === `delete:${p.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ③ 발행 예정: 날짜별 묶음 */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 px-1">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <CalendarClock className="size-[18px] text-subtle-foreground" /> 발행 예정
          </h2>
          <p className="text-[13px] text-muted-foreground">그날 논문이 모두 검수되면 08:30 발행이 예약돼요. 논문을 끌거나 &quot;옮기기&quot;로 다른 날짜에 넣을 수 있어요.</p>
          {busy === "move" && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="옮기는 중" />}
        </div>
        {days.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState icon={CalendarClock} title="아직 발행 예정이 없어요" description="위에서 날짜를 정하고 논문을 올려 보세요." />
          </div>
        ) : (
          <div className="grid gap-3">
            {days.map((day) => {
              const past = day.date < today;
              const allReady = day.papers.every((p) => p.reviewed && p.hasCard);
              return (
                <div
                  key={day.date}
                  className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", dragId && !past && "transition-shadow hover:ring-2 hover:ring-primary/50")}
                  onDragOver={(e) => dragId && !past && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && !past) handleMove(dragId, day.date);
                    setDragId(null);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
                    <Link href={`/briefing/admin/${day.date}`} className="text-[15px] font-bold tabular-nums hover:text-primary hover:underline">
                      {formatIssueDate(day.date)}
                    </Link>
                    {day.date === today && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">오늘</span>}
                    {day.status === "scheduled" ? (
                      <span className="rounded-md bg-status-doing-bg px-1.5 py-0.5 text-xs font-bold text-status-doing">08:30 발행 예약</span>
                    ) : !allReady ? (
                      <span className="rounded-md bg-status-ask-bg px-1.5 py-0.5 text-xs font-bold text-status-ask">검수할 논문이 있어요</span>
                    ) : past ? (
                      <span className="rounded-md bg-status-late-bg px-1.5 py-0.5 text-xs font-bold text-status-late">발행되지 않고 지났어요 — 다른 날짜로 옮겨 주세요</span>
                    ) : (
                      <span className="rounded-md bg-status-ask-bg px-1.5 py-0.5 text-xs font-bold text-status-ask">08:30이 지났어요</span>
                    )}
                    <span className="text-[13px] tabular-nums text-muted-foreground">논문 {day.papers.length}건</span>
                    {day.date === today && day.status !== "scheduled" && allReady && (
                      <Button variant="outline" className="ml-auto h-8 rounded-lg px-2.5 text-[13px]" disabled={working} onClick={() => setConfirmPublish(day)}>
                        {busy === `publish:${day.date}` ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 지금 발행
                      </Button>
                    )}
                  </div>
                  <ul>
                    {day.papers.map((p, i) => (
                      <li
                        key={p.id}
                        draggable={!working}
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", p.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => dragId && dragId !== p.id && !past && e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragId && dragId !== p.id && !past) handleMove(dragId, day.date, i);
                          setDragId(null);
                        }}
                        className={cn("flex items-center gap-2 px-3 py-2.5", i > 0 && "border-t border-border", dragId === p.id && "opacity-40")}
                      >
                        <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted-foreground lg:block" aria-hidden="true" />
                        <Link href={`/briefing/admin/${day.date}?paper=${p.id}`} className="min-w-0 flex-1 hover:text-primary">
                          <span className="block truncate text-sm font-medium">{p.headline ?? "(카드 만들기 전)"}</span>
                          {!(p.reviewed && p.hasCard) && <span className="text-xs font-semibold text-status-ask">{p.hasCard ? "검수가 필요해요" : "카드가 없어요"}</span>}
                        </Link>
                        {moveSelect(p, day.date, "옮기기")}
                        {!past && (
                          <>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={working || i <= 0} onClick={() => handleMove(p.id, day.date, i - 1)} aria-label="이 날짜 안에서 앞으로">
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={working || i >= day.papers.length - 1} onClick={() => handleMove(p.id, day.date, i + 1)} aria-label="이 날짜 안에서 뒤로">
                              <ArrowDown className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" disabled={working} onClick={() => handleMove(p.id, QUEUE_DATE)} aria-label="이 날짜에서 빼기" title="이 날짜에서 빼기 (날짜 미정으로)">
                          <Undo2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 날짜 미정 */}
      {data.undated.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <CalendarOff className="size-[18px] text-subtle-foreground" /> 날짜 미정
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold tabular-nums text-subtle-foreground">{data.undated.length}</span>
            </h2>
            <p className="text-[13px] text-muted-foreground">날짜를 정해야 발행돼요.</p>
          </div>
          <ul>
            {data.undated.map((p, i) => (
              <li key={p.id} className={cn("flex items-center gap-2 px-4 py-2.5", i > 0 && "border-t border-border")}>
                <Link href={`/briefing/admin/${QUEUE_DATE}?paper=${p.id}`} className="min-w-0 flex-1 hover:text-primary">
                  <span className="block truncate text-sm font-medium">{p.headline ?? "(카드 만들기 전)"}</span>
                  <span className={cn("text-xs font-semibold", p.reviewed ? "text-status-done" : "text-status-ask")}>{p.reviewed ? "검수 완료" : p.hasCard ? "검수 전" : "카드 없음"}</span>
                </Link>
                {moveSelect(p, QUEUE_DATE, "날짜 정하기")}
                <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-status-late" disabled={working} onClick={() => handleDelete(p.id)} aria-label="이 논문 지우기">
                  {busy === `delete:${p.id}` ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 지난 발행 */}
      {data.published.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[15px] font-bold">
            <Newspaper className="size-[18px] text-subtle-foreground" /> 최근 발행
          </h2>
          <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {data.published.map((d, i) => (
              <Link key={d.date} href={`/briefing/admin/${d.date}`} className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60", i > 0 && "border-t border-border")}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-sm font-semibold tabular-nums">{formatIssueDate(d.date)}</b>
                    <span className="rounded-md bg-status-done-bg px-1.5 py-0.5 text-xs font-bold text-status-done">발행 완료</span>
                    <span className="text-[13px] tabular-nums text-muted-foreground">논문 {d.paperCount}건</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-subtle-foreground">{d.headlines.join("  ·  ")}</span>
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {review !== null && (
        <ReviewFlow
          papers={pending}
          startId={review || null}
          duplicates={data.duplicates}
          perDay={perDay}
          onClose={(changed) => {
            setReview(null);
            if (changed) reload();
          }}
        />
      )}

      <Dialog open={confirmPublish !== null} onOpenChange={(o) => !o && setConfirmPublish(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지금 발행할까요?</DialogTitle>
            <DialogDescription>
              {confirmPublish ? `${formatIssueDate(confirmPublish.date)} 브리핑 논문 ${confirmPublish.papers.length}건이 직원에게 바로 보여요.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
            <Button onClick={() => confirmPublish && handlePublish(confirmPublish)} disabled={working}>
              지금 발행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="논문 브리핑 관리"
        description={<span className="hidden sm:inline">매일 08:30 · 올린 날짜에 발행</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={
          <Button asChild variant="outline" className="h-9 rounded-lg px-3 text-[13px]">
            <Link href="/briefing/admin/settings">
              <Settings className="size-4" /> 설정
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-md space-y-4 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">{children}</div>
    </>
  );
}
