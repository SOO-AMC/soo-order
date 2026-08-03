"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeaveCalendar } from "@/components/leave/leave-calendar";
import { LeaveTable } from "@/components/leave/leave-table";
import { LeaveGrid } from "@/components/leave/leave-grid";
import { LeaveRequests } from "@/components/leave/leave-requests";
import { LeaveLogs } from "@/components/leave/leave-logs";
import { LeaveHistory } from "@/components/leave/leave-history";
import { LeaveSettings } from "@/components/leave/leave-settings";
import { fetchLeaveRequestCount } from "@/lib/actions/leave-actions";

export function LeavePage() {
  const { isAdmin, isManager } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reqCount, setReqCount] = useState(0);
  // 설정에서 주기·잠금을 바꾸면 달력을 다시 마운트해 새 주기로 갱신
  const [calendarKey, setCalendarKey] = useState(0);
  const settingsChanged = useRef(false);
  const [tab, setTab] = useState("calendar");

  const refreshCount = useCallback(() => {
    fetchLeaveRequestCount().then(setReqCount);
  }, []);

  useEffect(() => {
    const t = setTimeout(refreshCount, 0);
    return () => clearTimeout(t);
  }, [refreshCount]);

  return (
    <div
      className={cn(
        "mx-auto max-w-md md:max-w-2xl",
        // 엑셀형 연차현황은 열이 많아 PC에서 폭을 넓게 씀
        tab === "grid" ? "lg:max-w-[1600px]" : "lg:max-w-4xl",
      )}
    >
      <header className="sticky top-[var(--page-top)] z-40 flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">연차</h1>
        {isManager && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => setSettingsOpen(true)}
            aria-label="연차 설정"
          >
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </header>

      <div className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="calendar">연차종합</TabsTrigger>
            <TabsTrigger value="table">연차표</TabsTrigger>
            <TabsTrigger value="requests">
              <span className="inline-flex items-center gap-1.5">
                수정요청
                {reqCount > 0 && (
                  <span className={cn(
                    "flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white",
                  )}>
                    {reqCount > 99 ? "99+" : reqCount}
                  </span>
                )}
              </span>
            </TabsTrigger>
            {isAdmin && <TabsTrigger value="grid">연차현황</TabsTrigger>}
            {isAdmin && <TabsTrigger value="logs">로그</TabsTrigger>}
            {isAdmin && <TabsTrigger value="history">이력</TabsTrigger>}
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <LeaveCalendar key={calendarKey} />
          </TabsContent>

          <TabsContent value="table" className="mt-4">
            <LeaveTable />
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            <LeaveRequests onChanged={refreshCount} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="grid" className="mt-4">
              <LeaveGrid />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="logs" className="mt-4">
              <LeaveLogs />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="history" className="mt-4">
              <LeaveHistory />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {isManager && (
        <LeaveSettings
          open={settingsOpen}
          onOpenChange={(o) => {
            setSettingsOpen(o);
            if (!o && settingsChanged.current) {
              settingsChanged.current = false;
              setCalendarKey((k) => k + 1);
            }
          }}
          onChanged={() => {
            settingsChanged.current = true;
          }}
        />
      )}
    </div>
  );
}
