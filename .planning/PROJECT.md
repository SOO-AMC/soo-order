# soo-order (수오더)

## What This Is

간호사들이 의약품 주문/반품 요청을 하고, 관리자가 발주/검수를 관리하는 PWA. Next.js 16 + Supabase 기반으로 운영 중이며, 가격비교, 혈액관리, 활동 로그 등 부가 기능을 포함.

## Core Value

간호사가 의약품을 빠르게 주문 요청하고, 관리자가 효율적으로 발주/검수할 수 있어야 한다.

## Current Milestone: v1.0 운영 데이터 리셋 & Firebase 재마이그레이션

**Goal:** 테스트/불일치 데이터를 정리하고 Firebase에서 최신 데이터를 깨끗하게 재마이그레이션

**Target features:**
- Supabase 데이터 초기화 (orders, blood_records, activity_logs)
- Firebase에서 최신 Items 데이터 재내보내기 및 마이그레이션
- Firebase Cloud Functions(실시간 동기화) 제거
- Firebase 의존성 정리

## Requirements

### Validated

- ✓ 사용자 인증 (이름+비밀번호 로그인) — existing
- ✓ 주문/반품 요청 CRUD — existing
- ✓ 발주/검수 관리 (관리자) — existing
- ✓ 가격비교 (엑셀 업로드/내보내기) — existing
- ✓ 혈액관리 (입출고/정산) — existing
- ✓ 활동 로그 — existing
- ✓ PWA (Serwist) — existing

### Active

- [x] Supabase 운영 데이터 초기화 (orders, blood_records, activity_logs) — Phase 1 complete
- [x] Firebase 최신 데이터 재내보내기 — Phase 2 complete (9,697건)
- [x] Items → orders 재마이그레이션 — Phase 3 complete (9,697건 적재)
- [ ] Firebase Cloud Functions 제거
- [ ] Firebase 코드/의존성 정리

### Out of Scope

- profiles 초기화 — 사용자 계정은 유지
- vendors/vendor_products/unified_products 초기화 — 가격비교 데이터는 유지
- blood_records Firebase 마이그레이션 — Firebase에 혈액 데이터 없음, 단순 초기화만

## Context

- Firebase Firestore의 "Items" 컬렉션이 원본 주문 데이터
- 현재 Cloud Functions가 Firestore → Supabase 실시간 동기화 중
- `src/data/firebase-items.json` (9,378건)은 이전 내보내기본으로 최신 아님
- 기존 마이그레이션 스크립트: `scripts/migrate-firebase-orders.ts`, `scripts/migrate-firebase-users.ts`
- `firebase-key.json` 서비스 계정 키 필요 (Firebase Admin SDK 접근용)

## Constraints

- **데이터 보존**: profiles, vendors, vendor_products, unified_products는 절대 삭제하지 않음
- **Firebase 접근**: firebase-key.json 서비스 계정 키가 로컬에 존재해야 함
- **운영 중단 최소화**: 마이그레이션은 순차적으로 진행 (초기화 → 내보내기 → 적재)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| orders만 Firebase에서 마이그레이션 | blood_records는 Firebase에 없음 | — Pending |
| Cloud Functions 제거 | Supabase 단독 운영으로 전환 | — Pending |
| profiles 유지 | 사용자 계정/인증 데이터는 변경 불필요 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-29 after Phase 3 complete*
