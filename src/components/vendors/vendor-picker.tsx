"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { registerVendor } from "@/lib/actions/vendor-actions";
import { vendorKey } from "@/lib/utils/vendor-name";
import type { VendorOption } from "@/lib/types/vendor";

interface VendorPickerProps {
  /** 업체 이름. 주문에는 이름이 글자로 저장된다 */
  value: string;
  onChange: (name: string) => void;
  options: VendorOption[];
  /** 여기서 새 업체를 등록했을 때 — 부모가 목록에 더한다 */
  onRegistered?: (vendor: VendorOption) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** 고르기 버튼의 id (단축키로 열 때 쓴다) */
  id?: string;
  /**
   * 고르거나 닫은 뒤 초점을 고르기 버튼에 돌려주지 않는다 — 단축키로 일하는 화면(주문 상세 패널)용.
   * 버튼에 초점이 남으면 Space 가 그 버튼을 눌러 버려 J/K·Space 단축키 흐름이 끊긴다.
   */
  releaseFocus?: boolean;
}

/**
 * 업체 고르기. 이름을 손으로 적지 않고 등록된 업체에서 고른다 → 같은 업체가 여러 이름으로 갈라지지 않는다.
 * 목록에 없으면 그 자리에서 새 업체로 등록한다. "다른 이름"(예: 브이에스팜 → vs팜)으로도 찾을 수 있다.
 */
export function VendorPicker({ value, onChange, options, onRegistered, placeholder = "업체 고르기", ariaLabel, className, id, releaseFocus }: VendorPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  /** 화살표로 고른 줄 (-1 = 없음). 검색어가 있으면 첫 줄부터 */
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const registered = options.some((o) => o.name === value);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    const key = vendorKey(q);
    if (!text) return options;
    return options.filter((o) => {
      const names = [o.name, ...o.aliases];
      return names.some((n) => n.toLowerCase().includes(text) || (key.length > 0 && vendorKey(n).includes(key)));
    });
  }, [options, q]);

  /** 적은 글자와 같은 업체가 이미 있는가 (표기만 다른 경우 포함) */
  const sameAsExisting = useMemo(() => {
    const key = vendorKey(q);
    return key.length > 0 && options.some((o) => [o.name, ...o.aliases].some((n) => vendorKey(n) === key));
  }, [options, q]);
  const canRegister = vendorKey(q).length >= 2 && !sameAsExisting;

  /** 화살표로 오르내리는 줄: [업체 지정 안 함] + 검색 결과 */
  const rows = useMemo(() => {
    const list: { key: string; name: string; aliases: string[] }[] = [];
    if (value && !q) list.push({ key: "__none", name: "", aliases: [] });
    for (const o of filtered.slice(0, 100)) list.push({ key: o.id, name: o.name, aliases: o.aliases });
    return list;
  }, [filtered, value, q]);
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const moveTo = (i: number) => {
    setActive(i);
    requestAnimationFrame(() => document.getElementById(optionId(i))?.scrollIntoView({ block: "nearest" }));
  };

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const register = async () => {
    if (busy || !canRegister) return;
    setBusy(true);
    setError("");
    try {
      const res = await registerVendor(q);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onRegistered?.({ id: res.data.id, name: res.data.name, aliases: res.data.aliases });
      pick(res.data.name);
    } catch {
      setError("등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQ("");
          setError("");
        }
        setActive(-1);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn("h-10 w-full justify-between gap-2 px-3 text-sm font-normal", className)}
        >
          <span className={cn("min-w-0 truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {value && !registered && <span className="rounded-full bg-status-ask-bg px-1.5 py-0.5 text-[11px] font-semibold text-status-ask">미등록</span>}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        align="start"
        onCloseAutoFocus={
          releaseFocus
            ? (e) => {
                e.preventDefault();
                (document.activeElement as HTMLElement | null)?.blur?.();
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(e.target.value.trim() ? 0 : -1);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (rows.length === 0) return;
                const step = e.key === "ArrowDown" ? 1 : -1;
                moveTo(active < 0 ? (step > 0 ? 0 : rows.length - 1) : (active + step + rows.length) % rows.length);
                return;
              }
              if (e.key === "Home" || e.key === "End") {
                if (rows.length === 0) return;
                e.preventDefault();
                moveTo(e.key === "Home" ? 0 : rows.length - 1);
                return;
              }
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (active >= 0 && rows[active]) pick(rows[active].name);
              else if (filtered.length === 1) pick(filtered[0].name);
              else if (filtered.length === 0 && canRegister) register();
            }}
            placeholder="업체 이름 검색 · ↑↓ 고르고 Enter"
            aria-label="업체 이름 검색"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && rows[active] ? optionId(active) : undefined}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div id={listId} role="listbox" aria-label="업체" className="max-h-64 overflow-y-auto py-1">
          {rows.map((r, i) => (
            <button
              key={r.key}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onClick={() => pick(r.name)}
              onMouseMove={() => { if (active !== i) setActive(i); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                i === active ? "bg-accent ring-1 ring-primary/40 ring-inset" : r.name && r.name === value && "bg-accent/60",
                !r.name && "text-muted-foreground",
              )}
            >
              {r.name && r.name === value ? <Check className="size-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
              {r.name ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {r.aliases.length > 0 && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{r.aliases.join(", ")}</span>}
                </>
              ) : (
                "업체 지정 안 함"
              )}
            </button>
          ))}
          {filtered.length === 0 && !canRegister && <p className="px-3 py-4 text-center text-sm text-muted-foreground">맞는 업체가 없어요</p>}
        </div>
        {canRegister && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={register}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-accent disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Plus className="size-3.5 shrink-0" />}
              <span className="min-w-0 truncate">&quot;{q.trim()}&quot; 새 업체로 등록</span>
            </button>
          </div>
        )}
        {error && <p role="alert" className="border-t px-3 py-2 text-[13px] font-medium text-status-late">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
