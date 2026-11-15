import { createPublicKey, verify as verifySignature } from "node:crypto";

/**
 * 네이버웍스로 로그인 (OpenID Connect, 인가 코드 방식) — 순수 함수 + 네이버웍스 서버 호출.
 * "use server" 파일이 아니다. 라우트 핸들러(src/app/auth/naverworks/*)만 부른다.
 *
 * 공식 문서 (2026-11 확인):
 *  - https://developers.worksmobile.com/kr/docs/auth-oauth  (인가·토큰 주소, client_secret 은 본문으로)
 *  - https://developers.worksmobile.com/kr/docs/auth-oidc   (ID 토큰: iss, aud=client_id, sub=구성원 ID, nonce, exp, RS256, JWKS)
 *
 * 환경변수 (모두 서버 전용, Vercel env 에 넣는다. 코드·채팅에 값을 쓰지 말 것):
 *  - NAVERWORKS_CLIENT_ID, NAVERWORKS_CLIENT_SECRET : Developer Console 에서 만든 앱의 값. 둘 다 있어야 기능이 켜진다.
 *  - NAVERWORKS_REDIRECT_BASE : 이 앱의 주소 (예: https://수오더주소). 없으면 요청이 들어온 주소를 쓴다.
 *      Developer Console 의 Redirect URL 에 `{주소}/auth/naverworks/callback` 을 똑같이 등록해야 한다.
 *  - NAVERWORKS_TENANT_ID (선택) : 있으면 ID 토큰 서명을 JWKS 로 한 번 더 확인한다.
 *  - NAVERWORKS_DOMAIN (선택) : SSO 를 쓰는 회사만. 문서: "SSO 를 사용하는 경우 필수".
 */

export const NW_AUTHORIZE_URL = "https://auth.worksmobile.com/oauth2/v2.0/authorize";
export const NW_TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
export const NW_ISSUER = "https://auth.worksmobile.com";
export const NW_SCOPE = "openid email profile";
export const CALLBACK_PATH = "/auth/naverworks/callback";
/** 로그인 시작 ~ 돌아오기까지 기억하는 쿠키 (state·nonce·돌아갈 곳·모드) */
export const FLOW_COOKIE = "nw_oidc";
export const FLOW_MAX_AGE_SEC = 10 * 60;

export type NwConfig = { clientId: string; clientSecret: string; redirectBase: string | null; tenantId: string | null; domain: string | null };

export function nwConfig(env: Record<string, string | undefined> = process.env): NwConfig | null {
  const clientId = (env.NAVERWORKS_CLIENT_ID ?? "").trim();
  const clientSecret = (env.NAVERWORKS_CLIENT_SECRET ?? "").trim();
  if (!clientId || !clientSecret) return null;
  const base = (env.NAVERWORKS_REDIRECT_BASE ?? "").trim().replace(/\/+$/, "");
  return {
    clientId,
    clientSecret,
    redirectBase: /^https?:\/\/[^\s/]+/i.test(base) ? base : null,
    tenantId: (env.NAVERWORKS_TENANT_ID ?? "").trim() || null,
    domain: (env.NAVERWORKS_DOMAIN ?? "").trim() || null,
  };
}

/** 로그인 버튼을 보여 줄지 (값은 보여 주지 않는다) */
export const naverWorksLoginEnabled = () => nwConfig() !== null;

/**
 * 로그인 뒤 돌아갈 곳. 이 앱 안의 경로만 받는다(다른 사이트로 보내는 열린 리다이렉트 방지).
 * "/briefing" ○, "//evil.com" ✕, "https://evil.com" ✕, "/\\evil" ✕
 */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  const v = next.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n\t]/.test(v) || v.length > 512) return fallback;
  if (v.startsWith("/auth/") || v.startsWith("/login")) return fallback;
  return v;
}

/**
 * 네이버웍스 알림 메시지에 넣는 링크.
 * 누르면: 이미 수오더에 로그인돼 있으면 바로 그 화면, 아니면 로그인 화면을 건너뛰고 네이버웍스 확인으로 간다 (start 라우트가 처리).
 * baseUrl 이 없으면 경로만 (미리보기용).
 */
export function notificationLink(path: string, baseUrl?: string | null): string {
  const origin = (baseUrl ?? "").replace(/\/+$/, "");
  return `${origin}/auth/naverworks/start?next=${encodeURIComponent(safeNext(path))}`;
}

export const redirectUri = (cfg: NwConfig, requestOrigin: string) => `${cfg.redirectBase ?? requestOrigin.replace(/\/+$/, "")}${CALLBACK_PATH}`;

export function authorizeUrl(cfg: NwConfig, p: { redirectUri: string; state: string; nonce: string }): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: p.redirectUri, scope: NW_SCOPE, response_type: "code", state: p.state, nonce: p.nonce });
  if (cfg.domain) q.set("domain", cfg.domain);
  return `${NW_AUTHORIZE_URL}?${q.toString()}`;
}

/** 쿠키에 담는 진행 정보. mode: login = 네이버웍스로 로그인, link = 로그인한 사람이 자기 계정에 네이버웍스를 연결 */
export type FlowState = { state: string; nonce: string; next: string; mode: "login" | "link"; at: number };

