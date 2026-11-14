"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, KeyRound, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTabCounts } from "@/hooks/use-tab-counts";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { NotificationBell } from "@/components/notification-bell";
import { NAV_GROUPS, type NavItem } from "@/components/nav-config";
import { ThemeModeSegmented } from "@/components/theme-toggle";
import { ROLE_LABEL, POSITION_LABEL, type Role, type Position } from "@/lib/types/member";
import { logClientAction } from "@/app/(main)/log-action";

/**
 * 더보기 (모바일 마지막 탭, 토스 "전체" 탭 모양).
 * 내 정보 → 메뉴(사이드바와 같은 구성 NAV_GROUPS, 건수 포함) → 설정 → 로그아웃.
 */
export function MorePage() {
  const { userName, isAdmin, role, position } = useAuth();
  const counts = useTabCounts();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    logClientAction("auth", "logout", "로그아웃");
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const roleText = ROLE_LABEL[role as Role] ?? role;
  const positionText = position ? POSITION_LABEL[position as Position] ?? position : null;

  return (
    <>
      <PageHeader
        title="더보기"
        action={
          <div className="lg:hidden">
            <NotificationBell />
          </div>
        }
      />

      <div className="mx-auto max-w-md md:max-w-2xl flex flex-col gap-5 p-4 pb-8 lg:px-6">
        {/* 내 정보 */}
        <Link
          href="/account"
          className="flex items-center gap-3.5 rounded-2xl bg-card p-4 ring-1 ring-border transition-colors hover:bg-muted/60 active:bg-muted"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {userName?.charAt(0) ?? "?"}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate text-[17px] font-bold">{userName}</b>
            <span className="text-[13px] text-muted-foreground">
              {roleText}
              {positionText ? ` · ${positionText}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-subtle-foreground">
            내 계정
            <ChevronRight className="size-4" />
          </span>
        </Link>

        {/* 메뉴 — 사이드바와 같은 구성 */}
        {NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin).map((group, gi) => (
          <MenuGroup key={group.label ?? gi} label={group.label ?? "내 현황"}>
            {group.items.map((item) => {
              const info = item.countKey ? counts[item.countKey] : null;
              return <MenuRow key={item.href} item={item} count={info?.count ?? 0} urgent={info?.hasUrgent ?? false} />;
            })}
          </MenuGroup>
        ))}

        <MenuGroup label="설정">
          <li className="px-4 py-3.5">
            <p className="mb-2 text-base font-semibold">화면 모드</p>
            <ThemeModeSegmented />
            <p className="mt-2 text-[13px] text-muted-foreground">시스템을 고르면 휴대폰 설정(다크 모드)을 따라가요.</p>
          </li>
          <MenuRow item={{ href: "/account", label: "내 계정 · 비밀번호", icon: KeyRound }} count={0} urgent={false} />
        </MenuGroup>

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-card text-[15px] font-semibold text-status-late ring-1 ring-border transition-colors hover:bg-status-late-bg"
        >
          <LogOut className="size-4" />
          로그아웃
        </button>

        <p className="text-center text-xs text-muted-foreground">수오더 · SOO Animal Medical Center</p>
      </div>
    </>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-subtle-foreground">{label}</h2>
      <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">{children}</ul>
    </section>
  );
}

function MenuRow({ item, count, urgent }: { item: NavItem; count: number; urgent: boolean }) {
  const Icon = item.icon;
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={item.href}
        aria-label={count > 0 ? `${item.label}, ${count}건${urgent ? " (긴급 포함)" : ""}` : undefined}
        className="flex min-h-14 items-center gap-3 px-4 transition-colors hover:bg-muted/60 active:bg-muted"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-subtle-foreground">
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{item.label}</span>
        {count > 0 && (
          <span
            className={cn(
              "min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums",
              urgent ? "bg-status-late-bg text-status-late" : "bg-muted text-subtle-foreground"
            )}
          >
            {count}
          </span>
        )}
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
