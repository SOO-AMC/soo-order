"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LAYOUT_LABEL, LAYOUT_VARIANTS, parseCard, type CardBlock, type LayoutVariant, type PaperCardContent } from "@/lib/briefing/schema";

const KIND_LABEL: Record<CardBlock["kind"], string> = {
  keyPoint: "글 구역",
  bullets: "목록 구역",
  metric: "숫자 강조",
  comparison: "비교",
  clinical: "임상 포인트",
  caution: "주의·한계",
};

const fieldCls =
  "block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-[1.6] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] font-semibold text-subtle-foreground">{children}</span>;
}

/**
 * 카드 글·템플릿 고치기.
 * 한 장 안의 구역을 고치거나 지울 수 있다. 장을 더하는 기능은 없다(논문 1건 = 카드 1장).
 * 왼쪽에 원문을 같이 보여 줘서 숫자·용어를 원문과 맞춰 볼 수 있다.
 */
export function CardEditDialog({
  open,
  onOpenChange,
  card,
  rawText,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PaperCardContent;
  rawText: string;
  /** 저장. 실패하면 사람 말 오류를 돌려준다 */
  onSave: (card: PaperCardContent) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<PaperCardContent>(card);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setBlock = (i: number, next: CardBlock) => setDraft((d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? next : b)) }));
  const removeBlock = (i: number) => setDraft((d) => ({ ...d, blocks: d.blocks.filter((_, j) => j !== i) }));
  const setSource = (k: keyof PaperCardContent["source"], v: string) => setDraft((d) => ({ ...d, source: { ...d.source, [k]: v.trim() ? v : null } }));

  const handleSave = async () => {
    setError("");
    const parsed = parseCard(draft);
    if (!parsed.ok) {
      setError(`형식이 맞지 않아요 (${parsed.error})`);
      return;
    }
    setSaving(true);
    const err = await onSave(parsed.card);
    setSaving(false);
    if (err) setError(err);
    else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>카드 글·템플릿 고치기</DialogTitle>
          <DialogDescription>원문과 나란히 보면서 고쳐요. 숫자·약물명·출처는 원문과 같아야 해요.</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          {/* 원문 */}
          <div className="hidden min-h-0 flex-col border-r border-border bg-muted/50 lg:flex">
            <p className="px-5 pt-4 text-[13px] font-semibold text-subtle-foreground">붙여넣은 원문</p>
            <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 pb-5 pt-2 text-sm leading-[1.7] text-foreground">{rawText}</p>
          </div>

          {/* 편집 */}
          <div className="grid min-h-0 gap-4 overflow-y-auto px-5 py-4">
            <label className="grid gap-1.5">
              <Label>제목</Label>
              <textarea rows={2} value={draft.headline} onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))} className={fieldCls} />
            </label>
            <label className="grid gap-1.5">
              <Label>한 줄 핵심</Label>
              <textarea rows={2} value={draft.lead ?? ""} onChange={(e) => setDraft((d) => ({ ...d, lead: e.target.value.trim() ? e.target.value : null }))} className={fieldCls} />
            </label>

            <label className="grid gap-1.5">
              <Label>템플릿 (한 장 안의 배치 방식)</Label>
              <Select value={draft.layoutVariant} onValueChange={(v) => setDraft((d) => ({ ...d, layoutVariant: v as LayoutVariant }))}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYOUT_VARIANTS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {LAYOUT_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <div className="grid gap-3">
              <Label>카드 안 구역 {draft.blocks.length}개</Label>
              {draft.blocks.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-xl bg-muted/60 p-3 ring-1 ring-border">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-subtle-foreground">{KIND_LABEL[b.kind]}</span>
                    <button type="button" onClick={() => removeBlock(i)} aria-label="이 구역 빼기" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-status-late-bg hover:text-status-late">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {(b.kind === "keyPoint" || b.kind === "bullets") && (
                    <Input value={b.label} onChange={(e) => setBlock(i, { ...b, label: e.target.value })} placeholder="구역 이름" className="h-9" />
                  )}
                  {(b.kind === "keyPoint" || b.kind === "clinical" || b.kind === "caution") && (
                    <textarea rows={3} value={b.text} onChange={(e) => setBlock(i, { ...b, text: e.target.value })} className={fieldCls} />
                  )}
                  {b.kind === "bullets" && (
                    <textarea
                      rows={Math.max(3, b.items.length)}
                      value={b.items.join("\n")}
                      onChange={(e) => setBlock(i, { ...b, items: e.target.value.split("\n") })}
                      onBlur={() => setBlock(i, { ...b, items: b.items.map((t) => t.trim()).filter(Boolean) })}
                      placeholder="한 줄에 하나씩 (최대 5줄)"
                      className={fieldCls}
                    />
                  )}
                  {b.kind === "metric" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={b.value} onChange={(e) => setBlock(i, { ...b, value: e.target.value })} placeholder="숫자 (원문 그대로)" className="h-9 tabular-nums" />
                        <Input value={b.label} onChange={(e) => setBlock(i, { ...b, label: e.target.value })} placeholder="무슨 숫자인지" className="h-9" />
                      </div>
                      <textarea rows={2} value={b.note ?? ""} onChange={(e) => setBlock(i, { ...b, note: e.target.value.trim() ? e.target.value : null })} placeholder="설명 (선택)" className={fieldCls} />
                    </>
                  )}
                  {b.kind === "comparison" && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={b.leftLabel} onChange={(e) => setBlock(i, { ...b, leftLabel: e.target.value })} placeholder="대상 A" className="h-9" />
                        <Input value={b.leftValue ?? ""} onChange={(e) => setBlock(i, { ...b, leftValue: e.target.value.trim() ? e.target.value : null })} placeholder="A 값" className="h-9 tabular-nums" />
                        <Input value={b.rightLabel} onChange={(e) => setBlock(i, { ...b, rightLabel: e.target.value })} placeholder="대상 B" className="h-9" />
                        <Input value={b.rightValue ?? ""} onChange={(e) => setBlock(i, { ...b, rightValue: e.target.value.trim() ? e.target.value : null })} placeholder="B 값" className="h-9 tabular-nums" />
                      </div>
                      <textarea rows={2} value={b.description ?? ""} onChange={(e) => setBlock(i, { ...b, description: e.target.value.trim() ? e.target.value : null })} placeholder="설명 (선택)" className={fieldCls} />
                    </>
                  )}
                </div>
              ))}
              {draft.blocks.length === 0 && <p className="text-[13px] text-muted-foreground">구역이 없어요. 제목과 한 줄 핵심만 보여요.</p>}
            </div>

            <div className="grid gap-2">
              <Label>출처 (원문에 있을 때만 — 없으면 비워 두세요)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input value={draft.source.journal ?? ""} onChange={(e) => setSource("journal", e.target.value)} placeholder="저널" className="h-9" />
                <Input value={draft.source.year ?? ""} onChange={(e) => setSource("year", e.target.value)} placeholder="연도" className="h-9 tabular-nums" />
                <Input value={draft.source.studyType ?? ""} onChange={(e) => setSource("studyType", e.target.value)} placeholder="연구 유형 (예: RCT)" className="h-9" />
                <Input value={draft.source.doi ?? ""} onChange={(e) => setSource("doi", e.target.value)} placeholder="DOI" className="h-9" />
                <Input value={draft.source.url ?? ""} onChange={(e) => setSource("url", e.target.value)} placeholder="https://…" className="col-span-2 h-9" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-3 sm:items-center">
          {error && (
            <p role="alert" className="mr-auto text-sm font-medium text-status-late">
              {error}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "저장하는 중…" : "저장하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
