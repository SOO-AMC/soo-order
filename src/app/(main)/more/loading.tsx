export default function MoreLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">더보기</h1>
      </header>
      <div className="p-4 space-y-4">
        {/* 프로필 카드 */}
        <div className="rounded-xl bg-card p-4 shadow-card animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-5 w-14 rounded-full bg-muted" />
            </div>
          </div>
        </div>
        {/* 메뉴 카드 */}
        <div className="rounded-xl bg-card shadow-card animate-pulse">
          <div className="px-4 py-3.5">
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
