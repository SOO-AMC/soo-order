"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Package, ClipboardCheck, Search, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/orders", label: "주문", icon: Package },
  { href: "/inspection", label: "검수", icon: ClipboardCheck },
  { href: "/search", label: "조회", icon: Search },
  { href: "/account", label: "계정관리", icon: UserCog },
];

export function AppSidebar() {
  const pathname = usePathname();

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
          const isActive = pathname.startsWith(href);
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
    </aside>
  );
}
