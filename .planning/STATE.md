# GSD State

## Current Position

Phase: Not started (defining requirements)
Plan: --
Status: Defining requirements
Last activity: 2026-03-29 -- Milestone v1.0 started

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** 간호사가 의약품을 빠르게 주문 요청하고, 관리자가 효율적으로 발주/검수할 수 있어야 한다.
**Current focus:** 운영 데이터 리셋 & Firebase 재마이그레이션

## Accumulated Context

- Supabase 기반 PWA 운영 중 (Next.js 16 + Supabase)
- Firebase Firestore에서 Supabase로 마이그레이션 이력 있음
- Cloud Functions로 실시간 동기화 운영 중 (제거 예정)
- 가격비교/유저 데이터는 유지, 주문/혈액/로그 데이터만 초기화 대상
