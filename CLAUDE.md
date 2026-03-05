# 수오더 (soo-order) - 의약품 주문 및 검수 관리

## 프로젝트 개요
간호사들이 매일 재고 체크 후 의약품 주문/반품 요청을 하고, 관리자가 발주 및 검수를 관리하는 PWA 웹 애플리케이션.

## 브랜드
- **앱 이름**: 수오더
- **메인 컬러**: `#15BDF0` (시안/라이트블루)
- **서브 컬러**: `#1A75BC` (다크블루)
- **그라데이션**: `#15BDF0` → `#1A75BC` (235deg)
- **배경**: `#F3F6F9` (연한 블루그레이)
- **theme_color**: `#15BDF0`
- **아이콘**: SOO Animal Medical Center 로고 (`src/app/icon.png`, `public/icons/`)

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL)
- **UI**: shadcn/ui (new-york style, cyan-blue theme, lucide icons) + Tailwind CSS v4
- **PWA**: Serwist (@serwist/next)
- **Excel**: ExcelJS (exceljs) — 클라이언트 사이드 엑셀 파일 생성 (스타일링 지원)
- **Image Compression**: browser-image-compression — 클라이언트 사이드 이미지 WebP 압축
- **Package Manager**: pnpm

## 주요 명령어
```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드 (webpack, Serwist가 webpack 필요)
pnpm dlx shadcn@latest add <component>  # shadcn/ui 컴포넌트 추가
```

## 라우트 구조
```
/ → /orders로 리다이렉트
(auth)/              # 인증 페이지 (탭바 없음, 중앙 정렬 레이아웃)
  login/             # 로그인 (이름+비밀번호, Server Action)
(main)/              # 메인 페이지 (AuthGuard + 하단 탭바)
  orders/            # 주문 리스트 (Server Component, type=order만)
    new/             # 새 주문 등록 (Client Component)
    [id]/            # 상세 뷰 (Server Component)
      edit/          # 수정 폼 (Client Component)
  returns/           # 반품 리스트 (Server Component, status=return_requested)
    [id]/            # 반품 상세 (Server Component, 원본주문+반품정보+반품완료)
  inspection/        # 검수 대기 리스트 (Server Component)
    [id]/            # 검수 상세 + 검수 처리 (Server Component)
  search/            # 조회 리스트 (Server Component + Client 검색/필터)
    [id]/            # 조회 상세 (Server Component, 요청+주문+검수+반품 정보 통합)
  price-compare/     # 가격 비교 (admin only, 준비 중 페이지)
  more/              # 더보기 (사용자 정보, 메뉴 링크, 로그아웃)
  account/           # 계정관리 (내 정보, 비밀번호 변경)
    members/         # 직원 관리 (admin only, 직원 CRUD + 비밀번호 초기화)
admin/               # 관리자 페이지 (AdminGuard, 별도 레이아웃)
~offline/            # PWA 오프라인 폴백
```

## 아키텍처 패턴

### Route Groups
- `(auth)`: 인증 페이지용 레이아웃 (탭바 없음)
- `(main)`: 메인 페이지용 레이아웃 (AuthGuard + BottomNav + AppSidebar)
- URL에 그룹명 미포함 (예: `/login`, `/orders`)

### Server vs Client 컴포넌트 분리
- **Server Component**: 데이터 fetch가 필요한 리스트/상세 페이지 (`supabase/server.ts` 사용)
- **Client Component**: 폼, 인터랙션이 필요한 페이지 (`supabase/client.ts` 사용)
- 패턴: Server에서 `getSession()` + 데이터 fetch (Promise.all 병렬) → Client 자식 컴포넌트에 `initialData` props 전달
- **성능 최적화**: Server Component에서 `getSession()` (로컬 JWT, 네트워크 0회) 사용, Middleware의 `getUser()`가 Auth 서버 검증 담당
- Client Component는 `initialData`가 있으면 초기 fetch 스킵 → 스피너 없이 즉시 렌더

### Supabase 클라이언트
- `src/lib/supabase/server.ts`: Server Component/Action용 (async, cookies 기반)
- `src/lib/supabase/client.ts`: Client Component용 (브라우저, 동기 생성)
- `src/lib/supabase/admin.ts`: Admin Client (service_role key, RLS 우회, Server Action에서만 사용)

