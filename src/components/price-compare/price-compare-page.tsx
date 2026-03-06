"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorManagement } from "./vendor-management";
import { ProductMapping } from "./product-mapping";
import { ComparisonTable } from "./comparison-table";
import type {
  Vendor,
  VendorProduct,
  UnifiedProduct,
} from "@/lib/types/price-compare";

interface PriceComparePageProps {
  vendors: (Vendor & { product_count: number })[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
}

export function PriceComparePage({
  vendors,
  vendorProducts,
  unifiedProducts,
}: PriceComparePageProps) {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <Button variant="ghost" size="icon" asChild className="lg:hidden">
          <Link href="/more">
            <ChevronLeft />
          </Link>
        </Button>
        <h1 className="text-lg font-bold">가격 비교</h1>
      </header>

      <div className="p-4">
        <Tabs defaultValue="comparison" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 bg-card shadow-card">
            <TabsTrigger value="comparison">비교표</TabsTrigger>
            <TabsTrigger value="vendors">업체 관리</TabsTrigger>
            <TabsTrigger value="mapping">제품 매핑</TabsTrigger>
          </TabsList>

          <TabsContent value="comparison" forceMount className="data-[state=inactive]:hidden">
            <ComparisonTable
              vendors={vendors}
              vendorProducts={vendorProducts}
              unifiedProducts={unifiedProducts}
            />
          </TabsContent>

          <TabsContent value="vendors" forceMount className="data-[state=inactive]:hidden">
            <VendorManagement vendors={vendors} />
          </TabsContent>

          <TabsContent value="mapping" forceMount className="data-[state=inactive]:hidden">
            <ProductMapping
              vendors={vendors}
              vendorProducts={vendorProducts}
              unifiedProducts={unifiedProducts}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
