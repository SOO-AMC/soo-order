export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-bold">오프라인 상태</h1>
      <p className="text-muted-foreground">
        인터넷 연결을 확인한 후 다시 시도해 주세요.
      </p>
    </div>
  );
}
