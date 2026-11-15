"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendTestNotificationToMe } from "@/lib/actions/naverworks-bot-actions";

/** 네이버웍스 알림 시험: 누른 관리자 본인에게만 메시지 1건 */
export function NaverWorksTestButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await sendTestNotificationToMe();
      setMessage(res.ok ? { ok: true, text: `보냈어요 (${res.to}). 네이버웍스 메시지에서 봇이 보낸 메시지를 확인해 주세요.` } : { ok: false, text: res.error });
    } catch {
      setMessage({ ok: false, text: "보내지 못했어요. 잠시 뒤 다시 눌러 주세요." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="px-4 py-3.5">
      <Button variant="outline" className="h-10 rounded-lg" disabled={busy} onClick={send}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 나에게 시험 메시지 보내기
      </Button>
      <p className="mt-2 text-[13px] text-muted-foreground">네이버웍스 알림 봇이 나에게만 메시지 1건을 보내요. 다른 직원이나 단체방에는 보내지 않아요.</p>
      {message && <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-2 text-[13px] font-medium text-status-done" : "mt-2 text-[13px] font-medium text-status-late"}>{message.text}</p>}
    </div>
  );
}
