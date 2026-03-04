"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ItemNameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
}

export function ItemNameAutocomplete({
  value,
  onChange,
}: ItemNameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!value.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("orders")
        .select("item_name")
        .ilike("item_name", `%${value}%`)
        .order("item_name")
        .limit(20);

      if (data) {
        const unique = [...new Set(data.map((d) => d.item_name))];
        setSuggestions(unique);
        setOpen(unique.length > 0);
      }
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
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((name) => (
            <li
              key={name}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                "hover:bg-accent hover:text-accent-foreground"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
