"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, LayoutGrid, Loader2, Monitor, Pencil, Smartphone, Sparkles, Trash2, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PaperCard, type CardVariant } from "@/components/briefing/paper-card";
import { FitWidth } from "@/components/briefing/fit-width";
import { CardEditDialog } from "@/components/briefing/admin/card-edit-dialog";
import { deletePaper, generatePaperCard, saveCardEdit, setPaperReviewed } from "@/lib/actions/briefing-admin-actions";
import { checkFidelity } from "@/lib/briefing/fidelity";
import { DUP_REASON_LABEL, type DupHit } from "@/lib/briefing/planner";
import type { PaperCardContent } from "@/lib/briefing/schema";
import type { BriefingPaper } from "@/lib/briefing/types";

/** 카드를 어떤 모양으로 볼지. all = PC·라운딩·모바일을 한 화면에 같이 */
type View = "all" | CardVariant;
const VIEW_KEY = "soo-briefing-review-view";
const VIEWS = [
  { v: "all", label: "전체", icon: LayoutGrid },
  { v: "desktop", label: "PC", icon: Monitor },
  { v: "mobile", label: "모바일", icon: Smartphone },
  { v: "rounding", label: "라운딩", icon: Tv },
] as const;
const isView = (v: unknown): v is View => VIEWS.some((x) => x.v === v);

