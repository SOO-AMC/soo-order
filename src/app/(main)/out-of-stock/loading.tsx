import { PageHeader } from "@/components/page-header";

export default function OutOfStockLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader
        title="품절"
        tabs={
          <div className="flex h-11 items-center gap-5">
            <div className="h-3.5 w-12 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-14 animate-pulse rounded bg-muted" />
          </div>
        }
      />
      <div className="p-4 lg:px-6">
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
          <div className="flex min-h-11 items-center bg-muted px-4">
            <div className="h-3.5 w-24 animate-pulse rounded bg-border" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-t border-border px-4 py-3">
              <div className="h-4 w-36 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-52 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
