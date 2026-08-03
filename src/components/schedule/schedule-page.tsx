"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Pencil, Printer, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fetchSchedule } from "@/lib/actions/schedule-actions";
import { composeDay, groupByTeam, type CellPerson } from "@/lib/utils/schedule-compose";
import { ScheduleEditor } from "@/components/schedule/schedule-editor";
import { SchedulePrint } from "@/components/schedule/schedule-print";
import { ScheduleRoster } from "@/components/schedule/schedule-roster";
import type { Team } from "@/lib/utils/team";
import type { ScheduleMonthData } from "@/lib/types/schedule";

const TEAM_TABS: { key: string; label: string; pos: string | null }[] = [
  { key: "all", label: "전체", pos: null },
  { key: "vet", label: "수의사", pos: "veterinarian" },
  { key: "intern_vet", label: "인턴수의사", pos: "intern_vet" },
  { key: "tech", label: "간호", pos: "technician" },
  { key: "radiologist", label: "방사선사", pos: "radiologist" },
  { key: "manager", label: "매니저", pos: "manager" },
  { key: "admin", label: "행정", pos: "admin_staff" },
];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TEAM_SHORT: Record<Team, string> = { vet: "수의사", intern_vet: "인턴", manager: "매니저", tech: "간호" };
const pad2 = (n: number) => String(n).padStart(2, "0");

function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function PersonChip({ p, isMe }: { p: CellPerson; isMe: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-sm",
        p.surgery
          ? "bg-yellow-100 text-yellow-900"
          : p.pathology
            ? "bg-pink-100 text-pink-900"
            : "bg-muted text-foreground",
        p.pathology && p.surgery && "ring-1 ring-pink-400",
        isMe && "font-bold ring-2 ring-primary",
      )}
    >
      {p.name}
      {p.tag && <span className="ml-0.5 text-xs opacity-70">({p.tag})</span>}
    </span>
  );
}

