import { PageHeader } from "@/components/page-header";

export default function MoreLoading() {
  return (
    <>
      <PageHeader title="더보기" />
      <div className="mx-auto max-w-md md:max-w-2xl flex animate-pulse flex-col gap-5 p-4 lg:px-6">
        <div className="flex items-center gap-3.5 rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="size-12 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
        </div>
        {[2, 6].map((rows, i) => (
          <div key={i}>
            <div className="mb-2 h-3 w-10 rounded bg-muted" />
            <div className="rounded-2xl bg-card ring-1 ring-border">
              {Array.from({ length: rows }).map((_, j) => (
                <div key={j} className="flex h-14 items-center gap-3 border-t border-border px-4 first:border-t-0">
                  <div className="size-9 rounded-xl bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
