import { PageHeader } from "@/components/page-header";

export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader
        title="주문"
        action={<div className="h-10 w-24 animate-pulse rounded-lg bg-primary/20 lg:h-9" />}
        tabs={
          <div className="flex h-11 items-center gap-5">
            <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-10 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
          </div>
        }
      />
      <div className="p-4 lg:px-6">
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex min-h-12 items-center px-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-t border-border px-4 py-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-44 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
