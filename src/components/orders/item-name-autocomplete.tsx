"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Suggestion {
  name: string;
  isUnified: boolean;
  notes?: string;
}

interface ItemNameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

export function ItemNameAutocomplete({
  value,
  onChange,
}: ItemNameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const q = value.trim();
    if (!q) {
      // effect 본문에서 동기 setState를 피하려 다음 틱으로 미룸
      timerRef.current = setTimeout(() => {
        setSuggestions([]);
        setOpen(false);
      }, 0);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    timerRef.current = setTimeout(async () => {
      const [unifiedRes, ordersRes] = await Promise.all([
        supabase
          .from("unified_products")
          .select("name, notes")
          .ilike("name", `%${q}%`)
          .order("name")
          .limit(25),
        supabase
          .from("orders")
          .select("item_name")
          .ilike("item_name", `%${q}%`)
          .order("item_name")
          .limit(25),
      ]);

      const ql = q.toLowerCase();
      // 접두사 일치를 부분 일치보다 위로, 그다음 짧은 이름, 그다음 가나다순
      const byRelevance = (a: Suggestion, b: Suggestion) => {
        const ra = a.name.toLowerCase().startsWith(ql) ? 0 : 1;
        const rb = b.name.toLowerCase().startsWith(ql) ? 0 : 1;
        return ra - rb || a.name.length - b.name.length || a.name.localeCompare(b.name);
      };

      const unifiedMap = new Map<string, Suggestion>();
      for (const d of unifiedRes.data ?? []) {
        if (!unifiedMap.has(d.name)) {
          unifiedMap.set(d.name, { name: d.name, isUnified: true, notes: (d.notes as string) || undefined });
        }
      }
      const unified = [...unifiedMap.values()].sort(byRelevance);

      const seen = new Set(unified.map((u) => u.name));
      const orderNames: Suggestion[] = [];
      for (const d of ordersRes.data ?? []) {
        if (!d.item_name || seen.has(d.item_name)) continue;
        seen.add(d.item_name);
        orderNames.push({ name: d.item_name, isUnified: false });
      }
      orderNames.sort(byRelevance);

      // 통합제품(표준 품목) 우선 노출 → 그다음 과거 주문명
      const merged = [...unified, ...orderNames].slice(0, 20);
      setSuggestions(merged);
      setOpen(merged.length > 0);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, supabase]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="품목명을 입력하세요"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((s) => (
            <li
              key={(s.isUnified ? "u:" : "o:") + s.name}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                "hover:bg-accent hover:text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.name);
                setOpen(false);
              }}
            >
              {s.isUnified && (
                <span className="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">표준</span>
              )}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.isUnified && s.notes && (
                <span className="shrink-0 text-[11px] text-muted-foreground">{s.notes}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
