import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** 예약 실행(Vercel Cron)이 부르는 주소. 로그인한 사람 없이 호출된다 */
const CRON_PATHS = ["/api/arrival-delay", "/api/briefing-publish", "/api/leave-rollover"];

export async function middleware(request: NextRequest) {
  // 예약 실행은 로그인 쿠키 없이 온다. 그대로 두면 아래에서 /login 으로 돌려보내져 한 번도 실행되지 않는다.
  // CRON_SECRET 이 설정돼 있고 요청의 비밀값이 맞을 때만 로그인 검사를 건너뛴다.
  // (비밀값이 없으면 건너뛰지 않는다 — 로그인하지 않은 사람이 이 주소들을 부를 수 없게)
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    CRON_PATHS.includes(request.nextUrl.pathname) &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession()으로 JWT 토큰 갱신 + 로컬 검증 (네트워크 요청 없음)
  // getUser()는 매번 Auth 서버에 왕복하므로 제거
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 네이버웍스로 로그인 왕복(시작·돌아오기)은 로그인 전에도, 로그인한 뒤(계정 연결)에도 그대로 지나간다
  if (request.nextUrl.pathname.startsWith("/auth/naverworks/")) return supabaseResponse;

  // 논문 브리핑 공개 열람(/b, /b/…): 로그인 없이도, 로그인한 채로도 그대로 연다.
  // 서버가 발행된 논문만 골라 보여 준다(lib/briefing/public-reader.ts). "/blood" 같은 다른 주소와 겹치지 않게 정확히 비교한다.
  const path = request.nextUrl.pathname;
  if (path === "/b" || path.startsWith("/b/")) return supabaseResponse;

  const publicPaths = ["/login"];
  const isPublicPath = publicPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!session && !isPublicPath) {
    const url = request.nextUrl.clone();
    // 가려던 곳을 기억해 로그인 뒤 그리로 보낸다 (예: 네이버웍스 알림의 링크 → /briefing)
    const wanted = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (request.method === "GET" && wanted !== "/" && !wanted.startsWith("/api/")) url.searchParams.set("next", wanted);
    return NextResponse.redirect(url);
  }

  if (session && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/"; // 루트에서 역할에 따라 대시보드/내 주문 현황으로 분기
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|sooorder-brand/|sw.js|manifest|~offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
