# 코드 컨벤션

## 인증/권한
- 이름 + 비밀번호 로그인 (`nameToEmail()`: 이름 → base64url `@soo-order.internal`)
- Role: `admin` / `user` (profiles.role)
- RLS + `is_admin()` SQL 헬퍼
- `useAuth()` 훅으로 `userId`, `userName`, `isAdmin` 접근

## Server Actions (`src/lib/actions/`)
- admin mutation: `requireAdmin()` 필수
- "use server" 파일에서는 async function만 export → 타입/상수는 별도 파일로 분리

## 활동 로그
- `logActivity()` (서버): admin client로 INSERT (fire-and-forget)
- `logClientAction()`: Client Component용 Server Action
- 카테고리: auth, order, dispatch, inspection, return, account, price, blood

## 주요 타입 위치
- `src/lib/types/order.ts`: Order, OrderWithRequester, ORDER_STATUS_LABEL
- `src/lib/types/blood.ts`: BloodRecord, BLOOD_TYPE_LABEL, BLOOD_STATUS_LABEL
- `src/lib/types/member.ts`: Position, POSITION_LABEL
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct

## 빌드
- `pnpm dev` (Turbopack), `pnpm build` (webpack — Serwist가 webpack 필요)
