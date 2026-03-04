"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, ClipboardCheck, Search, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/orders", label: "주문/반품", icon: Package },
  { href: "/inspection", label: "검수", icon: ClipboardCheck },
  { href: "/search", label: "조회", icon: Search },
  { href: "/account", label: "계정관리", icon: UserCog },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex h-14 max-w-md items-center justify-around">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
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
