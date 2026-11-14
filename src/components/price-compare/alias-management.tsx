"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Link2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { FilterBar, SearchField } from "@/components/workspace/filter-bar";
import { EmptyState } from "@/components/workspace/feedback";
import { setItemAlias, removeItemAlias } from "@/lib/actions/item-alias-actions";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { cn } from "@/lib/utils";
import type { ItemNameAlias, UnifiedProduct } from "@/lib/types/price-compare";

interface AliasManagementProps {
  aliases: ItemNameAlias[];
  unifiedProducts: UnifiedProduct[];
  onChange: () => void;
}

type DialogState = { mode: "edit"; alias: ItemNameAlias } | { mode: "add" } | null;

/**
 * 품목 매칭: 직원이 주문에 적은 품목명 → 가격 비교표 품목 연결(학습 데이터).
 * 주문 화면 업체 고르기의 "매칭 수정"으로 쌓이고, 여기서 한눈에 보고 고친다.
 */
export function AliasManagement({ aliases, unifiedProducts, onChange }: AliasManagementProps) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [newItemName, setNewItemName] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ItemNameAlias | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unifiedById = useMemo(() => {
    const m = new Map<string, UnifiedProduct>();
    for (const u of unifiedProducts) m.set(u.id, u);
    return m;
  }, [unifiedProducts]);

  const rows = useMemo(() => {
    const list = aliases.map((a) => ({
      alias: a,
      product: unifiedById.get(a.unified_product_id) ?? null,
    }));
    list.sort((x, y) => x.alias.item_name.localeCompare(y.alias.item_name));
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.alias.item_name.includes(q) || (r.product?.name.toLowerCase().includes(q) ?? false));
  }, [aliases, query, unifiedById]);

  const filteredUnified = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    const list = q ? unifiedProducts.filter((u) => u.name.toLowerCase().includes(q)) : unifiedProducts;
    return list.slice(0, 80);
  }, [unifiedProducts, pickerSearch]);

  const openAdd = () => {
    setDialog({ mode: "add" });
    setNewItemName("");
    setPickerSearch("");
    setError("");
  };

  const closeDialog = () => {
    setDialog(null);
    setNewItemName("");
    setPickerSearch("");
    setError("");
  };

  const dialogItemName = dialog?.mode === "edit" ? dialog.alias.item_name : newItemName.trim();
  const dialogCurrentUnifiedId = dialog?.mode === "edit" ? dialog.alias.unified_product_id : null;
  const aliasExistsForNew =
    dialog?.mode === "add" && !!dialogItemName && aliases.some((a) => a.item_name === normalizeItemName(newItemName));

  const handlePick = async (unifiedId: string) => {
    if (!dialogItemName || busy) return;
    setBusy(true);
    setError("");
    try {
      await setItemAlias(dialogItemName, unifiedId);
      closeDialog();
      onChange();
    } catch {
      setError("연결하지 못했어요. 잠시 뒤 다시 골라 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setError("");
    try {
      await removeItemAlias(deleteTarget.item_name);
      setDeleteTarget(null);
      onChange();
    } catch {
      setError("지우지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl bg-status-doing-bg px-4 py-3 text-[13px] leading-5 text-status-doing">
        <Link2 className="mt-0.5 size-4 shrink-0" />
        <span>
          직원이 주문에 적은 이름을 가격 비교표 품목에 연결해 둔 목록이에요. 주문 화면에서 업체를 고를 때 &quot;매칭 수정&quot;으로도 쌓여요.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <FilterBar className="min-w-0 flex-1">
          <SearchField id="alias-search" value={query} onChange={setQuery} placeholder="주문 이름·비교표 품목 검색" />
        </FilterBar>
        <Button size="sm" className="h-9 rounded-lg" onClick={openAdd}>
          <Plus className="size-4" /> 매칭 추가
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-card ring-1 ring-border">
          <EmptyState
            icon={Link2}
            title={aliases.length === 0 ? "아직 연결한 이름이 없어요" : "조건에 맞는 매칭이 없어요"}
            description={aliases.length === 0 ? "매칭 추가로 직접 연결할 수 있어요." : "검색어를 바꿔 보세요."}
          />
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_76px] items-center gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground lg:grid">
            <span>직원이 쓴 이름</span>
            <span />
            <span>비교표 품목</span>
            <span />
          </div>
          {rows.map(({ alias, product }, i) => (
            <div
              key={alias.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 lg:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)_76px]",
                i > 0 && "border-t border-border"
              )}
            >
              <span className="truncate text-[15px] font-semibold lg:text-sm">{alias.item_name}</span>
              <ArrowRight className="hidden size-4 text-muted-foreground lg:block" aria-hidden="true" />
              <span className={cn("col-start-1 row-start-2 truncate text-[13px] lg:col-start-auto lg:row-start-auto lg:text-sm", product ? "text-subtle-foreground" : "text-status-late")}>
                <span className="lg:hidden">→ </span>
                {product?.name ?? "(지워진 품목)"}
                {product?.notes && <span className="ml-1.5 text-xs text-muted-foreground">{product.notes}</span>}
              </span>
              <span className="row-span-2 flex justify-end gap-0.5 lg:row-span-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => {
                    setDialog({ mode: "edit", alias });
                    setPickerSearch("");
                    setError("");
                  }}
                  aria-label={`${alias.item_name} 연결 바꾸기`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-status-late"
                  onClick={() => {
                    setDeleteTarget(alias);
                    setError("");
                  }}
                  aria-label={`${alias.item_name} 매칭 지우기`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </span>
            </div>
          ))}
        </section>
      )}
      {rows.length > 0 && <p className="px-1 text-[13px] tabular-nums text-muted-foreground">{rows.length}개</p>}

      {/* 매칭 추가 / 바꾸기 */}
      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-h-[85dvh] gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>{dialog?.mode === "add" ? "매칭 추가" : "연결할 품목 바꾸기"}</DialogTitle>
            {dialog?.mode === "edit" && <DialogDescription className="break-all">주문 이름: {dialog.alias.item_name}</DialogDescription>}
            {dialog?.mode === "add" && <DialogDescription>직원이 쓰는 이름을 비교표 품목에 연결해요.</DialogDescription>}
          </DialogHeader>

          {dialog?.mode === "add" && (
            <div className="px-5 pt-3">
              <Input
                autoFocus
                placeholder="주문에 쓰는 이름 (예: 박스루킨주)"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="h-11 text-base"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                띄어쓰기·대소문자는 무시하고 저장해요.{aliasExistsForNew ? " 이미 연결이 있어서 새로 고른 품목으로 바뀌어요." : ""}
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 border-y border-border px-5 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus={dialog?.mode === "edit"}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="비교표 품목 검색…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto px-2 py-1">
            {dialog?.mode === "add" && !dialogItemName ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">먼저 주문 이름을 써 주세요</p>
            ) : filteredUnified.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">찾는 품목이 없어요</p>
            ) : (
              filteredUnified.map((u) => {
                const isCurrent = dialogCurrentUnifiedId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy || !dialogItemName}
                    onClick={() => handlePick(u.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50",
                      isCurrent && "bg-row-selected"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                    {u.notes && <span className="shrink-0 text-xs text-muted-foreground">{u.notes}</span>}
                    {isCurrent && <span className="shrink-0 text-xs font-semibold text-primary">지금 연결</span>}
                  </button>
                );
              })
            )}
          </div>
          {error && (
            <p role="alert" className="mx-5 mb-4 mt-1 rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* 지우기 확인 */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>매칭을 지울까요?</DialogTitle>
            <DialogDescription>
              &apos;{deleteTarget?.item_name}&apos; 연결을 지우면 이 이름은 다시 비슷한 이름으로 짐작해서 찾아요. 주문 기록은 그대로예요.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="rounded-lg bg-status-late-bg px-3 py-2.5 text-sm font-medium text-status-late">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={busy}>
                취소
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy ? "지우는 중…" : "지우기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
