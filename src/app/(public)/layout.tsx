import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import "@/components/briefing/briefing.css";
import { PUBLIC_SITE_DESCRIPTION, PUBLIC_SITE_TITLE, publicMetadata } from "@/lib/briefing/public-meta";

/**
 * 공개 열람 (로그인 없이) — 논문 브리핑 카드·해설만. (main) 레이아웃 밖이라 메뉴·직원 정보가 없다.
 * 검색엔진 노출은 꺼 둔다(링크를 받은 사람이 보는 용도). 켜려면 robots 를 바꾼다.
 */
export const metadata: Metadata = {
  ...publicMetadata("오늘의 수의학 논문 브리핑", PUBLIC_SITE_DESCRIPTION),
  title: { default: "오늘의 수의학 논문 브리핑", template: `%s | ${PUBLIC_SITE_TITLE}` },
  robots: { index: false, follow: false },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bf min-h-dvh bg-[#eef1f5] text-[var(--bf-ink)]">
      <header className="bf-navy-surface">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3.5 lg:px-6">
          <Link href="/b" className="flex items-center gap-3">
            <Image src="/sooorder-brand/logo-horizontal-on-dark.webp" alt="수오더" width={1231} height={440} className="h-7 w-auto" priority />
            <span className="h-5 w-px bg-white/25" aria-hidden="true" />
            <span className="text-[14px] font-semibold tracking-[0.02em] text-[var(--bf-gold-300)]">오늘의 수의학 논문 브리핑</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-5 lg:px-6">{children}</main>
    </div>
  );
}
