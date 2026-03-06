"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Undo2, ClipboardCheck, Search, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTabCounts } from "@/hooks/use-tab-counts";

const tabs = [
  { href: "/orders", label: "주문", icon: Package, countKey: "orders" as const },
  { href: "/returns", label: "반품", icon: Undo2, countKey: "returns" as const },
  { href: "/inspection", label: "검수", icon: ClipboardCheck, countKey: "inspection" as const },
  { href: "/search", label: "조회", icon: Search, countKey: null },
  { href: "/more", label: "더보기", icon: Menu, countKey: null },
];

// 탭바를 표시할 루트 경로들
const TAB_ROUTES = ["/orders", "/returns", "/inspection", "/search", "/more", "/account", "/price-compare", "/dashboard", "/members", "/logs"];

export function useShowBottomNav() {
  const pathname = usePathname();
  return TAB_ROUTES.some((route) => pathname === route);
}

export function BottomNav() {
  const pathname = usePathname();
  const counts = useTabCounts();
  const show = useShowBottomNav();

  if (!show) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm shadow-nav pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex h-14 max-w-md md:max-w-2xl items-center justify-around">
        {tabs.map(({ href, label, icon: Icon, countKey }) => {
          const isActive =
            href === "/more"
              ? pathname.startsWith("/more") || pathname.startsWith("/account")
              : pathname.startsWith(href);
          const info = countKey ? counts[countKey] : null;
          const count = info?.count ?? 0;
          const hasUrgent = info?.hasUrgent ?? false;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] transition-colors",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {count > 0 && (
                  <span className={cn(
                    "absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-primary-foreground",
                    hasUrgent ? "bg-destructive" : "bg-primary"
                  )}>
                    {count > 99 ? "99+" : count}
                  </span>
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
