import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeUrl, cleanLoginHint, FLOW_COOKIE, FLOW_MAX_AGE_SEC, NW_ID_COOKIE, nwConfig, redirectUri, safeNext, type FlowState } from "@/lib/naverworks/oidc";
import { loginIdForName, loginIdForUser } from "@/lib/naverworks/links";

/**
 * 네이버웍스로 로그인 시작.
 *   /auth/naverworks/start?next=/briefing          → 네이버웍스로 로그인 (네이버웍스 알림의 링크도 이 주소다)
 *      이미 수오더에 로그인돼 있으면 네이버웍스를 거치지 않고 바로 next 로 보낸다.
 *   /auth/naverworks/start?mode=link&next=/account → 로그인한 사람이 자기 계정에 네이버웍스를 연결
 *   &name=홍길동 (선택)                              → 로그인 화면에 적은 이름. 그 사람의 네이버웍스 아이디를 미리 채운다
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

  // 네이버웍스 로그인 화면에 아이디를 미리 채운다 — 선생님들이 자기 네이버웍스 아이디를 몰라도 되게.
  //  1) 로그인 화면에 이름을 적고 눌렀으면 그 사람의 아이디 (관리자가 직원 관리에서 연결해 둔 사람만)
  //  2) 아니면 이 기기에서 마지막으로 쓴 아이디 (쿠키)
  //  연결이 이미 로그인한 사람의 것이면 그 사람의 아이디
  let loginHint: string | null = null;
  try {
    const admin = createAdminClient();
    const name = url.searchParams.get("name");
    if (mode === "link" && who.user) loginHint = await loginIdForUser(admin, who.user.id);
    else if (name) loginHint = await loginIdForName(admin, name);
  } catch (e) {
    console.error("[naverworks] 아이디 미리 채우기 실패:", e instanceof Error ? e.message : e);
  }
  loginHint ??= cleanLoginHint(request.cookies.get(NW_ID_COOKIE)?.value);

  const flow: FlowState = { state: randomBytes(24).toString("base64url"), nonce: randomBytes(24).toString("base64url"), next, mode, at: Date.now() };
  const res = NextResponse.redirect(authorizeUrl(cfg, { redirectUri: redirectUri(cfg, url.origin), state: flow.state, nonce: flow.nonce, loginHint }));
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
