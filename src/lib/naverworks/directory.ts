import { createSign } from "node:crypto";
import type { DirUser } from "./directory-rules";

/**
 * 네이버웍스 직원 정보 읽기 (Directory API) — 서버 전용. "use server" 파일이 아니다.
 *
 * 서비스 계정(JWT)으로 토큰을 받아 GET /v1.0/users/{이메일} 을 부른다. 권한 범위는 user.read (읽기만).
 * 문서: https://developers.worksmobile.com/kr/docs/auth-jwt · https://developers.worksmobile.com/kr/docs/user-get
 *
 * 환경변수 (서버 전용, 값은 코드·채팅에 쓰지 말 것):
 *  - NAVERWORKS_SERVICE_ACCOUNT : Developer Console 에서 발급한 서비스 계정 ID (…serviceaccount)
 *  - NAVERWORKS_PRIVATE_KEY     : 그 서비스 계정의 개인 키 (PEM 전체. 한 줄로 넣을 때는 줄바꿈을 \n 으로)
 *  - NAVERWORKS_CLIENT_ID / NAVERWORKS_CLIENT_SECRET / NAVERWORKS_TENANT_ID : 로그인과 같은 값
 * 하나라도 없으면 직원 정보를 읽지 않는다 → 자동 계정 만들기·직책 맞추기가 꺼진다 (로그인 자체는 된다).
 */

const TOKEN_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const API = "https://www.worksapis.com/v1.0";

export type DirectoryConfig = { clientId: string; clientSecret: string; serviceAccount: string; privateKey: string; domainId: number };

/**
 * 개인 키 정리: PEM 그대로, 줄바꿈을 \n 으로 쓴 한 줄, 또는 머리·꼬리 줄(-----BEGIN/END-----) 없이 본문만 붙여넣은 경우까지 받는다.
 * 본문만 있으면 PKCS#8 머리·꼬리를 붙인다. 키 모양이 아니면 null.
 */
export function normalizePrivateKey(raw: string | undefined): string | null {
  const v = (raw ?? "").replace(/\\n/g, "\n").trim();
  if (!v) return null;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v)) return v;
  const body = v.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(body) || body.length < 200) return null;
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

export function directoryConfig(env: Record<string, string | undefined> = process.env): DirectoryConfig | null {
  const clientId = (env.NAVERWORKS_CLIENT_ID ?? "").trim();
  const clientSecret = (env.NAVERWORKS_CLIENT_SECRET ?? "").trim();
  const serviceAccount = (env.NAVERWORKS_SERVICE_ACCOUNT ?? "").trim();
  const privateKey = normalizePrivateKey(env.NAVERWORKS_PRIVATE_KEY) ?? "";
  const domainId = Number((env.NAVERWORKS_TENANT_ID ?? "").trim());
  if (!clientId || !clientSecret || !serviceAccount || !privateKey.includes("PRIVATE KEY") || !Number.isInteger(domainId) || domainId <= 0) return null;
  return { clientId, clientSecret, serviceAccount, privateKey, domainId };
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** 서비스 계정 JWT (RS256, 유효 60분 이내) */
export function serviceAccountJwt(cfg: DirectoryConfig, nowSec = Math.floor(Date.now() / 1000)): string {
  const head = b64({ alg: "RS256", typ: "JWT" });
  const body = b64({ iss: cfg.clientId, sub: cfg.serviceAccount, iat: nowSec, exp: nowSec + 30 * 60 });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(cfg.privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const cached = new Map<string, { token: string; until: number }>();

/** 서비스 계정 토큰 (권한 범위별로 따로 받아 만료 전까지 재사용) */
export async function serviceToken(cfg: DirectoryConfig, scope: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const key = `${cfg.clientId}|${cfg.serviceAccount}|${scope}`;
  const hit = cached.get(key);
  if (hit && hit.until > Date.now() + 60_000) return hit.token;
  const form = new URLSearchParams({
    assertion: serviceAccountJwt(cfg),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope,
  });
  const res = await fetchImpl(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: string | number; error?: string } | null;
  if (!res.ok || !body?.access_token) throw new Error(`directory-token-${res.status}${body?.error ? `-${body.error}` : ""}`);
  const ttl = Number(body.expires_in ?? 3600);
  cached.set(key, { token: body.access_token, until: Date.now() + (Number.isFinite(ttl) ? ttl : 3600) * 1000 });
  return body.access_token;
}

/** 직원 한 명 (이메일 또는 구성원 ID). 없으면 null */
export async function getDirectoryUser(cfg: DirectoryConfig, idOrEmail: string, fetchImpl: typeof fetch = fetch): Promise<DirUser | null> {
  const token = await serviceToken(cfg, "user.read", fetchImpl);
  const res = await fetchImpl(`${API}/users/${encodeURIComponent(idOrEmail)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`directory-user-${res.status}`);
  return (await res.json()) as DirUser;
}

/** 직원 전체 (관리자 연결 화면용). 문서: 한 번에 최대 100명, cursor 로 다음 쪽 */
export async function listDirectoryUsers(cfg: DirectoryConfig, fetchImpl: typeof fetch = fetch): Promise<DirUser[]> {
  const token = await serviceToken(cfg, "user.read", fetchImpl);
  const out: DirUser[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 50; guard++) {
    const q = new URLSearchParams({ count: "100", domainId: String(cfg.domainId) });
    if (cursor) q.set("cursor", cursor);
    const res = await fetchImpl(`${API}/users?${q}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`directory-list-${res.status}`);
    const body = (await res.json()) as { users?: DirUser[]; responseMetaData?: { nextCursor?: string | null } };
    out.push(...(body.users ?? []));
    cursor = body.responseMetaData?.nextCursor ?? null;
    if (!cursor) break;
  }
  return out;
}
