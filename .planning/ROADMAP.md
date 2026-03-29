# Roadmap: soo-order v1.0

## Overview

운영 데이터를 깨끗하게 리셋하고, Firebase Firestore에서 최신 주문 데이터를 재마이그레이션한 뒤, Firebase 의존성을 완전히 제거한다. 4단계 파이프라인(초기화 -> 내보내기 -> 적재 -> 정리)으로 진행하며, 각 단계는 다음 단계 진입 전 검증 게이트를 통과해야 한다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Supabase Data Reset** - 운영 테이블(orders, blood_records, activity_logs) 전체 데이터 초기화
- [ ] **Phase 2: Firebase Export** - Firestore Items 컬렉션 최신 데이터 내보내기 및 검증
- [ ] **Phase 3: Data Migration** - 내보낸 Items 데이터를 Supabase orders에 적재 및 정합성 검증
- [ ] **Phase 4: Firebase Cleanup** - Cloud Functions 해제, 코드/의존성 제거, firebase_id 컬럼 처리

## Phase Details

### Phase 1: Supabase Data Reset
**Goal**: Supabase의 테스트/불일치 데이터가 완전히 제거되어 깨끗한 상태에서 재마이그레이션을 시작할 수 있다
**Depends on**: Nothing (first phase)
**Requirements**: RESET-01, RESET-02, RESET-03
**Success Criteria** (what must be TRUE):
  1. orders 테이블에 0건의 데이터가 존재한다 (SELECT COUNT(*) = 0)
  2. blood_records 테이블에 0건의 데이터가 존재한다 (SELECT COUNT(*) = 0)
  3. activity_logs 테이블에 0건의 데이터가 존재한다 (SELECT COUNT(*) = 0)
  4. profiles, vendors, vendor_products, unified_products 테이블 데이터는 변경 없이 그대로 유지된다
**Plans**: TBD

### Phase 2: Firebase Export
**Goal**: Firebase Firestore의 최신 Items 데이터가 검증된 JSON 파일로 로컬에 존재하여 마이그레이션 입력으로 사용할 수 있다
**Depends on**: Phase 1
**Requirements**: EXPORT-01, EXPORT-02
**Success Criteria** (what must be TRUE):
  1. Firestore Items 컬렉션의 전체 문서가 JSON 파일로 내보내져 있다 (이전 9,378건과 비교하여 건수 차이 확인 가능)
  2. 내보낸 JSON의 각 문서가 마이그레이션에 필요한 필드(item_name, quantity, status 등)를 포함하고 있다
  3. dry-run 리포트를 통해 건수, 필드 분포, 누락 데이터를 사전에 확인할 수 있다
**Plans**: TBD

### Phase 3: Data Migration
**Goal**: Firebase에서 내보낸 주문 데이터가 Supabase orders 테이블에 정확하게 적재되어 운영 가능한 상태이다
**Depends on**: Phase 2
**Requirements**: MIGR-01, MIGR-02
**Success Criteria** (what must be TRUE):
  1. 내보낸 JSON의 전체 Items가 orders 테이블에 적재되어 있다 (원본 건수 = 적재 건수)
  2. 주문 상태(status) 분포가 Firebase 원본과 일치한다 (pending, ordered, inspecting 등 각 상태별 건수 대조)
  3. 관리자가 주문 목록 페이지에서 마이그레이션된 주문 데이터를 정상적으로 조회할 수 있다
**Plans**: TBD

### Phase 4: Firebase Cleanup
**Goal**: Firebase 실시간 동기화가 완전히 중단되고, 프로젝트에서 Firebase 관련 코드와 의존성이 제거되어 Supabase 단독 운영 상태이다
**Depends on**: Phase 3
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03
**Success Criteria** (what must be TRUE):
  1. Firebase Cloud Functions(onItemCreated/Updated/Deleted)가 배포 해제되어 Firestore 변경이 Supabase에 동기화되지 않는다
  2. functions/ 디렉토리와 Firebase 관련 설정 파일(firebase.json, .firebaserc 등)이 프로젝트에서 제거되어 있다
  3. firebase_id 컬럼이 제거되었거나, 유지 결정이 문서화되어 있다
  4. pnpm build가 Firebase 관련 import 없이 정상 완료된다
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Supabase Data Reset | 0/? | Not started | - |
| 2. Firebase Export | 0/? | Not started | - |
| 3. Data Migration | 0/? | Not started | - |
| 4. Firebase Cleanup | 0/? | Not started | - |