### 인증 흐름
- **로그인 방식**: 이름 + 비밀번호 (Server Action, profiles.full_name으로 email 조회 후 signInWithPassword)
- **회원가입 없음**: 관리자만 `/account/members`에서 계정 생성 가능
- **비밀번호 규칙**: 4자 이상 + 영문 + 숫자 + 특수문자 (`src/lib/utils/auth.ts`)
- **nameToEmail**: 새 계정 생성 시 이름을 base64url 인코딩한 `@soo-order.internal` 이메일 자동 생성
- `src/middleware.ts`: 모든 요청에서 토큰 갱신 + 라우트 보호
- 미인증 → `/login` 리다이렉트, 인증 상태에서 `/login` 접근 → `/orders` 리다이렉트
- `AuthGuard`: (main) 레이아웃에서 클라이언트 사이드 `getSession()` 확인 (네트워크 요청 없음, Middleware가 검증 담당)
- `AdminGuard`: admin 레이아웃에서 profiles.role === 'admin' 확인

### 권한 체계
- **Role**: `admin` / `user` (profiles 테이블의 role 필드)
- **RLS**: Supabase Row Level Security로 DB 레벨 권한 제어
- **is_admin()**: SQL 헬퍼 함수, 다른 테이블 RLS 정책에서 재사용
- **주문 수정/삭제**: 관리자 또는 해당 요청자만 가능
- **발주 처리**: 관리자만 가능 (상세 페이지 개별 발주 + 리스트 체크박스 일괄 발주)
- **검수 취소**: 검수자 본인 또는 관리자만 가능 (inspecting → ordered로 되돌리기, 검수 데이터 초기화)
- **관리자 판별**: Server Component에서 profiles.role 조회 후 Client에 isAdmin prop 전달

## DB 스키마 (supabase/schema.sql)

### profiles 테이블
- auth.users 확장, 회원가입 시 트리거로 자동 생성
- 필드: id, email, full_name, role(admin/user), pharmacy_name, is_active, created_at, updated_at

### orders 테이블
- 주문/반품 요청 관리
- 필드: id(UUID auto), type(order/return), item_name, quantity, unit(단위, 기본값 ''), status(pending/ordered/inspecting/return_requested/return_completed), requester_id(FK→profiles), updated_by(FK→profiles, nullable, 수정자 추적), vendor_name(업체명, 발주 시 입력), confirmed_quantity(검수 확인 수량), invoice_received(거래명세서 수령 여부), inspected_by(FK→profiles, 검수자), inspected_at(검수일시), photo_urls(text[] DEFAULT '{}', 사진 경로 배열, 최대 5장), is_urgent(BOOLEAN NOT NULL DEFAULT false, 긴급 여부), return_quantity(INTEGER, 반품 수량), return_reason(TEXT, 반품 사유), return_requested_by(FK→profiles, 반품 신청자), return_requested_at(TIMESTAMPTZ, 반품 신청일시), created_at, updated_at
- 상태 흐름: pending(요청중) → ordered(발주완료/검수대기) → inspecting(검수완료) → return_requested(반품신청) → return_completed(반품완료)
- update_updated_at() 트리거 재사용

### vendors 테이블
- 업체 정보 관리 (가격 비교용)
- 필드: id(UUID auto), name(TEXT UNIQUE), created_at, updated_at
- RLS: Admin full access (is_admin())

### vendor_products 테이블
- 업체별 원본 제품 (엑셀 파싱 데이터)
- 필드: id(UUID auto), vendor_id(FK→vendors, CASCADE), product_name, manufacturer, spec, unit_price(INTEGER), ingredient, category, unified_product_id(FK→unified_products, SET NULL), created_at
- 인덱스: vendor_id, unified_product_id

### unified_products 테이블
- 통합 제품 (관리자 직접 등록, 업체 제품 매핑 대상)
- 필드: id(UUID auto), name, mg, tab, sort_order(INTEGER DEFAULT 0), created_at, updated_at
- RLS: Admin full access (is_admin())

