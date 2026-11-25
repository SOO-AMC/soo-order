"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { findBriefingPaper, foundCategories } from "@/lib/actions/briefing-finder-actions";
import { FIND_CATEGORIES, RECENT_DAYS, type FindCategory } from "@/lib/briefing/finder/sources";
import { formatIssueDate } from "@/lib/briefing/kst";
import { CATEGORY_LABEL } from "@/lib/briefing/schema";

type Row =
  | { state: "empty" }
  | { state: "working" }
  | { state: "done"; paperId: string; headline: string | null; ready: boolean; detail?: string; reason?: string | null; url?: string | null }
  | { state: "failed"; error: string; paperId?: string };

const EMPTY: Record<FindCategory, Row> = { internal: { state: "empty" }, surgery: { state: "empty" }, imaging: { state: "empty" }, emergency: { state: "empty" } };

/**
 * 논문 자동 찾기 — 날짜를 고르고 누르면 내과·외과·영상·응급 분야마다 최근 논문을 1건씩 찾아 카드로 만들어 그 날짜에 넣는다.
 * 분야마다 서버를 한 번씩 차례로 부른다(분야당 30초 안팎). 검수 없이 그날 08:30 발행이 예약된다.
 */
export function AutoFinder({
  today,
  defaultDate,
  lockedDates,
  disabled,
  onBusyChange,
  onChanged,
}: {
  today: string;
  defaultDate: string;
  lockedDates: string[];
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const target = date ?? defaultDate;
  const [rows, setRows] = useState<Record<FindCategory, Row>>(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // 고른 날짜에 이미 찾아 둔 분야 불러오기
  useEffect(() => {
    let active = true;
    foundCategories(target)
      .then((res) => {
        if (!active) return;
        const next: Record<FindCategory, Row> = { ...EMPTY };
        if (res.ok) for (const f of res.data) if (f.category in next) next[f.category as FindCategory] = { state: "done", paperId: f.paperId, headline: f.headline, ready: f.ready };
        setRows(next);
        setLoadedFor(target);
      })
      .catch(() => {
        if (active) setLoadedFor(target);
      });
    return () => {
      active = false;
    };
  }, [target]);

  const problem = target < today ? "지난 날짜예요." : lockedDates.includes(target) ? "이미 발행된 날짜예요. 다른 날짜를 골라 주세요." : "";
  const missing = FIND_CATEGORIES.filter((c) => rows[c].state === "empty" || (rows[c].state === "failed" && !(rows[c] as { paperId?: string }).paperId));
  const working = busy || disabled;

  const findOne = async (category: FindCategory, replaceId?: string) => {
    setRows((r) => ({ ...r, [category]: { state: "working" } }));
    try {
      const res = await findBriefingPaper(target, category, replaceId ?? null);
      if (!res.ok) {
        setRows((r) => ({ ...r, [category]: { state: "failed", error: res.error, paperId: replaceId } }));
        return false;
      }
      const d = res.data;
      setRows((r) => ({
        ...r,
        [category]: {
          state: "done",
          paperId: d.paper.id,
          headline: d.paper.headline,
          ready: d.ready,
          detail: `${d.kind === "vet" ? "수의학" : "사람 의학"} · ${d.journal}`,
          reason: d.reason,
          url: d.paper.source_url,
        },
      }));
      return true;
    } catch {
      setRows((r) => ({ ...r, [category]: { state: "failed", error: "처리하지 못했어요. 다시 눌러 주세요.", paperId: replaceId } }));
      return false;
    }
  };

  const runAll = async (list: { category: FindCategory; replaceId?: string }[]) => {
    if (working || list.length === 0) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      for (const item of list) await findOne(item.category, item.replaceId);
      await onChanged();
    } catch {
      setError("처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="rounded-xl bg-card p-4 ring-1 ring-border lg:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Search className="size-[18px] text-subtle-foreground" /> 논문 찾기
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        내과·외과·영상·응급 분야마다 최근 {RECENT_DAYS}일 안에 나온 논문을 1건씩 찾아 한국어 카드로 요약해요. 수의학 논문을 먼저 찾고, 맞는 게 없을 때만 사람 의학 논문을 써요. 검수 없이 그날 08:30에 발행돼요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="finder-date" className="text-[13px] font-semibold text-subtle-foreground">
          발행 날짜
        </label>
        <input
          id="finder-date"
          type="date"
          value={target}
          min={today}
          disabled={working}
          onChange={(e) => setDate(e.target.value || null)}
          className="h-10 rounded-lg border border-input bg-background px-3 text-[15px] font-semibold tabular-nums"
        />
        <span className={cn("text-[13px]", problem ? "font-semibold text-status-late" : "text-muted-foreground")}>{problem || `${formatIssueDate(target)} 08:30에 나가요.`}</span>
        {date !== null && date !== defaultDate && (
          <button type="button" className="text-[13px] font-semibold text-primary hover:underline" disabled={working} onClick={() => setDate(null)}>
            다음 빈 날짜로
          </button>
        )}
      </div>

      <ul className="mt-3 overflow-hidden rounded-xl ring-1 ring-border">
        {FIND_CATEGORIES.map((c, i) => {
          const row = loadedFor === target ? rows[c] : ({ state: "empty" } as Row);
          return (
            <li key={c} className={cn("flex items-start gap-3 px-3.5 py-3", i > 0 && "border-t border-border")}>
              <span className="mt-0.5 w-12 shrink-0 text-[13px] font-bold text-subtle-foreground">{CATEGORY_LABEL[c].ko.replace("·중환자", "")}</span>
              <span className="min-w-0 flex-1">
                {row.state === "empty" && <span className="text-[13px] text-muted-foreground">아직 없어요</span>}
                {row.state === "working" && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-status-doing">
                    <Loader2 className="size-4 animate-spin" /> 논문을 찾고 요약하는 중… (30초쯤 걸려요)
                  </span>
                )}
                {row.state === "failed" && (
                  <span className="inline-flex items-start gap-1.5 text-[13px] font-medium text-status-late">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {row.error}
                  </span>
                )}
                {row.state === "done" && (
                  <>
                    <span className="flex items-start gap-1.5 text-sm font-semibold">
                      {row.ready ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-done" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-status-ask" />}
                      <span className="min-w-0">{row.headline ?? "(제목 없음)"}</span>
                    </span>
                    {row.detail && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {row.detail}
                        {row.url && (
                          <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
                            원문 <ExternalLink className="size-3" />
                          </a>
                        )}
                      </span>
                    )}
                    {row.reason && <span className="mt-0.5 block text-xs text-subtle-foreground">고른 이유: {row.reason}</span>}
                    {!row.ready && <span className="mt-0.5 block text-xs font-medium text-status-ask">AI 없이 시험 모드로 만들어 발행되지 않아요(검수 전으로 남아요).</span>}
                  </>
                )}
              </span>
              {(row.state === "done" || row.state === "failed") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                  disabled={working || !!problem}
                  onClick={() => runAll([{ category: c, replaceId: row.paperId }])}
                >
                  <RefreshCw className="size-3.5" /> {row.state === "done" ? "다른 논문" : "다시"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-status-late">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button className="h-11 rounded-xl px-5 text-[15px] font-bold" disabled={working || !!problem || loadedFor !== target || missing.length === 0} onClick={() => runAll(missing.map((category) => ({ category })))}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
          {busy ? "찾는 중…" : missing.length === FIND_CATEGORIES.length ? "4개 분야 논문 찾기" : missing.length > 0 ? `남은 ${missing.length}개 분야 찾기` : "모두 찾았어요"}
        </Button>
        <span className="text-[13px] text-muted-foreground">PubMed에 등록된 논문만 고르고, 출처는 PubMed 정보 그대로 적어요.</span>
      </div>
    </section>
  );
}
