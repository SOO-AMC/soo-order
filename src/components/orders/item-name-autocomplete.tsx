"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
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
  /** 지금 적힌 이름에 연결된 표준 품목 (없으면 null) */
  const [linked, setLinked] = useState<{ forName: string; name: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 목록에서 막 고른 이름 — 그 값으로 다시 검색돼도 목록을 다시 열지 않는다 */
  const pickedRef = useRef<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const q = value.trim();
    if (!q) {
      // effect 본문에서 동기 setState를 피하려 다음 틱으로 미룸
      timerRef.current = setTimeout(() => {
        setSuggestions([]);
        setOpen(false);
        setLinked(null);
      }, 0);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    timerRef.current = setTimeout(async () => {
      // 표준 품목은 직원도 찾을 수 있는 DB 함수로 (이름·구분만 돌려준다. 가격 없음).
      // 띄어쓰기를 무시하므로 "메로페넴 주" 로 "메로페넴주500mg 10V" 를 찾는다.
      const searchStandard = async () => {
        const viaRpc = await supabase.rpc("search_standard_products", { p_q: q, p_limit: 25 });
        if (!viaRpc.error) return (viaRpc.data ?? []) as { name: string; notes: string | null }[];
        // 함수가 아직 없으면(마이그레이션 전) 예전처럼 표를 직접 읽는다 — 관리자만 결과가 나온다
        const direct = await supabase.from("unified_products").select("name, notes").ilike("name", `%${q}%`).order("name").limit(25);
        return (direct.data ?? []) as { name: string; notes: string | null }[];
      };
      const [unifiedRows, linkedRes, ordersRes] = await Promise.all([
        searchStandard(),
        supabase.rpc("standard_product_for", { p_name: q }),
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
      for (const d of unifiedRows) {
        if (!unifiedMap.has(d.name)) {
          unifiedMap.set(d.name, { name: d.name, isUnified: true, notes: (d.notes as string) || undefined });
        }
      }
      // DB 함수가 이미 알맞은 순서(앞부분 일치 → 짧은 이름)로 준다
      const unified = [...unifiedMap.values()];
      const linkedProduct = (linkedRes.error ? null : linkedRes.data) as { name: string } | null;
      setLinked(linkedProduct?.name ? { forName: q, name: linkedProduct.name } : null);

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
      // 입력칸에서 치고 있을 때만 연다(수정 화면처럼 값이 미리 채워진 채 열릴 때 저절로 뜨지 않게)
      const typing = typeof document !== "undefined" && document.activeElement === inputRef.current;
      setOpen(merged.length > 0 && typing && pickedRef.current !== q);
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
        ref={inputRef}
        placeholder="품목 이름 (예: 포스레놀)"
        value={value}
        className="h-11 text-base"
        onChange={(e) => {
          pickedRef.current = null;
          onChange(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />
      {(() => {
        const typed = value.trim();
        if (!typed || open) return null;
        // 이미 표준 품목과 묶이는 이름
        if (linked && linked.forName === typed) {
          return (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-status-done">
              <CircleCheck className="size-4 shrink-0" />
              <span className="min-w-0 truncate">표준 품목 · {linked.name}</span>
            </p>
          );
        }
        // 아직 묶이지 않는 이름인데 비슷한 표준 품목이 있으면 권한다 (막지는 않는다)
        const similar = suggestions.filter((x) => x.isUnified && x.name !== typed).slice(0, 2);
        if (similar.length === 0 || suggestions.some((x) => x.isUnified && x.name === typed)) return null;
        return (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
            <span>혹시 이 품목인가요?</span>
            {similar.map((x) => (
              <button
                key={x.name}
                type="button"
                className="max-w-full truncate rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary"
                onClick={() => {
                  pickedRef.current = x.name;
                  onChange(x.name);
                }}
              >
                {x.name}
              </button>
            ))}
          </div>
        );
      })()}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
          {suggestions.map((s) => (
            <li
              key={(s.isUnified ? "u:" : "o:") + s.name}
              className={cn(
                "flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[15px]",
                "hover:bg-accent hover:text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                pickedRef.current = s.name;
                onChange(s.name);
                setOpen(false);
              }}
            >
              {s.isUnified && (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">표준</span>
              )}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {s.isUnified && s.notes && (
                <span className="shrink-0 text-xs text-muted-foreground">{s.notes}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
