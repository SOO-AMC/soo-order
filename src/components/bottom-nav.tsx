"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Undo2, ClipboardCheck, Search, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/orders", label: "주문", icon: Package },
  { href: "/returns", label: "반품", icon: Undo2 },
  { href: "/inspection", label: "검수", icon: ClipboardCheck },
  { href: "/search", label: "조회", icon: Search },
  { href: "/more", label: "더보기", icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex h-14 max-w-md md:max-w-2xl items-center justify-around">
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
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] transition-colors",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
