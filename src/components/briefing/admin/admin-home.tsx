import Link from "next/link";
import { ChevronRight, Newspaper, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/workspace/feedback";
import type { IssueSummary } from "@/lib/actions/briefing-admin-actions";
import { formatIssueDate } from "@/lib/briefing/kst";
import { ISSUE_STATUS_LABEL, MAX_PAPERS, MIN_PAPERS, type IssueStatus } from "@/lib/briefing/types";

const STATUS_CLS: Record<IssueStatus, string> = {
  draft: "bg-secondary text-subtle-foreground",
  scheduled: "bg-status-doing-bg text-status-doing",
  published: "bg-status-done-bg text-status-done",
};

/** 논문 브리핑 관리 첫 화면: 날짜별 발행 묶음 목록 + 새 논문 등록 */
export function BriefingAdminHome({
  issues,
  today,
  nextDate,
  loadError,
  setupNotice,
}: {
  issues: IssueSummary[];
  today: string;
  /** 새 논문의 기본 발행일 */
  nextDate: string;
  loadError: boolean;
  /** 대기함 방식을 아직 켜지 않았다는 안내를 보여 준다 */
  setupNotice?: boolean;
}) {
  return (
    <>
      <PageHeader
        title="논문 브리핑 관리"
        description={<span className="hidden sm:inline">매일 08:30 · 하루 {MIN_PAPERS}~{MAX_PAPERS}건</span>}
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        action={
          <>
            <Button asChild variant="outline" size="icon" className="size-9 rounded-lg" aria-label="논문 브리핑 설정">
              <Link href="/briefing/admin/settings">
                <Settings className="size-4" />
              </Link>
            </Button>
            <Button asChild className="h-9 rounded-lg px-3 text-[13px]">
              <Link href="/briefing/admin/new">
                <Plus className="size-4" /> 새 논문 등록
              </Link>
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
        {setupNotice && (
          <p className="rounded-xl bg-status-ask-bg px-4 py-3 text-[13px] leading-5 text-status-ask">
            <b className="font-semibold">대기함·자동 배정을 아직 켜지 않았어요.</b> Supabase SQL Editor에서 <code className="font-mono">supabase/migrate-briefing-planner.sql</code>을 실행하면, 여러 건을 한 번에 올리고 검수만 하면 날짜가 자동으로 채워지는 화면으로 바뀌어요. 그 전까지는 지금처럼 날짜를 골라 넣어요.
          </p>
        )}
        <p className="rounded-xl bg-status-doing-bg px-4 py-3 text-[13px] leading-5 text-status-doing">
          정리된 논문 요약을 글상자 하나에 붙여넣으면 카드 1장이 돼요. 하루 {MIN_PAPERS}~{MAX_PAPERS}건을 검수해 두면 다음 발행은{" "}
          <b className="font-semibold">{formatIssueDate(nextDate)} 08:30</b>이에요.
        </p>

        {loadError ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState title="목록을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." />
          </div>
        ) : issues.length === 0 ? (
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState
              icon={Newspaper}
              title="아직 등록한 논문이 없어요"
              description="새 논문 등록을 눌러 첫 요약을 붙여넣어 보세요."
              action={
                <Button asChild size="sm">
                  <Link href="/briefing/admin/new">새 논문 등록</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
            {issues.map((issue, i) => (
              <Link
                key={issue.id}
                href={`/briefing/admin/${issue.issue_date}`}
                className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/60", i > 0 && "border-t border-border")}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-[15px] font-semibold tabular-nums">{formatIssueDate(issue.issue_date)}</b>
                    {issue.issue_date === today && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">오늘</span>}
                    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-bold", STATUS_CLS[issue.status])}>{ISSUE_STATUS_LABEL[issue.status]}</span>
                    <span className="text-[13px] tabular-nums text-muted-foreground">
                      논문 {issue.paperCount}건 · 검수 {issue.reviewedCount}건
                    </span>
                  </span>
                  {issue.headlines.length > 0 && (
                    <span className="mt-1 block truncate text-[13px] text-subtle-foreground">{issue.headlines.join("  ·  ")}</span>
                  )}
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
