export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const videoId = "o1GbZpE7xkM";

  return (
    <>
      {/* 모바일: 풀스크린 */}
      <div className="flex min-h-svh flex-col bg-gradient-to-b from-[#7B3FC5] to-[#5A2D91] lg:hidden">
        {children}
      </div>

      {/* PC: 왼쪽 영상 + 오른쪽 폼 */}
      <div className="hidden lg:flex min-h-svh">
        {/* 왼쪽: YouTube 영상 배경 */}
        <div className="relative flex-1 overflow-hidden bg-[#1a0a2e]">
          {/* YouTube iframe - 화면 꽉 채움 */}
          <div className="absolute inset-0">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1&iv_load_policy=3`}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full min-h-full aspect-video"
              allow="autoplay; encrypted-media"
              frameBorder="0"
              tabIndex={-1}
              aria-hidden="true"
            />
          </div>
          {/* 오버레이 + 브랜드 */}
          <div className="absolute inset-0 bg-[#1a0a2e]/40" />
          <div className="relative z-10 flex h-full flex-col justify-between p-10">
            <div className="flex items-center gap-3">
              <img
                src="/icons/icon-192x192.png"
                alt="수오더 로고"
                className="h-10 w-10 rounded-lg"
              />
              <span className="text-xl font-bold text-white">수오더</span>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold text-white tracking-tight">
                의약품 주문 및<br />검수 관리
              </h1>
              <p className="mt-3 text-base text-white/60">
                SOO Animal Medical Center
              </p>
            </div>
          </div>
        </div>

        {/* 오른쪽: 로그인 폼 */}
        <div className="flex w-[480px] shrink-0 items-center justify-center bg-white p-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </>
  );
}
