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

## 유틸/타입
- `src/hooks/use-auth.ts`: AuthProvider, useAuth(), useIsAdmin()
- `src/lib/types/order.ts`: Order, ORDER_STATUS_LABEL, ORDER_TYPE_LABEL
- `src/lib/types/blood.ts`: BloodRecord, BLOOD_TYPE_LABEL
- `src/lib/types/price-compare.ts`: Vendor, VendorProduct, UnifiedProduct
- `src/lib/utils/parse-price-excel.ts`: parsePriceExcel() (헤더 자동 감지)

## UI 컴포넌트 (shadcn/ui)
badge, button, card, checkbox, chart, dialog, input, label, popover, select, separator, sheet, spinner, table, tabs

### tabs 특이사항
- 커스텀 슬라이딩 인디케이터 (MutationObserver + rAF throttled)
- `forceMount` + `data-[state=inactive]:hidden` 패턴
