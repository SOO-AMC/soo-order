export default function MainLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <div className="px-4 py-3">
        <div className="h-6 w-20 rounded bg-muted animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-card p-4 shadow-card animate-pulse">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="mt-2.5 h-3 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
