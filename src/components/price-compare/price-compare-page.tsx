"use client";

import { useEffect, useState, useCallback } from "react";
import { BackButton } from "@/components/back-button";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { PageHeader } from "@/components/page-header";
import { UnderlineTabs } from "@/components/list-parts";
import { ComparisonTable } from "./comparison-table";
import { AliasManagement } from "./alias-management";
import { ItemCleanup } from "./item-cleanup";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import { fetchLatestInvoicePrices } from "@/lib/actions/product-link-actions";
import { shareInflight } from "@/lib/utils/inflight";
import type {
  Vendor,
  VendorProduct,
  UnifiedProduct,
  ItemNameAlias,
} from "@/lib/types/price-compare";

interface PriceCompareData {
  vendors: (Vendor & { product_count: number })[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
  itemAliases: ItemNameAlias[];
}

type Tab = "compare" | "cleanup" | "aliases";

export function PriceComparePage() {
  const [data, setData] = useState<PriceCompareData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("compare");
  /** 업체×품목별 최근 명세서 단가 — 표가 뜬 뒤에 따로 읽는다(없어도 표는 동작한다) */
  const [invoicePrices, setInvoicePrices] = useState<Record<string, { price: number; date: string }>>({});

  /** 추가·수정 뒤에 다시 읽기 (항상 새로 읽는다) */
  const loadData = useCallback(() => {
    fetchPriceCompareData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let active = true;
    // 서버 호출은 보낸 순서대로 하나씩 처리된다 → 표 데이터를 먼저 보내고, 명세서 단가(참고 표시)는 그 뒤에 보낸다.
    // (반대로 보내면 표가 명세서 단가를 기다리느라 1초쯤 늦게 뜬다)
    shareInflight("price-compare-data", fetchPriceCompareData)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e.message); });
    shareInflight("latest-invoice-prices", fetchLatestInvoicePrices)
      .then((r) => { if (active) setInvoicePrices(r); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader
        title="가격 비교"
        leading={
          <div className="lg:hidden">
            <BackButton fallbackHref="/more" />
          </div>
        }
        tabs={
          <UnderlineTabs<Tab>
            ariaLabel="가격 비교 보기"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "compare", label: "가격 비교표" },
              // 정리함: 표준 품목과 연결 안 된 주문 이름 + 비교표에 안 보이는 업체 품목
              { value: "cleanup", label: "정리함", count: data ? data.vendorProducts.filter((p) => !p.unified_product_id).length : undefined },
              { value: "aliases", label: "품목 매칭", count: data?.itemAliases.length },
            ]}
          />
        }
      />

      {error ? (
        <div className="p-4 lg:px-6">
          <div className="rounded-xl bg-card ring-1 ring-border">
            <EmptyState title="가격 비교를 불러오지 못했어요" description={error} />
          </div>
        </div>
      ) : !data ? (
        <div className="p-4 lg:px-6">
          <ListSkeleton rows={10} />
        </div>
      ) : (
        <div className="space-y-4 p-4 lg:px-6">

          {tab === "compare" ? (
            <ComparisonTable
              vendors={data.vendors.filter((v) => v.show_in_compare !== false)}
              vendorProducts={data.vendorProducts}
              unifiedProducts={data.unifiedProducts}
              onDataChange={loadData}
              invoicePrices={invoicePrices}
            />
          ) : tab === "cleanup" ? (
            <ItemCleanup
              vendors={data.vendors}
              vendorProducts={data.vendorProducts}
              unifiedProducts={data.unifiedProducts}
              onChange={loadData}
            />
          ) : (
            <AliasManagement
              aliases={data.itemAliases}
              unifiedProducts={data.unifiedProducts}
              onChange={loadData}
            />
          )}
        </div>
      )}
    </div>
  );
}
