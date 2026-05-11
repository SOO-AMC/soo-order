"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { formatDateTime } from "@/lib/utils/format";

export function NotificationBell({ className }: { className?: string }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
    else if (n.order_id) router.push(`/orders/${n.order_id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="알림"
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className
          )}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-sm font-semibold">알림</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="text-xs text-primary hover:underline"
            >
              모두 읽음
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">알림이 없습니다</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent",
                  !n.is_read && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className={cn("text-sm", n.is_read ? "font-medium" : "font-semibold")}>{n.title}</span>
                </div>
                {n.body && (
                  <span className="whitespace-pre-line text-xs text-muted-foreground">{n.body}</span>
                )}
                <span className="text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