/** 미리보기 한 칸: 어떤 화면의 모양인지 이름표를 붙인다 */
function Preview({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // min-w-0: 안의 카드(고정 폭으로 그린 뒤 줄이는 PC 화면)가 칸을 밀어 넓히지 못하게
    <div className={cn("min-w-0 rounded-xl bg-muted p-3", className)}>
      <p className="mb-2 text-xs font-semibold text-subtle-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * 넘기면서 검수 (대기함 논문을 한 장씩).
 *
 * 왼쪽에 카드, 오른쪽에 원문과 "원문과 다를 수 있는 곳". 검수 완료를 누르면 다음 논문으로 넘어간다.
 * 카드는 직원이 실제로 보게 될 세 가지 모양(PC·모바일·라운딩 대기 화면)으로 같이 보여 준다 — 한 가지만 크게 볼 수도 있다(고른 보기는 이 PC에 기억).
 * 검수 완료 버튼에 포커스가 있어서 Enter 만 눌러도 된다. ← → 로 앞뒤 논문을 볼 수 있다.
 * 검수한 논문은 닫을 때가 아니라 누르는 즉시 발행 예정에 들어간다(서버가 날짜를 정한다).
 */
export function ReviewFlow({
  papers,
  startId,
  duplicates,
  perDay,
  onClose,
}: {
  /** 대기함 논문 (순서대로) */
  papers: BriefingPaper[];
  /** 이 논문부터 본다 (없으면 처음부터) */
  startId?: string | null;
  duplicates: Record<string, DupHit>;
  /** 하루 발행 건수 — 라운딩 미리보기의 "01 / 03" 표시에 쓴다 */
  perDay: number;
  /** 닫힐 때. changed = 무엇이든 바뀌었는가 (목록을 다시 읽어야 한다) */
  onClose: (changed: boolean) => void;
}) {
  const [list, setList] = useState<BriefingPaper[]>(papers);
  const [idx, setIdx] = useState(() => Math.max(0, papers.findIndex((p) => p.id === startId)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);
  const [changed, setChanged] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [view, setViewState] = useState<View>(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      return isView(saved) ? saved : "all";
    } catch {
      return "all";
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 저장하지 못해도 보기는 바뀐다
    }
  };

  const total = list.length;
  const current = list[Math.min(idx, total - 1)] ?? null;
  const card = current?.card_content ?? null;
  const warnings = useMemo(() => (current && card ? checkFidelity(current.raw_summary_text, card, [current.source_url ?? "", current.doi ?? ""]) : []), [current, card]);
  const dup = current ? duplicates[current.id] : undefined;

  const run = async (name: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch {
      setError("처리하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };
  const dropCurrent = () => {
    if (!current) return;
    const rest = list.filter((p) => p.id !== current.id);
    setList(rest);
    setIdx((i) => Math.min(i, Math.max(0, rest.length - 1)));
    setChanged(true);
  };
  const replace = (p: BriefingPaper) => setList((prev) => prev.map((x) => (x.id === p.id ? p : x)));

  const approve = () =>
    run("approve", async () => {
      if (!current || !card) return;
      const res = await setPaperReviewed(current.id, true);
      if (!res.ok) return setError(res.error);
      setDone((n) => n + 1);
      dropCurrent();
    });
  const remove = () =>
    run("delete", async () => {
      if (!current) return;
      const res = await deletePaper(current.id);
      if (!res.ok) return setError(res.error);
      dropCurrent();
    });
  const makeCard = () =>
    run("generate", async () => {
      if (!current) return;
      const res = await generatePaperCard(current.id);
      if (!res.ok) return setError(res.error);
      replace(res.data.paper);
      setChanged(true);
    });
  const saveCard = async (next: PaperCardContent): Promise<string | null> => {
    if (!current) return "논문을 찾지 못했어요.";
    const res = await saveCardEdit(current.id, next);
    if (!res.ok) return res.error;
    replace(res.data.paper);
    setChanged(true);
    return null;
  };
  const step = (dir: -1 | 1) => {
    setError("");
    setIdx((i) => Math.max(0, Math.min(total - 1, i + dir)));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose(changed)}>
      <DialogContent
        className="flex max-h-[94dvh] w-[calc(100vw-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1440px,96vw)]"
        onKeyDown={(e) => {
          if (editOpen || busy) return;
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3 pr-12">
          <DialogTitle className="text-base font-bold">넘기면서 검수</DialogTitle>
          {current && (
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[13px] font-semibold tabular-nums text-subtle-foreground">
              {Math.min(idx, total - 1) + 1} / {total}
            </span>
          )}
          {done > 0 && <span className="text-[13px] font-medium text-status-done">검수 {done}건 완료</span>}
          <DialogDescription className="sr-only">카드와 원문을 비교하고 검수 완료를 누르면 다음 논문으로 넘어가요. Enter 로 검수 완료, 좌우 화살표로 앞뒤 논문을 봐요.</DialogDescription>
          <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-border" role="group" aria-label="카드 보기">
            {VIEWS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
                  view === v ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {!current ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <div>
              <CheckCircle2 className="mx-auto size-9 text-status-done" />
              <p className="mt-3 text-lg font-bold">{done > 0 ? `${done}건을 검수했어요` : "검수할 논문이 없어요"}</p>
              <p className="mt-1 text-sm text-muted-foreground">검수한 논문은 다음 발행일부터 차례로 들어가요.</p>
              <Button className="mt-5 h-11 rounded-xl px-6 font-bold" autoFocus onClick={() => onClose(changed)}>
                닫기
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className={cn("grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:p-5", view === "mobile" ? "lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]")}>
              {/* 카드: 직원이 보게 될 모양 그대로 */}
              <div className="min-w-0">
                {card ? (
                  (() => {
                    const k = `${current.id}-${current.updated_at}`;
                    const desktop = (
                      // PC 폭(960px)으로 그린 뒤 이 칸에 맞게 줄여서 보여 준다
                      <FitWidth width={960}>
                        <PaperCard key={`${k}-d`} card={card} variant="desktop" />
                      </FitWidth>
                    );
                    const rounding = <PaperCard key={`${k}-r`} card={card} variant="rounding" rounding={{ dateLabel: "발행일 미정", index: 0, total: perDay }} className="rounded-lg" />;
                    const mobile = <PaperCard key={`${k}-m`} card={card} variant="mobile" className="w-full max-w-[380px]" />;
                    if (view === "desktop") return <Preview label="PC 화면">{desktop}</Preview>;
                    if (view === "rounding") return <Preview label="라운딩 대기 화면 (세미나실)">{rounding}</Preview>;
                    if (view === "mobile") return <Preview label="모바일 화면" className="flex flex-col items-center [&>p]:self-start">{mobile}</Preview>;
                    return (
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
                        <div className="flex min-w-0 flex-col gap-3">
                          <Preview label="PC 화면">{desktop}</Preview>
                          <Preview label="라운딩 대기 화면 (세미나실)">{rounding}</Preview>
                        </div>
                        <Preview label="모바일 화면" className="flex flex-col items-center [&>p]:self-start">
                          {mobile}
                        </Preview>
                      </div>
                    );
                  })()
                ) : (
                  <div className="grid min-h-[260px] w-full place-items-center rounded-xl bg-muted px-6 text-center">
                    <div>
                      <Sparkles className="mx-auto size-7 text-muted-foreground" />
                      <p className="mt-3 text-[15px] font-semibold">아직 카드가 없어요</p>
                      <Button className="mt-3 h-10 rounded-lg" disabled={!!busy} onClick={makeCard}>
                        {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} 카드 만들기
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* 원문 대조 */}
              <div className="flex min-w-0 flex-col gap-3">
                {dup && (
                  <p className="flex items-start gap-2 rounded-xl bg-status-ask-bg px-4 py-3 text-[13px] font-medium text-status-ask">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    이미 올린 논문과 같아 보여요 — {dup.where}과 {DUP_REASON_LABEL[dup.reason]}이에요. 같은 논문이면 지워 주세요.
                  </p>
                )}
                {card && (
                  <div className={cn("rounded-xl px-4 py-3 text-[13px]", warnings.length > 0 ? "bg-status-ask-bg" : "bg-status-done-bg")}>
                    {warnings.length > 0 ? (
                      <>
                        <p className="flex items-center gap-1.5 font-semibold text-status-ask">
                          <CircleAlert className="size-4" /> 원문과 다를 수 있는 곳 {warnings.length}개 — 확인해 주세요
                        </p>
                        <ul className="mt-1.5 grid gap-0.5 pl-[22px] text-foreground">
                          {warnings.slice(0, 8).map((w) => (
                            <li key={`${w.type}-${w.token}`}>
                              {w.message} <span className="text-muted-foreground">· {w.where}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="flex items-center gap-1.5 font-medium text-status-done">
                        <CheckCircle2 className="size-4" /> 카드의 숫자·영문 용어·출처가 모두 원문에 있어요.
                      </p>
                    )}
                  </div>
                )}
                <div className="min-h-0 flex-1 rounded-xl bg-card ring-1 ring-border">
                  <p className="border-b border-border px-4 py-2 text-[13px] font-semibold text-subtle-foreground">붙여넣은 원문</p>
                  <p className="max-h-[38dvh] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[14px] leading-[1.7] [overflow-wrap:anywhere] lg:max-h-[52dvh]">{current.raw_summary_text}</p>
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" className="mx-5 mb-2 rounded-lg bg-status-late-bg px-3 py-2 text-sm font-medium text-status-late">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 lg:px-5">
              <Button variant="outline" size="icon" className="size-10 rounded-lg" disabled={!!busy || idx <= 0} onClick={() => step(-1)} aria-label="앞 논문">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" className="size-10 rounded-lg" disabled={!!busy || idx >= total - 1} onClick={() => step(1)} aria-label="다음 논문 (검수하지 않고 넘기기)">
                <ChevronRight className="size-4" />
              </Button>
              <Button variant="outline" className="h-10 rounded-lg" disabled={!!busy || !card} onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> 카드 고치기
              </Button>
              <Button variant="outline" className="h-10 rounded-lg text-status-late hover:bg-status-late-bg hover:text-status-late" disabled={!!busy} onClick={remove}>
                {busy === "delete" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} 지우기
              </Button>
              <Button key={current.id} autoFocus className="ml-auto h-11 rounded-xl px-5 text-[15px] font-bold" disabled={!!busy || !card} onClick={approve}>
                {busy === "approve" ? <Loader2 className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
                {busy === "approve" ? "넣는 중…" : "검수 완료 · 다음"}
              </Button>
            </div>
          </>
        )}

        {current && card && (
          <CardEditDialog key={`${current.id}-${current.updated_at}`} open={editOpen} onOpenChange={setEditOpen} card={card} rawText={current.raw_summary_text} onSave={saveCard} />
        )}
      </DialogContent>
    </Dialog>
  );
}
