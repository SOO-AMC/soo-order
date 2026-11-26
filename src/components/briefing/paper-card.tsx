import type { ReactNode } from "react";
import Image from "next/image";
import { BookOpen, Check, ChevronRight, ExternalLink, Repeat, Scale, Stethoscope, Target, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, fitSentences, type CardBlock, type PaperCardContent } from "@/lib/briefing/schema";
import { clip } from "@/lib/briefing/rule-designer";
import "./briefing.css";

/**
 * 논문 카드 (논문 1건 = 이 카드 1장).
 *
 * 같은 카드 데이터를 세 가지 모양으로 그린다. 어느 모양이든 한 장이다.
 *  - "mobile"   : 세로형. 길면 카드 안에서 세로로 읽는다(스크롤해도 한 장).
 *  - "desktop"  : 넓은 화면. 구역을 2열로 펼친다.
 *  - "rounding" : 16:9 세미나실 화면. 큰 제목 + 한 줄 핵심 + 포인트 2~3개.
 *
 * 글자는 전부 텍스트로만 넣는다(HTML 삽입 없음). 색은 briefing.css 의 고정 색.
 */
export type CardVariant = "mobile" | "desktop" | "rounding";

export function categoryText(card: PaperCardContent) {
  return card.category ? CATEGORY_LABEL[card.category] : null;
}

/** 출처 한 줄. 정보가 없으면 지어내지 않고 "출처 정보 미입력" */
export function sourceLine(card: PaperCardContent): string {
  const s = card.source;
  const parts = [s.authors, s.journal, s.journal && s.year && s.journal.includes(s.year) ? null : s.year, s.studyType, s.basis].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  if (s.doi) return `doi: ${s.doi}`;
  if (s.url) return "원문 링크 있음";
  return "출처 정보 미입력";
}

export function sourceHref(card: PaperCardContent): string | null {
  if (card.source.url) return card.source.url;
  if (card.source.doi) return `https://doi.org/${card.source.doi}`;
  return null;
}

/** "꼭 확인" — 진료를 바로 바꿀 만한 논문 (AI 가 표시) */
function PriorityChip({ card, className }: { card: PaperCardContent; className?: string }) {
  if (!card.flags.includes("priority")) return null;
  return <span className={cn("inline-flex items-center rounded-full px-[0.9em] py-[0.35em] font-bold text-[var(--bf-gold-300)] ring-1 ring-[var(--bf-gold-400)]/70", className)}>꼭 확인</span>;
}

