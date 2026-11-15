import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { authorizeUrl, checkIdToken, exchangeCode, notificationLink, nwConfig, parseFlow, redirectUri, safeNext, verifyIdTokenSignature, verifyRs256 } from "../oidc";

const CLIENT = "client-123";
const NONCE = "nonce-0123456789abcdef";
const NOW = Date.UTC(2026, 10, 15, 4, 0, 0);
const sec = Math.floor(NOW / 1000);

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as { n: string; e: string; kty: string }), kid: "k1", alg: "RS256", use: "sig" };
/** 진짜로 RS256 서명한 ID 토큰 */
function idToken(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) {
  const h = b64({ typ: "JWT", alg: "RS256", kid: "k1", ...header });
  const p = b64({ iss: "https://auth.worksmobile.com", aud: CLIENT, sub: "1234567890", nonce: NONCE, iat: sec - 10, exp: sec + 3600, email: "kim@soo.example", name: "김수오", ...claims });
  const s = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");
  return `${h}.${p}.${s}`;
}

describe("설정", () => {
  it("client id 와 secret 이 둘 다 있어야 켜진다", () => {
    expect(nwConfig({})).toBeNull();
    expect(nwConfig({ NAVERWORKS_CLIENT_ID: "a" })).toBeNull();
    expect(nwConfig({ NAVERWORKS_CLIENT_ID: " a ", NAVERWORKS_CLIENT_SECRET: "b" })).toEqual({ clientId: "a", clientSecret: "b", redirectBase: null, tenantId: null, domain: null });
  });
  it("앱 주소는 http(s) 만, 끝의 / 는 뗀다", () => {
    expect(nwConfig({ NAVERWORKS_CLIENT_ID: "a", NAVERWORKS_CLIENT_SECRET: "b", NAVERWORKS_REDIRECT_BASE: "https://soo.example/" })?.redirectBase).toBe("https://soo.example");
    expect(nwConfig({ NAVERWORKS_CLIENT_ID: "a", NAVERWORKS_CLIENT_SECRET: "b", NAVERWORKS_REDIRECT_BASE: "soo.example" })?.redirectBase).toBeNull();
  });
  it("돌아올 주소: 설정이 있으면 그것, 없으면 요청 주소", () => {
    const cfg = nwConfig({ NAVERWORKS_CLIENT_ID: "a", NAVERWORKS_CLIENT_SECRET: "b" })!;
    expect(redirectUri(cfg, "http://192.168.0.37:3002")).toBe("http://192.168.0.37:3002/auth/naverworks/callback");
    expect(redirectUri({ ...cfg, redirectBase: "https://soo.example" }, "http://x")).toBe("https://soo.example/auth/naverworks/callback");
  });
  it("인가 주소에 필요한 값이 다 들어가고, 비밀 값은 들어가지 않는다", () => {
    const cfg = { clientId: "a", clientSecret: "SECRET", redirectBase: null, tenantId: null, domain: "soo.example" };
    const u = new URL(authorizeUrl(cfg, { redirectUri: "https://soo.example/auth/naverworks/callback", state: "S", nonce: "N" }));
    expect(u.origin + u.pathname).toBe("https://auth.worksmobile.com/oauth2/v2.0/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "a", redirect_uri: "https://soo.example/auth/naverworks/callback", scope: "openid email profile", response_type: "code", state: "S", nonce: "N", domain: "soo.example" });
    expect(u.toString()).not.toContain("SECRET");
  });
});

describe("돌아갈 곳은 이 앱 안의 경로만", () => {
  it.each([
    ["/briefing", "/briefing"],
    ["/briefing/paper/abc?x=1", "/briefing/paper/abc?x=1"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/login?next=/x", "/"],
    ["/auth/naverworks/start", "/"],
    ["/a\nb", "/"],
    [undefined, "/"],
    [123, "/"],
  ])("%s → %s", (input, want) => {
    expect(safeNext(input)).toBe(want);
  });
  it("기본값을 바꿀 수 있다", () => {
    expect(safeNext("", "/orders")).toBe("/orders");
  });
});

describe("진행 정보 쿠키", () => {
  const good = { state: "s".repeat(32), nonce: "n".repeat(32), next: "/briefing", mode: "login", at: NOW };
  it("올바르면 읽는다", () => {
    expect(parseFlow(JSON.stringify(good), NOW + 1000)).toEqual(good);
  });
  it("10분이 지났거나, 모양이 틀리거나, 짧은 값이면 버린다", () => {
    expect(parseFlow(JSON.stringify(good), NOW + 11 * 60_000)).toBeNull();
    expect(parseFlow(JSON.stringify({ ...good, mode: "admin" }), NOW)).toBeNull();
    expect(parseFlow(JSON.stringify({ ...good, state: "short" }), NOW)).toBeNull();
    expect(parseFlow("not json", NOW)).toBeNull();
    expect(parseFlow(undefined, NOW)).toBeNull();
  });
  it("쿠키 속의 돌아갈 곳도 다시 거른다", () => {
    expect(parseFlow(JSON.stringify({ ...good, next: "//evil.com" }), NOW)?.next).toBe("/");
  });
});

describe("ID 토큰 내용 확인 (iss·aud·nonce·exp·sub)", () => {
  const check = (t: string, p: Partial<{ nonce: string; now: number }> = {}) => checkIdToken(t, { clientId: CLIENT, nonce: p.nonce ?? NONCE, now: p.now ?? NOW });
  it("맞으면 구성원 ID·이메일·이름을 돌려준다", () => {
    const r = check(idToken());
    expect(r).toEqual({ ok: true, claims: { sub: "1234567890", email: "kim@soo.example", name: "김수오" }, header: { kid: "k1", alg: "RS256" } });
  });
  it.each([
    ["다른 발급자", { iss: "https://evil.example" }, "iss"],
    ["다른 앱", { aud: "other" }, "aud"],
    ["nonce 다름", { nonce: "x" }, "nonce"],
    ["만료", { exp: sec - 3600 }, "exp"],
    ["미래 발급", { iat: sec + 3600 }, "iat"],
    ["구성원 ID 없음", { sub: "" }, "sub"],
  ])("%s → 거절", (_name, claims, reason) => {
    expect(check(idToken(claims))).toEqual({ ok: false, reason });
  });
  it("aud 가 배열이어도 우리 앱이 들어 있으면 된다", () => {
    expect(check(idToken({ aud: ["x", CLIENT] })).ok).toBe(true);
  });
  it("서명 방식이 RS256 이 아니면 거절 (none 공격)", () => {
    expect(check(idToken({}, { alg: "none" }))).toEqual({ ok: false, reason: "alg" });
  });
  it("모양이 틀리면 거절", () => {
    expect(check("a.b")).toEqual({ ok: false, reason: "malformed" });
    expect(check("!!.@@.##")).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("ID 토큰 서명 (RS256, JWKS)", () => {
  it("맞는 키면 통과, 내용을 바꾸면 실패", () => {
    const t = idToken();
    expect(verifyRs256(t, [jwk])).toBe(true);
    const [h, , s] = t.split(".");
    expect(verifyRs256(`${h}.${b64({ sub: "attacker" })}.${s}`, [jwk])).toBe(false);
  });
  it("다른 키·키 없음이면 실패", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ format: "jwk" }) as { n: string; e: string; kty: string };
    expect(verifyRs256(idToken(), [{ ...other, kid: "k1" }])).toBe(false);
    expect(verifyRs256(idToken(), [])).toBe(false);
  });
  it("테넌트 ID 가 없으면 확인하지 않는다(null), 있으면 JWKS 주소에서 키를 받아 확인한다", async () => {
    const cfg = { clientId: CLIENT, clientSecret: "s", redirectBase: null, tenantId: null, domain: null };
    expect(await verifyIdTokenSignature(cfg, idToken())).toBeNull();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    expect(await verifyIdTokenSignature({ ...cfg, tenantId: "1111" }, idToken(), fetchMock as unknown as typeof fetch)).toBe(true);
    expect((fetchMock.mock.calls as unknown as string[][])[0][0]).toBe("https://auth.worksmobile.com/oauth2/v2.0/certs/1111");
  });
});

describe("인가 코드 → 토큰", () => {
  const cfg = { clientId: CLIENT, clientSecret: "SECRET", redirectBase: null, tenantId: null, domain: null };
  it("client_secret 은 본문(form)으로 보내고 id_token 을 받는다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: "a", id_token: "x.y.z", token_type: "Bearer" }), { status: 200 }));
    const r = await exchangeCode(cfg, { code: "CODE", redirectUri: "https://soo.example/auth/naverworks/callback" }, fetchMock as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, idToken: "x.y.z" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://auth.worksmobile.com/oauth2/v2.0/token");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({ code: "CODE", grant_type: "authorization_code", client_id: CLIENT, client_secret: "SECRET", redirect_uri: "https://soo.example/auth/naverworks/callback" });
  });
  it("오류 응답·id_token 없음·네트워크 오류는 실패로", async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    expect(await exchangeCode(cfg, { code: "C", redirectUri: "r" }, bad as unknown as typeof fetch)).toEqual({ ok: false, reason: "token-400-invalid_grant" });
    const noId = vi.fn(async () => new Response(JSON.stringify({ access_token: "a" }), { status: 200 }));
    expect(await exchangeCode(cfg, { code: "C", redirectUri: "r" }, noId as unknown as typeof fetch)).toEqual({ ok: false, reason: "no-id-token" });
    const down = vi.fn(async () => { throw new Error("down"); });
    expect(await exchangeCode(cfg, { code: "C", redirectUri: "r" }, down as unknown as typeof fetch)).toEqual({ ok: false, reason: "token-network" });
  });
});

describe("알림 링크", () => {
  it("네이버웍스 로그인 입구를 거쳐 그 화면으로", () => {
    expect(notificationLink("/briefing", "https://soo-order.vercel.app/")).toBe("https://soo-order.vercel.app/auth/naverworks/start?next=%2Fbriefing");
    expect(notificationLink("/briefing/paper/abc")).toBe("/auth/naverworks/start?next=%2Fbriefing%2Fpaper%2Fabc");
  });
  it("앱 밖 주소는 첫 화면으로 바꾼다", () => {
    expect(notificationLink("https://evil.com")).toBe("/auth/naverworks/start?next=%2F");
  });
});
