"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Package, Undo2, ClipboardCheck, Search, Menu, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const tabs = [
  { href: "/orders", label: "주문", icon: Package },
  { href: "/returns", label: "반품", icon: Undo2 },
  { href: "/inspection", label: "검수", icon: ClipboardCheck },
  { href: "/search", label: "조회", icon: Search },
  { href: "/more", label: "더보기", icon: Menu },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r bg-background lg:flex">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <Image
          src="/icons/icon-192x192.png"
          alt="수오더"
          width={32}
          height={32}
          className="rounded-lg"
        />
        <span className="text-lg font-bold">수오더</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/more"
              ? pathname.startsWith("/more") || pathname.startsWith("/account")
              : pathname.startsWith(href);
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
              <span>{label}</span>
            </Link>
          );
        })}
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
