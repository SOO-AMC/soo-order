import Link from "next/link";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/feedback";
import { PaperRow } from "@/components/briefing/reader/reader-parts";
import type { ReaderPaper } from "@/lib/actions/briefing-reader-actions";
import { formatIssueDate } from "@/lib/briefing/kst";

/** 내 북마크 (최근에 넣은 것부터). 한 줄이 논문 1건 */
export function BookmarksPage({ papers }: { papers: ReaderPaper[] }) {
  return (
    <div className="mx-auto max-w-md space-y-3 p-4 md:max-w-2xl lg:max-w-4xl lg:px-6">
      {papers.length === 0 ? (
        <div className="rounded-2xl bg-card ring-1 ring-border">
          <EmptyState
            icon={Bookmark}
            title="북마크한 논문이 없어요"
            description="논문을 읽다가 오른쪽 위 책갈피를 누르면 여기에 모여요."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/briefing">오늘의 브리핑 보기</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="px-1 text-[13px] text-muted-foreground">
            북마크 <b className="font-semibold tabular-nums text-foreground">{papers.length}건</b>
          </p>
          <section className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
            {papers.map((p, i) => (
              <div key={p.id} className={i > 0 ? "border-t border-border" : undefined}>
                <PaperRow paper={{ ...p, read: true }} showDate={formatIssueDate(p.issue_date)} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
