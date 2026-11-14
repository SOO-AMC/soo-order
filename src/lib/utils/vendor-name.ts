/**
 * 업체 이름 맞추기.
 *
 * 같은 업체가 "(주) 한미" · "㈜한미" · " vs팜" 처럼 여러 모양으로 적히는 문제를 다룬다.
 * DB에도 같은 규칙의 함수(vendor_key, canonical_vendor_name — supabase/migrate-vendor-unify.sql)가 있어
 * 주문에 이름이 저장될 때 표준 이름으로 맞춰 준다. **두 곳의 규칙은 반드시 같아야 한다**
 * (테스트의 기대값은 DB 함수가 실제로 낸 값이다).
 */

export interface VendorLite {
  id: string;
  name: string;
}
export interface VendorAliasLite {
  vendorId: string;
  alias: string;
}

/** 이름 비교용 열쇠: (주)·주식회사 등과 띄어쓰기·기호·대소문자를 뺀 글자 */
export function vendorKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\(주\)|주식회사|\(유\)|유한회사|\(사\)|\(재\)/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export interface VendorIndex {
  /** 적힌 이름 → 업체. 못 찾으면 null (DB의 canonical_vendor_name 과 같은 순서) */
  resolve(name: string | null | undefined): VendorLite | null;
  /** 업체 id → 다른 이름들 */
  aliasesOf(vendorId: string): string[];
}

export function buildVendorIndex(vendors: VendorLite[], aliases: VendorAliasLite[]): VendorIndex {
  const byExact = new Map(vendors.map((v) => [v.name, v] as const));
  const byId = new Map(vendors.map((v) => [v.id, v] as const));

  const byAliasKey = new Map<string, VendorLite>();
  const aliasList = new Map<string, string[]>();
  for (const a of aliases) {
    const v = byId.get(a.vendorId);
    const k = vendorKey(a.alias);
    if (!v || !k) continue;
    if (!byAliasKey.has(k)) byAliasKey.set(k, v);
    const list = aliasList.get(a.vendorId) ?? [];
    list.push(a.alias);
    aliasList.set(a.vendorId, list);
  }

  // (주)·띄어쓰기만 다른 경우 — 그런 업체가 딱 하나일 때만 인정한다
  const byNameKey = new Map<string, VendorLite | null>();
  for (const v of vendors) {
    const k = vendorKey(v.name);
    if (!k) continue;
    byNameKey.set(k, byNameKey.has(k) ? null : v);
  }

  return {
    resolve(name) {
      if (name == null) return null;
      const k = vendorKey(name);
      if (!k) return null;
      return byExact.get(name) ?? byAliasKey.get(k) ?? byNameKey.get(k) ?? null;
    },
    aliasesOf(vendorId) {
      return aliasList.get(vendorId) ?? [];
    },
  };
}

/**
 * 우리 병원 이름처럼 보이는가.
 * 명세서의 "공급받는자"(우리 병원)를 업체로 잘못 읽은 글자가 주문·명세서에 많이 들어 있다
 * ("24시수동물메디칼센터(영등포)", "24시수동굴미디컬센터" 등 오독 포함).
 * 이런 이름은 특정 업체의 "다른 이름"으로 기억하면 안 된다 — 어느 업체 명세서에서든 나올 수 있기 때문.
 */
export function looksLikeOwnHospital(name: string | null | undefined): boolean {
  const k = vendorKey(name);
  return /24시.{0,2}동.{0,2}(메디|미디)/.test(k) || /수동물(메디|미디)/.test(k);
}

/** 못 찾은 이름에 대해 "혹시 이 업체?" 후보. 열쇠가 서로를 포함하면 후보로 본다 (자동 연결에는 쓰지 않는다) */
export function suggestVendors(name: string, vendors: VendorLite[], aliases: VendorAliasLite[], limit = 3): VendorLite[] {
  const k = vendorKey(name);
  if (k.length < 2) return [];
  const byId = new Map(vendors.map((v) => [v.id, v] as const));
  const scored = new Map<string, number>();
  const consider = (vendorId: string, candidate: string) => {
    const ck = vendorKey(candidate);
    if (ck.length < 2) return;
    let score = 0;
    if (ck === k) score = 1;
    else if (ck.includes(k) || k.includes(ck)) score = Math.min(ck.length, k.length) / Math.max(ck.length, k.length);
    if (score > (scored.get(vendorId) ?? 0)) scored.set(vendorId, score);
  };
  for (const v of vendors) consider(v.id, v.name);
  for (const a of aliases) consider(a.vendorId, a.alias);
  return [...scored.entries()]
    .filter(([, s]) => s >= 0.4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => byId.get(id))
    .filter((v): v is VendorLite => !!v);
}
