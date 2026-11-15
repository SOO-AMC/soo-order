/**
 * 네이버웍스 직원 정보 → 수오더 계정 규칙 (순수 함수 — 서버·테스트가 같이 쓴다).
 *
 * 2026-11-15 사용자와 정한 대응표 (조직도와 수오더 직원 목록을 비교해서 만든 것):
 *   수의사팀 → 수의사 · 간호팀 → 테크니션 · 고객만족팀 → 매니저 · 경영지원팀 → 행정 · 방사선 → 방사선사
 *   경영 → 자동으로 정하지 않음
 * 규칙:
 *   - 직급이 "관리직"인 사람(원장·사무장·실장)은 여러 부서에 겸직돼 있어 직책을 자동으로 바꾸지 않는다.
 *   - 네이버웍스로는 인턴수의사와 수의사를 구분할 수 없다 → 수오더에서 인턴수의사로 정한 사람은 그대로 둔다.
 *   - 권한(전체관리자·팀관리자)은 따라가지 않는다. 수오더에서만 정한다.
 *   - 대응표에 있는 부서 사람만 자동으로 계정을 만든다. 공용 계정(이름이 회사 이름)은 만들지 않는다.
 */

export type DirOrgUnit = { orgUnitName?: string | null; positionName?: string | null; primary?: boolean | null };
export type DirOrganization = { domainId?: number | null; primary?: boolean | null; levelName?: string | null; organizationName?: string | null; orgUnits?: DirOrgUnit[] | null };
/** GET /v1.0/users/{userId} 응답 중 쓰는 것만 */
export type DirUser = {
  userId?: string;
  domainId?: number | null;
  email?: string | null;
  userName?: { lastName?: string | null; firstName?: string | null } | null;
  isSuspended?: boolean | null;
  isDeleted?: boolean | null;
  isPending?: boolean | null;
  isAwaiting?: boolean | null;
  organizations?: DirOrganization[] | null;
};

export type SooPosition = "veterinarian" | "intern_vet" | "technician" | "radiologist" | "manager" | "admin_staff";

/** 네이버웍스 부서 이름 → 수오더 직책 */
export const DEPT_POSITION: Record<string, SooPosition> = {
  수의사팀: "veterinarian",
  간호팀: "technician",
  고객만족팀: "manager",
  경영지원팀: "admin_staff",
  방사선: "radiologist",
};
/** 이 직급이면 직책을 자동으로 바꾸지 않는다 */
export const KEEP_LEVELS = ["관리직"];

/** 성+이름 (네이버웍스는 성과 이름이 따로 온다) */
export function dirFullName(u: DirUser): string {
  return `${u.userName?.lastName ?? ""}${u.userName?.firstName ?? ""}`.trim();
}

/** 우리 병원 소속이고 지금 쓸 수 있는 계정인가 */
export function isActiveMember(u: DirUser, domainId: number): boolean {
  if (u.isSuspended || u.isDeleted || u.isPending || u.isAwaiting) return false;
  const domains = [u.domainId, ...(u.organizations ?? []).map((o) => o.domainId)].filter((d): d is number => typeof d === "number");
  return domains.includes(domainId);
}

export type PositionDecision =
  | { kind: "set"; position: SooPosition; dept: string }
  /** 관리직 · 대응되는 부서 없음 · 대응 부서가 둘 이상 → 바꾸지 않는다 */
  | { kind: "keep"; reason: "manager-level" | "no-dept" | "ambiguous" };

/** 이 사람의 수오더 직책. current = 지금 수오더에 저장된 직책 (인턴수의사 유지에 쓴다) */
export function decidePosition(u: DirUser, current: string | null = null): PositionDecision {
  const orgs = u.organizations ?? [];
  if (orgs.some((o) => KEEP_LEVELS.includes((o.levelName ?? "").trim()))) return { kind: "keep", reason: "manager-level" };
  const depts = [...new Set(orgs.flatMap((o) => (o.orgUnits ?? []).map((ou) => (ou.orgUnitName ?? "").trim())).filter((n) => n in DEPT_POSITION))];
  if (depts.length === 0) return { kind: "keep", reason: "no-dept" };
  // 겸직이면 원직(primary) 부서를 본다. 그래도 하나로 안 정해지면 바꾸지 않는다
  let dept = depts.length === 1 ? depts[0] : null;
  if (!dept) {
    const primary = orgs.flatMap((o) => (o.orgUnits ?? []).filter((ou) => ou.primary)).map((ou) => (ou.orgUnitName ?? "").trim()).filter((n) => n in DEPT_POSITION);
    dept = primary.length === 1 ? primary[0] : null;
  }
  if (!dept) return { kind: "keep", reason: "ambiguous" };
  const position = DEPT_POSITION[dept];
  if (position === "veterinarian" && current === "intern_vet") return { kind: "set", position: "intern_vet", dept };
  return { kind: "set", position, dept };
}

/** 자동으로 수오더 계정을 만들어도 되는 사람인가 */
export function canAutoCreate(u: DirUser, domainId: number): { ok: true; name: string; position: SooPosition } | { ok: false; reason: "inactive" | "no-name" | "shared-account" | "not-mapped" } {
  if (!isActiveMember(u, domainId)) return { ok: false, reason: "inactive" };
  const name = dirFullName(u);
  if (!name) return { ok: false, reason: "no-name" };
  // 공용 계정: 이름이 회사 이름과 같다 (예: "24시수동물메디컬센터")
  if ((u.organizations ?? []).some((o) => (o.organizationName ?? "").replace(/\s+/g, "") === name.replace(/\s+/g, ""))) return { ok: false, reason: "shared-account" };
  const d = decidePosition(u);
  if (d.kind !== "set") return { ok: false, reason: "not-mapped" };
  return { ok: true, name, position: d.position };
}