function PeopleByTeam({
  people,
  userId,
  highlightId,
}: {
  people: CellPerson[];
  userId: string;
  highlightId?: string | null;
}) {
  const groups = groupByTeam(people);
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.team ?? "none"} className="flex gap-2">
          <span className="w-12 shrink-0 pt-1 text-[10px] font-semibold text-muted-foreground">
            {g.team ? TEAM_SHORT[g.team] : "기타"}
          </span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {g.people.map((p) => (
              <PersonChip
                key={p.user_id}
                p={p}
                isMe={p.user_id === userId || (!!highlightId && p.user_id === highlightId)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SchedulePage() {
  const { userId, isAdmin, isTeamManager, isManager, position } = useAuth();
  const [ym, setYm] = useState(() => kstToday().slice(0, 7));
  const [editOpen, setEditOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [teamKey, setTeamKey] = useState("all");
  const [data, setData] = useState<ScheduleMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => kstToday());
  const [view, setView] = useState<"day" | "month">("day");
  const [highlightId] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("person"),
  );

  const load = useCallback(() => {
    let active = true;
    fetchSchedule(ym).then((res) => {
      if (!active) return;
      if (res.error) {
        setError(res.error);
        setData(null);
      } else if (res.data) {
        setError(null);
        setData(res.data);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ym]);

  useEffect(() => load(), [load]);

  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = useMemo(() => new Date(y, m, 0).getDate(), [y, m]);
  const dates = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`),
    [y, m, daysInMonth],
  );

  const selInMonth = selectedDate.startsWith(ym) ? selectedDate : dates[0];
  const today = kstToday();

  const teamTab = TEAM_TABS.find((t) => t.key === teamKey) ?? TEAM_TABS[0];
  // 이 탭을 편집할 수 있는지: 전체관리자=모든 탭, 팀관리자=본인 직책 탭만
  const canEditTab = isAdmin || (isTeamManager && teamTab.pos !== null && teamTab.pos === position);
  const filteredData = useMemo<ScheduleMonthData | null>(() => {
    if (!data) return null;
    if (teamKey === "all") return data;
    return { ...data, members: data.members.filter((m) => m.position === teamTab.pos) };
  }, [data, teamKey, teamTab.pos]);

  const comp = useMemo(() => (filteredData ? composeDay(filteredData, selInMonth) : null), [filteredData, selInMonth]);
  const selObj = new Date(selInMonth + "T00:00:00");

  // 달력 뷰용 일별 요약
  const monthSummary = useMemo(() => {
    const map = new Map<string, { counts: Record<string, number>; off: number; surgery: boolean; pathology: boolean }>();
    if (!filteredData) return map;
    for (const d of dates) {
      const c = composeDay(filteredData, d);
      const counts: Record<string, number> = {};
      let surgery = false;
      let pathology = false;
      for (const g of c.groups) {
        counts[g.shift.id] = g.people.length;
        if (g.people.some((p) => p.surgery)) surgery = true;
        if (g.people.some((p) => p.pathology)) pathology = true;
      }
      map.set(d, { counts, off: c.off.length, surgery, pathology });
    }
    return map;
  }, [filteredData, dates]);

  const leadingBlanks = new Date(y, m - 1, 1).getDay();

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-6xl">
      <header className="sticky top-[var(--page-top)] z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md print:hidden">
        <CalendarRange className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">근무표</h1>
        <div className="ml-auto flex items-center gap-1">
          {isManager && (
            <Button variant="ghost" size="icon" onClick={() => setRosterOpen(true)} aria-label="명단">
              <Users className="h-5 w-5" />
            </Button>
          )}
          {data && (
            <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="인쇄">
              <Printer className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-3 p-4 print:hidden">
        {/* 월 네비 */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setYm(addMonth(ym, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <p className="text-lg font-bold tracking-tight">
            {y}년 {m}월
          </p>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setYm(addMonth(ym, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* 팀 탭 */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {TEAM_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTeamKey(t.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                teamKey === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 뷰 토글 */}
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["day", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex-1 rounded-md py-1 text-xs font-semibold transition-colors",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {v === "day" ? "일별" : "달력"}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">{error}</div>
        )}

        {/* 달력 뷰 */}
        {!loading && !error && filteredData && view === "month" && (
          <div className="space-y-2 rounded-2xl bg-card p-2 shadow-card">
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: leadingBlanks }).map((_, i) => (
                <div key={`b${i}`} />
              ))}
              {dates.map((d) => {
                const dn = Number(d.slice(8));
                const s = monthSummary.get(d);
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setSelectedDate(d);
                      setView("day");
                    }}
                    className={cn(
                      "flex min-h-[64px] flex-col items-stretch rounded-lg border p-1 text-left transition-colors hover:bg-accent/40",
                      isToday ? "border-primary bg-primary/[0.04]" : "border-border/50 bg-background",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1">
                      <span className={cn("text-[11px] font-bold", isToday && "text-primary")}>{dn}</span>
                      {s?.surgery && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                      {s?.pathology && <span className="h-1.5 w-1.5 rounded-full bg-pink-400" />}
                    </div>
                    <div className="space-y-0.5">
                      {filteredData.shifts.map((sh) => {
                        const c = s?.counts[sh.id] ?? 0;
                        if (!c) return null;
                        return (
                          <div key={sh.id} className="truncate text-[9px] leading-tight text-muted-foreground">
                            {sh.start_time} <span className="font-semibold text-foreground">{c}</span>
                          </div>
                        );
                      })}
                      {s && s.off > 0 && (
                        <div className="text-[9px] leading-tight text-muted-foreground/70">휴 {s.off}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 일별 뷰 */}
        {!loading && !error && filteredData && view === "day" && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {dates.map((d) => {
                const dn = Number(d.slice(8));
                const dow = new Date(d + "T00:00:00").getDay();
                const isSel = d === selInMonth;
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={cn(
                      "flex shrink-0 flex-col items-center rounded-lg px-2.5 py-1.5 transition-colors",
                      isSel ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <span className="text-[10px] leading-none">{WEEKDAYS[dow]}</span>
                    <span className={cn("text-sm font-bold leading-tight", isToday && !isSel && "text-primary")}>
                      {dn}
                    </span>
                  </button>
                );
              })}
            </div>

            {comp && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {selObj.getMonth() + 1}월 {selObj.getDate()}일 ({WEEKDAYS[selObj.getDay()]})
                  </p>
                  {canEditTab && (
                    <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => setEditOpen(true)}>
                      <Pencil className="h-3.5 w-3.5" />
                      편집
                    </Button>
                  )}
                </div>

                {comp.groups.map(({ shift, people }) => (
                  <div key={shift.id} className="rounded-xl bg-card p-3 shadow-card">
                    <div className="mb-2 flex items-baseline gap-2">
                      <span className="text-sm font-bold">{shift.name}</span>
                      <span className="text-xs text-muted-foreground">{shift.start_time}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{people.length}명</span>
                    </div>
                    {people.length === 0 ? (
                      <p className="text-xs text-muted-foreground">배정 없음</p>
                    ) : (
                      <PeopleByTeam people={people} userId={userId} highlightId={highlightId} />
                    )}
                  </div>
                ))}

                <div className="rounded-xl bg-card p-3 shadow-card">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-muted-foreground">휴무</span>
                    <span className="ml-auto text-xs text-muted-foreground">{comp.off.length}명</span>
                  </div>
                  {comp.off.length === 0 ? (
                    <p className="text-xs text-muted-foreground">없음</p>
                  ) : (
                    <PeopleByTeam people={comp.off} userId={userId} highlightId={highlightId} />
                  )}
                </div>

                <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded bg-yellow-200" />
                    술방보조
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded bg-pink-200" />
                    임상병리
                  </span>
                  <span>(연)연차 (반)반차 (특)특근 (휴변)휴무변경 (무)무급 (유)유급</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {canEditTab && filteredData && (
        <ScheduleEditor
          key={`${selInMonth}-${teamKey}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          date={selInMonth}
          data={filteredData}
          onChanged={load}
        />
      )}

      {isManager && <ScheduleRoster open={rosterOpen} onOpenChange={setRosterOpen} onChanged={load} />}

      {filteredData && <SchedulePrint data={filteredData} ym={ym} teamLabel={teamKey === "all" ? "" : teamTab.label} />}
    </div>
  );
}
