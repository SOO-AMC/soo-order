# 수오더 (soo-order) - 의약품 주문 및 검수 관리

간호사들이 의약품 주문/반품 요청, 관리자가 발주/검수를 관리하는 PWA.

## Tech Stack
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL + Storage + Realtime)
- **UI**: shadcn/ui (new-york) + Tailwind CSS v4
- **PWA**: Serwist (@serwist/next)
- **Package Manager**: pnpm

## 주요 명령어
```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드 (webpack, Serwist 필요)
vercel --prod         # 프로덕션 배포
```

## 브랜드
- Primary: `#2563EB`, Sub: `#1D4ED8`, 배경: `oklch(0.965 0.003 260)`

## 라우트 구조
```
(auth)/login
(main)/ — orders/ | returns/ | inspection/ | search/ | out-of-stock/
          dashboard/ | price-compare/ | members/ | blood/ | logs/ | more/ | account/
```

## DB 테이블
profiles, orders, vendors, vendor_products, unified_products, blood_records, activity_logs

**orders 상태**: pending → ordered → inspecting → return_requested → return_completed (+ out_of_stock)

## 인증
이름 + 비밀번호 (`nameToEmail()` → base64url `@soo-order.internal`)
Role: admin / user (profiles.role), RLS + `is_admin()` SQL 헬퍼

## Supabase 클라이언트
- `server.ts`: Server Action용 + `requireUser()` / `requireAdmin()`
- `client.ts`: Client Component용 (읽기 전용)
- `admin.ts`: service_role (RLS 우회, 로그 전용)

## 환경변수
- `.env.local`: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- `functions/.env`: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

## Firestore → Supabase 동기화
Cloud Functions 2nd Gen → `firebase deploy --only functions`

## 상세 규칙
- `.claude/rules/ui-patterns.md` — 디자인 시스템, 헤더/카드/반응형 패턴
- `.claude/rules/architecture.md` — Server/Client 분리, 데이터 페칭, 활동 로그
- `.claude/rules/conventions.md` — 인증, Server Actions, 타입 위치, 빌드
- `.claude/rules/components.md` — 주요 공유 컴포넌트 레퍼런스
- `.claude/rules/db-schema.md` — DB 스키마 상세, 스크립트
