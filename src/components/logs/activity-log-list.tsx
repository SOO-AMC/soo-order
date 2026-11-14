"use client";

import { useState, useCallback, useRef } from "react";
import { History, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { SavedViews } from "@/components/workspace/saved-views";
import { FilterBar, SearchField } from "@/components/workspace/filter-bar";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { PeriodPicker } from "@/components/workspace/period-picker";
import { kstToday, type DateRange } from "@/lib/utils/period";
import { formatDateTime } from "@/lib/utils/format";

interface ActivityLog {
  id: string;
  user_name: string;
  category: string;
  action: string;
  description: string;
  created_at: string;
}

type Category = "all" | "auth" | "order" | "dispatch" | "inspection" | "return" | "account" | "price" | "blood";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "order", label: "주문" },
  { value: "dispatch", label: "발주" },
  { value: "inspection", label: "검수" },
  { value: "return", label: "반품" },
  { value: "blood", label: "혈액" },
  { value: "price", label: "가격비교" },
  { value: "account", label: "계정" },
  { value: "auth", label: "로그인" },
];

/** 분류 이름 — 예전 인사(leave) 기록도 이름은 보여 준다 */
const CATEGORY_LABEL: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.filter((c) => c.value !== "all").map((c) => [c.value, c.label])),
  leave: "인사",
};

const PAGE = 50;

interface ActivityLogListProps {
  initialData: ActivityLog[];
}

/** 활동 로그 (관리자). 누가 언제 무엇을 했는지 — 분류 보기 · 설명 검색 · 기간 · 50건씩 더 보기 */
export function ActivityLogList({ initialData }: ActivityLogListProps) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialData);
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>({ start: "", end: "" });
  const [today] = useState(kstToday);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.length === PAGE);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const supabase = createClient();

  const fetchLogs = useCallback(
    async (opts?: { cat?: Category; q?: string; range?: DateRange; cursor?: string }) => {
      setIsLoading(true);
      const cat = opts?.cat ?? category;
      const q = opts?.q ?? search;
      const r = opts?.range ?? range;

      let query = supabase
        .from("activity_logs")
        .select("id, user_name, category, action, description, created_at")
        .order("created_at", { ascending: false });

      if (cat !== "all") query = query.eq("category", cat);
      if (q.trim()) query = query.ilike("description", `%${q.trim()}%`);
      if (r.start) query = query.gte("created_at", `${r.start}T00:00:00+09:00`);
      if (r.end) query = query.lte("created_at", `${r.end}T23:59:59+09:00`);
      if (opts?.cursor) query = query.lt("created_at", opts.cursor);
      query = query.limit(PAGE);

      const { data } = await query;
      const newLogs = (data as ActivityLog[]) ?? [];

      if (opts?.cursor) setLogs((prev) => [...prev, ...newLogs]);
      else setLogs(newLogs);

      setHasMore(newLogs.length === PAGE);
      setIsLoading(false);
    },
    [supabase, category, search, range]
  );

  const changeCategory = (value: Category) => {
    setCategory(value);
    fetchLogs({ cat: value });
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs({ q: value }), 400);
  };

  const changeRange = (r: DateRange) => {
    setRange(r);
    // 직접 입력 중 한쪽만 바뀐 상태여도 그대로 조회(빈 칸은 제한 없음)
    fetchLogs({ range: r });
  };

  return (
    <>
      <PageHeader
        title="활동 로그"
        description={<span className="hidden sm:inline">누가 언제 무엇을 했는지</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
      />

      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-6xl lg:px-6">
        <SavedViews<Category> value={category} onValueChange={changeCategory} views={CATEGORIES} ariaLabel="분류" />
        <FilterBar>
          <SearchField id="log-search" value={search} onChange={changeSearch} placeholder="설명 검색 (품목·이름 등)" />
        </FilterBar>
        <PeriodPicker value={range} onChange={changeRange} today={today} presets={["thisMonth", "lastMonth", "last3", "all"]} idPrefix="log" />

        {isLoading && logs.length === 0 ? (
          <ListSkeleton rows={10} />
        ) : logs.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState icon={History} title="조건에 맞는 기록이 없어요" description="분류·검색어·기간을 바꿔 보세요." />
          </div>
        ) : (
          <>
            {/* PC 표 */}
            <section className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-border lg:block">
              <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-muted-foreground">
                    <th className="w-44 border-b border-border bg-muted py-2 pl-4 font-semibold">시간</th>
                    <th className="w-28 border-b border-border bg-muted px-3 py-2 font-semibold">사람</th>
                    <th className="w-24 border-b border-border bg-muted px-3 py-2 font-semibold">분류</th>
                    <th className="border-b border-border bg-muted px-3 py-2 pr-4 font-semibold">한 일</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/60">
                      <td className="whitespace-nowrap border-b border-border py-2.5 pl-4 tabular-nums text-subtle-foreground">{formatDateTime(log.created_at)}</td>
                      <td className="truncate border-b border-border px-3 py-2.5 font-semibold">{log.user_name}</td>
                      <td className="border-b border-border px-3 py-2.5">
                        <CategoryTag category={log.category} />
                      </td>
                      <td className="border-b border-border px-3 py-2.5 pr-4 text-sm">{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* 모바일 */}
            <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border lg:hidden">
              {logs.map((log, i) => (
                <div key={log.id} className={cn("px-4 py-3", i > 0 && "border-t border-border")}>
                  <div className="flex items-center gap-2">
                    <CategoryTag category={log.category} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{log.user_name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(log.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-subtle-foreground">{log.description}</p>
                </div>
              ))}
            </section>

            <div className="flex items-center justify-between px-1">
              <span className="text-[13px] tabular-nums text-muted-foreground">{logs.length}건 표시</span>
              {hasMore && (
                <Button
                  variant="outline"
                  className="h-9 rounded-lg"
                  onClick={() => fetchLogs({ cursor: logs[logs.length - 1]?.created_at })}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="size-4 animate-spin" />}
                  {isLoading ? "불러오는 중…" : `${PAGE}건 더 보기`}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** 분류 배지 — 상태색은 상태에만 쓰므로 분류는 차분한 회색 하나 */
function CategoryTag({ category }: { category: string }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-secondary px-2 text-xs font-semibold text-subtle-foreground">
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}
