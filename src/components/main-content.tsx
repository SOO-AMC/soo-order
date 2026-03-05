"use client";

import { useShowBottomNav } from "@/components/bottom-nav";
import { cn } from "@/lib/utils";

export function MainContent({ children }: { children: React.ReactNode }) {
  const showNav = useShowBottomNav();

  return (
    <main
      className={cn(
        "flex-1 lg:pl-60 lg:pb-0",
        showNav && "pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]"
      )}
    >
      <div className={showNav ? "animate-page-enter" : "animate-page-slide-in"}>
        {children}
      </div>
    </main>
  );
}
