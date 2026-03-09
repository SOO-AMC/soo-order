# 수오더 (soo-order) - 의약품 주문 및 검수 관리

## 프로젝트 개요
간호사들이 매일 재고 체크 후 의약품 주문/반품 요청을 하고, 관리자가 발주 및 검수를 관리하는 PWA 웹 애플리케이션.

## 브랜드
- **앱 이름**: 수오더
- **Primary 컬러**: `#2563EB` (파란색, oklch(0.55 0.25 264))
- **Sub 컬러**: `#1D4ED8` (다크 블루)
- **그라데이션**: `#2563EB` → `#1D4ED8`
- **배경**: `oklch(0.965 0.003 260)` (연한 블루그레이)
- **theme_color**: `#2563EB`
- **아이콘**: SOO Animal Medical Center 로고 (`src/app/icon.png`, `public/icons/`)

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL + Storage + Realtime)
- **UI**: shadcn/ui (new-york style) + Tailwind CSS v4
- **Charts**: Recharts (대시보드)
- **PWA**: Serwist (@serwist/next)
- **Excel**: ExcelJS — 클라이언트 사이드 엑셀 파일 생성
- **Image Compression**: browser-image-compression — WebP 압축
- **Package Manager**: pnpm

## 주요 명령어
```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드 (webpack, Serwist가 webpack 필요)
vercel --prod         # 프로덕션 배포 (Vercel CLI)
```

## 디자인 시스템

### CSS 변수 & 유틸리티 (`src/app/globals.css`)
- **배경**: `oklch(0.965 0.003 260)` (연한 블루그레이, 흰색이 아님)
- **카드**: `bg-card` (흰색) + `shadow-card` (border 제거)
- **radius**: `0.75rem` (12px 기준)

### 커스텀 Shadow
```css
.shadow-card   → 카드/리스트 아이템용
.shadow-header → sticky 헤더용
.shadow-nav    → 하단 네비게이션용
```

### 헤더 패턴
모든 페이지 sticky 헤더:
```
"sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header"
```

### 카드 패턴
- 모바일 리스트 아이템: `"rounded-xl bg-card p-4 shadow-card"` (border 없음)
- 상세 페이지 래핑: `<div className="p-4"><div className="space-y-6 rounded-2xl bg-card p-5 shadow-card">...</div></div>`
- 폼 래핑: `<div className="rounded-2xl bg-card p-5 shadow-card">...</div>`

### 상태 라벨 (ORDER_STATUS_LABEL)
| status | 라벨 |
|--------|------|
| pending | 주문신청 |
| ordered | 검수대기 |
| inspecting | 검수완료 |
| return_requested | 반품신청 |
| return_completed | 반품완료 |

> 상태 라벨은 `src/lib/types/order.ts`의 `ORDER_STATUS_LABEL` 상수를 사용할 것. 인라인으로 중복 정의하지 않기.

### 반응형 레이아웃
- **모바일(<md)**: BottomNav + max-w-md, 카드 리스트 뷰
- **태블릿(md~lg)**: BottomNav + max-w-2xl, 상세 2컬럼 그리드
- **PC(lg+)**: BottomNav 숨김, 좌측 사이드바(240px), 리스트는 테이블 뷰
  - `hidden lg:block` / `lg:hidden` 패턴으로 모바일/PC 전환
  - 리스트: `lg:max-w-6xl` (가격비교/활동로그: `lg:max-w-full`)
  - 상세: `lg:max-w-4xl`, dl `lg:grid-cols-3`
  - 폼: `lg:max-w-2xl`

## 라우트 구조
```
/ → /orders 리다이렉트
(auth)/login          # 로그인 (모바일: 풀스크린 파랑+흰시트, PC: 좌측 YouTube영상+우측 폼)
(main)/               # AuthGuard + BottomNav + AppSidebar
  orders/             # 주문 리스트 (type=order)
    new/ | [id]/ | [id]/edit/
  returns/            # 반품 리스트 + [id]/ 상세
  inspection/         # 검수 대기 + [id]/ 상세
  search/             # 조회 (검색/필터/엑셀) + [id]/ 상세
  dashboard/          # 대시보드 (admin, 차트)
  price-compare/      # 가격 비교 (admin, 3탭: 비교표/업체관리/제품매핑)
  members/            # 직원 관리 (admin)
  blood/              # 혈액 대장 (수령/출고 2탭) + [id]/ 상세
    new/
  logs/               # 활동 로그 (admin, 네비 미노출, URL 직접 접속)
  more/               # 더보기 메뉴
  account/            # 계정관리
```

