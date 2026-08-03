---
paths:
  - "src/components/**/*.tsx"
---

# 주요 공유 컴포넌트

## 네비게이션
- `app-sidebar.tsx`: PC 사이드바 (shadow, rounded-xl 아이템)
- `bottom-nav.tsx`: 모바일 5탭 (bg-card/95, backdrop-blur, shadow-nav)

## 주문
- `order-form.tsx`: 생성/수정 공용
- `order-status-badge.tsx`: 상태 뱃지 + `StatusLegend`
- `order-admin-action.tsx`: 관리자 개별 발주
- `vendor-price-popover.tsx`: 업체 드롭다운 + 가격비교 Popover (admin, 모듈레벨 캐시, 가격데이터 없으면 DEFAULT_VENDORS 폴백)
- `item-name-autocomplete.tsx`: 품목명 자동완성
- `photo-picker.tsx` / `photo-gallery.tsx`: 사진 첨부/갤러리

## 검수/반품
- `inspection-list.tsx`: 체크박스 일괄 검수 (다중선택 시 비고만 표시, 확인수량/거래명세서 제거됨)
- `inspection-actions.tsx`: 개별 검수 완료 + 주문 취소 + 검수 수정
- `return-list.tsx`: 체크박스 일괄 반품완료
- `return-request-button.tsx`: 반품 신청 Dialog
- `cancel-inspection-button.tsx`: 검수 취소

## 품절
- `out-of-stock-list.tsx`: 품절 목록 (Realtime 구독)
- `out-of-stock-actions.tsx`: 품절 처리/복구

## 가격비교
- `comparison-table.tsx`: 비교표 + 인라인 편집/추가 + 최저가 하이라이트 + 엑셀 내보내기
- `excel-upload-dialog.tsx`: 드래그앤드롭 업로드 + 덮어쓰기/병합

## 혈액 대장
- `blood-list-page.tsx`: 수령/출고 2탭 (forceMount)
- `blood-form.tsx`: 등록/수정 공용
- `blood-confirm-button.tsx`: 관리자 확인 (결제 방식 Select)

## 인사 — 연차 (`components/leave/`)
- `leave-page.tsx`: 탭(연차종합/연차표/수정요청 + admin 로그·이력). 설정 시트 게이팅(팀관리자=본인팀 주기·잠금만)
- `leave-calendar.tsx`: 팀 달력(주말 구분 없음) + 날짜 시트(등록/수정/삭제/요청). `canManage`로 편집 노출
- `leave-table.tsx`(잔여·사용) · `leave-requests.tsx`(수정요청, 관리자/팀관리자 승인·반려) · `leave-request-form.tsx`(공용 요청 폼) · `leave-settings.tsx`(주기/잠금/유형, restrictTeam) · `leave-logs.tsx` · `leave-history.tsx`(복구)

## 인사 — 근무표 (`components/schedule/`)
- `schedule-page.tsx`: 전체+팀 탭, 일별/달력 뷰, 인쇄. `canEditTab`(본인 직책 탭만 편집)
- `schedule-editor.tsx`(배정·복사) · `schedule-roster.tsx`(명단 포함/제외) · `schedule-print.tsx`(A4 가로 1페이지)
- `src/lib/utils/schedule-compose.ts`: 연차 오버레이 반영해 시프트별·휴무 구성(`composeDay`/`groupByTeam`)

## 명세서 스캔 (`components/invoice-scan/`)
- `invoice-scan-page.tsx`: 단일/묶음 업로드 → (묶음) **grouping 단계**(업체별 카드, 명세서별 페이지 썸네일, 드래그/드롭다운 재지정, 인라인 업체등록, 크게보기) → 미리보기 큐 → 확정

## 유틸/타입
- `src/hooks/use-auth.ts`: AuthProvider, useAuth()(role/team/position/isTeamManager/isManager 포함), useIsAdmin()
- `src/lib/types/order.ts`: Order, ORDER_STATUS_LABEL, ORDER_TYPE_LABEL
- `src/lib/types/blood.ts`: BloodRecord, BLOOD_TYPE_LABEL
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct
- `src/lib/types/leave.ts` · `src/lib/types/schedule.ts` · `src/lib/types/member.ts`(Role/Position) · `src/lib/utils/team.ts`
- `src/lib/utils/parse-price-excel.ts`: parsePriceExcel() (헤더 자동 감지)

## UI 컴포넌트 (shadcn/ui)
badge, button, card, checkbox, chart, dialog, input, label, popover, select, separator, sheet, spinner, table, tabs

### tabs 특이사항
- 커스텀 슬라이딩 인디케이터 (MutationObserver + rAF throttled)
- `forceMount` + `data-[state=inactive]:hidden` 패턴
