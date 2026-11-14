"use client";

import { useMemo, useState } from "react";
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
}

/**
 * 업체 고르기. 이름을 손으로 적지 않고 등록된 업체에서 고른다 → 같은 업체가 여러 이름으로 갈라지지 않는다.
 * 목록에 없으면 그 자리에서 새 업체로 등록한다. "다른 이름"(예: 브이에스팜 → vs팜)으로도 찾을 수 있다.
 */
export function VendorPicker({ value, onChange, options, onRegistered, placeholder = "업체 고르기", ariaLabel, className }: VendorPickerProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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
      }}
    >
      <PopoverTrigger asChild>
        <Button
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
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (filtered.length === 1) pick(filtered[0].name);
              else if (filtered.length === 0 && canRegister) register();
            }}
            placeholder="업체 이름 검색"
            aria-label="업체 이름 검색"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {value && !q && (
            <button type="button" onClick={() => pick("")} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent">
              <span className="w-3.5 shrink-0" /> 업체 지정 안 함
            </button>
          )}
          {filtered.slice(0, 100).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.name)}
              className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent", o.name === value && "bg-accent")}
            >
              {o.name === value ? <Check className="size-3.5 shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.aliases.length > 0 && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{o.aliases.join(", ")}</span>}
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
