export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-card px-4 py-3 shadow-header">
        <div className="h-6 w-28 rounded bg-muted animate-pulse" />
      </header>
      <div className="p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
            <div className="h-5 w-24 rounded bg-muted" />
            <div className="mt-3 h-32 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
