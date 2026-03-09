"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/utils/format";

interface ActivityLog {
  id: string;
  user_name: string;
  category: string;
  action: string;
  description: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "all", label: "전체" },
  { value: "auth", label: "인증" },
  { value: "order", label: "주문" },
  { value: "dispatch", label: "발주" },
  { value: "inspection", label: "검수" },
  { value: "return", label: "반품" },
  { value: "account", label: "계정" },
  { value: "price", label: "가격비교" },
  { value: "blood", label: "혈액" },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  auth: "bg-blue-100 text-blue-700",
  order: "bg-green-100 text-green-700",
  dispatch: "bg-purple-100 text-purple-700",
  inspection: "bg-amber-100 text-amber-700",
  return: "bg-orange-100 text-orange-700",
  account: "bg-slate-100 text-slate-700",
  price: "bg-pink-100 text-pink-700",
  blood: "bg-red-100 text-red-700",
};

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.value !== "all").map((c) => [c.value, c.label])
);

interface ActivityLogListProps {
  initialData: ActivityLog[];
}

export function ActivityLogList({ initialData }: ActivityLogListProps) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialData);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialData.length === 50);
  const supabase = createClient();

  const fetchLogs = useCallback(
    async (opts?: { cat?: string; q?: string; from?: string; to?: string; cursor?: string }) => {
      setIsLoading(true);
      const cat = opts?.cat ?? category;
      const q = opts?.q ?? search;
      const from = opts?.from ?? dateFrom;
      const to = opts?.to ?? dateTo;

      let query = supabase
        .from("activity_logs")
        .select("id, user_name, category, action, description, created_at")
        .order("created_at", { ascending: false });

      if (cat !== "all") query = query.eq("category", cat);
      if (q.trim()) query = query.ilike("description", `%${q.trim()}%`);
      if (from) query = query.gte("created_at", `${from}T00:00:00+09:00`);
      if (to) query = query.lte("created_at", `${to}T23:59:59+09:00`);
      if (opts?.cursor) query = query.lt("created_at", opts.cursor);
      query = query.limit(50);

      const { data } = await query;
      const newLogs = (data as ActivityLog[]) ?? [];

      if (opts?.cursor) {
        setLogs((prev) => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setHasMore(newLogs.length === 50);
      setIsLoading(false);
    },
    [supabase, category, search, dateFrom, dateTo]
  );

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    fetchLogs({ cat: value });
  };

  const handleSearch = () => {
    fetchLogs();
  };

  const handleDateChange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    fetchLogs({ from, to });
  };

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">활동 로그</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* 검색 + 날짜 필터 */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="설명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 bg-card"
            />
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateChange(e.target.value, dateTo)}
              className="w-36 bg-card"
            />
            <span className="flex items-center text-muted-foreground">~</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateChange(dateFrom, e.target.value)}
              className="w-36 bg-card"
            />
          </div>
        </div>

        {/* 카테고리 탭 */}
        <Tabs value={category} onValueChange={handleCategoryChange}>
          <TabsList className="w-full overflow-x-auto justify-start">
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat.value} value={cat.value}>
                {cat.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner text="불러오는 중..." />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">활동 로그가 없습니다.</p>
          </div>
        ) : (
          <>
            {/* PC 테이블 뷰 */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">시간</TableHead>
                    <TableHead className="w-24">사용자</TableHead>
                    <TableHead className="w-24">카테고리</TableHead>
                    <TableHead>설명</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.user_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={CATEGORY_COLORS[log.category] ?? ""}
                        >
                          {CATEGORY_LABEL[log.category] ?? log.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{log.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 모바일 카드 뷰 */}
            <div className="lg:hidden space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl bg-card p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={CATEGORY_COLORS[log.category] ?? ""}
                      >
                        {CATEGORY_LABEL[log.category] ?? log.category}
                      </Badge>
                      <span className="font-medium text-sm">
                        {log.user_name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {log.description}
                  </p>
                </div>
              ))}
            </div>

            {/* 더보기 */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => fetchLogs({ cursor: logs[logs.length - 1]?.created_at })}
                  disabled={isLoading}
                >
                  {isLoading ? "불러오는 중..." : "더보기"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
