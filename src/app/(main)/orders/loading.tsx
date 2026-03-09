export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-card px-4 py-3 shadow-header">
        <h1 className="text-lg font-bold">주문</h1>
        <div className="h-9 w-9 rounded-md bg-primary/20 animate-pulse" />
      </header>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded bg-muted" />
              <div className="h-5 w-14 rounded-full bg-muted" />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
