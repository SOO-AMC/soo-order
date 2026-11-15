import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, FLOW_COOKIE, FLOW_MAX_AGE_SEC, nwConfig, redirectUri, safeNext, type FlowState } from "@/lib/naverworks/oidc";

/**
 * 네이버웍스로 로그인 시작.
 *   /auth/naverworks/start?next=/briefing          → 네이버웍스로 로그인 (네이버웍스 알림의 링크도 이 주소다)
 *      이미 수오더에 로그인돼 있으면 네이버웍스를 거치지 않고 바로 next 로 보낸다.
 *   /auth/naverworks/start?mode=link&next=/account → 로그인한 사람이 자기 계정에 네이버웍스를 연결
 * state·nonce 를 만들어 쿠키(httpOnly, 10분)에 담고 네이버웍스 로그인 화면으로 보낸다.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";
  const next = safeNext(url.searchParams.get("next"), mode === "link" ? "/account" : "/");
  const back = (code: string) => {
    const to = new URL(mode === "link" ? "/account" : "/login", url.origin);
    to.searchParams.set("nw", code);
    if (mode === "login" && next !== "/") to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  };

  const supabase = await createClient();
  const { data: who } = await supabase.auth.getUser();

  // 알림 링크: 이미 로그인돼 있으면 확인 없이 바로 그 화면으로
  if (mode === "login" && who.user) return NextResponse.redirect(new URL(next, url.origin));

  const cfg = nwConfig();
  if (!cfg) {
    // 설정 전: 로그인 버튼은 숨겨져 있으므로 여기 오는 것은 알림 링크뿐 → 평소 로그인 화면으로 (돌아갈 곳은 유지)
    if (mode === "login") {
      const to = new URL("/login", url.origin);
      if (next !== "/") to.searchParams.set("next", next);
      return NextResponse.redirect(to);
    }
    return back("off");
  }

  // 연결은 이미 로그인한 사람만 (누구 계정에 붙일지가 로그인으로 정해진다)
  if (mode === "link" && !who.user) return NextResponse.redirect(new URL("/login", url.origin));

  const flow: FlowState = { state: randomBytes(24).toString("base64url"), nonce: randomBytes(24).toString("base64url"), next, mode, at: Date.now() };
  const res = NextResponse.redirect(authorizeUrl(cfg, { redirectUri: redirectUri(cfg, url.origin), state: flow.state, nonce: flow.nonce }));
  res.cookies.set(FLOW_COOKIE, JSON.stringify(flow), {
    httpOnly: true,
    secure: url.protocol === "https:",
    // 네이버웍스에서 이 사이트로 돌아오는 이동(최상위 GET)에도 쿠키가 실려야 한다 → lax
    sameSite: "lax",
    path: "/auth/naverworks",
    maxAge: FLOW_MAX_AGE_SEC,
  });
  return res;
}