## 아키텍처 패턴

### Server vs Client 컴포넌트
- **Server 페이지**: 순수 레이아웃만 렌더 (async 없음, `getSessionProfile()` 호출 금지)
- **인증/권한**: Layout에서 `getSessionProfile()` → `AuthProvider` Context로 `userId`, `userName`, `isAdmin` 제공
- **Client 컴포넌트**: `useAuth()` 훅으로 auth 정보 접근, 마운트 시 데이터 fetch → 스피너 → 렌더
- **상세 페이지**: 여전히 Server에서 데이터 fetch (SSR, `force-dynamic`)

### Server Actions (`src/lib/actions/`)
- `search-action.ts`: 조회 필터 검색 (클라이언트 상태 기반, `history.replaceState` URL 동기화)
- `dashboard-action.ts`: 대시보드 RPC + Firebase 분석
- `price-compare-action.ts`: 업체/제품/통합제품 조회
- `members-action.ts`: 직원 목록 조회

### 데이터 페칭 패턴
- **리스트 페이지** (주문/반품/검수): 클라이언트 `fetchOrders()` + Supabase Realtime 구독
- **조회 페이지**: Server Action `searchOrders()` + 클라이언트 상태 관리
- **대시보드/가격비교/직원관리**: Server Action으로 마운트 시 fetch
- **상세 페이지**: Server Component에서 SSR

### Supabase 클라이언트
- `server.ts`: Server Component/Action용 (async, cookies)
- `client.ts`: Client Component용 (브라우저, 싱글톤)
- `admin.ts`: service_role key (RLS 우회, Server Action 전용)

### 인증
- 이름 + 비밀번호 (profiles.full_name → email 조회 → signInWithPassword)
- 회원가입 없음 (관리자만 `/members`에서 생성)
- `nameToEmail()`: 이름 → base64url `@soo-order.internal`
- Middleware: 토큰 갱신 + 라우트 보호

### 권한
- Role: `admin` / `user` (profiles.role)
- RLS + `is_admin()` SQL 헬퍼
- Layout에서 `AuthProvider`로 `isAdmin` 제공 → `useAuth()` 훅으로 접근

### 활동 로그 (Activity Logs)
- `activity_logs` 테이블: user_id, user_name, category, action, description, metadata
- `logActivity()` (`src/lib/utils/activity-log.ts`): admin client로 INSERT (fire-and-forget)
- `logClientAction()` (`src/app/(main)/log-action.ts`): Client Component용 Server Action
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood
- RLS: admin만 읽기, service_role로 쓰기

## DB 스키마

### profiles
id, email, full_name, role(admin/user), pharmacy_name, is_active, created_at, updated_at

### orders
id, type(order/return), item_name, quantity, unit, status, requester_id, updated_by, vendor_name, confirmed_quantity, invoice_received, inspected_by, inspected_at, photo_urls(text[]), is_urgent, return_quantity, return_reason, return_requested_by, return_requested_at, firebase_id(UNIQUE), created_at, updated_at

**상태 흐름**: pending → ordered → inspecting → return_requested → return_completed

### vendors
id, name(UNIQUE), created_at, updated_at

### vendor_products
id, vendor_id(FK→vendors), product_name, manufacturer, spec, unit_price, ingredient, category, unified_product_id(FK→unified_products), created_at

### unified_products
id, name, mg, tab, quantity, notes, sort_order, created_at, updated_at

### blood_records
id, type(received/sent), record_date, hospital_name, animal_type(dog/cat), blood_type, volume_ml, collection_date, receiver, shipper, status(pending/confirmed), settlement_type(invoice/transfer), confirmed_by(FK→profiles), confirmed_at, created_by(FK→profiles), created_at, updated_at, notes

**상태 흐름**: pending (미확인) → confirmed (확인완료, 관리자가 결제 방식 선택)

### activity_logs
id, user_id(FK→profiles), user_name, category, action, description, metadata(JSONB), created_at

## 주요 공유 컴포넌트

### 네비게이션
- `app-sidebar.tsx`: PC 사이드바 (shadow, rounded-xl 아이템)
- `bottom-nav.tsx`: 모바일 5탭 (bg-card/95, backdrop-blur, shadow-nav)

