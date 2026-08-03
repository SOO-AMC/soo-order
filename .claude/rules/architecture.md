---
paths:
  - "src/app/**"
  - "src/lib/**"
---

# 아키텍처 규칙

## Server vs Client 컴포넌트
- Server 페이지: 순수 레이아웃만 렌더 (async 없음, `getSessionProfile()` 호출 금지)
- 인증/권한: Layout에서 `getSessionProfile()` → `AuthProvider` Context로 제공
- Client 컴포넌트: `useAuth()` 훅으로 auth 정보 접근, 마운트 시 데이터 fetch
- 상세 페이지: Server에서 데이터 fetch (SSR, `force-dynamic`)

## Supabase 클라이언트 사용
- `server.ts`: Server Component/Action용 + `requireUser()` / `requireAdmin()` 헬퍼
- `client.ts`: Client Component용 (브라우저, 싱글톤) — 읽기 전용
- `admin.ts`: service_role key (RLS 우회). 로그 기록 + 팀 RLS를 넘어선 조회/쓰기(연차 오버레이 전체조회, schedule_exclude 등) — **액션 내 권한검증 후에만** 사용
- Client에서 mutation 금지 → 반드시 Server Action 사용

## 데이터 페칭 패턴
- 리스트 페이지: 클라이언트 fetch + Supabase Realtime 구독
- 조회 페이지: Server Action + 클라이언트 상태 관리
- 대시보드/가격비교/직원관리: Server Action으로 마운트 시 fetch
- 상세 페이지: Server Component SSR
- **마운트 fetch는 effect 안에서 `fetch().then(setState)`(+`let active` 가드)** — effect에서 setState 유발 함수를 그냥 호출하면 `react-hooks/set-state-in-effect` 경고. 렌더 중 `Date.now()`/`new Date()` 금지(`react-hooks/purity`) → `useState(() => …)`. 폼 리셋은 effect 대신 `key` remount.

## Server Actions (`src/lib/actions/`)
- `order-mutations.ts`: 주문 발주/검수/품절/취소/반품완료/혈액확인 (`requireAdmin()`)
- `price-compare-action.ts`: 업체/제품/통합제품 CRUD (인라인 편집/추가 포함)
- `search-action.ts`: 조회 필터 검색
- `dashboard-action.ts`: 대시보드 RPC 통계
- `leave-actions.ts`: 연차 전반(달력·연차표·수정요청·주기·잠금·잔여·유형·로그·이력복구). 팀관리자 게이팅 `canManageTeam`
- `schedule-actions.ts`: 근무표(조회·배정·복사·명단·시프트정의). 팀관리자 게이팅 `canManagePosition`. 연차 오버레이는 admin client로 전체 조회
- `invoice-scan-action.ts`(OCR·페이지 렌더 mupdf) / `invoice-confirm-action.ts` / `vendor-ledger-action.ts` / `price-analysis-action.ts` / `notification-actions.ts`

## 활동 로그
- `logActivity()` (서버): admin client로 INSERT (fire-and-forget)
- `logClientAction()`: Client Component용 Server Action
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood, leave
