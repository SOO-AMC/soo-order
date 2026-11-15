"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchNaverWorksLink, unlinkNaverWorks, type NaverWorksLinkStatus } from "@/lib/actions/naverworks-link-actions";

/** 돌아온 결과 코드(?nw=) → 안내 문구 */
const RESULT_TEXT: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: "네이버웍스 계정을 연결했어요. 이제 로그인 화면에서 \"네이버웍스로 로그인\"을 쓸 수 있어요." },
  taken: { ok: false, text: "이 네이버웍스 계정은 이미 다른 수오더 계정에 연결돼 있어요. 관리자에게 문의해 주세요." },
  cancel: { ok: false, text: "연결을 취소했어요." },
  expired: { ok: false, text: "연결 시간이 지났어요. 다시 눌러 주세요." },
  failed: { ok: false, text: "네이버웍스에서 본인 확인을 하지 못했어요. 다시 눌러 주세요." },
  off: { ok: false, text: "네이버웍스 연동이 아직 설정되지 않았어요." },
  setup: { ok: false, text: "연결 정보를 저장할 곳이 아직 없어요. 관리자에게 알려 주세요. (supabase/migrate-naverworks-login.sql)" },
};

/**
 * 내 계정 → 네이버웍스 연결.
 * 연결해 두면 로그인 화면의 "네이버웍스로 로그인"으로 비밀번호 없이 들어올 수 있다(네이버웍스 알림의 링크를 눌렀을 때도).
 * 서버에 네이버웍스 앱 값이 설정돼 있지 않으면 이 칸은 보이지 않는다.
 */
export function NaverWorksLinkSection() {
  const [status, setStatus] = useState<NaverWorksLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("nw");
    return code ? RESULT_TEXT[code] ?? null : null;
  });

  useEffect(() => {
    let active = true;
    fetchNaverWorksLink()
      .then((s) => { if (active) setStatus(s); })
      .catch(() => {});
    // 결과 코드는 한 번 보여 주고 주소에서 지운다 (새로 고침해도 또 뜨지 않게)
    if (new URLSearchParams(window.location.search).has("nw")) window.history.replaceState(null, "", "/account");
    return () => { active = false; };
  }, []);

  if (!status?.enabled) return null;

  const unlink = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await unlinkNaverWorks();
      if (!res.ok) return setMessage({ ok: false, text: res.error });
      setStatus((s) => (s ? { ...s, linked: null } : s));
      setMessage({ ok: true, text: "연결을 끊었어요. 이제 네이버웍스로는 로그인할 수 없어요." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
      <h2 className="text-lg font-extrabold tracking-tight">네이버웍스 연결</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">연결해 두면 네이버웍스 계정으로 비밀번호 없이 로그인할 수 있어요. 네이버웍스 알림의 링크를 눌렀을 때도 이걸로 들어와요.</p>

      {!status.ready ? (
        <p className="mt-3 rounded-lg bg-status-ask-bg px-3 py-2.5 text-[13px] font-medium text-status-ask">연결 정보를 저장할 곳이 아직 없어요. 관리자가 준비를 마치면 쓸 수 있어요.</p>
      ) : status.linked ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-status-done-bg px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-status-done" />
          <p className="min-w-0 flex-1 text-sm">
            <b className="font-semibold text-status-done">연결됨</b>
            <span className="text-subtle-foreground">
              {" "}
              · {[status.linked.name, status.linked.email].filter(Boolean).join(" · ") || "네이버웍스 계정"}
            </span>
          </p>
          <Button variant="outline" size="sm" className="h-9 rounded-lg" disabled={busy} onClick={unlink}>
            {busy && <Loader2 className="size-4 animate-spin" />} 연결 끊기
          </Button>
        </div>
      ) : (
        <Button asChild className="mt-3 h-11 rounded-xl px-5 font-bold">
          {/* 네이버웍스 로그인 화면으로 갔다가 돌아오는 이동이라 일반 링크(a)를 쓴다 */}
          <a href="/auth/naverworks/start?mode=link&next=/account">
            <Link2 className="size-4" /> 네이버웍스 계정 연결하기
          </a>
        </Button>
      )}

      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "mt-3 text-[13px] font-medium text-status-done" : "mt-3 text-[13px] font-medium text-status-late"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
