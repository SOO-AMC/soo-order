"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Search, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** 검색에 포함할 추가 텍스트 */
  keywords?: string;
}

interface SearchableSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyText?: string;
  allowClear?: boolean;
  clearLabel?: string;
  className?: string;
}

/** 검색창 + 스크롤이 있는 드롭다운 (항목이 많을 때 shadcn Select 대체) */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "선택",
  emptyText = "결과 없음",
  allowClear = false,
  clearLabel = "선택 안 함",
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? options.filter((o) => (o.label + " " + (o.keywords ?? "")).toLowerCase().includes(query))
      : options;
    return list.slice(0, 100);
  }, [options, q]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("h-8 w-full justify-between gap-1 px-2 text-xs font-normal", className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {allowClear && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="pl-5 text-muted-foreground">{clearLabel}</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  o.value === value && "bg-accent",
                )}
              >
                {o.value === value ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{o.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
