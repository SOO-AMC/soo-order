import { Search } from "lucide-react";

export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">조회</h1>
      </header>
      <div className="p-4 space-y-4">
        {/* 검색바 스켈레톤 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <div className="h-10 w-full rounded-md bg-card pl-9 shadow-card" />
          </div>
          <div className="h-10 w-10 rounded-md bg-card shadow-card" />
          <div className="h-10 w-10 rounded-md bg-card shadow-card" />
        </div>
        {/* 리스트 스켈레톤 */}
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
              <div className="mt-2 h-3 w-48 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