/** 한 문단형 본문 (모바일·PC) — 요약 문단 · 임상적 의미 · 주의. 같은 글자 크기·줄 간격 */
function BriefBody({ card, wide }: { card: PaperCardContent; wide: boolean }) {
  const summary = card.blocks.find((b) => b.kind === "keyPoint");
  // 휴대폰: 제목 + 요약 한 문단만 (인스타 "수의학 데일리 브리핑" 카드처럼 한 화면에). 임상적 의미·주의는 "해설 보기"에서.
  // 해설이 없는 카드(예전 카드)는 갈 곳이 없으니 그대로 다 보여 준다.
  const compact = !wide && !!card.detail;
  const clinical = compact ? undefined : card.blocks.find((b) => b.kind === "clinical");
  const caution = compact ? undefined : card.blocks.find((b) => b.kind === "caution");
  const size = wide ? "text-[17px] leading-[1.85]" : "text-[16px] leading-[1.8]";
  return (
    <div className="grid gap-5">
      {summary && <p className={cn(size, "text-[var(--bf-ink)]")}>{summary.text}</p>}
      {clinical && (
        <div className="rounded-2xl bg-[var(--bf-teal-100)] px-4 py-3.5">
          <BlockLabel icon={<Stethoscope />}>임상적 의미</BlockLabel>
          <p className={cn(size, "text-[var(--bf-ink)]")}>{clinical.text}</p>
        </div>
      )}
      {caution && (
        <p className={cn(size, "flex gap-2 text-[var(--bf-slate-700)]")}>
          <TriangleAlert className="mt-[0.35em] size-4 shrink-0 text-[#8a6426]" aria-hidden="true" />
          <span>
            <b className="mr-1.5 font-bold text-[#8a6426]">주의</b>
            {caution.text}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * 라운딩 면의 한 문단형 본문. TV 는 멀리서 훑어보는 화면이라 긴 문단을 자르지 않고 따로 쓴 짧은 글을 보여 준다:
 * AI 가 만든 핵심 한 문장(lead) + 짧은 줄(라운딩 bullets). 그게 없는 예전 카드는 요약·임상적 의미를 "문장이 끝나는 곳"까지만.
 */
function RoundingBrief({ card }: { card: PaperCardContent }) {
  const tv = card.blocks.find((b): b is Extract<CardBlock, { kind: "bullets" }> => b.kind === "bullets" && b.label === "라운딩");
  if (card.lead || tv) {
    return (
      <div className="mt-[2.2cqw] flex min-h-0 flex-1 flex-col gap-[1.8cqw] overflow-hidden">
        {card.lead && (
          <div className="flex shrink-0 items-start gap-[1.4cqw] rounded-[1.2cqw] bg-white/[0.06] px-[2cqw] py-[1.5cqw] ring-1 ring-white/15">
            <span className="mt-[0.15cqw] flex shrink-0 items-center gap-[0.6cqw] text-[1.6cqw] font-bold text-[var(--bf-gold-300)] [&_svg]:size-[1.9cqw]">
              <Target aria-hidden="true" />
              핵심
            </span>
            <p className="line-clamp-3 text-[2.05cqw] font-semibold leading-[1.45]">{card.lead}</p>
          </div>
        )}
        {tv && (
          <ul className="grid shrink-0 gap-[1cqw]">
            {tv.items.map((t, i) => {
              const clinicalLine = /^임상\s*[:：]\s*/.test(t);
              return (
                <li key={i} className="flex items-start gap-[1cqw] text-[1.75cqw] leading-[1.45] text-white/90">
                  <span className="mt-[0.28cqw] shrink-0 text-[var(--bf-gold-400)] [&_svg]:size-[1.8cqw]" aria-hidden="true">
                    {clinicalLine ? <Stethoscope /> : <Check />}
                  </span>
                  <span className="line-clamp-2">
                    {clinicalLine && <b className="mr-[0.5cqw] font-bold text-[var(--bf-gold-300)]">임상</b>}
                    {t.replace(/^임상\s*[:：]\s*/, "")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  const summary = card.blocks.find((b) => b.kind === "keyPoint");
  const clinical = card.blocks.find((b) => b.kind === "clinical");
  const summaryText = summary && "text" in summary ? fitSentences(summary.text, 170) : null;
  const clinicalText = clinical && "text" in clinical ? fitSentences(clinical.text, 95) : null;
  return (
    <div className="mt-[2cqw] flex min-h-0 flex-1 flex-col gap-[1.6cqw] overflow-hidden">
      {summaryText && <p className="shrink-0 text-[1.9cqw] leading-[1.6] text-white/90">{summaryText}</p>}
      {clinicalText && (
        <div className="flex shrink-0 items-start gap-[1.4cqw] rounded-[1.2cqw] bg-white/[0.06] px-[2cqw] py-[1.3cqw] ring-1 ring-white/15">
          <span className="mt-[0.1cqw] flex shrink-0 items-center gap-[0.6cqw] text-[1.6cqw] font-bold text-[var(--bf-gold-300)] [&_svg]:size-[1.9cqw]">
            <Stethoscope aria-hidden="true" />
            임상
          </span>
          <p className="text-[1.75cqw] font-semibold leading-[1.5]">{clinicalText}</p>
        </div>
      )}
    </div>
  );
}

function CategoryChip({ card, className }: { card: PaperCardContent; className?: string }) {
  const c = categoryText(card);
  return (
    <span className={cn("inline-flex items-center gap-[0.5em] rounded-full bg-[var(--bf-gold-100)] px-[0.9em] py-[0.35em] font-bold text-[var(--bf-ink)]", className)}>
      <span>{c ? c.ko : "분야 미지정"}</span>
      {c && <span className="font-semibold tracking-[0.06em] opacity-70">{c.en}</span>}
    </span>
  );
}

/** 구역 제목 (아이콘 + 글자 — 색만으로 구분하지 않는다) */
function BlockLabel({ icon, children, tone = "teal" }: { icon: ReactNode; children: ReactNode; tone?: "teal" | "gold" }) {
  return (
    <span className={cn("mb-1.5 flex items-center gap-1.5 text-[13px] font-bold", tone === "gold" ? "text-[#8a6426]" : "text-[var(--bf-teal-700)]")}>
      <span className="[&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** 밝은 본문(모바일·PC)에서의 구역 하나 */
function LightBlock({ block }: { block: CardBlock }) {
  switch (block.kind) {
    case "keyPoint":
      return (
        <div>
          <BlockLabel icon={<BookOpen />}>{block.label}</BlockLabel>
          <p className="text-[15px] leading-[1.65] text-[var(--bf-slate-700)]">{block.text}</p>
        </div>
      );
    case "bullets":
      return (
        <div>
          <BlockLabel icon={<Target />}>{block.label}</BlockLabel>
          <ul className="grid gap-1.5">
            {block.items.map((t, i) => (
              <li key={i} className="flex gap-2 text-[15px] leading-[1.6] text-[var(--bf-slate-700)]">
                <Check className="mt-[0.3em] size-4 shrink-0 text-[var(--bf-teal-500)]" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "metric":
      return (
        <div className="rounded-2xl bg-[var(--bf-ivory-100)] px-4 py-3.5 ring-1 ring-[var(--bf-line)]">
          <BlockLabel icon={<Target />}>{block.label}</BlockLabel>
          <p className="text-[34px] font-extrabold leading-none tracking-tight text-[var(--bf-navy-900)] tabular-nums">{block.value}</p>
          {block.note && <p className="mt-2 text-[14px] leading-[1.6] text-[var(--bf-slate-700)]">{block.note}</p>}
        </div>
      );
    case "comparison":
      return (
        <div>
          <BlockLabel icon={<Scale />}>비교</BlockLabel>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: block.leftLabel, value: block.leftValue },
              { label: block.rightLabel, value: block.rightValue },
            ].map((side, i) => (
              <div key={i} className="rounded-2xl bg-[var(--bf-ivory-100)] px-3.5 py-3 ring-1 ring-[var(--bf-line)]">
                <p className="truncate text-[13px] font-semibold text-[var(--bf-slate-700)]">{side.label}</p>
                {side.value && <p className="mt-1 whitespace-nowrap text-[24px] font-extrabold leading-none tracking-tight text-[var(--bf-navy-900)] tabular-nums">{side.value}</p>}
              </div>
            ))}
          </div>
          {block.description && <p className="mt-2 text-[14px] leading-[1.6] text-[var(--bf-slate-700)]">{block.description}</p>}
        </div>
      );
    case "clinical":
      return (
        <div className="rounded-2xl bg-[var(--bf-teal-100)] px-4 py-3.5">
          <BlockLabel icon={<Stethoscope />}>임상 포인트</BlockLabel>
          <p className="text-[15px] font-medium leading-[1.65] text-[var(--bf-ink)]">{block.text}</p>
        </div>
      );
    case "caution":
      return (
        <div className="rounded-2xl bg-[var(--bf-gold-100)] px-4 py-3.5">
          <BlockLabel icon={<TriangleAlert />} tone="gold">
            주의·한계
          </BlockLabel>
          <p className="text-[15px] leading-[1.65] text-[var(--bf-ink)]">{block.text}</p>
        </div>
      );
  }
}

/**
 * 라운딩 화면용 짧은 포인트 (최대 3개).
 * 새 문장을 쓰지 않는다 — 카드에 이미 있는 글을 고르고, 길면 잘라낼 뿐이다.
 */
export function roundingPoints(card: PaperCardContent, max = 3): { kind: CardBlock["kind"]; text: string }[] {
  const out: { kind: CardBlock["kind"]; text: string }[] = [];
  for (const b of card.blocks) {
    if (out.length >= max) break;
    if (b.kind === "comparison") {
      const l = [b.leftLabel, b.leftValue].filter(Boolean).join(" ");
      const r = [b.rightLabel, b.rightValue].filter(Boolean).join(" ");
      out.push({ kind: b.kind, text: `${l}  vs  ${r}` });
    } else if (b.kind === "metric") {
      out.push({ kind: b.kind, text: b.note ? clip(b.note, 96) : `${b.value} · ${b.label}` });
    } else if (b.kind === "bullets") {
      for (const t of b.items) {
        if (out.length >= max) break;
        out.push({ kind: b.kind, text: clip(t, 96) });
      }
    } else {
      out.push({ kind: b.kind, text: clip(b.text, 96) });
    }
  }
  // 같은 문장이 한 줄 핵심과 겹치면 뺀다
  return out.filter((p) => p.text !== card.lead).slice(0, max);
}

export function PaperCard({
  card,
  variant,
  dateLabel,
  progress,
  rounding,
  detailHref,
  roundingQr,
  className,
}: {
  card: PaperCardContent;
  variant: CardVariant;
  /** 카드 머리에 넣을 날짜 (예: 2026.11.14 (토)) */
  dateLabel?: string;
  /** "02 / 04" — 실제 논문 수로 계산한 값 */
  progress?: string;
  /** 라운딩 화면의 공통 머리·바닥 (날짜·진행률·AUTO LOOP). 논문 카드 밖의 덮개이지 별도 장이 아니다 */
  rounding?: RoundingChrome;
  /** 해설이 있는 카드에 "해설 보기" 버튼을 단다 (해설 페이지 주소 또는 같은 화면의 #해설) */
  detailHref?: string;
  /** 라운딩 화면 구석의 QR (해설 페이지로) — 라운딩 화면이 만들어 넘긴다 */
  roundingQr?: ReactNode;
  className?: string;
}) {
  if (variant === "rounding") return <RoundingFace card={card} chrome={rounding} qr={roundingQr} className={className} />;

  const href = sourceHref(card);
  const wide = variant === "desktop";
  // 한 문단형(자동으로 찾은 논문): 제목 · 요약 한 문단 · 임상적 의미 · 주의 — 글자 크기를 하나로 맞춘다
  const brief = card.layoutVariant === "brief";
  // PC: 구역이 3개 이상이면 2열로 펼친다 (한 장 안의 격자). 카드 폭이 좁으면 1열로 떨어진다(@container)
  const twoCol = wide && !brief && card.blocks.length >= 3;

  return (
    <article className={cn("bf bf-text @container overflow-hidden rounded-[22px] bg-[var(--bf-ivory-50)] text-[var(--bf-ink)] shadow-[0_18px_40px_-24px_rgb(8_35_68/0.45)] ring-1 ring-[var(--bf-line)]", className)}>
      {/* 머리: 네이비 띠 + 제목 */}
      <header className={cn("bf-navy-surface text-white", wide ? "px-8 pb-7 pt-6" : "px-5 pb-6 pt-5")}>
        <div className="flex items-center justify-between gap-3 text-[12px] font-semibold tracking-[0.08em] text-[var(--bf-gold-300)]">
          <span className="whitespace-nowrap">SOO AMC · DAILY JOURNAL</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-white/70">{(wide ? [dateLabel, progress] : [progress ?? dateLabel]).filter(Boolean).join("  ·  ")}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CategoryChip card={card} className="text-[12px]" />
          <PriorityChip card={card} className="text-[12px]" />
        </div>
        <h2 className={cn("mt-3 font-extrabold tracking-tight", wide ? "text-[30px] leading-[1.3]" : "text-[23px] leading-[1.35]")}>{card.headline}</h2>
      </header>

      <div className={cn(wide ? "px-8 py-6" : "px-5 py-5")}>
        {/* 한 문단형은 핵심 한 문장(lead)을 라운딩 TV 에서만 쓴다 — 카드에서는 요약과 겹친다 */}
        {card.lead && !brief && (
          <div className="mb-5 rounded-2xl bg-[var(--bf-teal-100)] px-4 py-3.5">
            <BlockLabel icon={<Target />}>한 줄 핵심</BlockLabel>
            <p className={cn("font-bold leading-[1.55] text-[var(--bf-ink)]", wide ? "text-[19px]" : "text-[17px]")}>{card.lead}</p>
          </div>
        )}

        {brief ? (
          <BriefBody card={card} wide={wide} />
        ) : card.blocks.length > 0 && (
          <div className={cn(twoCol ? "@[620px]:columns-2 @[620px]:gap-x-7 [&>*]:mb-5 [&>*]:break-inside-avoid [&>*:last-child]:mb-0" : "grid gap-5")}>
            {card.blocks.map((b, i) => (
              <LightBlock key={i} block={b} />
            ))}
          </div>
        )}

        {detailHref && card.detail && (
          <a
            href={detailHref}
            className="mt-6 flex items-center justify-center gap-1 rounded-xl bg-[var(--bf-navy-900)] py-3 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
          >
            해설 보기 <ChevronRight className="size-4" aria-hidden="true" />
          </a>
        )}

        {/* 출처 */}
        <footer className="mt-6 flex items-center gap-2 border-t border-[var(--bf-line)] pt-4 text-[13px] text-[var(--bf-slate-500)]">
          <BookOpen className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{sourceLine(card)}</span>
            {brief && card.source.title && <span className="mt-0.5 block truncate text-[12px] italic opacity-80">{card.source.title}</span>}
          </span>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--bf-teal-700)] underline-offset-2 hover:underline"
            >
              원문 보기 <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          )}
        </footer>
      </div>
    </article>
  );
}

const POINT_ICON: Record<CardBlock["kind"], ReactNode> = {
  keyPoint: <Check />,
  bullets: <Check />,
  metric: <Target />,
  comparison: <Scale />,
  clinical: <Stethoscope />,
  caution: <TriangleAlert />,
};

/**
 * 16:9 라운딩 면. 글자 크기를 화면 폭 비율(cqw)로 잡아서
 * 4K TV에서도, 관리자 미리보기의 작은 썸네일에서도 같은 비례로 보인다.
 * 상단 로고·날짜·진행률과 하단 AUTO LOOP 표시는 이 면 밖의 공통 덮개(RoundingScreen)가 그린다.
 */
export type RoundingChrome = {
  dateLabel: string;
  /** 지금 몇 번째 논문인지 (0부터) */
  index: number;
  /** 오늘 발행된 논문 수 = 총 장수 */
  total: number;
  /** 이 장에서 흐른 시간 비율 0~1 (자동 넘김 진행바). 없으면 진행바를 채우지 않는다 */
  elapsed?: number;
  paused?: boolean;
  /** 머리 글자. 없으면 "오늘의 수의학 논문 브리핑" (지난 브리핑을 틀 때 바꾼다) */
  title?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function RoundingFace({ card, chrome, qr, className }: { card: PaperCardContent; chrome?: RoundingChrome; qr?: ReactNode; className?: string }) {
  const points = roundingPoints(card);
  return (
    <div className={cn("bf bf-text bf-navy-surface relative aspect-video w-full overflow-hidden text-white [container-type:inline-size]", className)}>
      {/* 가는 금색 테두리 */}
      <div className="pointer-events-none absolute inset-[1.6cqw] rounded-[1.6cqw] ring-1 ring-[var(--bf-gold-400)]/35" aria-hidden="true" />

      {chrome && (
        <>
          {/* 공통 머리: 로고 · 오늘의 논문 브리핑 · 날짜 · 진행률 (표지 장이 아니라 덮개) */}
          <div className="absolute inset-x-[4cqw] top-[2.9cqw] flex items-center gap-[1.6cqw]">
            <Image src="/sooorder-brand/logo-horizontal-on-dark.webp" alt="수오더" width={1231} height={440} className="h-[2.7cqw] w-auto" />
            <span className="h-[2cqw] w-px bg-white/25" aria-hidden="true" />
            <span className="text-[1.45cqw] font-semibold tracking-[0.04em] text-[var(--bf-gold-300)]">{chrome.title ?? "오늘의 수의학 논문 브리핑"}</span>
            <span className="text-[1.3cqw] tabular-nums text-white/60">{chrome.dateLabel}</span>
            <span className="ml-auto flex items-center gap-[0.5cqw]" aria-hidden="true">
              {Array.from({ length: chrome.total }).map((_, i) => (
                <span key={i} className="relative h-[0.42cqw] w-[4.4cqw] overflow-hidden rounded-full bg-white/20">
                  <span
                    className="bf-fade-off absolute inset-y-0 left-0 rounded-full bg-[var(--bf-gold-400)] transition-[width] duration-300 ease-linear"
                    style={{ width: i < chrome.index ? "100%" : i === chrome.index ? `${Math.round((chrome.elapsed ?? 1) * 100)}%` : "0%" }}
                  />
                </span>
              ))}
            </span>
            <span className="text-[2cqw] font-bold tabular-nums" aria-label={`${chrome.total}장 중 ${chrome.index + 1}번째`}>
              {pad2(chrome.index + 1)}
              <span className="text-white/50"> / {pad2(chrome.total)}</span>
            </span>
          </div>
          {/* 공통 바닥 */}
          <div className="absolute inset-x-[4cqw] bottom-[2.4cqw] flex items-center gap-[1.2cqw] border-t border-white/15 pt-[1.3cqw] text-[1.25cqw]">
            <span className="font-bold tracking-[0.06em] text-[var(--bf-gold-300)]">12:00 ROUNDING</span>
            <span className="text-white/65">입원환자 라운딩 대기 중, 오늘의 연구를 확인하세요.</span>
            <span className="ml-auto flex items-center gap-[0.6cqw] font-semibold tracking-[0.06em] text-[var(--bf-gold-300)] [&_svg]:size-[1.5cqw]">
              <Repeat aria-hidden="true" />
              {chrome.paused ? "PAUSED" : "AUTO LOOP"}
            </span>
          </div>
        </>
      )}

      {/* key: 논문이 바뀌면 본문만 다시 나타난다 (공통 머리·바닥은 그대로) */}
      <div key={card.headline} className={cn("absolute inset-0 flex flex-col px-[6cqw] pb-[7.2cqw] pt-[8.2cqw]", chrome && "bf-fade", qr && "pr-[16cqw]")}>
        <div className="flex shrink-0 items-center gap-[0.8cqw]">
          <CategoryChip card={card} className="text-[1.35cqw]" />
          <PriorityChip card={card} className="text-[1.35cqw]" />
        </div>

        <h2 className="mt-[1.6cqw] line-clamp-2 shrink-0 text-[4.1cqw] font-extrabold leading-[1.22] tracking-tight">{card.headline}</h2>

        {card.layoutVariant === "brief" && <RoundingBrief card={card} />}

        {card.layoutVariant !== "brief" && card.lead && (
          <div className="mt-[2.2cqw] flex shrink-0 items-start gap-[1.4cqw] rounded-[1.2cqw] bg-white/[0.06] px-[2cqw] py-[1.5cqw] ring-1 ring-white/15">
            <span className="mt-[0.15cqw] flex shrink-0 items-center gap-[0.6cqw] text-[1.6cqw] font-bold text-[var(--bf-gold-300)] [&_svg]:size-[1.9cqw]">
              <Target aria-hidden="true" />
              핵심
            </span>
            <p className="line-clamp-3 text-[2.05cqw] font-semibold leading-[1.45]">{card.lead}</p>
          </div>
        )}

        {card.layoutVariant !== "brief" && points.length > 0 && (
          <ul className="mt-[1.8cqw] grid min-h-0 flex-1 content-start gap-[0.9cqw] overflow-hidden">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-[1cqw] text-[1.62cqw] leading-[1.45] text-white/85">
                <span className="mt-[0.28cqw] shrink-0 text-[var(--bf-gold-400)] [&_svg]:size-[1.7cqw]" aria-hidden="true">
                  {POINT_ICON[p.kind]}
                </span>
                <span className="line-clamp-2">
                  {p.kind === "caution" && <b className="mr-[0.5cqw] font-bold text-[var(--bf-gold-300)]">주의</b>}
                  {p.kind === "clinical" && <b className="mr-[0.5cqw] font-bold text-[var(--bf-gold-300)]">임상</b>}
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-auto flex shrink-0 items-center gap-[0.7cqw] pt-[1.2cqw] text-[1.25cqw] text-white/60 [&_svg]:size-[1.45cqw] [&_svg]:shrink-0">
          <BookOpen aria-hidden="true" />
          <span className="min-w-0 truncate">{sourceLine(card)}</span>
        </p>
        {qr && (
          <div className="absolute bottom-[7.6cqw] right-[4.6cqw] flex flex-col items-center gap-[0.5cqw]">
            <div className="rounded-[0.8cqw] bg-white p-[0.6cqw] [&_svg]:block [&_svg]:size-[8.5cqw]">{qr}</div>
            <span className="text-[1.05cqw] font-semibold text-white/70">해설 보기</span>
          </div>
        )}
      </div>
    </div>
  );
}