export function parseFlow(raw: string | undefined | null, now = Date.now()): FlowState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FlowState>;
    if (typeof v.state !== "string" || typeof v.nonce !== "string" || v.state.length < 16 || v.nonce.length < 16) return null;
    if (v.mode !== "login" && v.mode !== "link") return null;
    if (typeof v.at !== "number" || now - v.at > FLOW_MAX_AGE_SEC * 1000 || v.at > now + 60_000) return null;
    return { state: v.state, nonce: v.nonce, next: safeNext(v.next), mode: v.mode, at: v.at };
  } catch {
    return null;
  }
}

const b64urlJson = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

export type IdClaims = { sub: string; email: string | null; name: string | null };
export type IdTokenCheck = { ok: true; claims: IdClaims; header: { kid: string | null; alg: string | null } } | { ok: false; reason: string };

/**
 * ID 토큰의 내용 확인 (문서의 검증 규칙): iss, aud(= client_id), nonce, exp/iat, sub.
 * 서명 확인은 verifyIdTokenSignature 가 따로 한다.
 * (이 토큰은 우리 서버가 client_secret 으로 토큰 주소에서 직접 받은 것이다 — OIDC Core 3.1.3.7 은 이 경우 TLS 로 발급자 확인을 대신할 수 있다고 한다.
 *  그래도 NAVERWORKS_TENANT_ID 가 있으면 서명까지 확인한다.)
 */
export function checkIdToken(idToken: string, p: { clientId: string; nonce: string; now?: number; skewSec?: number }): IdTokenCheck {
  const parts = typeof idToken === "string" ? idToken.split(".") : [];
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  let header: Record<string, unknown>;
  let c: Record<string, unknown>;
  try {
    header = b64urlJson(parts[0]);
    c = b64urlJson(parts[1]);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const now = Math.floor((p.now ?? Date.now()) / 1000);
  const skew = p.skewSec ?? 120;
  if (header.alg !== "RS256") return { ok: false, reason: "alg" };
  if (c.iss !== NW_ISSUER) return { ok: false, reason: "iss" };
  const aud = c.aud;
  if (!(aud === p.clientId || (Array.isArray(aud) && aud.includes(p.clientId)))) return { ok: false, reason: "aud" };
  if (typeof c.exp !== "number" || c.exp + skew < now) return { ok: false, reason: "exp" };
  if (typeof c.iat !== "number" || c.iat - skew > now) return { ok: false, reason: "iat" };
  if (c.nonce !== p.nonce) return { ok: false, reason: "nonce" };
  if (typeof c.sub !== "string" || !c.sub.trim()) return { ok: false, reason: "sub" };
  return {
    ok: true,
    claims: { sub: c.sub, email: typeof c.email === "string" ? c.email : null, name: typeof c.name === "string" ? c.name : null },
    header: { kid: typeof header.kid === "string" ? header.kid : null, alg: typeof header.alg === "string" ? header.alg : null },
  };
}

type Jwk = { kty: string; kid?: string; n?: string; e?: string; alg?: string; use?: string };

/** RS256 서명 확인 (키 목록에서 kid 가 같은 키로) */
export function verifyRs256(idToken: string, keys: Jwk[]): boolean {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) return false;
  let kid: unknown;
  try {
    kid = b64urlJson(h).kid;
  } catch {
    return false;
  }
  const jwk = keys.find((k) => k.kty === "RSA" && (!kid || k.kid === kid));
  if (!jwk?.n || !jwk.e) return false;
  try {
    const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
    return verifySignature("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"));
  } catch {
    return false;
  }
}

/** 테넌트 ID 가 설정돼 있으면 JWKS 로 서명 확인. 설정이 없으면 "확인 안 함"(null) */
export async function verifyIdTokenSignature(cfg: NwConfig, idToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  if (!cfg.tenantId) return null;
  const res = await fetchImpl(`https://auth.worksmobile.com/oauth2/v2.0/certs/${encodeURIComponent(cfg.tenantId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as { keys?: Jwk[] } | null;
  return verifyRs256(idToken, body?.keys ?? []);
}

/** 인가 코드 → 토큰 (client_secret 은 본문으로 — 문서의 client_secret_post) */
export async function exchangeCode(cfg: NwConfig, p: { code: string; redirectUri: string }, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; idToken: string } | { ok: false; reason: string }> {
  const form = new URLSearchParams({ code: p.code, grant_type: "authorization_code", client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: p.redirectUri });
  if (cfg.domain) form.set("domain", cfg.domain);
  let res: Response;
  try {
    res = await fetchImpl(NW_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { ok: false, reason: "token-network" };
  }
  const body = (await res.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
  if (!res.ok) return { ok: false, reason: `token-${res.status}${typeof body?.error === "string" ? `-${body.error}` : ""}` };
  if (typeof body?.id_token !== "string") return { ok: false, reason: "no-id-token" };
  return { ok: true, idToken: body.id_token };
}

export { NW_ERROR_TEXT } from "./errors";
