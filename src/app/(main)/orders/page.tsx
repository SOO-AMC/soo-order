import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";
import { createClient } from "@/lib/supabase/server";
import { normalizeItemName } from "@/lib/utils/normalize-item-name";
import { serverMemo } from "@/lib/utils/server-memo";
import type { OrderWithRequester } from "@/lib/types/order";

export const metadata: Metadata = {
  title: "주문",
};

const LAST_VENDOR_TTL_MS = 5 * 60_000;

/** 품목별 최근 업체 { 정규화한 품목명: 업체명 } */
async function loadLastVendors(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Record<string, string>> {
  let out: Record<string, string> = {};
  const rpcRes = await supabase.rpc("latest_vendor_by_item");
  if (!rpcRes.error && rpcRes.data) {
    // 신버전 RPC는 { item_key: vendor_name } jsonb 객체 1개를 반환(행 상한 우회).
    // 구버전(행 반환) 함수가 아직 떠 있을 수 있어 두 형태 모두 처리.
    const d = rpcRes.data as unknown;
    if (Array.isArray(d)) {
      for (const row of d as { item_key: string; vendor_name: string }[]) {
        if (row?.item_key) out[row.item_key] = row.vendor_name;
      }
    } else {
      out = (d as Record<string, string>) ?? {};
    }
  } else {
    // 폴백: RPC 미적용(마이그레이션 전)이면 기존 방식으로 집계
    const { data } = await supabase
      .from("orders")
      .select("item_name, vendor_name, created_at")
      .eq("type", "order")
      .neq("vendor_name", "")
      .order("created_at", { ascending: false })
      .limit(1500);
    for (const row of (data as { item_name: string; vendor_name: string }[] | null) ?? []) {
      const key = normalizeItemName(row.item_name);
      if (key && !(key in out)) out[key] = row.vendor_name;
    }
  }
  return out;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const supabase = await createClient();
  // 가격비교 데이터는 무겁고 팝업 열 때만 필요하므로 페이지 렌더를 막지 않음
  // (vendor-price-popover 모듈이 클라이언트 마운트 시 백그라운드로 프리페치함)
  // "품목별 최근 업체"는 서버 집계 RPC로 품목당 1행만 받음(이력 1500행 전송 제거).
  const [ordersRes, initialLastVendors] = await Promise.all([
    supabase
      .from("orders")
      .select("*, requester:profiles!requester_id(full_name)")
      .eq("type", "order")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // 힌트라서 5분쯤 묵은 값이어도 된다 → 서버가 기억해 두고 재사용한다.
    // (주문 화면을 열 때마다 주문 이력 전체를 집계하느라 0.5~1초가 걸렸다. 누가 불러도 결과가 같다.)
    serverMemo("latest-vendor-by-item", LAST_VENDOR_TTL_MS, () => loadLastVendors(supabase), (v) => Object.keys(v).length > 0),
  ]);

  const initialOrders = (ordersRes.data as OrderWithRequester[] | null) ?? [];

  // 상단바(PageHeader)는 탭·건수가 목록 상태에 달려 있어 OrderList가 그린다
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <OrderList
        initialOrders={initialOrders}
        initialLastVendors={initialLastVendors}
        initialView={view}
        headerAction={
          <Button asChild className="h-10 rounded-lg px-3 text-[13px] lg:h-9">
            <Link href="/orders/new">
              <Plus className="h-4 w-4" /> 주문 등록
            </Link>
          </Button>
        }
      />
    </div>
  );
}
