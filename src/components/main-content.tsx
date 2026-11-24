"use client";

import { useShowBottomNav } from "@/components/bottom-nav";
import { MobileSearchButton } from "@/components/workspace/command-palette";
import { AttentionBanner } from "@/components/attention-banner";
import { cn } from "@/lib/utils";

export function MainContent({ children }: { children: React.ReactNode }) {
  const showNav = useShowBottomNav();

  return (
    <main
      className={cn(
        // flex-1만 있으면 패널이 내용만큼 늘어나 틀까지 스크롤됨 → PC는 flex-none으로 높이를 화면에 고정
        // PC: 사이드바 색 틀 위에 본문이 8px 안쪽 둥근 패널로 올라가고, 스크롤은 패널 안에서만 (수링크 inset 패턴)
        "flex-1 [--page-top:3rem] lg:h-dvh lg:flex-none lg:[--page-top:0px] lg:overflow-hidden lg:bg-sidebar lg:py-2 lg:pl-60 lg:pr-2 lg:pb-2",
        showNav && "pb-[calc(6rem+env(safe-area-inset-bottom))]"
      )}
    >
      {/* 패널 안은 수링크처럼 흰 바탕(--background를 흰색으로) — 카드·표는 1px 선으로 나뉜다 */}
      <div className="lg:h-full lg:overflow-y-auto lg:rounded-xl lg:bg-card lg:shadow-xs lg:ring-1 lg:ring-border lg:[--background:var(--card)]">
        <MobileSearchButton />
        {/* 확인할 코멘트·삭제된 주문 안내 띠 */}
        <AttentionBanner />
        <div className={showNav ? "animate-page-enter" : "animate-page-slide-in"}>
          {children}
        </div>
      </div>
    </main>
  );
}
