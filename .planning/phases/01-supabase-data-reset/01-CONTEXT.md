# Phase 1: Supabase Data Reset - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Supabase의 운영 테이블(orders, blood_records, activity_logs) 전체 데이터를 초기화하고, order-photos Storage 버킷을 비운다. profiles, vendors, vendor_products, unified_products는 절대 건드리지 않는다.

</domain>

<decisions>
## Implementation Decisions

### 데이터 백업
- **D-01:** 백업 불필요. 현재 데이터는 테스트/불일치 데이터로, 복구할 필요 없음.

### Storage 사진 정리
- **D-02:** order-photos 버킷의 전체 사진 파일을 삭제한다. 마이그레이션 후 새 데이터에는 사진이 없으므로 깨끗한 상태 유지.

### 삭제 방법
- **D-03:** SQL 스크립트(`scripts/reset-data.sql`)를 생성하여 Supabase SQL Editor에서 실행한다. Storage 비우기는 별도 처리(Supabase Dashboard 또는 Node.js 스크립트).

### Claude's Discretion
- 삭제 순서(FK 의존성 고려한 TRUNCATE/DELETE 순서)는 Claude가 최적으로 결정
- Storage 비우기 방법(Dashboard 수동 vs 스크립트)은 Claude가 판단

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DB Schema
- `.claude/rules/db-schema.md` -- 전체 테이블 스키마 및 FK 관계
- `scripts/migrate-activity-logs.sql` -- activity_logs 테이블 생성 DDL (FK: user_id -> profiles)
- `scripts/migrate-blood-records.sql` -- blood_records 테이블 생성 DDL (FK: confirmed_by, created_by -> profiles)

### Storage
- `src/lib/utils/photo.ts` -- order-photos 버킷 사용 패턴 (BUCKET_NAME, upload/delete 로직)

### Migration Scripts (참고)
- `scripts/migrate-firebase-orders.ts` -- 기존 마이그레이션 스크립트 (Phase 3에서 활용)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/utils/photo.ts`: `deletePhotos()` 함수로 Storage 파일 삭제 가능
- `src/lib/supabase/admin.ts`: service_role 클라이언트 (RLS 우회 가능)

### Established Patterns
- SQL 마이그레이션 스크립트는 `scripts/` 폴더에 생성 후 Supabase SQL Editor에서 실행
- FK 관계: orders -> profiles (requester_id, updated_by, inspected_by), blood_records -> profiles, activity_logs -> profiles

### Integration Points
- orders 삭제 시 Realtime 구독 중인 클라이언트에 자동 통보됨 (Supabase Realtime)
- order-photos 버킷은 public 접근 가능 -- 삭제 후 즉시 URL 무효화

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- standard data reset operation.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 01-supabase-data-reset*
*Context gathered: 2026-03-29*
