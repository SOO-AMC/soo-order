# UI 패턴 규칙

## 디자인 시스템
- Primary: `#2563EB`, Sub: `#1D4ED8`
- 배경: `oklch(0.965 0.003 260)` (연한 블루그레이, 흰색 아님)
- 카드: `bg-card` (흰색) + `shadow-card` (border 제거)
- radius: `0.75rem`

## 헤더 패턴
모든 페이지 sticky 헤더:
```
"sticky top-0 z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header"
```

## 카드 패턴
- 모바일 리스트: `"rounded-xl bg-card p-4 shadow-card"` (border 없음)
- 상세 래핑: `"p-4" > "space-y-6 rounded-2xl bg-card p-5 shadow-card"`
- 폼 래핑: `"rounded-2xl bg-card p-5 shadow-card"`

## 반응형
- 모바일(<md): BottomNav + max-w-md, 카드 리스트
- 태블릿(md~lg): BottomNav + max-w-2xl
- PC(lg+): 좌측 사이드바(240px), 테이블 뷰
  - `hidden lg:block` / `lg:hidden` 패턴
  - 리스트: `lg:max-w-6xl`, 상세: `lg:max-w-4xl`, 폼: `lg:max-w-2xl`

## 상태 라벨
`ORDER_STATUS_LABEL` (`src/lib/types/order.ts`) 상수 사용. 인라인 중복 정의 금지.
