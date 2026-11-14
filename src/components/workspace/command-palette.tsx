"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NAV_GROUPS } from "@/components/nav-config";
import { globalSearch, type GlobalSearchResult } from "@/lib/actions/global-search-action";
import { POSITION_LABEL, type Position } from "@/lib/types/member";

/**
 * 빠른 실행 (디자인 시스템 CommandPalette).
 * Ctrl K(맥 ⌘K)·사이드바 "빠른 실행"·모바일 검색 버튼으로 연다.
 * 비어 있으면 메뉴 바로가기와 자주 하는 동작, 입력하면 메뉴 + 직원·약품·업체·주문 검색(기존 전체검색과 같은 대상).
 */

type Entry = { key: string; group: string; label: string; hint?: string; href: string; icon?: "plus" };

const CommandPaletteContext = createContext<{ open: () => void }>({ open: () => {} });

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setIsOpen} />
    </CommandPaletteContext.Provider>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    setQ("");
    setRes(null);
    setLoading(false);
    setActive(0);
  };

  const onQuery = (val: string) => {
    setQ(val);
    setActive(0);
    if (timer.current) clearTimeout(timer.current);
    const term = val.trim();
    if (!term) {
      setRes(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(() => {
      const id = ++reqId.current;
      globalSearch(term)
        .then((r) => {
          if (id !== reqId.current) return;
          setRes(r);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 220);
  };

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const menus: Entry[] = NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin).flatMap((g) =>
      g.items.map((it) => ({ key: `m:${it.href}`, group: "메뉴로 이동", label: it.label, hint: g.label, href: it.href }))
    );
    const actions: Entry[] = [{ key: "a:new-order", group: "동작", label: "새 주문 등록", href: "/orders/new", icon: "plus" }];
    if (!term) return [...actions, ...menus];

    const out: Entry[] = menus.filter((m) => m.label.toLowerCase().includes(term));
    if (res) {
      for (const p of res.products)
        out.push({ key: `p:${p.name}`, group: "약품", label: p.name, hint: p.price != null ? `최저 ${won(p.price)}` : undefined, href: `/price-compare?q=${encodeURIComponent(p.name)}` });
      for (const o of res.orders)
        out.push({ key: `o:${o.id}`, group: "주문·검수·반품", label: o.itemName, hint: [o.vendorName, o.requesterName].filter(Boolean).join(" · ") || undefined, href: `/search?q=${encodeURIComponent(o.itemName)}` });
      for (const v of res.vendors)
        out.push({ key: `v:${v.id}`, group: "업체", label: v.name, hint: "거래처원장", href: `/vendor-ledger?vendor=${v.id}` });
      for (const p of res.people)
        out.push({
          key: `u:${p.id}`,
          group: "직원",
          label: p.name,
          hint: [p.position ? POSITION_LABEL[p.position as Position] : null, p.recentOrder ? `최근 ${p.recentOrder}` : "주문 내역"].filter(Boolean).join(" · "),
          href: `/search?requester=${encodeURIComponent(p.name)}`,
        });
    }
    return out;
  }, [q, res, isAdmin]);

  const go = (e: Entry) => {
    onOpenChange(false);
    reset();
    router.push(e.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && entries[active]) {
      e.preventDefault();
      go(entries[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[12dvh] max-w-[calc(100%-1.5rem)] translate-y-0 gap-0 overflow-hidden rounded-[14px] border-0 bg-card p-0 shadow-[0_12px_32px_-8px_rgb(20_33_61/0.3),0_0_0_1px_var(--border)] sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">빠른 실행</DialogTitle>
        <DialogDescription className="sr-only">메뉴 이동과 직원·약품·업체·주문 검색</DialogDescription>
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="메뉴, 약품, 업체, 직원, 주문 검색"
            aria-label="빠른 실행 검색"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={entries[active] ? `cmd-${active}` : undefined}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-subtle-foreground sm:block">Esc</kbd>
        </div>
        <div ref={listRef} id="command-list" role="listbox" className="max-h-[min(60dvh,440px)] overflow-y-auto py-1.5">
          {loading && entries.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">찾는 중…</p>}
          {!loading && q.trim() && entries.length === 0 && (
            <p className="px-4 pb-2 pt-4 text-center text-[13px] text-muted-foreground">맞는 결과가 없어요</p>
          )}
          {entries.map((e, i) => {
            const header = i === 0 || entries[i - 1].group !== e.group ? e.group : null;
            return (
              <div key={e.key}>
                {header && <div className="px-4 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground">{header}</div>}
                <button
                  type="button"
                  id={`cmd-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm",
                    i === active ? "bg-secondary text-foreground" : "text-subtle-foreground"
                  )}
                >
                  {e.icon === "plus" && <Plus className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 truncate font-medium text-foreground">{e.label}</span>
                  {e.hint && <span className="min-w-0 truncate text-xs text-muted-foreground">{e.hint}</span>}
                  {i === active && <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
          {loading && entries.length > 0 && <p className="px-4 py-2 text-xs text-muted-foreground">더 찾는 중…</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 모바일 맨 위 검색 버튼(누르면 빠른 실행). PC는 사이드바 버튼과 Ctrl K. */
export function MobileSearchButton() {
  const { open } = useCommandPalette();
  return (
    <div className="sticky top-0 z-50 flex h-12 items-center border-b border-border bg-card/95 px-3 backdrop-blur-sm lg:hidden print:hidden">
      <button
        type="button"
        onClick={open}
        className="flex h-9 w-full items-center gap-2 rounded-full bg-card px-3 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)]"
      >
        <Search className="size-4" aria-hidden="true" />
        검색 · 직원·약품·업체·주문
      </button>
    </div>
  );
}

/** 사이드바 맨 위 "빠른 실행 Ctrl K" */
export function QuickActionButton() {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      onClick={open}
      className="mb-2 flex h-[34px] w-full items-center gap-2 rounded-lg bg-card px-2.5 text-[13px] text-muted-foreground shadow-[0_0_0_1px_var(--sidebar-border)] transition-colors hover:text-foreground"
    >
      <Search className="size-[15px]" aria-hidden="true" />
      빠른 실행
      <kbd className="ml-auto rounded bg-secondary px-1.5 py-px font-mono text-xs text-subtle-foreground">Ctrl K</kbd>
    </button>
  );
}
