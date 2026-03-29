# Requirements: soo-order v1.0

**Defined:** 2026-03-29
**Core Value:** 간호사가 의약품을 빠르게 주문 요청하고, 관리자가 효율적으로 발주/검수할 수 있어야 한다.

## v1.0 Requirements

운영 데이터 리셋 및 Firebase 재마이그레이션. 각 요구사항은 로드맵 페이즈에 매핑됨.

### 데이터 초기화

- [ ] **RESET-01**: Supabase orders 테이블 전체 데이터 삭제
- [ ] **RESET-02**: Supabase blood_records 테이블 전체 데이터 삭제
- [ ] **RESET-03**: Supabase activity_logs 테이블 전체 데이터 삭제

### Firebase 내보내기

- [ ] **EXPORT-01**: Firebase Firestore Items 컬렉션에서 최신 데이터를 JSON으로 내보내기
- [ ] **EXPORT-02**: 내보낸 데이터의 건수/필드 검증 (dry-run 확인)

### 데이터 마이그레이션

- [ ] **MIGR-01**: 내보낸 Firebase Items를 Supabase orders 테이블에 적재
- [ ] **MIGR-02**: 마이그레이션 후 데이터 정합성 검증 (건수, 상태 분포 확인)

### Firebase 정리

- [ ] **CLEAN-01**: Firebase Cloud Functions (onItemCreated/Updated/Deleted) 배포 해제
- [ ] **CLEAN-02**: functions/ 디렉토리 및 Firebase 관련 설정 파일 제거
- [ ] **CLEAN-03**: orders 테이블의 firebase_id 컬럼 제거 검토 및 처리

## Future Requirements

없음 (운영 마일스톤)

## Out of Scope

| Feature | Reason |
|---------|--------|
| profiles 초기화 | 사용자 계정은 유지 |
| vendors/vendor_products/unified_products 초기화 | 가격비교 데이터는 유지 |
| blood_records Firebase 마이그레이션 | Firebase에 혈액 데이터 없음, 단순 초기화만 |
| Firebase Auth 마이그레이션 | Supabase Auth 이미 운영 중, profiles 유지 |
| 스키마 변경 | 이번 마일스톤은 데이터 마이그레이션만, 스키마 변경 없음 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RESET-01 | — | Pending |
| RESET-02 | — | Pending |
| RESET-03 | — | Pending |
| EXPORT-01 | — | Pending |
| EXPORT-02 | — | Pending |
| MIGR-01 | — | Pending |
| MIGR-02 | — | Pending |
| CLEAN-01 | — | Pending |
| CLEAN-02 | — | Pending |
| CLEAN-03 | — | Pending |

**Coverage:**
- v1.0 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after initial definition*
