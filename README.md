# 수오더 (soo-order)

의약품 주문 및 검수 관리 PWA 웹 애플리케이션

간호사들이 매일 재고 체크 후 의약품 주문/반품 요청을 하고, 관리자가 발주 및 검수를 관리합니다.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Backend/DB**: Supabase (Auth + PostgreSQL + Storage + Realtime)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Charts**: Recharts
- **PWA**: Serwist
- **Excel**: ExcelJS
- **Package Manager**: pnpm

## 주요 기능

- **주문 관리**: 의약품 주문 신청, 긴급 주문, 사진 첨부
- **발주/검수**: 관리자 일괄 발주, 검수 완료 처리
- **반품 관리**: 반품 신청 및 완료 처리
- **품절 관리**: 품절 처리/복구
- **가격 비교**: 업체별 단가 비교표, 엑셀 업로드/내보내기
- **혈액 대장**: 혈액 수령/출고 기록 관리
- **대시보드**: 주문 현황 및 통계
- **직원 관리**: 계정 생성 및 권한 관리
- **활동 로그**: 전체 활동 이력 추적

## 시작하기

### 환경변수

`.env.local` 파일을 생성하고 다음 변수를 설정합니다:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 개발 서버

```bash
pnpm install
pnpm dev
```

### 프로덕션 빌드

```bash
pnpm build
```

### 배포

```bash
vercel --prod
```

end.
