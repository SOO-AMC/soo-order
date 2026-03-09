export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <div className="h-6 w-28 rounded bg-muted animate-pulse" />
      </header>
      <div className="p-4 space-y-4">
        {/* Pills 스켈레톤 */}
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
        {/* 리스트 스켈레톤 */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="mt-2 h-4 w-32 rounded bg-muted" />
            <div className="mt-1 h-3 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
