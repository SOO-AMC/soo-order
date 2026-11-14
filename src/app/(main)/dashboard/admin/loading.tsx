import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/workspace/feedback";

export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-[1400px]">
      <PageHeader title="대시보드" />
      <div className="space-y-4 p-4 lg:px-6" aria-label="불러오는 중">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
