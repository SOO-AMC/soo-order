import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/workspace/feedback";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <PageHeader title="조회" />
      <div className="space-y-3 p-4 lg:px-6">
        <div className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <ListSkeleton rows={10} />
      </div>
    </div>
  );
}