### 반응형 레이아웃
- **모바일(<md)**: BottomNav + max-w-md, 사이드바 없음, 카드 리스트 뷰 (기존 UX 유지)
- **태블릿(md~lg)**: BottomNav + max-w-2xl(672px), 상세 페이지 dl 2컬럼 그리드, 카드 리스트 뷰
- **PC(lg+)**: BottomNav 숨김, 좌측 사이드바(240px) 표시, 콘텐츠 lg:pl-60 오프셋
  - 리스트 페이지: lg:max-w-6xl, 테이블 뷰 (`hidden lg:block` / `lg:hidden` 패턴)
  - 상세 페이지: lg:max-w-4xl, dl 3컬럼 그리드 (lg:grid-cols-3)
  - 폼 페이지: lg:max-w-2xl
  - 계정 페이지: lg:max-w-4xl
- 폼 페이지는 md:max-w-xl(576px)로 약간만 확장 (사용성 유지)
- Floating 버튼: PC에서 lg:left-60 + lg:bottom-4 적용, lg:max-w-6xl
- 조회 필터 Sheet: PC에서 side="right" w-96, 모바일에서 side="bottom" max-h-[85vh]
- `src/hooks/use-media-query.ts`: useMediaQuery 훅 (SSR에서 false 반환, Sheet 방향 동적 전환에 사용)

## 주요 공유 컴포넌트
- `src/components/app-sidebar.tsx`: PC 좌측 사이드바 (lg:flex, 4메인탭 + 관리자탭(가격비교/직원관리) + 내 계정관리 + 하단 로그아웃)
- `src/components/bottom-nav.tsx`: 하단 5탭 네비게이션 (주문/반품/검수/조회/더보기, pathname.startsWith로 활성 탭 감지, lg:hidden)
- `src/components/orders/order-form.tsx`: 주문 생성/수정 공용 폼 (defaultValues로 모드 전환)
- `src/components/orders/item-name-autocomplete.tsx`: 단순 드롭다운 기반 자동완성 (300ms 디바운스, Supabase ilike 쿼리)
- `src/components/orders/order-type-badge.tsx`: 주문(default)/반품(secondary) 뱃지
- `src/components/orders/order-status-badge.tsx`: 요청중(outline)/발주완료(default)/검수완료(secondary)/반품신청(destructive)/반품완료(secondary) 뱃지
- `src/components/orders/order-admin-action.tsx`: 관리자 전용 개별 발주 (업체명 입력 + 발주 버튼, pending일 때만 표시)
- `src/components/orders/photo-picker.tsx`: 사진 선택 UI (촬영/갤러리/파일선택, 썸네일 그리드, 최대 5장)
- `src/components/orders/photo-gallery.tsx`: 사진 갤러리 뷰 (읽기 전용, 클릭 시 Dialog 라이트박스, 좌우 네비게이션)
- `src/lib/utils/photo.ts`: 사진 압축(WebP 1MB)/업로드/삭제 유틸리티, Supabase Storage `order-photos` 버킷
- `src/lib/types/order.ts`: Order 타입, OrderWithRequester, 라벨 상수 (ORDER_TYPE_LABEL, ORDER_STATUS_LABEL)
- `src/lib/utils/format.ts`: formatDate, formatDateTime (ko-KR 로케일)
- `src/components/inspection/inspection-list.tsx`: 검수 대기 리스트 (체크박스 일괄 검수, 인라인 확인수량/거래명세서 입력)
- `src/components/inspection/inspection-actions.tsx`: 검수 상세 액션 (검수 완료 폼 + 주문 취소 Dialog)
- `src/components/search/search-list.tsx`: 조회 리스트 (품목명 검색 + Sheet 기반 필터 + 카드 리스트 + 관리자 엑셀 다운로드)
- `src/components/search/search-filter-sheet.tsx`: 조회 필터 Sheet (주문유형/상태/요청자/날짜범위/발주자/검수자/검수날짜/거래명세서 필터, 초기화/적용, PC: side=right, 모바일: side=bottom)
- `src/components/search/cancel-inspection-button.tsx`: 검수 취소 버튼 (Dialog 확인 후 ordered로 되돌리기, 검수자/관리자만)
- `src/components/search/return-request-button.tsx`: 반품 신청 버튼 (Dialog, 반품수량+사유 입력, 검수완료 상태에서 표시)
- `src/components/returns/return-list.tsx`: 반품 리스트 (체크박스 일괄 반품완료, PC 테이블 + 모바일 카드)
- `src/components/returns/return-complete-button.tsx`: 반품 완료 버튼 (개별 반품 상세에서 사용)
- `src/components/more/more-page.tsx`: 더보기 페이지 (사용자 정보, 계정관리/직원관리 메뉴, 로그아웃)
- `src/lib/utils.ts`: cn() (shadcn/ui 유틸, clsx + tailwind-merge)
- `src/lib/utils/auth.ts`: nameToEmail(), validatePassword() 인증 유틸리티
- `src/components/account/account-page.tsx`: 계정 정보 + 비밀번호 변경 (뒤로가기→/more)
- `src/components/ui/spinner.tsx`: 로딩 스피너 (primary 컬러, 선택적 text prop)
- `src/components/account/staff-management.tsx`: 직원 목록 + 추가/수정/삭제/비밀번호 초기화 Dialog
- `src/components/price-compare/price-compare-page.tsx`: 가격 비교 메인 (3탭: 비교표/업체관리/제품매핑)
- `src/components/price-compare/vendor-management.tsx`: 업체 CRUD + 엑셀 업로드
- `src/components/price-compare/product-mapping.tsx`: 통합 제품 CRUD + 업체 제품 매핑
- `src/components/price-compare/comparison-table.tsx`: 가격 비교표 + 최저가 하이라이트 + 엑셀 다운로드
- `src/lib/utils/parse-vendor-excel.ts`: 업체 엑셀 파싱 (ExcelJS, 헤더 자동 감지)
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct 타입

