"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { bestVendor, matchItemPrices, usePriceData } from "./vendor-price-popover";

interface LastOrder {
  quantity: number;
  unit: string | null;
  created_at: string;
  requester: { full_name: string | null } | null;
}

/** "11/14" (KST) */
const md = (iso: string) => {
  const [, m, d] = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).split("-");
  return `${Number(m)}/${Number(d)}`;
};

/**
 * 주문 등록 "지난번엔" 줄: 같은 이름(띄어쓰기·대소문자 무시)의 가장 최근 주문 + (관리자만) 가격표 최저가 업체.
 * 일반 직원에게는 가격을 보여주지 않는다 — 가격표를 받지도 않음.
 * "같게 채우기"를 누르면 수량·단위를 지난번과 같게 채운다. 읽기만 한다.
 */
export function LastOrderHint({
  itemName,
  onFill,
}: {
  itemName: string;
  onFill: (quantity: number, unit: string) => void;
}) {
  const [last, setLast] = useState<{ key: string; order: LastOrder | null } | null>(null);
  const { isAdmin } = useAuth();
  const [priceData] = usePriceData(isAdmin);
  const key = normalizeItemName(itemName.trim());

  useEffect(() => {
    if (key.length < 2) return;
    let active = true;
    const name = itemName.trim();
    const timer = setTimeout(() => {
      const supabase = createClient();
      supabase
        .from("orders")
        .select("item_name, quantity, unit, created_at, requester:profiles!requester_id(full_name)")
        .eq("type", "order")
        .ilike("item_name", `%${name.replace(/[%_]/g, "")}%`)
        .order("created_at", { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (!active) return;
          const rows = (data as (LastOrder & { item_name: string })[] | null) ?? [];
          const hit = rows.find((r) => normalizeItemName(r.item_name) === key) ?? null;
          setLast({ key, order: hit });
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, itemName]);

  const best = useMemo(() => {
    if (!isAdmin || key.length < 2) return null;
    return bestVendor(matchItemPrices(itemName.trim(), priceData));
  }, [isAdmin, key, itemName, priceData]);

  // 지금 입력과 다른 이름의 결과는 버린다(타이핑 중 깜빡임 방지)
  const order = last && last.key === key ? last.order : null;
  if (key.length < 2 || (!order && !best)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-muted px-3.5 py-2.5 text-[13px]">
      {order && (
        <span className="flex min-w-0 items-center gap-1.5 text-subtle-foreground">
          <History className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            지난번엔{" "}
            <b className="font-semibold tabular-nums text-foreground">
              {order.quantity > 0 ? `${order.quantity}${order.unit ? ` ${order.unit}` : ""}` : "사진 참고"}
            </b>
            {" · "}
            {order.requester?.full_name ?? "—"} · <span className="tabular-nums">{md(order.created_at)}</span>
          </span>
        </span>
      )}
      {best && (
        <span className="flex items-center gap-1.5 text-subtle-foreground">
          <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          최저 {best.vendorName} <b className="font-semibold tabular-nums text-status-done">{best.price?.toLocaleString()}원</b>
        </span>
      )}
      {order && order.quantity > 0 && (
        <button
          type="button"
          onClick={() => onFill(order.quantity, order.unit ?? "")}
          className="ml-auto h-8 shrink-0 rounded-lg bg-card px-3 text-[13px] font-semibold text-primary ring-1 ring-border hover:bg-accent"
        >
          같게 채우기
        </button>
      )}
    </div>
  );
}
