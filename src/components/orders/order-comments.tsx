"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import { addOrderComment, fetchOrderComments, markOrderCommentsRead } from "@/lib/actions/order-comment-actions";
import { COMMENT_MAX, type OrderComment } from "@/lib/types/order-comment";

/**
 * 주문 코멘트 (주문 한 건).
 * - 관리자: 언제든 코멘트를 남긴다. 주문자가 읽었는지 보인다.
 * - 주문자: 관리자가 코멘트를 남긴 자기 주문에만 보이고, 답글을 단다.
 * 열면 내가 받은 코멘트를 읽음으로 바꾼다(관련 알림도 함께).
 * 주문이 바뀌면 key 로 새로 그린다 (부모가 key={orderId}).
 */
export function OrderComments({
  orderId,
  requesterId,
  viewerId,
  isAdmin,
  onChanged,
  className,
}: {
  orderId: string;
  requesterId: string | null;
  viewerId: string;
  isAdmin: boolean;
  /** 코멘트를 남기거나 읽었을 때 (목록 표시를 새로 고치려고) */
  onChanged?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<{ loading: boolean; ready: boolean; comments: OrderComment[]; loadError: string }>({
    loading: true,
    ready: true,
    comments: [],
    loadError: "",
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  const isRequester = viewerId === requesterId;

  useEffect(() => {
    let active = true;
    fetchOrderComments(orderId)
      .then(async (res) => {
        if (!active) return;
        setState({ loading: false, ready: res.ready, comments: res.comments, loadError: "" });
        // 내가 받은 안 읽은 코멘트가 있으면 읽음으로
        const unreadForMe = res.comments.some((c) => !c.readAt && c.authorId !== viewerId && (isRequester ? c.byAdmin : !c.byAdmin));
        if (unreadForMe) {
          const n = await markOrderCommentsRead(orderId).catch(() => 0);
          if (n > 0) onChangedRef.current?.();
        }
      })
      .catch((e) => {
        if (active) setState({ loading: false, ready: true, comments: [], loadError: e instanceof Error ? e.message : "코멘트를 불러오지 못했어요." });
      });
    return () => {
      active = false;
    };
  }, [orderId, viewerId, isRequester]);

  const { loading, ready, comments, loadError } = state;
  const hasAdminComment = comments.some((c) => c.byAdmin);
  const canWrite = ready && (isAdmin || (isRequester && hasAdminComment));

  // 주문자에게는 관리자 코멘트가 있을 때만 보인다
  if (!isAdmin && (loading || !hasAdminComment)) return null;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await addOrderComment(orderId, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState((s) => ({ ...s, comments: [...s.comments, res.data] }));
      setText("");
      onChangedRef.current?.();
    } catch {
      setError("보내지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="코멘트" className={cn("space-y-2.5", className)}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="size-4 text-muted-foreground" /> 코멘트
        {comments.length > 0 && <span className="font-normal tabular-nums text-muted-foreground">{comments.length}</span>}
        {isAdmin && <span className="font-normal text-muted-foreground">· 주문한 사람에게 보이고, 답글을 받을 수 있어요</span>}
      </h3>

      {loading ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> 불러오는 중…
        </p>
      ) : !ready ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
          코멘트 기능을 켜려면 Supabase 에서 supabase/migrate-order-comments.sql 을 먼저 실행해 주세요.
        </p>
      ) : loadError ? (
        <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2 text-[13px] font-medium text-status-late">{loadError}</p>
      ) : (
        comments.length > 0 && (
          <ol className="space-y-2">
            {comments.map((c) => {
              const mine = c.authorId === viewerId;
              return (
                <li key={c.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[90%] rounded-xl px-3 py-2", mine ? "bg-primary/10" : "bg-muted")}>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.authorName}</span>
                      <span>{c.byAdmin ? "관리자" : "주문자"}</span>
                      <span className="tabular-nums">{formatDateTime(c.createdAt)}</span>
                      {mine && (
                        <span className={cn("font-semibold", c.readAt ? "text-status-done" : "text-muted-foreground")}>
                          {c.readAt ? "읽음" : "안 읽음"}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )
      )}

      {canWrite && (
        <div className="space-y-1.5">
          <label htmlFor={`comment-${orderId}`} className="sr-only">
            {isAdmin ? "코멘트 남기기" : "답글 달기"}
          </label>
          <textarea
            id={`comment-${orderId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={COMMENT_MAX}
            rows={2}
            placeholder={isAdmin ? "주문한 사람에게 남길 코멘트 (예: 이번 주는 품절이라 다음 주에 들어와요)" : "답글 달기"}
            className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <div className="flex items-center gap-2">
            {error && <p role="alert" className="min-w-0 flex-1 text-[13px] font-medium text-status-late">{error}</p>}
            <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">Ctrl Enter 보내기</span>
            <Button size="sm" className="h-8" onClick={send} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {isAdmin ? "코멘트 남기기" : "답글 보내기"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
