# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트
간호사들이 의약품 주문/반품 요청, 관리자가 발주/검수를 관리하는 PWA (수오더).

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL + Storage + Realtime)
- **UI**: shadcn/ui (new-york) + Tailwind CSS v4
- **PWA**: Serwist (@serwist/next)
- **Package Manager**: pnpm

## 주요 명령어
```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드 (webpack — Serwist가 webpack 필요)
git push origin main  # 배포 (GitHub → Vercel 자동 배포)
```

## 브랜드
- Primary: `#2563EB`, Sub: `#1D4ED8`, 배경: `oklch(0.965 0.003 260)`

## 라우트 구조
```
(auth)/login
(main)/ — orders/ | returns/ | inspection/ | search/ | out-of-stock/
          dashboard/ | price-compare/ | members/ | blood/ | logs/ | more/ | account/
```

## 핵심 아키텍처 패턴

### Server vs Client 컴포넌트
- **Server 페이지**: 레이아웃만 렌더, `async` 없음, `getSessionProfile()` 호출 금지
- **인증**: Layout → `AuthProvider` → `useAuth()` 훅 (`userId`, `userName`, `isAdmin`)
- **Client**: 마운트 시 데이터 fetch → 스피너 → 렌더 (Realtime 구독은 리스트 페이지)
- **예외**: 상세 페이지는 Server Component SSR (`force-dynamic`)

### Supabase 클라이언트 3종
- `server.ts`: Server Action용 + `requireUser()` / `requireAdmin()`
- `client.ts`: Client Component용 — **읽기 전용**, mutation 금지
- `admin.ts`: service_role (RLS 우회, 활동 로그 전용)

### Server Actions
- `src/app/(main)/price-compare/actions.ts`: 가격비교 CRUD
- `src/lib/actions/order-mutations.ts`: 주문 상태 변경 (모두 `requireAdmin()`)
- `src/lib/actions/price-compare-action.ts`: 가격 데이터 조회

### 활동 로그
- 서버: `logActivity()` (`src/lib/utils/activity-log.ts`) — fire-and-forget
- 클라이언트: `logClientAction()` (`src/app/(main)/log-action.ts`)
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood

## DB 스키마

### 주요 테이블
- **profiles**: id, full_name, role(admin/user), position, is_active
- **orders**: id, type(order/return), item_name, quantity, unit, status, vendor_name, confirmed_quantity, invoice_received, photo_urls(text[]), return_photo_urls(text[]), inspection_memo, is_urgent
  - 상태: `pending → ordered → inspecting → return_requested → return_completed` (+ `out_of_stock`)
- **vendors**: id, name(UNIQUE), **discount_rate**(DECIMAL 5,2, DEFAULT 0)
- **vendor_products**: id, vendor_id, product_name, unit_price, unified_product_id
- **unified_products**: id, name, notes(구분), remarks(비고), sort_order
- **blood_records**: id, type(received/sent), status(pending/confirmed), settlement_type
- **activity_logs**: id, user_id, user_name, category, action, description, metadata(JSONB)

### 마이그레이션 스크립트 (`scripts/`)
새 컬럼/테이블 추가 시 `scripts/migrate-*.sql` 파일 생성 후 Supabase SQL Editor에서 실행.

## 가격비교 특이사항
- `vendors.discount_rate`: 업체별 할인율(%). 추가/편집 시 할인전 가격 입력 → 할인율 적용 후 DB 저장
- 엑셀 내보내기: 시트1(할인전 역산), 시트2(할인후 저장값) 2시트 구성
- 엑셀 업로드: 할인전 가격 기준 → 할인율 적용 후 저장, 업로드 전 미리보기 제공
- `vendor-price-popover.tsx`: 모듈 레벨 캐시 (TTL 2분, stale-while-revalidate), orders/page.tsx에서 서버 사이드 프리페치로 첫 로딩 제거

## 상세 규칙
- `.claude/rules/ui-patterns.md` — 헤더/카드/반응형 패턴
- `.claude/rules/architecture.md` — Server/Client 분리, 데이터 페칭
- `.claude/rules/conventions.md` — 인증, Server Actions, 타입 위치
- `.claude/rules/components.md` — 주요 공유 컴포넌트
- `.claude/rules/db-schema.md` — DB 스키마 상세
