"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, GripVertical, Inbox, Loader2, Newspaper, Send, Settings, Sparkles, Trash2, Undo2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { EmptyState, ListSkeleton } from "@/components/workspace/feedback";
import { ReviewFlow } from "@/components/briefing/admin/review-flow";
import { deletePaper, generatePaperCard } from "@/lib/actions/briefing-admin-actions";
import { applyPlanOrder, fetchPlanner, publishTodayNow, reviewCleanPapers, sendToQueue, uploadPapers, type PlannerData, type PlannerDay } from "@/lib/actions/briefing-planner-actions";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { addDays, formatIssueDate } from "@/lib/briefing/kst";
import { DUP_REASON_LABEL, moveBefore, moveInOrder, moveToDay, nthOpenDate, splitSummaries } from "@/lib/briefing/planner";
import { STOCK_LOW_DAYS } from "@/lib/briefing/publish-engine";
import { QUEUE_DATE } from "@/lib/briefing/types";
import { shareInflight } from "@/lib/utils/inflight";

const BLOCKED_TEXT: Record<NonNullable<PlannerDay["blocked"]>, string> = {
  short: "건수가 모자라요",
  unreviewed: "검수할 논문이 있어요",
  "past-time": "08:30이 지났어요",
};

/**
 * 논문 브리핑 관리 첫 화면 — 대기함 + 날짜별 발행 예정.
 *
 * 관리자가 하는 일은 셋: ① 요약을 (여러 건이어도) 붙여넣어 올린다 ② 넘기면서 검수한다 ③ 필요하면 순서를 바꾼다.
 * 날짜는 고르지 않는다. 검수한 논문을 앱이 다음 발행일부터 하루 N건씩 채우고 08:30 발행을 예약한다.
 * 순서가 곧 날짜라서, 논문을 옮기거나 빼면 뒤의 논문이 당겨진다.
 */
