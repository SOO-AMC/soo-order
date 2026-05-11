"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notification-actions";

export interface AppNotification {
  id: string;
  user_id: string;
  order_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsValue {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const NotificationsContext = createContext<NotificationsValue>({
  notifications: [],
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export { NotificationsContext };

export function useNotificationsProvider(userId: string): NotificationsValue {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const supabaseRef = useRef(createClient());

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabaseRef.current
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifications((data as AppNotification[]) ?? []);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // 초기 fetch는 effect 동기 setState를 피하려 다음 틱으로 미룸
    const initialTimer = setTimeout(fetchNotifications, 0);

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => fetchNotifications()
      )
      .subscribe();

    return () => {
      clearTimeout(initialTimer);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    markNotificationRead(id).catch(() => {});
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    markAllNotificationsRead().catch(() => {});
  }, []);

  const unreadCount = notifications.reduce((acc, n) => (n.is_read ? acc : acc + 1), 0);

  return useMemo(
    () => ({ notifications, unreadCount, markAsRead, markAllAsRead }),
    [notifications, unreadCount, markAsRead, markAllAsRead]
  );
}
