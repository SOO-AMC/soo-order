import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/utils/activity-log";
import { checkIdToken, exchangeCode, FLOW_COOKIE, nwConfig, parseFlow, redirectUri, verifyIdTokenSignature } from "@/lib/naverworks/oidc";
import { isMissingTable, LINK_TABLE, normalizeNwEmail, resolveLogin } from "@/lib/naverworks/links";

/**
 * 네이버웍스에서 돌아오는 곳.
 *  1) state 를 쿠키와 대조하고 → 인가 코드를 토큰으로 바꾸고 → ID 토큰을 확인한다(iss·aud·nonce·exp, 테넌트가 설정돼 있으면 서명까지).
 *  2) login: 이 네이버웍스 계정과 연결된 수오더 계정으로 세션을 만든다 (lib/naverworks/links.ts 의 resolveLogin).
 *     - 이미 구성원 ID(sub)가 붙은 연결, 또는 관리자가 적어 둔 네이버웍스 이메일이 네이버웍스가 확인해 준 이메일과 같은 연결(첫 로그인 — 이때 sub 를 붙인다).
 *     연결이 없으면 들어가지 않는다 — 이름이 같다고 짐작해서 붙이지 않는다.
 *  3) link: 지금 로그인한 수오더 계정에 이 네이버웍스 계정을 연결한다.
 *
 * 세션 만들기: 서버(service_role)가 그 사용자의 1회용 로그인 토큰을 만들고(generateLink — 메일은 보내지 않는다),
 * 곧바로 이 요청에서 그 토큰으로 로그인한다(verifyOtp → 로그인 쿠키). 토큰은 브라우저로 나가지 않는다.
 */
export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const flow = parseFlow(request.cookies.get(FLOW_COOKIE)?.value);
  const mode = flow?.mode ?? "login";
  const done = (to: URL) => {
    const res = NextResponse.redirect(to);
    res.cookies.set(FLOW_COOKIE, "", { path: "/auth/naverworks", maxAge: 0 });
    return res;
  };
  const back = (code: string) => {
    const to = new URL(mode === "link" ? "/account" : "/login", url.origin);
    to.searchParams.set("nw", code);
    if (mode === "login" && flow && flow.next !== "/") to.searchParams.set("next", flow.next);
    return done(to);
  };

  const cfg = nwConfig();
  if (!cfg) return back("off");
  if (url.searchParams.get("error")) return back("cancel");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!flow || !code || !state || state !== flow.state) return back("expired");

  const token = await exchangeCode(cfg, { code, redirectUri: redirectUri(cfg, url.origin) });
  if (!token.ok) {
    console.error("[naverworks] 토큰 교환 실패:", token.reason);
    return back("failed");
  }
  const checked = checkIdToken(token.idToken, { clientId: cfg.clientId, nonce: flow.nonce });
  if (!checked.ok) {
    console.error("[naverworks] ID 토큰 확인 실패:", checked.reason);
    return back("failed");
  }
  const signature = await verifyIdTokenSignature(cfg, token.idToken).catch(() => false);
  if (signature === false) {
    console.error("[naverworks] ID 토큰 서명 확인 실패");
    return back("failed");
  }
  const nw = checked.claims;
  const admin = createAdminClient();

  // ── 연결 ──
  if (flow.mode === "link") {
    const supabase = await createClient();
    const { data: who } = await supabase.auth.getUser();
    if (!who.user) return done(new URL("/login", url.origin));
    const { data: taken } = await admin.from(LINK_TABLE).select("user_id").eq("nw_sub", nw.sub).maybeSingle();
    if (taken && taken.user_id !== who.user.id) return back("taken");
    const { error } = await admin
      .from(LINK_TABLE)
      .upsert({ user_id: who.user.id, nw_sub: nw.sub, nw_login_email: normalizeNwEmail(nw.email) || null, nw_email: nw.email, nw_name: nw.name, linked_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      console.error("[naverworks] 연결 저장 실패:", error.message);
      return back(isMissingTable(error.message) ? "setup" : /duplicate|unique/i.test(error.message) ? "taken" : "failed");
    }
    const { data: me } = await admin.from("profiles").select("full_name").eq("id", who.user.id).maybeSingle();
    void logActivity({ userId: who.user.id, userName: (me?.full_name as string | undefined) ?? "", category: "auth", action: "naverworks_link", description: `네이버웍스 계정 연결${nw.name ? ` (${nw.name})` : ""}` });
    const to = new URL(flow.next, url.origin);
    to.searchParams.set("nw", "linked");
    return done(to);
  }

  // ── 로그인 ──
  const link = await resolveLogin(admin, nw);
  if (link.error) {
    console.error("[naverworks] 연결 조회 실패:", link.error);
    return back(isMissingTable(link.error) ? "setup" : "failed");
  }
  if (!link.userId) return back("unlinked");

  const { data: profile } = await admin.from("profiles").select("id, email, full_name, is_active").eq("id", link.userId).maybeSingle();
  if (!profile?.email) return back("unlinked");
  if (profile.is_active === false) return back("inactive");

  const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: profile.email as string });
  const tokenHash = gen?.properties?.hashed_token;
  if (genErr || !tokenHash) {
    console.error("[naverworks] 로그인 토큰 만들기 실패:", genErr?.message);
    return back("failed");
  }
  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (otpErr) {
    console.error("[naverworks] 세션 만들기 실패:", otpErr.message);
    return back("failed");
  }

  await admin.from(LINK_TABLE).update({ last_login_at: new Date().toISOString(), nw_email: nw.email, nw_name: nw.name }).eq("user_id", profile.id);
  void logActivity({ userId: profile.id as string, userName: (profile.full_name as string) ?? "", category: "auth", action: "login_naverworks", description: "네이버웍스로 로그인" });
  return done(new URL(flow.next, url.origin));
}
