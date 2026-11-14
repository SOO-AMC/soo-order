export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인 화면(PC) 배경 영상 — 유튜브 영상 번호 (youtu.be/ 뒤의 글자). 퍼가기 허용된 영상이어야 한다
  const videoId = "cjx0hcdmry8";

  return (
    <>
      {/* 모바일: 풀스크린 */}
      <div className="flex min-h-svh flex-col bg-[#082344] lg:hidden">
        {children}
      </div>

      {/* PC: 왼쪽 영상 + 오른쪽 폼 */}
      <div className="hidden lg:flex min-h-svh">
        {/* 왼쪽: YouTube 영상 배경 */}
        <div className="relative flex-1 overflow-hidden bg-[#082344]">
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
          <div className="absolute inset-0 bg-[#082344]/55" />
          <div className="relative z-10 flex h-full flex-col justify-between p-10">
            <img
              src="/sooorder-brand/logo-horizontal-on-dark.webp"
              alt="수오더"
              className="h-12 w-auto self-start object-contain"
            />
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
        <div className="flex w-[480px] shrink-0 items-center justify-center bg-card p-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </>
  );
}
