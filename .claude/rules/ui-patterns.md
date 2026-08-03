# UI 패턴 규칙

## 디자인 시스템
- Primary: `#2563EB`, Sub: `#1D4ED8`
- 배경: `oklch(0.965 0.003 260)` (연한 블루그레이, 흰색 아님)
- 카드: `bg-card` (흰색) + `shadow-card` (border 제거)
- radius: `0.75rem`

## 헤더 패턴
모든 페이지 sticky 헤더 — **`top-0` 아님, `top-[var(--page-top)]`** (전체검색 상단바 높이만큼 내려서 안 겹치게):
```
"sticky top-[var(--page-top)] z-40 flex items-center gap-2 bg-background/95 backdrop-blur-sm px-4 py-3 shadow-header"
```
`--page-top`은 (main) 레이아웃의 `<main>`에서 3rem(전체검색 상단바 높이)로 설정. 새 페이지 헤더도 반드시 이 패턴 사용.

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

## 인사 달력 / 탭 패턴
- **365일 연중무휴 병원** → 달력(연차·근무표)에 **주말(토·일) 색 구분·음영 없음**. 모든 요일 동일하게. (재도입 금지)
- **팀 탭/스위처**: 가로 스크롤 pill — `flex gap-1.5 overflow-x-auto` + `rounded-full px-3 py-1 text-xs font-semibold`, 선택 시 `bg-primary text-primary-foreground` / 비선택 `bg-muted text-muted-foreground`.
- **세그먼트 토글**(일별/달력, 대기/전체 등): `flex rounded-lg bg-muted p-0.5` 안에 `rounded-md px-3 py-1 text-xs font-semibold`, 선택 `bg-card text-foreground shadow-sm`.
- **권한 게이팅**: 편집/설정 버튼은 `isAdmin`/`isManager`/`canManage`(연차)·`canEditTab`(근무표, 본인 직책 탭) 로 노출 제어.
