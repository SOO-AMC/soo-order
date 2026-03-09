import type { Metadata } from "next";
import { OutOfStockList } from "@/components/out-of-stock/out-of-stock-list";

export const metadata: Metadata = {
  title: "품절",
};

export default function OutOfStockPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">품절</h1>
      </header>
      <div className="p-4">
        <OutOfStockList />
      </div>
    </div>
  );
}
