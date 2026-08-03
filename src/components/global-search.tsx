"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { globalSearch, type GlobalSearchResult } from "@/lib/actions/global-search-action";
import { POSITION_LABEL, type Position } from "@/lib/types/member";
import { positionToTeam } from "@/lib/utils/team";

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-0.5">
      <p className="px-2 pb-0.5 pt-1 text-[11px] font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<GlobalSearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const onChange = (val: string) => {
    setQ(val);
    setOpen(true);
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
    }, 250);
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (url: string) => {
    setOpen(false);
    setQ("");
    setRes(null);
    router.push(url);
  };

  const clear = () => {
    setQ("");
    setRes(null);
    setOpen(false);
  };

  const hasResults =
    !!res && (res.people.length > 0 || res.products.length > 0 || res.vendors.length > 0 || res.orders.length > 0);

  return (
    <div className="sticky top-0 z-50 flex h-12 items-center border-b border-border/60 bg-background/95 backdrop-blur-sm print:hidden">
      <div ref={boxRef} className="relative mx-auto w-full max-w-3xl px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => q.trim() && setOpen(true)}
            placeholder="전체 검색 — 직원·약품·업체·주문"
            className="h-9 w-full rounded-full border bg-card pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
          {q && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="지우기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {open && q.trim() && (
          <div className="absolute inset-x-3 top-full z-50 mt-1 max-h-[70dvh] overflow-y-auto rounded-xl border bg-card p-1.5 shadow-lg">
            {loading && <p className="px-2 py-3 text-center text-xs text-muted-foreground">검색 중…</p>}
            {!loading && !hasResults && <p className="px-2 py-3 text-center text-xs text-muted-foreground">결과가 없습니다.</p>}
            {!loading && res && (
              <>
                {res.people.length > 0 && (
                  <Section title="직원">
                    {res.people.map((p) => (
                      <div key={p.id} className="rounded-lg px-2 py-2 hover:bg-accent/40">
                        <div className="text-sm font-medium">
                          {p.name}
                          {p.position && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {POSITION_LABEL[p.position as Position] ?? ""}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5 text-[11px]">
                          {/* 근무표: 오늘부터 3일 */}
                          {p.schedule.length > 0 && (
                            <button
                              type="button"
                              onClick={() => go(`/schedule?person=${p.id}`)}
                              className="block w-full rounded px-1 py-0.5 text-left hover:bg-accent/60"
                            >
                              <span className="font-semibold text-primary">근무표</span>{" "}
                              <span className="text-muted-foreground">
                                {p.schedule.map((s) => `${s.day} ${s.label}`).join(" · ")}
                              </span>
                            </button>
                          )}
                          {/* 연차: 총·사용·기준일 (관리자 전용) */}
                          {res.isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                const t = positionToTeam(p.position as Position | null);
                                go(`/leave?person=${p.id}${t ? `&team=${t}` : ""}`);
                              }}
                              className="block w-full rounded px-1 py-0.5 text-left hover:bg-accent/60"
                            >
                              <span className="font-semibold text-primary">연차</span>{" "}
                              <span className="text-muted-foreground">
                                {p.leave
                                  ? `${p.leave.total}일 중 ${p.leave.used}일 사용${p.leave.periodStart ? ` · 기준 ${p.leave.periodStart}` : ""}`
                                  : "보기"}
                              </span>
                            </button>
                          )}
                          {/* 주문: 최근 항목 → 그 사람 이름으로 조회 (전 직원) */}
                          <button
                            type="button"
                            onClick={() => go(`/search?requester=${encodeURIComponent(p.name)}`)}
                            className="block w-full rounded px-1 py-0.5 text-left hover:bg-accent/60"
                          >
                            <span className="font-semibold text-primary">주문</span>{" "}
                            <span className="text-muted-foreground">
                              {p.recentOrder ? `최근: ${p.recentOrder}` : "내역 보기"}
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </Section>
                )}

                {res.products.length > 0 && (
                  <Section title="약품 (단가)">
                    {res.products.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => go(`/price-compare?q=${encodeURIComponent(p.name)}`)}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-accent/40"
                      >
                        <span className="truncate text-sm">{p.name}</span>
                        <span className="ml-2 shrink-0 text-xs font-semibold text-primary">
                          {p.price != null ? `최저 ${won(p.price)}` : "—"}
                        </span>
                      </button>
                    ))}
                  </Section>
                )}

                {res.vendors.length > 0 && (
                  <Section title="업체">
                    {res.vendors.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => go(`/vendor-ledger?vendor=${v.id}`)}
                        className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/40"
                      >
                        {v.name}
                      </button>
                    ))}
                  </Section>
                )}

                {res.orders.length > 0 && (
                  <Section title="주문·검수·반품">
                    {res.orders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => go(`/search?q=${encodeURIComponent(o.itemName)}`)}
                        className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/40"
                      >
                        {o.itemName}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · {o.vendorName ?? "?"}
                          {o.requesterName ? ` · ${o.requesterName}` : ""}
                        </span>
                      </button>
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
