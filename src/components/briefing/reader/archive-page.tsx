"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ClearFilters, FilterBar, FilterChip, SearchField } from "@/components/workspace/filter-bar";
import { EmptyState, ListSkeleton } from "@/components/workspace/feedback";
import { PaperRow } from "@/components/briefing/reader/reader-parts";
import { searchBriefing, type ReaderIssue } from "@/lib/actions/briefing-reader-actions";
import { addDays, formatIssueDate } from "@/lib/briefing/kst";
import { CATEGORY_KEYS, CATEGORY_LABEL, type CategoryKey } from "@/lib/briefing/schema";

type Period = "7" | "30" | "90";
const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
];
const CATEGORY_OPTIONS = CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABEL[k].ko }));

/**
 * 지난 브리핑 · 검색 (전 직원).
 * 날짜별로 묶어 보여 준다. 검색은 요약문 본문·제목·DOI·링크에서 찾는다.
 * 발행된 논문만 나온다.
 */
export function ArchivePage({ initial, today }: { initial: ReaderIssue[]; today: string }) {
  const [issues, setIssues] = useState(initial);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    // 처음 한 번은 서버에서 받은 목록을 그대로 쓴다
    if (first.current) {
      first.current = false;
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      searchBriefing({ q, category, from: period ? addDays(today, -(Number(period) - 1)) : null })
        .then((res) => {
          if (!active) return;
          setIssues(res);
          setFailed(false);
        })
        .catch(() => active && setFailed(true))
        .finally(() => active && setLoading(false));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, category, period, today]);

  const filtered = q.trim() !== "" || category !== null || period !== null;
  const count = issues.reduce((n, i) => n + i.papers.length, 0);

  return (
    <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
      <FilterBar>
        <SearchField value={q} onChange={setQ} placeholder="질환명·약물명·제목·저널·DOI로 찾기" className="flex-[1_1_100%] sm:flex-[1_1_260px]" />
        <FilterChip label="분야" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <FilterChip label="기간" options={PERIODS} value={period} onChange={setPeriod} />
        <ClearFilters
          show={filtered}
          onClear={() => {
            setQ("");
            setCategory(null);
            setPeriod(null);
          }}
        />
      </FilterBar>

      {filtered && !loading && !failed && (
        <p className="px-1 text-[13px] text-muted-foreground" role="status">
          논문 <b className="font-semibold tabular-nums text-foreground">{count}건</b>을 찾았어요
        </p>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : failed ? (
        <div className="rounded-2xl bg-card ring-1 ring-border">
          <EmptyState title="불러오지 못했어요" description="잠시 뒤 다시 시도해 주세요." />
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-2xl bg-card ring-1 ring-border">
          <EmptyState
            icon={Search}
            title={filtered ? "찾는 논문이 없어요" : "아직 발행된 브리핑이 없어요"}
            description={filtered ? "검색어를 줄이거나 필터를 지워 보세요." : "첫 브리핑이 발행되면 여기에 날짜별로 쌓여요."}
          />
        </div>
      ) : (
        issues.map((issue) => (
          <section key={issue.id}>
            <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-subtle-foreground">
              <span className="tabular-nums">{formatIssueDate(issue.issue_date)}</span>
              {issue.issue_date === today && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">오늘</span>}
              <span className="font-medium text-muted-foreground">논문 {issue.papers.length}건</span>
            </h2>
            <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              {issue.papers.map((p, i) => (
                <div key={p.id} className={i > 0 ? "border-t border-border" : undefined}>
                  <PaperRow paper={p} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