## 설치된 shadcn/ui 컴포넌트
badge, button, card, checkbox, command, dialog, input, label, popover, select, separator, sheet, table, tabs

## 구현 상태
- [x] 프로젝트 세팅 (Next.js + Supabase + shadcn/ui + PWA)
- [x] 인증 (이름+비밀번호 로그인, 회원가입 제거, middleware, AuthGuard/AdminGuard)
- [x] 주문 탭 (리스트, 생성, 상세, 수정, 삭제, type=order만 필터)
- [x] 수정자 추적 (updated_by 필드, 상세 페이지에서 수정자 표시)
- [x] 관리자 발주 기능 (상세 페이지 개별 발주 + 리스트 일괄 발주)
- [x] 검수 탭 (리스트, 상세, 개별/일괄 검수 완료, 주문 취소)
- [x] 조회 탭 (리스트 검색/필터, 상세 통합 조회, 검수 취소, 관리자 엑셀 다운로드)
- [x] 반품 탭 (조회 상세에서 검수완료 품목 반품 신청, 반품 리스트, 반품 상세, 일괄/개별 반품 완료)
- [x] 더보기 탭 (사용자 정보, 계정관리/직원관리 메뉴, 로그아웃)
- [x] 계정관리 (내 정보, 비밀번호 변경, 뒤로가기→더보기)
- [x] 직원 관리 (admin only, 계정 추가/수정/삭제/비밀번호 초기화/권한 변경)
- [x] 화면 전환 애니메이션 (Spinner 로딩, page-enter fade-in, 로그인 slide-up)
- [x] 성능 최적화 (getUser→getSession, Server prefetch + initialData, Promise.all 병렬화, 검수 일괄 병렬 처리)
- [x] 태블릿/PC 반응형 최적화 (AppSidebar, 콘텐츠 너비 확장, 상세 2컬럼 그리드, floating 버튼 오프셋)
- [x] PC 레이아웃 최적화 (리스트 테이블 뷰, max-width 확장, 상세 3컬럼 그리드, 필터 Sheet 우측 패널)
- [x] 주문 사진 첨부 (최대 5장, WebP 압축, 카메라/갤러리/파일선택, 갤러리 라이트박스, 리스트 아이콘 표시, 삭제 시 스토리지 정리)
- [x] 긴급 주문 (is_urgent 체크박스, 리스트 최상단 정렬, 빨간 CircleAlert 아이콘, 상세 긴급 뱃지, 조회 필터, 엑셀 컬럼)
- [x] 가격 비교 페이지 (admin only, 3탭: 비교표/업체관리/제품매핑, 엑셀 업로드→파싱→DB, 통합제품 매핑, 최저가 하이라이트, 엑셀 다운로드)
- [x] Firestore→Supabase 실시간 동기화 (Cloud Functions 2nd Gen, Items 컬렉션 생성/수정/삭제 → orders 테이블 upsert/delete)

