import { ListSkeleton, Skeleton } from "@/components/workspace/feedback";

export default function BriefingLoading() {
  return (
    <div className="mx-auto max-w-md space-y-4 p-4 md:max-w-2xl lg:max-w-6xl lg:px-6" aria-label="불러오는 중">
      <Skeleton className="h-40 rounded-2xl" />
      <ListSkeleton rows={4} />
    </div>
  );
}
