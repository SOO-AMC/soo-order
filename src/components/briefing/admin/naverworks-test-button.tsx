"use client";

import { useState } from "react";
import { Loader2, Newspaper, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendTestNotificationToMe, sendTodayBriefingToMe } from "@/lib/actions/naverworks-bot-actions";

type Kind = "test" | "today";

/** 네이버웍스 알림 시험: 누른 관리자 본인에게만 메시지 1건 */
export function NaverWorksTestButton() {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (kind: Kind) => {
    if (busy) return;
    setBusy(kind);
    setMessage(null);
    try {
      const res = kind === "test" ? await sendTestNotificationToMe() : await sendTodayBriefingToMe();
      setMessage(res.ok ? { ok: true, text: `보냈어요 (${res.to}). 네이버웍스 메시지에서 봇이 보낸 메시지를 확인해 주세요.` } : { ok: false, text: res.error });
    } catch {
      setMessage({ ok: false, text: "보내지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-10 rounded-lg" disabled={busy !== null} onClick={() => send("test")}>
          {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 나에게 시험 메시지 보내기
        </Button>
        <Button variant="outline" className="h-10 rounded-lg" disabled={busy !== null} onClick={() => send("today")}>
          {busy === "today" ? <Loader2 className="size-4 animate-spin" /> : <Newspaper className="size-4" />} 오늘 브리핑 알림을 나에게 보내기
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        네이버웍스 알림 봇이 나에게만 메시지 1건을 보내요. 다른 직원이나 단체방에는 보내지 않아요. &quot;오늘 브리핑 알림&quot;은 오늘 발행된 논문으로 단체방에 나갈 것과 같은 내용이에요.
      </p>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-2 text-[13px] font-medium text-status-done" : "mt-2 text-[13px] font-medium text-status-late"}>{message.text}</p>}
    </div>
  );
}
