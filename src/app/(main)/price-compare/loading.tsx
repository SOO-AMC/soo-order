import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/workspace/feedback";

export default function PriceCompareLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader title="가격 비교" />
      <div className="p-4 lg:px-6">
        <ListSkeleton rows={10} />
      </div>
    </div>
  );
}
