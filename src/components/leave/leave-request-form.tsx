"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  REQUEST_TYPE_LABEL,
  type DayPortion,
  type LeaveType,
  type LeaveDetailEntry,
  type RequestType,
} from "@/lib/types/leave";
import { createLeaveRequest, fetchActiveLeaveTypes, fetchLeaveDetail } from "@/lib/actions/leave-actions";

const REQUEST_TYPES: RequestType[] = ["add", "modify", "delete"];

function fmtMD(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export function LeaveRequestForm({
  open,
  onOpenChange,
  prefill,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill?: {
    requestType?: RequestType;
    targetEntryId?: string;
    leaveDate?: string;
  };
  onDone?: () => void;
}) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [myEntries, setMyEntries] = useState<LeaveDetailEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [requestType, setRequestType] = useState<RequestType>(prefill?.requestType ?? "add");
  const [targetEntryId, setTargetEntryId] = useState(prefill?.targetEntryId ?? "");
  const [leaveDate, setLeaveDate] = useState(prefill?.leaveDate ?? "");
  const [typeId, setTypeId] = useState("");
  const [portion, setPortion] = useState<DayPortion>("full");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([fetchActiveLeaveTypes(), fetchLeaveDetail()]).then(([t, d]) => {
      if (!active) return;
      setTypes(t.types);
      setMyEntries(d.detail?.entries ?? []);
      setTypeId((prev) => prev || t.types[0]?.id || "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const res = await createLeaveRequest({
      requestType,
      targetEntryId: requestType === "add" ? undefined : targetEntryId,
      leaveDate: requestType === "delete" ? undefined : leaveDate,
      leaveTypeId: requestType === "delete" ? undefined : typeId,
      dayPortion: requestType === "delete" ? undefined : portion,
      reason,
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone?.();
    onOpenChange(false);
  };

  const needsTarget = requestType === "modify" || requestType === "delete";
  const needsDesired = requestType === "add" || requestType === "modify";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="px-4 pb-0">
          <SheetTitle>연차 수정요청</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-6">
            {/* 요청 종류 */}
            <div className="flex rounded-lg bg-muted p-0.5">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setRequestType(t)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${
                    requestType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {REQUEST_TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            {/* 대상 연차 (변경/취소) */}
            {needsTarget && (
              <div className="space-y-1.5">
                <Label>대상 연차</Label>
                {myEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 연차가 없습니다.</p>
                ) : (
                  <Select value={targetEntryId} onValueChange={setTargetEntryId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="연차 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {myEntries.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {fmtMD(e.leave_date)} {e.type_name}
                          {e.day_portion !== "full" && ` (${e.day_portion === "am" ? "오전반차" : "오후반차"})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* 희망 값 (추가/변경) */}
            {needsDesired && (
              <>
                <div className="space-y-1.5">
                  <Label>{requestType === "modify" ? "변경할 날짜" : "희망 날짜"}</Label>
                  <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Select value={typeId} onValueChange={setTypeId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="유형" />
                    </SelectTrigger>
                    <SelectContent>
                      {types.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={portion} onValueChange={(v) => setPortion(v as DayPortion)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">종일</SelectItem>
                      <SelectItem value="am">오전반차</SelectItem>
                      <SelectItem value="pm">오후반차</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* 사유 */}
            <div className="space-y-1.5">
              <Label>사유</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="요청 사유를 적어주세요"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              onClick={submit}
              disabled={
                submitting ||
                !reason.trim() ||
                (needsTarget && !targetEntryId) ||
                (needsDesired && (!leaveDate || !typeId))
              }
              className="w-full"
            >
              요청 보내기
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
