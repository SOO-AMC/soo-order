import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fetchPublicArchive } from "@/lib/briefing/public-reader";
import { formatIssueDate } from "@/lib/briefing/kst";
import { CATEGORY_KEYS, CATEGORY_LABEL, type CategoryKey } from "@/lib/briefing/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "지난 브리핑" };

const catLabel = (c: string | null) => ((CATEGORY_KEYS as readonly string[]).includes(c ?? "") ? CATEGORY_LABEL[c as CategoryKey].ko : null);

/** 공개: 날짜별 브리핑 목록 (최근 순) */
export default async function PublicBriefingListPage() {
  const days = await fetchPublicArchive();
  return (
    <div>
      <h1 className="text-[22px] font-extrabold tracking-tight">수의학 논문 브리핑</h1>
      <p className="mt-1 text-[14px] text-[var(--bf-slate-500)]">매일 08:30 · 내과·외과·영상·응급 분야의 최신 논문을 PubMed에서 골라 한국어로 정리합니다.</p>
      {days.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-white px-5 py-10 text-center text-[15px] text-[var(--bf-slate-500)] ring-1 ring-[var(--bf-line)]">아직 발행된 브리핑이 없어요.</p>
      ) : (
        <div className="mt-5 grid gap-4">
          {days.map((d) => (
            <section key={d.date} className="overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--bf-line)]">
              <Link href={`/b/${d.date}`} className="flex items-center justify-between gap-3 border-b border-[var(--bf-line)] px-5 py-3.5 hover:bg-[var(--bf-ivory-50)]">
                <b className="text-[16px] font-bold tabular-nums">{formatIssueDate(d.date)}</b>
                <span className="flex items-center gap-1 text-[13px] font-semibold text-[var(--bf-teal-700)]">
                  카드 {d.papers.length}장 보기 <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
              <ul>
                {d.papers.map((p, i) => (
                  <li key={p.id} className={i > 0 ? "border-t border-[var(--bf-line)]" : undefined}>
                    <Link href={`/b/paper/${p.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--bf-ivory-50)]">
                      <span className="mt-0.5 w-12 shrink-0 text-[12px] font-bold text-[var(--bf-slate-500)]">{catLabel(p.category) ?? "논문"}</span>
                      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-[1.5]">
                        {p.priority && <span className="mr-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-[#8a6426] ring-1 ring-[#c9a25c]">꼭 확인</span>}
                        {p.headline}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
