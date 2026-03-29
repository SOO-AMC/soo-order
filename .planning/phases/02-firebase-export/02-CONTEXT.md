# Phase 2: Firebase Export - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Firebase Firestore Items 컬렉션에서 최신 데이터를 JSON으로 내보내고, 마이그레이션 입력으로 사용 가능한지 검증한다.

</domain>

<decisions>
## Implementation Decisions

### Firebase 접근
- **D-01:** firebase-key.json 서비스 계정 키가 프로젝트 루트에 이미 존재함. 별도 생성 불필요.

### 스크립트 작성
- **D-02:** 기존 export/analyze 스크립트를 사용하지 않고 새로 작성한다. 기존 스크립트(export-firebase-items.ts, analyze-firebase.ts)는 참고용으로만 활용.

### Claude's Discretion
- 내보내기 스크립트의 구체적 구현 방식 (기존 패턴 참고 가능)
- JSON 출력 경로 (기존: src/data/firebase-items.json)
- dry-run 검증 리포트 형식 및 내용

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 기존 스크립트 (참고용)
- `scripts/export-firebase-items.ts` -- 기존 Firebase Items 내보내기 스크립트 (구조 참고)
- `scripts/analyze-firebase.ts` -- 기존 Firebase 데이터 분석 스크립트 (분석 항목 참고)
- `scripts/migrate-firebase-orders.ts` -- 기존 마이그레이션 스크립트 (Phase 3에서 활용, 필드 매핑 참고)

### DB Schema
- `.claude/rules/db-schema.md` -- Supabase 테이블 스키마 (마이그레이션 대상 필드 확인)

### Firebase 설정
- `firebase-key.json` -- 서비스 계정 키 (Firebase Admin SDK 인증)
- `functions/src/index.ts` -- Cloud Functions 동기화 로직 (필드 변환 로직 참고)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `firebase-admin` 패키지: 이미 functions/에 설치되어 있으나, 스크립트에서는 별도 import 필요
- 기존 export 스크립트의 Timestamp -> ISO 변환 로직 참고 가능

### Established Patterns
- Firebase 스크립트: firebase-key.json으로 Admin SDK 초기화
- 출력 경로: `src/data/firebase-items.json`
- 실행: `npx tsx scripts/[script-name].ts`

### Integration Points
- 내보낸 JSON은 Phase 3 마이그레이션 스크립트의 입력으로 사용됨
- 필드 구조가 migrate-firebase-orders.ts의 FirebaseItem 인터페이스와 일치해야 함

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- standard Firebase export operation with validation.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 02-firebase-export*
*Context gathered: 2026-03-29*
