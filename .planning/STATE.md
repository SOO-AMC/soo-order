# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-29)

**Core value:** 간호사가 의약품을 빠르게 주문 요청하고, 관리자가 효율적으로 발주/검수할 수 있어야 한다.
**Current focus:** Phase 1: Supabase Data Reset

## Current Position

Phase: 1 of 4 (Supabase Data Reset)
Plan: --
Status: Ready to plan
Last activity: 2026-03-29 -- Roadmap created (4 phases, 10 requirements mapped)

Progress: [..........] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- orders만 Firebase에서 마이그레이션 (blood_records는 Firebase에 없음)
- Cloud Functions 제거 (Supabase 단독 운영으로 전환)
- profiles 유지 (사용자 계정/인증 데이터는 변경 불필요)

### Pending Todos

None yet.

### Blockers/Concerns

- firebase-key.json 서비스 계정 키가 로컬에 존재해야 Firebase 내보내기 가능 (Phase 2 진입 전 확인 필요)

## Session Continuity

Last session: 2026-03-29
Stopped at: Roadmap created, ready to plan Phase 1
Resume file: None
