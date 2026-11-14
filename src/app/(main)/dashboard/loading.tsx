import { PageHeader } from "@/components/page-header";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader title="내 주문 현황" />
      <div className="space-y-4 p-4 lg:px-6">
        {/* 단계 타일 */}
        <div className="grid grid-cols-4 gap-2 lg:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card px-3 py-3 ring-1 ring-border">
              <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
              <div className="mt-2.5 h-5 w-6 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        {/* 목록 */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex min-h-12 items-center px-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-t border-border px-4 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
