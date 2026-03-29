# Phase 1: Supabase Data Reset - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 01-supabase-data-reset
**Areas discussed:** 데이터 백업, Storage 사진 정리, 삭제 순서/방법

---

## 데이터 백업

| Option | Description | Selected |
|--------|-------------|----------|
| 백업 불필요 | 테스트/불일치 데이터라 복구할 필요 없음 | v |
| JSON으로 백업 | 각 테이블 데이터를 JSON으로 내보낸 후 삭제 | |
| Supabase 백업 기능 사용 | 대시보드에서 수동 백업 스냅샷 생성 | |

**User's choice:** 백업 불필요
**Notes:** 현재 데이터는 테스트/불일치 데이터이므로 복구 불필요

---

## Storage 사진 정리

| Option | Description | Selected |
|--------|-------------|----------|
| 전체 비우기 | order-photos 버킷 전체 사진 삭제 | v |
| 그대로 둠 | 고아 파일이 남지만 저장소 비용은 미미 | |
| 나중에 정리 | 데이터만 초기화하고 Storage 정리는 별도 작업 | |

**User's choice:** 전체 비우기
**Notes:** 마이그레이션 후 새 데이터에는 사진이 없으므로 깨끗한 상태 유지

---

## 삭제 순서/방법

| Option | Description | Selected |
|--------|-------------|----------|
| SQL 스크립트 | scripts/reset-data.sql 생성 후 SQL Editor에서 실행 | v |
| Node.js 스크립트 | Storage + DB 삭제를 한 번에 실행 | |
| Claude에게 위임 | Claude가 최적의 방법을 결정 | |

**User's choice:** SQL 스크립트
**Notes:** 기존 마이그레이션 패턴과 동일하게 scripts/ 폴더에 SQL 파일 생성

---

## Claude's Discretion

- TRUNCATE vs DELETE FROM 선택 및 실행 순서 (FK 의존성 고려)
- Storage 비우기 구현 방법 (Dashboard 수동 vs 스크립트)

## Deferred Ideas

None
