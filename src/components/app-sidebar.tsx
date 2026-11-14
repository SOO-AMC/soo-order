"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Settings, UserCog } from "lucide-react";
import { NAV_GROUPS } from "@/components/nav-config";
import { QuickActionButton } from "@/components/workspace/command-palette";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useTabCounts } from "@/hooks/use-tab-counts";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationBell } from "@/components/notification-bell";
import { ROLE_LABEL, type Role } from "@/lib/types/member";

/**
 * 사이드바 (수링크 패턴)
 * - 수링크와 동일: 회색 틀(=화면 테두리) 위에 흰 본문 패널. 선택된 메뉴만 흰 칸 + 1px 선 + 얕은 그림자, 호버는 #EDF0F3.
 * - 행 36px · 아이콘 16px(글자보다 옅게) — 관리자 메뉴 17개도 한 화면에 들어오게
 * - 구분선 없이 그룹 제목만
 * - 숫자: 평소 처리할 건수는 회색 숫자, 긴급이 섞이면 빨간 원 (진한 원이 메뉴 글자를 가리지 않도록)
 * - 맨 아래 계정 한 줄 → 누르면 계정관리·로그아웃
 */
/** 메뉴 옆 숫자: 평소 회색 숫자, 긴급 포함이면 빨간 원 */
export function NavCount({ count, urgent, className }: { count: number; urgent: boolean; className?: string }) {
  if (count <= 0) return null;
  const text = count > 99 ? "99+" : count;
  return urgent ? (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold tabular-nums text-white",
        className
      )}
    >
      {text}
    </span>
  ) : (
    <span className={cn("shrink-0 text-xs font-semibold tabular-nums text-sidebar-muted", className)}>{text}</span>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();
  const { isAdmin, userName, role } = useAuth();
  const counts = useTabCounts();
  const [accountOpen, setAccountOpen] = useState(false);
  const fromDashboard = searchParams.get("from") === "dashboard";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const isActiveHref = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard" || (fromDashboard && pathname.startsWith("/orders"));
    if (href === "/dashboard/admin") return pathname.startsWith("/dashboard/admin");
    if (fromDashboard && pathname.startsWith("/orders")) return false;
    return pathname.startsWith(href);
  };

  const roleLabel = ROLE_LABEL[role as Role] ?? (isAdmin ? "관리자" : "일반");

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col bg-sidebar lg:flex">
      {/* 로고 + 알림 */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 pl-4 pr-2.5">
        {/* 가로형 로고 36px, 다크 모드는 on-dark 파일 */}
        <Link href="/dashboard" className="flex-1" aria-label="수오더 홈">
          <Image src="/sooorder-brand/logo-horizontal.webp" alt="수오더" width={1231} height={440} priority className="h-9 w-auto dark:hidden" />
          <Image src="/sooorder-brand/logo-horizontal-on-dark.webp" alt="수오더" width={1231} height={440} className="hidden h-9 w-auto dark:block" />
        </Link>
        <NotificationBell className="text-sidebar-muted hover:bg-secondary hover:text-foreground" />
      </div>

      <div className="shrink-0 px-2.5 pt-1">
        <QuickActionButton />
      </div>

      <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto px-2.5 pb-3">
        {NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin).map((group, gi) => (
          <div key={group.label ?? gi} className="py-1">
            {group.label && (
              <p className="flex h-7 items-center px-2.5 text-xs font-semibold text-sidebar-muted">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon, countKey }) => {
                const active = isActiveHref(href);
                const info = countKey ? counts[countKey] : null;
                const count = info?.count ?? 0;
                const urgent = info?.hasUrgent ?? false;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      aria-label={count > 0 ? `${label}, ${count}건${urgent ? " (긴급 포함)" : ""}` : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-xs ring-1 ring-sidebar-border"
                          : "text-sidebar-foreground hover:bg-secondary hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-foreground" : "text-sidebar-muted"
                        )}
                      />
                      <span className="flex-1 truncate">{label}</span>
                      <NavCount count={count} urgent={urgent} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 계정 한 줄 → 계정관리 · 로그아웃 */}
      <div className="shrink-0 px-2.5 pb-2.5">
        <Popover open={accountOpen} onOpenChange={setAccountOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-12 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-secondary",
                (accountOpen || pathname === "/account") && "bg-sidebar-accent shadow-xs ring-1 ring-sidebar-border hover:bg-sidebar-accent"
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                {(userName || "?").slice(0, 1)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
                <span className="truncate text-sm font-semibold text-foreground">{userName || "사용자"}</span>
                <span className="truncate text-xs text-muted-foreground">{roleLabel} · 수오더</span>
              </span>
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground">
                <Settings className="size-4" />
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-[calc(15rem-1.25rem)] p-1">
            <Link
              href="/account"
              onClick={() => setAccountOpen(false)}
              className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium hover:bg-accent"
            >
              <UserCog className="size-4 text-muted-foreground" />
              내 계정
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-destructive hover:bg-status-late-bg"
            >
              <LogOut className="size-4" />
              로그아웃
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}
