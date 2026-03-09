import type { Metadata } from "next";
import { PriceComparePage } from "@/components/price-compare/price-compare-page";

export const metadata: Metadata = {
  title: "가격 비교",
};

export default function PriceComparePageRoute() {
  return <PriceComparePage />;
}
