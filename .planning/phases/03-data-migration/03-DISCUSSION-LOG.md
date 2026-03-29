# Phase 3: Data Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-29
**Phase:** 03-data-migration
**Areas discussed:** 필드 매핑 규칙, 매칭 실패 처리

---

## 필드 매핑 규칙

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 로직 동일 | Cloud Functions와 동일한 변환 규칙 | v |
| 다른 규칙 적용 | 상태 매핑을 변경 | |

**User's choice:** 기존 로직 동일
**Notes:** progress(주문) 0/1/2 → pending/ordered/inspecting, progress(반품) 0/2 → return_requested/return_completed

---

## 매칭 실패 처리

| Option | Description | Selected |
|--------|-------------|----------|
| admin으로 폴백 | requester: admin ID 대체, updated_by/inspected_by: null | v |
| skip (건너뛰기) | 매칭 실패 레코드 적재하지 않음 | |
| 에러 발생 | 매칭 실패 시 전체 중단 | |

**User's choice:** admin으로 폴백
**Notes:** 기존 Cloud Functions 로직과 동일

---

## Claude's Discretion

- 배치 INSERT 크기
- dry-run 모드 구현
- 정합성 검증 쿼리 설계

## Deferred Ideas

None
