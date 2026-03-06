export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">대시보드</h1>
      </header>
      <div className="p-4 space-y-4">
        {/* 요약 카드 스켈레톤 */}
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="mt-2 h-6 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        {/* 차트 스켈레톤 */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-4 h-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
