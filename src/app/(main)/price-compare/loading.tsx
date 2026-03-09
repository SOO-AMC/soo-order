export default function PriceCompareLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">가격 비교</h1>
      </header>
      <div className="p-4 space-y-4">
        {/* 탭 스켈레톤 */}
        <div className="flex gap-2">
          {["비교표", "업체 관리", "제품 매핑"].map((label) => (
            <div key={label} className="h-9 px-4 rounded-md bg-card shadow-card flex items-center">
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        {/* 테이블 스켈레톤 */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="flex gap-4">
                  <div className="h-4 w-16 rounded bg-muted" />
                  <div className="h-4 w-16 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
