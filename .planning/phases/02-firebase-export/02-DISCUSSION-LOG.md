# Phase 2: Firebase Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 02-firebase-export
**Areas discussed:** firebase-key.json, 기존 스크립트 활용

---

## firebase-key.json

| Option | Description | Selected |
|--------|-------------|----------|
| 이미 있음 | firebase-key.json이 프로젝트 루트에 존재 | v |
| 없음, 생성 필요 | Firebase Console에서 새 비공개 키를 생성해야 함 | |

**User's choice:** 이미 있음
**Notes:** 별도 생성 불필요

---

## 기존 스크립트 활용

| Option | Description | Selected |
|--------|-------------|----------|
| 그대로 사용 | export-firebase-items.ts + analyze-firebase.ts 수정 없이 실행 | |
| 수정 필요 | 필드 추가/변경 등 스크립트 업데이트 필요 | |
| 새로 작성 | 기존 스크립트 참고하되 새로 작업 (사용자 선택) | v |

**User's choice:** 새로 작성
**Notes:** 기존 스크립트가 어떻게 짜여져있는지 기억이 안나서 새로 작업하겠다고 함

---

## Claude's Discretion

- 내보내기/검증 스크립트 구현 방식
- JSON 출력 경로
- dry-run 리포트 형식

## Deferred Ideas

None
