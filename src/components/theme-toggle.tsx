"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { THEME_LABEL, type ThemeMode } from "@/lib/theme";

const MODES: { value: ThemeMode; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

/** 라이트 · 다크 · 시스템 세 칸 (더보기·내 계정·사이드바 계정 메뉴) */
export function ThemeModeSegmented({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="화면 모드" className={cn("grid grid-cols-3 gap-1 rounded-xl bg-muted p-1", className)}>
      {MODES.map(({ value, icon: Icon }) => {
        const on = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setMode(value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors",
              size === "sm" ? "h-8 text-[13px]" : "h-10 text-sm",
              on ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {THEME_LABEL[value]}
          </button>
        );
      })}
    </div>
  );
}

/** 한 번에 라이트 ↔ 다크 (사이드바 머리, 종 옆) */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();
  const label = dark ? "라이트 모드로 바꾸기" : "다크 모드로 바꾸기";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-secondary hover:text-foreground",
        className
      )}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
