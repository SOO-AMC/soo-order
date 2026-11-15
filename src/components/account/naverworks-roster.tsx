"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchNaverWorksRoster, linkNaverWorksMembers, type RosterResult, type RosterRow } from "@/lib/actions/naverworks-admin-actions";
import { POSITION_LABEL, type Position } from "@/lib/types/member";

const STATUS: Record<RosterRow["status"], { label: string; cls: string }> = {
  suggest: { label: "연결 후보", cls: "bg-status-doing-bg text-status-doing" },
  conflict: { label: "확인 필요", cls: "bg-status-late-bg text-status-late" },
  new: { label: "첫 로그인 때 자동 생성", cls: "bg-secondary text-subtle-foreground" },
  skip: { label: "자동 생성 안 함", cls: "bg-secondary text-muted-foreground" },
  linked: { label: "연결됨", cls: "bg-status-done-bg text-status-done" },
};
const pos = (p: string | null) => (p ? POSITION_LABEL[p as Position] ?? p : "—");

/**
 * 네이버웍스 직원 ↔ 수오더 계정 맞추기 (관리자).
 * 이름이 같은 사람을 연결 후보로 보여 주고, 고른 것만 연결한다. 연결하면 그 직원은 비밀번호 없이 "네이버웍스로 로그인"으로 들어온다.
 */
export function NaverWorksRosterDialog({ onClose }: { onClose: (changed?: boolean) => void }) {
  const [data, setData] = useState<RosterResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [changed, setChanged] = useState(false);

  const load = () =>
    fetchNaverWorksRoster()
      .then((r) => {
        setData(r);
        if (r.ready) setPicked(new Set(r.rows.filter((x) => x.status === "suggest" && x.userId && x.nwEmail).map((x) => x.userId!)));
      })
      .catch(() => setData({ ready: false, reason: "failed" }));

  useEffect(() => {
    let active = true;
    fetchNaverWorksRoster()
      .then((r) => {
        if (!active) return;
        setData(r);
        if (r.ready) setPicked(new Set(r.rows.filter((x) => x.status === "suggest" && x.userId && x.nwEmail).map((x) => x.userId!)));
      })
      .catch(() => { if (active) setData({ ready: false, reason: "failed" }); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => (data?.ready ? data.rows : []), [data]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {}), [rows]);

  const link = async () => {
    if (busy) return;
    const pairs = rows.filter((r) => r.userId && r.nwEmail && picked.has(r.userId)).map((r) => ({ userId: r.userId!, email: r.nwEmail! }));
    if (pairs.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await linkNaverWorksMembers(pairs);
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setChanged(true);
      setMessage({ ok: res.failed.length === 0, text: `${res.linked}명을 연결했어요.${res.failed.length ? ` ${res.failed.length}명은 연결하지 못했어요(이미 다른 직원에게 등록된 계정일 수 있어요).` : ""}` });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose(changed)}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>네이버웍스 직원 맞추기</DialogTitle>
          <DialogDescription>이름이 같은 수오더 계정을 연결 후보로 보여 줘요. 연결하면 그 직원은 비밀번호 없이 네이버웍스로 로그인해요. 직책은 로그인할 때마다 네이버웍스 부서에 맞춰져요(관리직·인턴수의사는 그대로).</DialogDescription>
        </DialogHeader>

        {!data ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> 네이버웍스 직원 목록을 읽는 중…</p>
        ) : !data.ready ? (
          <p className="rounded-lg bg-status-ask-bg px-3 py-2.5 text-sm text-status-ask">
            {data.reason === "no-directory" ? "네이버웍스 직원 정보를 읽을 설정(서비스 계정·개인 키)이 아직 없어요." : "네이버웍스 직원 목록을 읽지 못했어요. 잠시 뒤 다시 열어 주세요."}
          </p>
        ) : (
          <>
            <p className="text-[13px] text-subtle-foreground">
              {(["suggest", "conflict", "new", "skip", "linked"] as const).filter((s) => counts[s]).map((s) => `${STATUS[s].label} ${counts[s]}`).join(" · ")}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg ring-1 ring-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-subtle-foreground">
                  <tr>
                    <th className="w-9 px-2 py-2" />
                    <th className="px-2 py-2 font-semibold">네이버웍스</th>
                    <th className="px-2 py-2 font-semibold">부서 → 직책</th>
                    <th className="px-2 py-2 font-semibold">수오더</th>
                    <th className="px-2 py-2 font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const can = r.status === "suggest" && !!r.userId && !!r.nwEmail;
                    return (
                      <tr key={`${r.nwEmail ?? r.nwName}`} className="border-t border-border">
                        <td className="px-2 py-2 text-center">
                          {can && (
                            <input
                              type="checkbox"
                              aria-label={`${r.nwName} 연결`}
                              checked={picked.has(r.userId!)}
                              disabled={busy}
                              onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.userId!); else n.delete(r.userId!); return n; })}
                              className="size-4"
                            />
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className="font-medium">{r.nwName}</span>
                          {r.nwEmail && <span className="block text-xs text-muted-foreground">{r.nwEmail}</span>}
                        </td>
                        <td className="px-2 py-2 text-[13px]">{r.dept ?? "—"} → {r.position ? pos(r.position) : "그대로"}</td>
                        <td className="px-2 py-2 text-[13px]">{r.userId ? <>있음 · {pos(r.sooPosition)}</> : <span className="text-muted-foreground">없음</span>}</td>
                        <td className="px-2 py-2"><span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {message && <p role={message.ok ? "status" : "alert"} className={cn("text-[13px] font-medium", message.ok ? "text-status-done" : "text-status-late")}>{message.text}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>닫기</Button>
          </DialogClose>
          {data?.ready && (
            <Button onClick={link} disabled={busy || picked.size === 0}>
              {busy && <Loader2 className="size-4 animate-spin" />} 고른 {picked.size}명 연결
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