export function BriefingPlanner() {
  const [data, setData] = useState<PlannerData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** 넘기면서 검수: null = 닫힘, "" = 처음부터, id = 그 논문부터 */
  const [review, setReview] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmToday, setConfirmToday] = useState(false);

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

  const parts = useMemo(() => splitSummaries(text), [text]);
  const queue = useMemo(() => data?.queue ?? [], [data]);
  /** 대기함 논문마다 "원문과 다를 수 있는 곳" 수 (카드가 없으면 null) */
  const warningCount = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const p of queue) out.set(p.id, p.card_content ? checkFidelity(p.raw_summary_text, p.card_content, [p.source_url ?? "", p.doi ?? ""]).length : null);
    return out;
  }, [queue]);
  const noCard = queue.filter((p) => !p.card_content);
  const cleanCount = queue.filter((p) => warningCount.get(p.id) === 0).length;

  /** 카드가 없는 논문들에 카드를 차례로 만든다 (진행 상황 표시) */
  const makeCards = async (ids: string[]) => {
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      setProgress({ done: i, total: ids.length });
      const res = await generatePaperCard(ids[i]);
      if (!res.ok) failed += 1;
    }
    return failed;
  };

  const handleUpload = () =>
    run("upload", async () => {
      const res = await uploadPapers(text);
      if (!res.ok) return setError(res.error);
      const ids = res.data.papers.map((p) => p.id);
      const failed = await makeCards(ids);
      setText("");
      await reload();
      if (failed > 0) setError(`카드 ${failed}장을 만들지 못했어요. 대기함에서 "카드 만들기"를 다시 눌러 주세요.`);
      else setNotice(`논문 ${ids.length}건을 올리고 카드를 만들었어요. 이제 검수만 하면 돼요.`);
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

  const applyOrder = (next: string[]) =>
    run("move", async () => {
      if (!data || next.join("|") === data.order.join("|")) return;
      const res = await applyPlanOrder(next);
      if (!res.ok) setError(res.error);
      await reload();
    });

  const handleSendToQueue = (id: string) =>
    run(`queue:${id}`, async () => {
      const res = await sendToQueue(id);
      if (!res.ok) return setError(res.error);
      await reload();
      setNotice("대기함으로 돌려보냈어요. 다시 검수하면 맨 뒤 날짜에 들어가요.");
    });

  const handlePublishToday = () =>
    run("today", async () => {
      setConfirmToday(false);
      const res = await publishTodayNow();
      if (!res.ok) {
        setError([res.error, ...(res.reasons ?? [])].join(" "));
        await reload();
        return;
      }
      await reload();
      setNotice("오늘 브리핑을 발행했어요. 직원에게 바로 보여요.");
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

  const { settings, days, order } = data;
  const perDay = settings.perDay;
  const low = data.stock < STOCK_LOW_DAYS;
  const locked = new Set(data.todayLive ? [data.today] : []);
  /** 발행 예정의 k번째 날짜 (옮길 곳 고르기 — 지금 있는 날 + 그 다음 새 날) */
  const dayDates = days.map((d) => d.date);
  const nextNewDate = days.length > 0 ? addDays(days[days.length - 1].date, 1) : nthOpenDate(data.nextDate, 0, locked);
  /** 08:30을 놓쳤고 오늘 나간 게 없을 때: 지금 발행할 수 있다 (검수한 논문이 있으면) */
  const canPublishToday = data.todayPast && !data.todayLive && days.some((d) => d.papers.every((p) => p.reviewed && p.hasCard) && d.papers.length >= settings.min);
  const working = !!busy;

  return (
    <Shell perDay={perDay} min={settings.min}>
      {/* 준비 상태 한 줄 */}
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm", low ? "bg-status-ask-bg text-status-ask" : "bg-status-done-bg text-status-done")}>
        {low ? <CircleAlert className="size-[18px] shrink-0" /> : <CheckCircle2 className="size-[18px] shrink-0" />}
        <b className="font-bold">{data.stock === 0 ? "예약된 브리핑이 없어요" : `앞으로 ${data.stock}일치가 준비됐어요`}</b>
        <span className="text-[13px] font-medium opacity-90">
          {days.find((d) => d.status === "scheduled") ? `다음 발행 ${formatIssueDate(days.find((d) => d.status === "scheduled")!.date)} 08:30` : `다음 발행일은 ${formatIssueDate(data.nextDate)}이에요`}
          {low && " · 논문을 올리고 검수해 주세요"}
        </span>
      </div>

      {canPublishToday && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border">
          <p className="min-w-0 flex-1 text-sm">
            <b className="font-semibold">오늘 브리핑이 아직 나가지 않았어요.</b> <span className="text-muted-foreground">08:30이 지나서 자동으로는 내일부터 나가요.</span>
          </p>
          <Button variant="outline" className="h-10 rounded-lg" disabled={working} onClick={() => setConfirmToday(true)}>
            {busy === "today" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 오늘 것 지금 발행
          </Button>
        </div>
      )}

      {data.syncError && (
        <p role="alert" className="rounded-xl bg-status-ask-bg px-4 py-3 text-[13px] font-medium text-status-ask">
          날짜를 다시 채우지 못했어요. {data.syncError === "locked" ? "그사이 발행된 날짜가 있어요." : ""} 화면을 새로 고쳐 주세요.
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

      {/* ① 올리기 */}
      <section className="rounded-xl bg-card p-4 ring-1 ring-border lg:p-5">
        <label htmlFor="planner-upload" className="flex items-center gap-2 text-base font-bold">
          <Upload className="size-[18px] text-subtle-foreground" /> 논문 요약 올리기
        </label>
        <p className="mt-1 text-[13px] text-muted-foreground">
          정리된 요약을 통째로 붙여넣으세요. 여러 건이면 논문 사이에 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">---</code> 한 줄을 넣으면 논문별로 나눠져요. 날짜는 고르지 않아도 돼요.
        </p>
        <textarea
          id="planner-upload"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          disabled={working}
          placeholder={"첫 번째 논문 요약…\n\n---\n\n두 번째 논문 요약…"}
          className="mt-3 block min-h-[160px] w-full resize-y rounded-xl border border-input bg-background px-4 py-3 text-[15px] leading-[1.7] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[200px]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button className="h-11 rounded-xl px-5 text-[15px] font-bold" disabled={working || parts.length === 0} onClick={handleUpload}>
            {busy === "upload" ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            {busy === "upload" ? (progress ? `카드 만드는 중 ${progress.done + 1} / ${progress.total}` : "올리는 중…") : parts.length > 1 ? `논문 ${parts.length}건 올리고 카드 만들기` : "올리고 카드 만들기"}
          </Button>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {parts.length === 0 ? "붙여넣으면 몇 건인지 여기에 보여요" : `논문 ${parts.length}건 · ${text.trim().length.toLocaleString()}자`}
          </span>
        </div>
      </section>

      {/* ② 대기함: 검수 전 */}
      <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Inbox className="size-[18px] text-subtle-foreground" /> 검수 기다리는 논문
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold tabular-nums text-subtle-foreground">{queue.length}</span>
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
            {queue.length > 0 && (
              <Button className="h-9 rounded-lg text-[13px] font-bold" disabled={working} onClick={() => setReview("")}>
                넘기면서 검수 <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {queue.length === 0 ? (
          <EmptyState icon={Inbox} title="검수할 논문이 없어요" description="위에 요약을 붙여넣으면 여기에 쌓여요." />
        ) : (
          <ul>
            {queue.map((p, i) => {
              const w = warningCount.get(p.id);
              const dup = data.duplicates[p.id];
              return (
                <li key={p.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-border")}>
                  <button type="button" className="min-w-0 flex-1 text-left" disabled={working} onClick={() => setReview(p.id)}>
                    <span className="block truncate text-sm font-semibold">{p.headline ?? p.raw_summary_text.split("\n")[0].slice(0, 90)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
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
                    <Link href={`/briefing/admin/${QUEUE_DATE}?paper=${p.id}`}>글 고치기</Link>
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

      {/* ③ 발행 예정: 날짜별 */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 px-1">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <CalendarClock className="size-[18px] text-subtle-foreground" /> 발행 예정
          </h2>
          <p className="text-[13px] text-muted-foreground">
            하루 {perDay}건씩 순서대로 채워요. 논문을 끌거나 화살표로 순서를 바꾸면 날짜가 따라 바뀌어요.
          </p>
          {busy === "move" && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="옮기는 중" />}
        </div>
        {days.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState icon={CalendarClock} title="아직 발행 예정이 없어요" description={`검수를 마친 논문이 ${formatIssueDate(data.nextDate)}부터 하루 ${perDay}건씩 들어가요.`} />
          </div>
        ) : (
          <div className="grid gap-3">
            {days.map((day, k) => (
              <div
                key={day.date}
                className={cn("overflow-hidden rounded-xl bg-card ring-1 ring-border", dragId && "transition-shadow hover:ring-2 hover:ring-primary/50")}
                onDragOver={(e) => dragId && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) applyOrder(moveToDay(order, dragId, k, perDay));
                  setDragId(null);
                }}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-2.5">
                  <Link href={`/briefing/admin/${day.date}`} className="text-[15px] font-bold tabular-nums hover:text-primary hover:underline">
                    {formatIssueDate(day.date)}
                  </Link>
                  {day.date === data.today && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">오늘</span>}
                  {day.status === "scheduled" ? (
                    <span className="rounded-md bg-status-doing-bg px-1.5 py-0.5 text-xs font-bold text-status-doing">08:30 발행 예약</span>
                  ) : (
                    <span className="rounded-md bg-status-ask-bg px-1.5 py-0.5 text-xs font-bold text-status-ask">{BLOCKED_TEXT[day.blocked ?? "short"]}</span>
                  )}
                  <span className="text-[13px] tabular-nums text-muted-foreground">
                    {day.papers.length} / {perDay}건
                  </span>
                </div>
                <ul>
                  {day.papers.map((p, i) => {
                    const at = order.indexOf(p.id);
                    return (
                      <li
                        key={p.id}
                        draggable={!working}
                        onDragStart={(e) => {
                          setDragId(p.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", p.id);
                        }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => dragId && dragId !== p.id && e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragId && dragId !== p.id) applyOrder(moveBefore(order, dragId, p.id));
                          setDragId(null);
                        }}
                        className={cn("flex items-center gap-2 px-3 py-2.5", i > 0 && "border-t border-border", dragId === p.id && "opacity-40")}
                      >
                        <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted-foreground lg:block" aria-hidden="true" />
                        <Link href={`/briefing/admin/${day.date}?paper=${p.id}`} className="min-w-0 flex-1 hover:text-primary">
                          <span className="block truncate text-sm font-medium">{p.headline ?? "(카드 만들기 전)"}</span>
                          {!(p.reviewed && p.hasCard) && <span className="text-xs font-semibold text-status-ask">검수가 필요해요 — 눌러서 확인</span>}
                        </Link>
                        <select
                          aria-label="날짜 옮기기"
                          value=""
                          disabled={working}
                          onChange={(e) => {
                            const to = Number(e.target.value);
                            if (Number.isInteger(to)) applyOrder(moveToDay(order, p.id, to, perDay));
                          }}
                          className="h-8 w-[74px] shrink-0 rounded-md border border-input bg-background px-1.5 text-xs text-subtle-foreground"
                        >
                          <option value="">옮기기</option>
                          {dayDates.map((d, di) => (di === k ? null : <option key={d} value={di}>{formatIssueDate(d).slice(5)}</option>))}
                          <option value={dayDates.length}>{formatIssueDate(nextNewDate).slice(5)} (새 날)</option>
                        </select>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={working || at <= 0} onClick={() => applyOrder(moveInOrder(order, p.id, at - 1))} aria-label="한 칸 앞으로">
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" disabled={working || at >= order.length - 1} onClick={() => applyOrder(moveInOrder(order, p.id, at + 1))} aria-label="한 칸 뒤로">
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" disabled={working} onClick={() => handleSendToQueue(p.id)} aria-label="대기함으로 돌려보내기" title="대기함으로 돌려보내기">
                          {busy === `queue:${p.id}` ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

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
          papers={queue}
          startId={review || null}
          duplicates={data.duplicates}
          perDay={perDay}
          onClose={(changed) => {
            setReview(null);
            if (changed) reload();
          }}
        />
      )}

      <Dialog open={confirmToday} onOpenChange={setConfirmToday}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>오늘 것을 지금 발행할까요?</DialogTitle>
            <DialogDescription>발행 예정의 맨 앞 논문들이 오늘 날짜로 당겨져 직원에게 바로 보여요. 뒤의 논문들은 하루씩 앞당겨져요.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
            <Button onClick={handlePublishToday} disabled={working}>
              지금 발행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children, perDay, min }: { children: React.ReactNode; perDay?: number; min?: number }) {
  return (
    <>
      <PageHeader
        title="논문 브리핑 관리"
        description={<span className="hidden sm:inline">매일 08:30{perDay ? ` · 하루 ${perDay}건${min !== undefined && min < perDay ? ` (최소 ${min}건)` : ""}` : ""}</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={
          <Button asChild variant="outline" className="h-9 rounded-lg px-3 text-[13px]">
            <Link href="/briefing/admin/settings">
              <Settings className="size-4" /> 건수·설정
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-md space-y-4 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">{children}</div>
    </>
  );
}
