import Link from "next/link";
import { CalendarDays, ChevronRight, MonitorPlay, Newspaper, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { BriefingTabs, PaperRow, PaperTile } from "@/components/briefing/reader/reader-parts";
import { categoryInfo } from "@/components/briefing/reader/category";
import type { ReaderIssue } from "@/lib/actions/briefing-reader-actions";
import { PUBLISH_HOUR, PUBLISH_MINUTE, formatIssueDate } from "@/lib/briefing/kst";
import "@/components/briefing/briefing.css";

const publishTime = `${String(PUBLISH_HOUR).padStart(2, "0")}:${String(PUBLISH_MINUTE).padStart(2, "0")}`;

/** 브리핑 화면 공통 머리 (오늘 / 지난 브리핑 / 북마크) */
export function BriefingHeader({ isAdmin }: { isAdmin: boolean }) {
  return (
    <PageHeader
      title="논문 브리핑"
      description={<span className="hidden sm:inline">매일 {publishTime} · 오늘의 수의학 논문</span>}
      leading={
        <div className="lg:hidden">
          <BackButton fallbackHref="/more" />
        </div>
      }
      action={
        isAdmin ? (
          <Button asChild variant="outline" className="h-9 rounded-lg px-3 text-[13px]">
            <Link href="/briefing/admin">
              <Settings2 className="size-4" /> 관리
            </Link>
          </Button>
        ) : undefined
      }
      tabs={<BriefingTabs />}
    />
  );
}

/**
 * 오늘의 논문 브리핑 (전 직원).
 * 오늘 발행된 논문 3~4건을 보여 준다 — 한 줄(모바일)·카드 하나(PC)가 논문 1건이다.
 * 오늘 발행분이 없으면 없다고 말한다. 전날 것을 오늘 것처럼 보여 주지 않는다.
 */
export function TodayPage({
  today,
  issue,
  isAdmin,
  past,
}: {
  today: string;
  issue: ReaderIssue | null;
  isAdmin: boolean;
  /** 오늘 발행 시각(08:30)이 지났는지 */
  past: boolean;
}) {
  const papers = issue?.papers ?? [];
  const total = papers.length;
  const unread = papers.filter((p) => !p.read).length;
  const categories = [...new Set(papers.map((p) => categoryInfo(p.category).label))];

  return (
    <>
      <BriefingHeader isAdmin={isAdmin} />

      <div className="mx-auto max-w-md space-y-4 p-4 md:max-w-2xl lg:max-w-6xl lg:px-6">
        {/* 머리 면: 날짜 + 오늘 몇 건 */}
        <section className="bf bf-text bf-navy-surface relative overflow-hidden rounded-2xl px-5 pb-6 pt-5 text-white lg:px-9 lg:pb-9 lg:pt-8">
          {/* 가는 금색 곡선 (이미지 없이) */}
          <svg className="pointer-events-none absolute -right-10 bottom-0 h-full w-[70%] opacity-50" viewBox="0 0 400 200" fill="none" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 190 C 140 170, 250 120, 400 20" stroke="var(--bf-gold-400)" strokeWidth="1" />
            <path d="M40 200 C 180 185, 290 150, 400 80" stroke="var(--bf-gold-400)" strokeWidth="0.6" opacity="0.6" />
          </svg>
          <p className="relative flex items-center gap-1.5 text-[13px] font-medium tabular-nums text-white/70">
            <CalendarDays className="size-4" aria-hidden="true" /> {formatIssueDate(today)}
          </p>
          <h2 className="relative mt-2 text-[26px] font-extrabold leading-[1.25] tracking-tight lg:text-[40px]">
            오늘의 수의학 <span className="text-[var(--bf-gold-300)]">논문 브리핑</span>
          </h2>
          <p className="relative mt-2 text-[15px] text-white/80 lg:text-[17px]">
            {total > 0
              ? `오늘 주목할 연구 ${total}건을 정리했어요.${unread > 0 && unread < total ? ` 안 읽은 글 ${unread}건.` : ""}`
              : past
                ? "오늘은 올라온 브리핑이 없어요."
                : `오늘 브리핑은 ${publishTime}에 올라와요.`}
          </p>
          {categories.length > 0 && (
            <p className="relative mt-4 flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="rounded-full px-2.5 py-1 font-semibold text-[var(--bf-gold-300)] ring-1 ring-[var(--bf-gold-400)]/60">오늘의 분야</span>
              {categories.map((c) => (
                <span key={c} className="rounded-full bg-white/10 px-2.5 py-1 font-medium text-white/90">
                  {c}
                </span>
              ))}
            </p>
          )}
          {/* 세미나실 큰 화면용 */}
          <Link
            href="/briefing/rounding"
            className="relative mt-5 hidden h-11 items-center gap-2 rounded-full bg-[var(--bf-gold-400)] pl-4 pr-3 text-[15px] font-bold text-[var(--bf-navy-950)] transition-transform hover:scale-[1.02] md:inline-flex lg:absolute lg:bottom-9 lg:right-9 lg:mt-0 lg:h-12 lg:pl-5"
          >
            <MonitorPlay className="size-5" aria-hidden="true" /> 라운딩 대기 모드 시작
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        {total === 0 ? (
          <div className="rounded-2xl bg-card px-4 py-10 text-center ring-1 ring-border">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary text-muted-foreground">
              <Newspaper className="size-5" />
            </span>
            <p className="mt-3 text-[15px] font-semibold">{past ? "오늘 발행된 논문이 없어요" : "아직 발행 전이에요"}</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
              {past ? "지난 브리핑에서 이전 논문을 볼 수 있어요." : `매일 ${publishTime}에 새 논문 3~4건이 올라와요. 그동안 지난 브리핑을 볼 수 있어요.`}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/briefing/archive">지난 브리핑 보기</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* 모바일·태블릿: 목록 — 한 줄이 논문 1건 */}
            <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-border lg:hidden" aria-label={`오늘 논문 ${total}건`}>
              {papers.map((p, i) => (
                <div key={p.id} className={i > 0 ? "border-t border-border" : undefined}>
                  <PaperRow paper={p} />
                </div>
              ))}
            </section>

            {/* PC: 카드 격자 — 카드 하나가 논문 1건 (3건이면 3칸, 4건이면 4칸) */}
            <section className={total >= 4 ? "hidden gap-4 lg:grid lg:grid-cols-4" : "hidden gap-4 lg:grid lg:grid-cols-3"} aria-label={`오늘 논문 ${total}건`}>
              {papers.map((p, i) => (
                <PaperTile key={p.id} paper={p} index={i} total={total} />
              ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}
