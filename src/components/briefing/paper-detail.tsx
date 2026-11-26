import { ChevronLeft, ExternalLink, FileText, Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { sourceHref } from "@/components/briefing/paper-card";
import type { PaperCardContent } from "@/lib/briefing/schema";

/**
 * 논문 1건의 해설 — 카드 아래(또는 공개 해설 페이지)에 붙는 긴 글. 장이 아니라 같은 논문의 읽을거리다.
 * 서버·클라이언트 어디서나 쓸 수 있게 훅을 쓰지 않는다.
 * 해설이 없는 카드(직접 붙여넣은 논문)는 논문 정보만 보여 준다.
 */
export function PaperDetail({
  card,
  id,
  className,
  closeHref,
}: {
  card: PaperCardContent;
  id?: string;
  className?: string;
  /** "해설 닫기" → 보던 카드로 (같은 화면의 #카드 또는 그날 브리핑의 그 카드). 없으면 버튼 없음 */
  closeHref?: string;
}) {
  const d = card.detail;
  const clinical = d?.clinical ?? card.blocks.find((b) => b.kind === "clinical")?.text ?? null;
  const s = card.source;
  const href = sourceHref(card);
  const rows: [string, React.ReactNode][] = [];
  if (s.journal || s.year) rows.push(["출처", [s.journal, s.year].filter(Boolean).join(", ")]);
  if (s.title) rows.push(["원제", <span key="t" className="italic">{s.title}</span>]);
  if (s.studyType) rows.push(["근거 수준", s.studyType]);
  if (d?.author) rows.push([d.author.role === "corresponding" ? "교신저자" : "제1저자", [d.author.name, d.author.affiliation].filter(Boolean).join(" · ")]);
  else if (s.authors) rows.push(["저자", s.authors]);
  if (s.doi) rows.push(["DOI", s.doi]);
  if (s.basis) rows.push(["요약 기준", s.basis]);

  return (
    <section id={id} className={cn("bf bf-text scroll-mt-20 rounded-[22px] bg-[var(--bf-ivory-50)] px-5 py-6 text-[var(--bf-ink)] ring-1 ring-[var(--bf-line)] lg:px-8 lg:py-7", className)}>
      {closeHref && (
        <div className="-mt-2 mb-3 flex justify-end">
          <a
            href={closeHref}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3.5 text-[13px] font-bold text-[var(--bf-slate-500)] ring-1 ring-[var(--bf-line)] hover:text-[var(--bf-ink)]"
          >
            <X className="size-4" aria-hidden="true" /> 닫기
          </a>
        </div>
      )}
      {d && d.paragraphs.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
            <FileText className="size-[18px] text-[var(--bf-teal-700)]" aria-hidden="true" /> 해설
          </h2>
          <div className="mt-3 grid gap-4">
            {d.paragraphs.map((p, i) => (
              <p key={i} className="text-[16px] leading-[1.85] lg:text-[17px]">
                {p}
              </p>
            ))}
          </div>
        </>
      )}

      {clinical && (
        <div className={cn("rounded-2xl bg-[var(--bf-teal-100)] px-4 py-4", d && d.paragraphs.length > 0 && "mt-6")}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[14px] font-bold text-[var(--bf-teal-700)]">
            <Stethoscope className="size-4" aria-hidden="true" /> 임상적 의미
          </h3>
          <p className="text-[16px] leading-[1.85] lg:text-[17px]">{clinical}</p>
        </div>
      )}

      {rows.length > 0 && (
        <dl className="mt-6 grid gap-x-4 gap-y-2.5 border-t border-[var(--bf-line)] pt-5 text-[14px] sm:grid-cols-[88px_1fr]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-[var(--bf-slate-500)]">{k}</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--bf-teal-700)] underline-offset-2 hover:underline"
        >
          원문 보기 <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
      {d && <p className="mt-4 text-[12px] leading-[1.6] text-[var(--bf-slate-500)]">PubMed에 등록된 논문을 AI가 요약·해설했어요. 요약과 해석에 오류가 있을 수 있으니 중요한 판단 전에는 원문을 확인해 주세요.</p>}
      {closeHref && (
        <a
          href={closeHref}
          className="mt-5 flex items-center justify-center gap-1 rounded-xl bg-[var(--bf-navy-900)] py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> 해설 닫기 · 카드로 돌아가기
        </a>
      )}
    </section>
  );
}
