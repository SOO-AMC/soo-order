# Phase 3: Data Migration - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

src/data/firebase-items.json (9,697건)을 Supabase orders 테이블에 적재하고, 원본과 적재 데이터의 정합성을 검증한다.

</domain>

<decisions>
## Implementation Decisions

### 필드 매핑 규칙
- **D-01:** 기존 Cloud Functions 로직(functions/src/index.ts)과 동일한 변환 규칙 적용:
  - type: "반품" → "return", 그 외 → "order"
  - progress(주문): 0 → "pending", 1 → "ordered", 2 → "inspecting"
  - progress(반품): 0 → "return_requested", 2 → "return_completed"
  - requestQty: 숫자+단위 파싱 (예: "2박스" → quantity=2, unit="박스")
  - Timestamp → ISO string 변환

### 이름→profile ID 매핑
- **D-02:** Supabase profiles 테이블에서 full_name → id 매핑. 매칭 실패 시:
  - requester: admin ID로 폴백 (기존 로직 동일)
  - updated_by/inspected_by: null (기존 로직 동일)
  - 매칭 실패한 이름 목록을 리포트에 출력

### 스크립트 작성
- **D-03:** Phase 2와 동일하게 새 스크립트 작성 (기존 migrate-firebase-orders.ts 참고용)

### Claude's Discretion
- 배치 INSERT 크기 (기존: 500건씩)
- dry-run 모드 구현 방식
- 정합성 검증 쿼리 설계

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 필드 변환 로직 (핵심 참고)
- `functions/src/index.ts` -- Cloud Functions 동기화 로직: parseType(), parseStatus(), parseQuantityAndUnit(), toISO(), resolveProfileId()
- `scripts/migrate-firebase-orders.ts` -- 기존 마이그레이션 스크립트: FirebaseItem 인터페이스, mapStatus(), mapType(), parseQty()

### DB Schema
- `.claude/rules/db-schema.md` -- orders 테이블 스키마 (모든 컬럼 정의)

### 입력 데이터
- `src/data/firebase-items.json` -- Phase 2에서 내보낸 9,697건 Firebase Items

### Supabase 클라이언트
- `src/lib/supabase/admin.ts` -- service_role 클라이언트 (RLS 우회)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@supabase/supabase-js`: 이미 프로젝트에 설치됨
- profiles 테이블의 full_name → id 매핑 패턴 (functions/src/index.ts의 getProfileMap)

### Established Patterns
- 배치 INSERT: 500건씩 처리 (기존 스크립트)
- .env.local에서 환경변수 로드 (dotenv)
- service_role 키로 RLS 우회

### Integration Points
- orders 테이블에 INSERT 후 Realtime 구독 중인 클라이언트에 자동 통보
- requester_id, updated_by, inspected_by는 profiles(id) FK 참조

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- standard data migration with established patterns.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 03-data-migration*
*Context gathered: 2026-03-29*
