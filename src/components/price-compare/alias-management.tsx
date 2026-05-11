"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setItemAlias, removeItemAlias } from "@/lib/actions/item-alias-actions";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import type { ItemNameAlias, UnifiedProduct } from "@/lib/types/price-compare";

interface AliasManagementProps {
  aliases: ItemNameAlias[];
  unifiedProducts: UnifiedProduct[];
  onChange: () => void;
}

type DialogState =
  | { mode: "edit"; alias: ItemNameAlias }
  | { mode: "add" }
  | null;

export function AliasManagement({ aliases, unifiedProducts, onChange }: AliasManagementProps) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [newItemName, setNewItemName] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ItemNameAlias | null>(null);
  const [busy, setBusy] = useState(false);

  const unifiedById = useMemo(() => {
    const m = new Map<string, UnifiedProduct>();
    for (const u of unifiedProducts) m.set(u.id, u);
    return m;
  }, [unifiedProducts]);

  const rows = useMemo(() => {
    const list = aliases.map((a) => ({
      alias: a,
      productName: unifiedById.get(a.unified_product_id)?.name ?? "(삭제된 제품)",
    }));
    list.sort((x, y) => x.alias.item_name.localeCompare(y.alias.item_name));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.alias.item_name.includes(q) || r.productName.toLowerCase().includes(q));
  }, [aliases, query, unifiedById]);

  const filteredUnified = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const list = q ? unifiedProducts.filter((u) => u.name.toLowerCase().includes(q)) : unifiedProducts;
    return list.slice(0, 80);
  }, [unifiedProducts, pickerSearch]);

  const closeDialog = () => {
    setDialog(null);
    setNewItemName("");
    setPickerSearch("");
  };

  const dialogItemName = dialog?.mode === "edit" ? dialog.alias.item_name : newItemName.trim();
  const dialogCurrentUnifiedId = dialog?.mode === "edit" ? dialog.alias.unified_product_id : null;
  const aliasExistsForNew =
    dialog?.mode === "add" &&
    !!dialogItemName &&
    aliases.some((a) => a.item_name === normalizeItemName(newItemName));

  const handlePick = async (unifiedId: string) => {
    if (!dialogItemName || busy) return;
    setBusy(true);
    try {
      await setItemAlias(dialogItemName, unifiedId);
      closeDialog();
      onChange();
    } catch {
      // silently fail
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await removeItemAlias(deleteTarget.item_name);
      setDeleteTarget(null);
      onChange();
    } catch {
      // silently fail
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        간호사가 적은 품목명을 가격비교 통합제품에 직접 연결한 학습 데이터입니다. 주문 탭의 업체 선택 드롭다운에서 &quot;매칭 수정&quot;으로도 추가·수정할 수 있어요.
      </p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="품목명 또는 제품명 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="shrink-0" onClick={() => { setDialog({ mode: "add" }); setNewItemName(""); setPickerSearch(""); }}>
          <Plus className="h-4 w-4" /> 매칭 추가
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {aliases.length === 0 ? "아직 학습된 매칭이 없습니다." : "검색 결과가 없습니다."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card shadow-card">
          {rows.map(({ alias, productName }) => (
            <div key={alias.id} className="flex items-center gap-2 border-b border-border px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{alias.item_name}</div>
                <div className="truncate text-xs text-muted-foreground">→ {productName}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { setDialog({ mode: "edit", alias }); setPickerSearch(""); }}
                aria-label="매칭 변경"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(alias)}
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 매칭 추가 / 변경 */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{dialog?.mode === "add" ? "매칭 추가" : "매칭 제품 변경"}</DialogTitle>
            {dialog?.mode === "edit" && (
              <DialogDescription className="break-all">품목명: {dialog.alias.item_name}</DialogDescription>
            )}
            {dialog?.mode === "add" && (
              <DialogDescription>간호사가 적는 품목명을 통합제품에 연결합니다.</DialogDescription>
            )}
          </DialogHeader>

          {dialog?.mode === "add" && (
            <div className="px-5 pt-3">
              <Input
                autoFocus
                placeholder="품목명 (예: 박스루킨주)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                공백·대소문자는 무시하고 저장됩니다.{aliasExistsForNew ? " 이미 매칭이 있어 덮어씁니다." : ""}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 border-y border-border px-5 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus={dialog?.mode === "edit"}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="통합제품 검색…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto px-2 py-1">
            {dialog?.mode === "add" && !dialogItemName ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">먼저 품목명을 입력하세요</p>
            ) : filteredUnified.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">검색 결과 없음</p>
            ) : (
              filteredUnified.map((u) => {
                const isCurrent = dialogCurrentUnifiedId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy || !dialogItemName}
                    onClick={() => handlePick(u.id)}
                    className={`flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50 ${isCurrent ? "bg-accent" : ""}`}
                  >
                    <span className="font-medium">{u.name}</span>
                    {u.notes && <span className="text-xs text-muted-foreground">{u.notes}</span>}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>매칭 삭제</DialogTitle>
            <DialogDescription>
              &apos;{deleteTarget?.item_name}&apos; 매칭을 삭제하면 이 품목명은 다시 자동(추정) 매칭으로 돌아갑니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>취소</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