## Firestore → Supabase 실시간 동기화

### 개요
이전 프로젝트(Firebase/Firestore)에서 새 프로젝트(Supabase)로 전환하는 기간 동안, Firestore `Items` 컬렉션의 생성/수정/삭제를 실시간으로 Supabase `orders` 테이블에 동기화.

### 구조
- **Firebase 프로젝트**: `transactionledger-3f134`
- **Cloud Functions (2nd Gen)**: `functions/src/index.ts`
  - `onItemCreated` → Supabase UPSERT
  - `onItemUpdated` → Supabase UPSERT
  - `onItemDeleted` → Supabase DELETE (firebase_id 기준)
- **리전**: us-central1
- **런타임**: Node.js 22

### DB 마이그레이션
```sql
ALTER TABLE public.orders ADD COLUMN firebase_id TEXT UNIQUE;
```

### 필드 매핑 (Firestore → Supabase)
- `doc.id` → `firebase_id` (중복 방지 UNIQUE 키)
- `type` → `type` ("주문"→order, "반품"→return)
- `name` → `item_name`
- `requestQty` → `quantity` + `unit` (파싱: "2박스"→2,"박스")
- `progress` → `status` (0→pending, 1→ordered, 2→inspecting)
- `companyNm` → `vendor_name`
- `requester/orderer/inspector` → profiles.id (이름→ID 매핑, 5분 캐싱)
- `confirmQty` → `confirmed_quantity`, `hasTS` → `invoice_received`
- `createdAt/recievedAt/lastEdited` → `created_at/inspected_at/updated_at`

### 환경변수
- `functions/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (defineString으로 런타임 resolve)

### 배포
```bash
cd functions && npm run deploy   # 또는 firebase deploy --only functions
```

### 파일
| 파일 | 설명 |
|---|---|
| `functions/src/index.ts` | Cloud Function 메인 코드 |
| `functions/package.json` | 의존성 (firebase-functions, firebase-admin, @supabase/supabase-js) |
| `functions/tsconfig.json` | TypeScript 설정 |
| `functions/.env` | 환경변수 (gitignore) |
| `firebase.json` | Firebase 프로젝트 설정 |
| `.firebaserc` | Firebase 프로젝트 alias |

## 기획 메모
- 주문 요청 → 관리자가 발주 실행 → 발주 완료된 품목은 검수 탭에 검수 대기로 표시 → 확인 수량 + 거래명세서 수령 여부 입력 후 검수 완료 → 조회 상세에서 반품 신청 → 반품 탭에서 반품 완료 처리
- 검수 대기 품목 주문 취소: 요청중으로 되돌리기 또는 완전 삭제 선택 가능 (관리자 또는 요청자)
- 품목명: 자유 텍스트 입력 + 이전 입력값 기반 자동완성
- Supabase 설정: Authentication → Providers → Email → Confirm email **OFF**, Minimum password length → 4
- 환경변수: `SUPABASE_SERVICE_ROLE_KEY` (서버 전용, admin client용)
- Supabase Storage: `order-photos` 버킷 (public), 경로 `{orderId}/{uuid}.webp`, RLS: authenticated INSERT/SELECT, owner/admin DELETE
- DB 마이그레이션: `ALTER TABLE orders ADD COLUMN photo_urls text[] DEFAULT '{}'`
- DB 마이그레이션: `ALTER TABLE orders ADD COLUMN is_urgent BOOLEAN NOT NULL DEFAULT false`
- DB 마이그레이션: 반품 기능 추가
  ```sql
  ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
  ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending', 'ordered', 'inspecting', 'return_requested', 'return_completed'));
  ALTER TABLE public.orders ADD COLUMN return_quantity INTEGER;
  ALTER TABLE public.orders ADD COLUMN return_reason TEXT DEFAULT '';
  ALTER TABLE public.orders ADD COLUMN return_requested_by UUID REFERENCES public.profiles(id);
  ALTER TABLE public.orders ADD COLUMN return_requested_at TIMESTAMPTZ;
  ```
- 네비게이션: 4탭(주문/검수/조회/계정관리) → 5탭(주문/반품/검수/조회/더보기)
- DB 마이그레이션: 가격 비교 (vendors, vendor_products, unified_products 테이블 + RLS + 인덱스 + 트리거) → `scripts/migrate-price-compare.sql`
