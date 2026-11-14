"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, ChevronRight, CircleAlert, ExternalLink, Loader2, Send, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  cancelSchedule,
  fetchPublishPanel,
  publishIssueNow,
  scheduleIssue,
  unpublishIssue,
  type PublishPanelData,
} from "@/lib/actions/briefing-publish-actions";
import { formatIssueDate, formatKstDateTime, isPastPublishTime } from "@/lib/briefing/kst";
import type { PublishCheck } from "@/lib/briefing/publish-rules";
import { describeLog } from "@/components/briefing/admin/log-text";
import { MAX_PAPERS, MIN_PAPERS, type BriefingIssue, type IssueStatus } from "@/lib/briefing/types";

/**
 * 발행 패널 (관리자 작업 화면 왼쪽 아래).
 * 초안 → 08:30 예약 → 발행 완료. 조건(검수 완료 3~4건)이 안 맞으면 버튼 대신 이유를 보여 준다.
 * 알림 상태는 발행 상태와 따로 보여 준다. 네이버웍스는 보낼 내용 미리보기만(전송 안 함).
 */
export function PublishPanel({
  issue,
  issueDate,
  status,
  publish,
  paperCount,
  papersKey,
  disabled,
  onIssueChange,
}: {
  issue: BriefingIssue | null;
  issueDate: string;
  /** 화면에 보여 줄 상태 (예약 뒤 조건이 깨지면 초안으로 보인다) */
  status: IssueStatus;
  publish: PublishCheck;
  paperCount: number;
  /** 논문 구성이 바뀌면 달라지는 값 — 미리보기를 다시 받는 신호 */
  papersKey: string;
  disabled: boolean;
  onIssueChange: (issue: BriefingIssue) => void;
}) {
  const [panel, setPanel] = useState<PublishPanelData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; reasons?: string[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pastTime] = useState(() => isPastPublishTime(issueDate));
  const issueId = issue?.id ?? null;

  useEffect(() => {
    if (!issueId) return;
    let active = true;
    fetchPublishPanel(issueId)
      .then((d) => active && setPanel(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [issueId, status, papersKey]);

  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError(null);
    setNotice("");
    try {
      await fn();
    } catch {
      setError({ message: "처리하지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const handleSchedule = () =>
    run("schedule", async () => {
      if (!issueId) return;
      const res = await scheduleIssue(issueId);
      if (!res.ok) return setError({ message: res.error, reasons: res.reasons });
      onIssueChange(res.data);
      setNotice(`${formatIssueDate(res.data.issue_date)} 08:30에 발행돼요.`);
    });
  const handleCancel = () =>
    run("cancel", async () => {
      if (!issueId) return;
      const res = await cancelSchedule(issueId);
      if (!res.ok) return setError({ message: res.error });
      onIssueChange(res.data);
      setNotice("예약을 취소했어요.");
    });
  const handlePublish = () =>
    run("publish", async () => {
      if (!issueId) return;
      const res = await publishIssueNow(issueId);
      if (!res.ok) return setError({ message: res.error, reasons: res.reasons });
      onIssueChange(res.data.issue);
      const internal = res.data.deliveries.find((d) => d.channel === "internal");
      setNotice(
        internal?.outcome === "sent"
          ? `발행했어요. 직원 ${internal.recipients ?? 0}명에게 알림을 보냈어요.`
          : internal?.outcome === "mock"
            ? "발행했어요. 테스트 모드라 직원 알림은 보내지 않고 기록만 남겼어요."
            : internal?.outcome === "failed"
              ? "발행했어요. 직원 알림은 실패했어요 — 아래 기록을 확인해 주세요."
              : "발행했어요. 이 날짜 알림은 이미 나간 적이 있어 다시 보내지 않았어요."
      );
    });
  const handleUnpublish = () =>
    run("unpublish", async () => {
      if (!issueId) return;
      const res = await unpublishIssue(issueId);
      if (!res.ok) return setError({ message: res.error });
      onIssueChange(res.data);
      setNotice("발행을 취소했어요. 직원 화면에서 사라졌어요.");
    });

  const off = disabled || !!busy;
  const logs = panel?.logs ?? [];

  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      {/* 상태 한 줄 */}
      {status === "published" ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-status-done">
          <CheckCircle2 className="size-[18px]" /> 발행 완료
          {issue?.published_at && <span className="font-medium tabular-nums text-muted-foreground">· {formatKstDateTime(issue.published_at)}</span>}
        </p>
      ) : status === "scheduled" ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-status-doing">
          <CalendarClock className="size-[18px]" /> 발행 예약됨
          <span className="font-medium tabular-nums text-muted-foreground">· {formatIssueDate(issueDate)} 08:30 (한국시간)</span>
        </p>
      ) : publish.ok ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-status-done">
          <CheckCircle2 className="size-[18px]" /> 발행 준비 완료 — 논문 {publish.paperCount}건 = 카드 {publish.paperCount}장
        </p>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-sm font-bold text-subtle-foreground">
            <CircleAlert className="size-[18px]" /> 발행 준비 중 — 지금 {paperCount}건 (하루 {MIN_PAPERS}~{MAX_PAPERS}건)
          </p>
          <ul className="mt-1.5 grid gap-0.5 pl-6 text-[13px] text-subtle-foreground">
            {publish.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}

      {/* 할 수 있는 일 */}
      {status === "published" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 rounded-lg">
            <Link href={pastTime ? "/briefing/archive" : "/briefing"}>
              <ExternalLink className="size-4" /> 직원 화면에서 보기
            </Link>
          </Button>
          <Button variant="outline" className="h-10 rounded-lg text-status-late hover:bg-status-late-bg hover:text-status-late" disabled={!!busy} onClick={() => setConfirm("unpublish")}>
            <Undo2 className="size-4" /> 발행 취소
          </Button>
        </div>
      ) : status === "scheduled" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 rounded-lg" disabled={off} onClick={handleCancel}>
            {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />} 예약 취소
          </Button>
          <Button variant="outline" className="h-10 rounded-lg" disabled={off} onClick={() => setConfirm("publish")}>
            <Send className="size-4" /> 지금 발행
          </Button>
        </div>
      ) : publish.ok ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="h-11 flex-1 rounded-xl font-bold" disabled={off || pastTime} onClick={handleSchedule}>
            {busy === "schedule" ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            {pastTime ? "08:30이 지났어요" : `${formatIssueDate(issueDate)} 08:30 발행 예약`}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" disabled={off} onClick={() => setConfirm("publish")}>
            <Send className="size-4" /> 지금 발행
          </Button>
        </div>
      ) : null}
      {status === "published" && <p className="mt-2 text-xs text-muted-foreground">발행된 논문은 고칠 수 없어요. 고치려면 발행을 취소한 뒤 고치고 다시 발행해 주세요.</p>}

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-status-late-bg px-3 py-2.5 text-sm text-status-late">
          <p className="font-medium">{error.message}</p>
          {error.reasons && (
            <ul className="mt-1 grid gap-0.5 pl-4 text-[13px]">
              {error.reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-lg bg-status-doing-bg px-3 py-2.5 text-[13px] font-medium text-status-doing">
          {notice}
        </p>
      )}

      {/* 알림 상태 — 발행 상태와 따로 */}
      {panel && (
        <div className="mt-3 border-t border-border pt-3 text-[13px]">
          <p className="font-semibold text-subtle-foreground">알림</p>
          {logs.length === 0 ? (
            <p className="mt-1 text-muted-foreground">
              {panel.config.internalLive ? "발행하면 직원 알림함에 알림 1건이 가요." : "지금은 테스트 모드예요. 발행해도 직원 알림함에는 넣지 않고 기록만 남겨요."} 네이버웍스는 아직 연결하지 않았어요.
            </p>
          ) : (
            <ul className="mt-1 grid gap-1">
              {logs.map((l) => {
                const d = describeLog(l);
                return (
                  <li key={l.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{d.label}</span>
                    <span className={cn(d.bad ? "font-medium text-status-late" : "text-muted-foreground")}>{d.text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {panel.naverWorksPreview && (
            <>
              <button
                type="button"
                onClick={() => setPreviewOpen((v) => !v)}
                aria-expanded={previewOpen}
                className="mt-2 inline-flex items-center gap-1 font-semibold text-subtle-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-4 transition-transform", previewOpen && "rotate-90")} />
                네이버웍스 메시지 미리보기 (전송 안 함)
              </button>
              {previewOpen && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">
                    논문 {panel.naverWorksPreview.itemCount}건을 메시지 {panel.naverWorksPreview.messageCount}건에 묶어요. 연결 전이라 실제로는 보내지 않아요.
                  </p>
                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted px-3 py-2.5 font-sans text-[13px] leading-[1.6] [overflow-wrap:anywhere]">{panel.naverWorksPreview.text}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "unpublish" ? "발행을 취소할까요?" : "지금 발행할까요?"}</DialogTitle>
            <DialogDescription>
              {confirm === "unpublish"
                ? "직원 화면과 라운딩 화면에서 바로 사라져요. 이미 나간 알림은 되돌릴 수 없고, 다시 발행해도 이 날짜 알림은 또 나가지 않아요."
                : `논문 ${publish.ok ? publish.paperCount : paperCount}건이 직원에게 바로 보여요. ${
                    panel?.config.internalLive ? "직원 알림함에 알림 1건이 가요." : "테스트 모드라 직원 알림은 보내지 않고 기록만 남겨요."
                  } 네이버웍스로는 보내지 않아요.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
            {confirm === "unpublish" ? (
              <Button variant="destructive" onClick={handleUnpublish} disabled={!!busy}>
                {busy === "unpublish" ? "취소하는 중…" : "발행 취소"}
              </Button>
            ) : (
              <Button onClick={handlePublish} disabled={!!busy}>
                {busy === "publish" ? "발행하는 중…" : "지금 발행"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
