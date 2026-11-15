import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canAutoCreate, decidePosition, dirFullName, isActiveMember, type DirUser } from "../directory-rules";
import { directoryConfig, serviceAccountJwt } from "../directory";

const DOMAIN = 300119159;
/** 조직도에서 본 모양 그대로: 이름(성·이름), 부서, 직책/직급 */
const member = (name: string, depts: string[], level = "일반직", over: Partial<DirUser> = {}): DirUser => ({
  userId: `u-${name}`,
  domainId: DOMAIN,
  email: `${name}@sooamc.com`,
  userName: { lastName: name.slice(0, 1), firstName: name.slice(1) },
  organizations: [{ domainId: DOMAIN, primary: true, levelName: level, organizationName: "24시수동물메디컬센터", orgUnits: depts.map((d, i) => ({ orgUnitName: d, primary: i === 0 })) }],
  ...over,
});

describe("대응표: 네이버웍스 부서 → 수오더 직책", () => {
  it.each([
    ["수의사팀", "veterinarian"],
    ["간호팀", "technician"],
    ["고객만족팀", "manager"],
    ["경영지원팀", "admin_staff"],
    ["방사선", "radiologist"],
  ])("%s → %s", (dept, position) => {
    expect(decidePosition(member("홍길동", [dept]))).toEqual({ kind: "set", position, dept });
  });

  it("관리직(원장·사무장·실장)은 여러 부서에 겸직해도 바꾸지 않는다", () => {
    expect(decidePosition(member("정연미", ["경영", "간호팀", "경영지원팀", "수의사팀"], "관리직"))).toEqual({ kind: "keep", reason: "manager-level" });
    expect(decidePosition(member("김동빈", ["경영", "수의사팀"], "관리직"), "veterinarian")).toEqual({ kind: "keep", reason: "manager-level" });
  });

  it("경영 부서만 있으면 정하지 않는다", () => {
    expect(decidePosition(member("누구", ["경영"]))).toEqual({ kind: "keep", reason: "no-dept" });
  });

  it("수오더에서 인턴수의사로 정한 사람은 수의사팀이어도 인턴수의사 그대로", () => {
    expect(decidePosition(member("고민주", ["수의사팀"]), "intern_vet")).toEqual({ kind: "set", position: "intern_vet", dept: "수의사팀" });
    expect(decidePosition(member("이준우", ["수의사팀"]), "veterinarian")).toEqual({ kind: "set", position: "veterinarian", dept: "수의사팀" });
  });

  it("부서가 바뀌면 직책도 바뀐다 (심채윤: 매니저 → 테크니션)", () => {
    expect(decidePosition(member("심채윤", ["간호팀"]), "manager")).toEqual({ kind: "set", position: "technician", dept: "간호팀" });
  });

  it("대응 부서가 둘이면 원직(primary) 부서로, 그래도 모르면 바꾸지 않는다", () => {
    expect(decidePosition(member("겸직", ["간호팀", "고객만족팀"]))).toEqual({ kind: "set", position: "technician", dept: "간호팀" });
    const noPrimary = member("겸직", ["간호팀", "고객만족팀"]);
    noPrimary.organizations![0].orgUnits!.forEach((ou) => (ou.primary = false));
    expect(decidePosition(noPrimary)).toEqual({ kind: "keep", reason: "ambiguous" });
  });
});

describe("자동 계정 만들기", () => {
  it("대응 부서의 일반직은 만든다", () => {
    expect(canAutoCreate(member("최소미", ["고객만족팀"]), DOMAIN)).toEqual({ ok: true, name: "최소미", position: "manager" });
    expect(canAutoCreate(member("오채희", ["경영지원팀"]), DOMAIN)).toEqual({ ok: true, name: "오채희", position: "admin_staff" });
  });
  it("공용 계정(이름이 회사 이름)은 만들지 않는다", () => {
    const shared = member("24시수동물메디컬센터", ["간호팀"], "사원", { userName: { lastName: "", firstName: "24시수동물메디컬센터" } });
    expect(canAutoCreate(shared, DOMAIN)).toEqual({ ok: false, reason: "shared-account" });
  });
  it("관리직·경영 부서만인 사람은 만들지 않는다", () => {
    expect(canAutoCreate(member("원장", ["경영", "수의사팀"], "관리직"), DOMAIN)).toEqual({ ok: false, reason: "not-mapped" });
    expect(canAutoCreate(member("누구", ["경영"]), DOMAIN)).toEqual({ ok: false, reason: "not-mapped" });
  });
  it("다른 회사·정지·삭제·대기 계정은 만들지 않는다", () => {
    expect(canAutoCreate(member("남", ["간호팀"], "일반직", { domainId: 1, organizations: [{ domainId: 1, levelName: "일반직", orgUnits: [{ orgUnitName: "간호팀" }] }] }), DOMAIN)).toEqual({ ok: false, reason: "inactive" });
    for (const flag of ["isSuspended", "isDeleted", "isPending", "isAwaiting"] as const) {
      expect(isActiveMember(member("퇴사", ["간호팀"], "일반직", { [flag]: true }), DOMAIN)).toBe(false);
    }
    expect(isActiveMember(member("재직", ["간호팀"]), DOMAIN)).toBe(true);
  });
  it("이름은 성+이름", () => {
    expect(dirFullName({ userName: { lastName: "김", firstName: "나은" } })).toBe("김나은");
    expect(canAutoCreate({ ...member("x", ["간호팀"]), userName: null }, DOMAIN)).toEqual({ ok: false, reason: "no-name" });
  });
});

describe("서비스 계정 설정·토큰", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const env = { NAVERWORKS_CLIENT_ID: "cid", NAVERWORKS_CLIENT_SECRET: "sec", NAVERWORKS_SERVICE_ACCOUNT: "abc.serviceaccount@sooamc.com", NAVERWORKS_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), NAVERWORKS_TENANT_ID: "300119159" };

  it("하나라도 없으면 꺼진다, 한 줄로 넣은 개인 키(\\n)도 읽는다", () => {
    expect(directoryConfig({ ...env, NAVERWORKS_SERVICE_ACCOUNT: "" })).toBeNull();
    expect(directoryConfig({ ...env, NAVERWORKS_PRIVATE_KEY: "not a key" })).toBeNull();
    expect(directoryConfig({ ...env, NAVERWORKS_TENANT_ID: "abc" })).toBeNull();
    const cfg = directoryConfig(env)!;
    expect(cfg.domainId).toBe(300119159);
    expect(cfg.privateKey).toContain("\n");
  });

  it("머리·꼬리 줄 없이 본문만 붙여넣어도 읽는다", () => {
    const body = pem.replace(/-----[A-Z ]+-----/g, "").trim();
    const cfg = directoryConfig({ ...env, NAVERWORKS_PRIVATE_KEY: body })!;
    expect(cfg).not.toBeNull();
    expect(() => serviceAccountJwt(cfg)).not.toThrow();
  });

  it("JWT: iss=client id, sub=서비스 계정, 60분 이내, RS256 서명", () => {
    const cfg = directoryConfig(env)!;
    const jwt = serviceAccountJwt(cfg, 1_000_000);
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const body = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(body).toEqual({ iss: "cid", sub: "abc.serviceaccount@sooamc.com", iat: 1_000_000, exp: 1_000_000 + 1800 });
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});
