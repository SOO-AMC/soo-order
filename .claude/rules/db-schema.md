---
paths:
  - "scripts/**"
  - "supabase/**"
  - "src/lib/supabase/**"
---

# DB 스키마

## profiles
id, email, full_name, role(`admin`/`team_manager`/`user`), pharmacy_name, position(`manager`/`technician`/`veterinarian`/`intern_vet`/`radiologist`/`admin_staff`), is_active, `schedule_exclude`(근무표 제외), created_at, updated_at
- role/position CHECK 제약은 제거됨(자유 텍스트, 앱이 값 관리). 팀 = positionToTeam(position).

## orders
id, type(order/return), item_name, quantity, unit, status, requester_id, updated_by, vendor_name, confirmed_quantity, invoice_received, inspected_by, inspected_at, photo_urls(text[]), is_urgent, return_quantity, return_reason, return_requested_by, return_requested_at, notes, order_notes, inspection_notes, created_at, updated_at

**상태 흐름**: pending → ordered → inspecting → return_requested → return_completed (+ out_of_stock)

## vendors
id, name(UNIQUE), **discount_rate**(DECIMAL 5,2 DEFAULT 0 — 업체 할인율 %), **show_in_compare**(가격비교 탭 노출 여부; 명세서로 자동등록된 신규 업체는 false), created_at, updated_at

## vendor_products
id, vendor_id(FK→vendors), product_name, manufacturer, spec, unit_price, ingredient, category, unified_product_id(FK→unified_products), created_at

## unified_products
id, name, mg, tab, quantity, notes, remarks, sort_order, created_at, updated_at

## blood_records
id, type(received/sent), record_date, hospital_name, animal_type(dog/cat), blood_type, volume_ml, collection_date, receiver, shipper, status(pending/confirmed), settlement_type(invoice/transfer/confirm_only), confirmed_by, confirmed_at, created_by, created_at, updated_at, notes

## activity_logs
id, user_id, user_name, category(auth/order/dispatch/inspection/return/account/price/blood/leave), action, description, metadata(JSONB), created_at

## 인사 — 연차
- `leave_types`: name, deducts_balance, sort_order, is_active (시드: 연차/병가/경조사/유급휴가)
- `leave_cycles`: year_month + **team**별 신청주기 override (UNIQUE year_month,team)
- `leave_entries`: user_id, team, leave_date, leave_type_id, day_portion(full/am/pm), note, `balance_id`(차감 주기 명시=선사용, NULL이면 날짜 기준) → 변경 시 트리거가 `leave_entry_history`에 자동 기록(복구용). UNIQUE(user_id, leave_date, day_portion)
- `leave_balances`: **주기별 다행**. user_id, total_days(기본 부여), period_start/end, status(active/scheduled/closed — active는 사람당 1개 강제), confirmed(false=롤오버 자동생성 미확정), closed_at
- `leave_grants`: balance_id, user_id, days(0.5단위·음수 허용), reason(필수), granted_date — 특별연차. **삭제 불가**(RLS에 DELETE 정책 없음), 취소는 음수 부여로
- `leave_grid_snapshots`: kind(monthly/cycle_end/manual), snapshot_date, team, user_id, period_start/end, data(JSONB = LeaveGridColumn[] 자기완결) — 연차표 버전
- `leave_locks`: team(PK), submit_mode(auto/open/locked)
- `leave_requests`: requester_id, team, request_type(add/modify/delete), target_entry_id, status, admin_note … (마감 후 변경요청 워크플로)
- RLS 헬퍼: `my_team()`, `is_team_manager()`, `my_position()`, `user_position()`

## 인사 — 근무표
- `work_shifts`: name, start_time, sort_order (시드: 오전8:50/오전11:00/야간21:50)
- `schedule_entries`: work_date, user_id(UNIQUE work_date,user_id), shift_id, status(work/off/extra/off_change), surgery_assist, pathology, note

## 거래명세서 (OCR/원장)
- `invoices` / `invoice_items`(list_price·unit_price·matched_order_id·is_new_product), orders에 `received_quantity` 누적

## 마이그레이션 스크립트
- 기존 약품: `scripts/migrate-*.sql`(price-compare/activity-logs/blood-records/position/inspection-memo/return-photos), `scripts/dashboard-rpc.sql`, `scripts/activity-logs-auto-cleanup.sql`
- 인사/권한/OCR: **`supabase/migrate-*.sql`** — annual-leave, leave-cycle-team, leave-intern-team, leave-locks, leave-requests, leave-entry-history, work-schedule, schedule-roster, team-manager, invoice-ocr 등. Storage 버킷: `order-photos`, `invoices`.
- ⚠️ 새 컬럼/테이블은 **Supabase SQL Editor에서 직접 실행**(앱 DDL 불가). 미실행 시 해당 컬럼 참조 액션이 런타임 에러. 정책은 `DROP POLICY IF EXISTS` 가드로 재실행 안전.
