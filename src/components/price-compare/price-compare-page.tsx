"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ComparisonTable } from "./comparison-table";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";
import type {
  Vendor,
  VendorProduct,
  UnifiedProduct,
} from "@/lib/types/price-compare";

interface PriceCompareData {
  vendors: (Vendor & { product_count: number })[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
}

export function PriceComparePage() {
  const [data, setData] = useState<PriceCompareData | null>(null);
  const [error, setError] = useState("");

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
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="lg:hidden">
            <Link href="/more">
              <ChevronLeft />
            </Link>
          </Button>
          <h1 className="text-lg font-bold">가격 비교</h1>
        </div>
      </header>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-destructive">데이터를 불러올 수 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-16">
          <Spinner text="불러오는 중..." />
        </div>
      ) : (
        <div className="p-4">
          <ComparisonTable
            vendors={data.vendors}
            vendorProducts={data.vendorProducts}
            unifiedProducts={data.unifiedProducts}
            onDataChange={loadData}
          />
        </div>
      )}
    </div>
  );
}
