"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/utils/format";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";

/** 띠로 알리는 알림 종류 */
const COMMENT_TYPES = new Set(["order_comment", "order_comment_reply"]);
const DELETED_TYPE = "order_deleted";

/**
 * 앱을 열면 화면 위에 뜨는 안내 띠: 확인할 코멘트·삭제된 주문.
 * 알림(notifications)의 안 읽은 것으로 센다 — 알림 종과 같은 실시간 구독을 쓴다.
 * 코멘트는 그 주문을 열면 읽음이 되고, 삭제 알림은 "확인"을 누르면 읽음이 된다.
 */
export function AttentionBanner() {
  const { notifications, markAsRead } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const items = notifications.filter((n) => !n.is_read && (COMMENT_TYPES.has(n.type) || n.type === DELETED_TYPE));
  if (items.length === 0) return null;

  const comments = items.filter((n) => COMMENT_TYPES.has(n.type));
  const deleted = items.filter((n) => n.type === DELETED_TYPE);
  const summary = [comments.length > 0 && `확인할 코멘트 ${comments.length}건`, deleted.length > 0 && `삭제된 주문 ${deleted.length}건`].filter(Boolean).join(" · ");

  const openComment = (n: AppNotification) => {
    markAsRead(n.id);
    setOpen(false);
    router.push(n.link ?? (n.order_id ? `/orders/${n.order_id}` : "/dashboard"));
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-3 md:max-w-2xl lg:max-w-6xl lg:px-6">
      <div className="overflow-hidden rounded-xl bg-primary/10 ring-1 ring-primary/20">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-primary"
        >
          {comments.length > 0 ? <MessageSquare className="size-4 shrink-0" /> : <Trash2 className="size-4 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{summary}</span>
          <span className="shrink-0 text-xs font-medium">{open ? "접기" : "보기"}</span>
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <ul className="divide-y divide-primary/10 border-t border-primary/15 bg-card">
            {[...comments, ...deleted].map((n) => {
              const isComment = COMMENT_TYPES.has(n.type);
              return (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  {isComment ? <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" /> : <Trash2 className="mt-0.5 size-4 shrink-0 text-status-late" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{n.title}</p>
                    {n.body && <p className="mt-0.5 whitespace-pre-line break-words text-[13px] text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatDateTime(n.created_at)}</p>
                  </div>
                  {isComment ? (
                    <button type="button" onClick={() => openComment(n)} className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground">
                      보고 답글
                    </button>
                  ) : (
                    <button type="button" onClick={() => markAsRead(n.id)} className="shrink-0 rounded-lg bg-muted px-3 py-1.5 text-[13px] font-semibold text-subtle-foreground hover:bg-secondary">
                      확인
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
