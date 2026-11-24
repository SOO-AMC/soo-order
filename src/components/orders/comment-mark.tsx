import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommentMark } from "@/lib/types/order-comment";

/** 목록의 코멘트 표시: 새 답글(파란 점) · 주문자가 아직 안 읽음 · 코멘트 수 */
export function CommentMarkIcon({ mark, className }: { mark?: CommentMark; className?: string }) {
  if (!mark || mark.count === 0) return null;
  const label = mark.newReply ? "주문자 답글 있음 (안 읽음)" : mark.unreadByRequester ? `코멘트 ${mark.count}개 · 주문자가 아직 안 읽음` : `코멘트 ${mark.count}개`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
        mark.newReply ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <MessageSquare className="size-3.5" />
      {mark.count}
      {mark.newReply && <span className="absolute -right-1 -top-0.5 size-1.5 rounded-full bg-primary" />}
    </span>
  );
}
