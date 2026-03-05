"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Package,
  Undo2,
  ClipboardCheck,
  Search,
  LogOut,
  Scale,
  Users,
  UserCog,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useTabCounts } from "@/hooks/use-tab-counts";
import { useIsAdmin } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const mainTabs = [
  { href: "/orders", label: "주문", icon: Package, countKey: "orders" as const },
  { href: "/returns", label: "반품", icon: Undo2, countKey: "returns" as const },
  { href: "/inspection", label: "검수", icon: ClipboardCheck, countKey: "inspection" as const },
  { href: "/search", label: "조회", icon: Search, countKey: null },
];

const dashboardTab = { href: "/dashboard", label: "대시보드", icon: BarChart3, countKey: null };

const adminTabs = [
  { href: "/price-compare", label: "가격 비교", icon: Scale },
  { href: "/account/members", label: "직원 관리", icon: Users },
];

const accountTab = { href: "/account", label: "내 계정관리", icon: UserCog };

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const isAdmin = useIsAdmin();
  const counts = useTabCounts();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const renderLink = ({
    href,
    label,
    icon: Icon,
    countKey,
  }: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    countKey?: "orders" | "returns" | "inspection" | null;
  }) => {
    const isActive =
      href === "/account"
        ? pathname === "/account"
        : pathname.startsWith(href);
    const info = countKey ? counts[countKey] : null;
    const count = info?.count ?? 0;
    const hasUrgent = info?.hasUrgent ?? false;
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="flex-1">{label}</span>
        {count > 0 && (
          <span className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none text-primary-foreground",
            hasUrgent ? "bg-destructive" : "bg-primary"
          )}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r bg-background lg:flex">
      <div className="flex items-center gap-3 px-5 py-4">
        <Image
          src="/icons/icon-192x192.png"
          alt="수오더"
          width={32}
          height={32}
          className="rounded-lg"
        />
        <span className="text-lg font-bold">수오더</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainTabs.map(renderLink)}

        {isAdmin && (
          <>
            <Separator className="my-3" />
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground/70">관리자 전용</p>
            {renderLink(dashboardTab)}
            {adminTabs.map(renderLink)}
          </>
        )}

        <Separator className="my-3" />

        {renderLink(accountTab)}
      </nav>
      <div className="border-t px-3 py-4">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          <span>로그아웃</span>
        </Button>
      </div>
    </aside>
  );
}
