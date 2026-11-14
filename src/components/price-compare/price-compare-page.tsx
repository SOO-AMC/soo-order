"use client";

import { useEffect, useState, useCallback } from "react";
import { BackButton } from "@/components/back-button";
import { ListSkeleton, EmptyState } from "@/components/workspace/feedback";
import { PageHeader } from "@/components/page-header";
import { UnderlineTabs } from "@/components/list-parts";
import { ComparisonTable } from "./comparison-table";
import { AliasManagement } from "./alias-management";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
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

export function PriceComparePage() {
  const [data, setData] = useState<PriceCompareData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"compare" | "aliases">("compare");

  const loadData = useCallback(() => {
    fetchPriceCompareData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
          <UnderlineTabs<"compare" | "aliases">
            ariaLabel="가격 비교 보기"
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "compare", label: "가격 비교표" },
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