### 주문
- `order-form.tsx`: 생성/수정 공용
- `order-status-badge.tsx`: 상태 뱃지 + `StatusLegend` (2열 모바일 / flex PC)
- `order-admin-action.tsx`: 관리자 개별 발주
- `order-detail-actions.tsx`: 수정/삭제 버튼
- `photo-picker.tsx` / `photo-gallery.tsx`: 사진 첨부/갤러리

### 검수/반품
- `inspection-list.tsx`: 체크박스 일괄 검수
- `inspection-actions.tsx`: 개별 검수 완료 + 주문 취소
- `return-list.tsx`: 체크박스 일괄 반품완료
- `return-complete-button.tsx`: 개별 반품 완료
- `return-request-button.tsx`: 반품 신청 Dialog
- `cancel-inspection-button.tsx`: 검수 취소

### 혈액 대장
- `blood-list-page.tsx`: 수령/출고 2탭 (forceMount)
- `blood-list.tsx`: 탭별 리스트 (fetch + Realtime, 모바일 카드/PC 테이블)
- `blood-form.tsx`: 등록/수정 공용 폼
- `blood-confirm-button.tsx`: 관리자 확인 Dialog (결제 방식 Select)
- `blood-status-badge.tsx`: 미확인(노란색)/확인완료(초록색) 배지
- `blood-delete-button.tsx`: 삭제 Dialog

### 조회
- `search-list.tsx`: 검색 + 필터 + 엑셀
- `search-filter-sheet.tsx`: 다중선택 필터 (상태/긴급/거래명세서 배열)

### 가격비교
- `comparison-table.tsx`: 비교표 + 약품/약국 탭 필터 + 최저가 하이라이트 + 엑셀 (auto-width)
- `product-mapping.tsx`: 통합 제품 CRUD + 매핑
- `vendor-management.tsx`: 업체 CRUD + 엑셀 업로드

### 활동 로그
- `activity-log-list.tsx`: 카테고리 탭 + 검색 + 날짜 필터 + 더보기 (cursor 기반)

### 유틸
- `src/hooks/use-auth.ts`: AuthProvider, useAuth(), useIsAdmin() — Layout에서 제공하는 auth context
- `src/lib/types/order.ts`: Order, OrderWithRequester, ORDER_STATUS_LABEL, ORDER_TYPE_LABEL
- `src/lib/types/blood.ts`: BloodRecord, BloodRecordWithCreator, BLOOD_TYPE_LABEL, BLOOD_STATUS_LABEL
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct
- `src/lib/types/dashboard.ts`: DashboardData, FirebaseItem 등
- `src/lib/utils/search-params.ts`: SearchFilters (다중선택 배열), URL 직렬화, parseSearchParams
- `src/lib/utils/format.ts`: formatDate, formatDateTime, toKSTDateString
- `src/lib/utils/auth.ts`: nameToEmail(), validatePassword()
- `src/lib/utils/activity-log.ts`: logActivity() (서버 전용, admin client)
- `src/lib/utils/dashboard.ts`: transformRpcResponse()
- `src/lib/utils.ts`: cn() (clsx + tailwind-merge)
- `src/lib/queries/search-orders.ts`: fetchSearchOrders(), fetchAllSearchOrders()

### UI 컴포넌트 (shadcn/ui)
badge, button, card, checkbox, chart, command, dialog, input, label, popover, select, separator, sheet, table, tabs

### tabs 컴포넌트 특이사항
- 커스텀 슬라이딩 인디케이터 (MutationObserver + rAF throttled resize)
- `forceMount` + `data-[state=inactive]:hidden` 패턴으로 탭 전환 시 리마운트 방지

## 스크립트
- `scripts/import-price-excel.ts`: 단가비교 엑셀 → Supabase 마이그레이션 (`pnpm tsx scripts/import-price-excel.ts`)
- `scripts/migrate-activity-logs.sql`: activity_logs 테이블 생성 SQL
- `scripts/migrate-price-compare.sql`: 가격비교 테이블 생성 SQL

## Firestore → Supabase 동기화
- Cloud Functions 2nd Gen (`functions/src/index.ts`)
- Firestore Items 컬렉션 → orders 테이블 (firebase_id 기준 UPSERT/DELETE)
- `firebase deploy --only functions`

## 환경변수
- `.env.local`: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- `functions/.env`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
