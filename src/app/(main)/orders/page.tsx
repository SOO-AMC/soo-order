import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderList } from "@/components/orders/order-list";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";

export const metadata: Metadata = {
  title: "주문",
};

export default async function OrdersPage() {
  const { vendors, vendorProducts, unifiedProducts } = await fetchPriceCompareData();

  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">주문</h1>
        <Button size="icon" asChild>
          <Link href="/orders/new">
            <Plus />
          </Link>
        </Button>
      </header>
      <div className="p-4">
        <OrderList initialPriceData={{ vendors, products: vendorProducts, unified: unifiedProducts }} />
      </div>
    </div>
  );
}
