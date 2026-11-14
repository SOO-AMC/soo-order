"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, BarChart3, ClipboardCheck, Search, Menu, Inbox, Droplets } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabCounts } from "@/hooks/use-tab-counts";
import { useNotifications } from "@/hooks/use-notifications";
import { useAuth } from "@/hooks/use-auth";

type CountKey = "orders" | "inspection" | "blood";
type Tab = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; countKey: CountKey | null };

// 역할별 하단 탭 (디자인 시스템 BottomNav)
const STAFF_TABS: Tab[] = [
  { href: "/dashboard", label: "내 현황", icon: BarChart3, countKey: null },
  { href: "/orders", label: "주문", icon: Package, countKey: "orders" },
  { href: "/search", label: "조회", icon: Search, countKey: null },
  { href: "/blood", label: "혈액 대장", icon: Droplets, countKey: "blood" },
  { href: "/more", label: "더보기", icon: Menu, countKey: null },
];
const ADMIN_TABS: Tab[] = [
  { href: "/todo", label: "처리할 일", icon: Inbox, countKey: null },
  { href: "/orders", label: "주문", icon: Package, countKey: "orders" },
  { href: "/inspection", label: "검수", icon: ClipboardCheck, countKey: "inspection" },
  { href: "/search", label: "조회", icon: Search, countKey: null },
  { href: "/more", label: "더보기", icon: Menu, countKey: null },
];

// 탭바를 표시할 루트 경로들
const TAB_ROUTES = ["/orders", "/out-of-stock", "/returns", "/inspection", "/search", "/blood", "/more", "/account", "/price-compare", "/dashboard", "/members", "/logs", "/dashboard/admin", "/todo", "/invoice-scan", "/vendor-ledger", "/vendors", "/price-analysis", "/items", "/briefing", "/briefing/archive", "/briefing/bookmarks"];

export function useShowBottomNav() {
  const pathname = usePathname();
  return TAB_ROUTES.some((route) => pathname === route);
}

export function BottomNav() {
  const pathname = usePathname();
  const counts = useTabCounts();
  const { unreadCount } = useNotifications();
  const show = useShowBottomNav();
  const { isAdmin } = useAuth();
  const tabs = isAdmin ? ADMIN_TABS : STAFF_TABS;
  // 더보기: 다른 탭에 해당하지 않는 화면 전부
  const matchTab = (href: string) =>
    pathname === href || (href !== "/dashboard" && href !== "/more" && pathname.startsWith(href + "/"));
  const otherActive = tabs.some((t) => t.href !== "/more" && matchTab(t.href));

  if (!show) return null;

  return (
    <nav
      aria-label={isAdmin ? "하단 메뉴 (관리자)" : "하단 메뉴"}
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[18px] bg-card shadow-[0_8px_24px_rgb(20_33_61/0.18)] ring-1 ring-border md:max-w-xl lg:hidden"
    >
      <div className="grid h-[62px] grid-cols-5 items-center">
        {tabs.map(({ href, label, icon: Icon, countKey }) => {
          const isActive = href === "/more" ? !otherActive : matchTab(href);
          const info = countKey ? counts[countKey] : null;
          const count = info?.count ?? 0;
          const hasUrgent = info?.hasUrgent ?? false;
          // 내 현황: 숫자 대신 "안 읽은 알림 있음" 점만 (모바일엔 종이 내 현황 상단에만 있어서)
          const showUnreadDot = (href === "/dashboard" || href === "/todo") && unreadCount > 0;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              aria-label={
                count > 0
                  ? `${label}, ${count}건${hasUrgent ? " (긴급 포함)" : ""}`
                  : showUnreadDot
                    ? `${label}, 읽지 않은 알림 ${unreadCount}개`
                    : undefined
              }
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 text-xs transition-colors",
                isActive ? "font-semibold text-primary" : "font-medium text-muted-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" />
                {count > 0 && (
                  // 평소: 흰 바탕 회색 숫자, 긴급 포함: 빨간 원
                  <span
                    className={cn(
                      "absolute -right-4 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-bold leading-none tabular-nums",
                      hasUrgent
                        ? "bg-destructive text-white"
                        : "bg-card text-subtle-foreground ring-1 ring-border"
                    )}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {showUnreadDot && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-card" aria-hidden="true" />
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
