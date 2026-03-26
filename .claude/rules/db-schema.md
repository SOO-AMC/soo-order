---
paths:
  - "scripts/**"
  - "supabase/**"
  - "src/lib/supabase/**"
---

# DB 스키마

## profiles
id, email, full_name, role(admin/user), pharmacy_name, position(manager/technician/veterinarian/admin_staff), is_active, created_at, updated_at

## orders
id, type(order/return), item_name, quantity, unit, status, requester_id, updated_by, vendor_name, confirmed_quantity, invoice_received, inspected_by, inspected_at, photo_urls(text[]), is_urgent, return_quantity, return_reason, return_requested_by, return_requested_at, firebase_id(UNIQUE), notes, order_notes, inspection_notes, created_at, updated_at

**상태 흐름**: pending → ordered → inspecting → return_requested → return_completed (+ out_of_stock)

## vendors
id, name(UNIQUE), created_at, updated_at

## vendor_products
id, vendor_id(FK→vendors), product_name, manufacturer, spec, unit_price, ingredient, category, unified_product_id(FK→unified_products), created_at

## unified_products
id, name, mg, tab, quantity, notes, remarks, sort_order, created_at, updated_at

## blood_records
id, type(received/sent), record_date, hospital_name, animal_type(dog/cat), blood_type, volume_ml, collection_date, receiver, shipper, status(pending/confirmed), settlement_type(invoice/transfer/confirm_only), confirmed_by, confirmed_at, created_by, created_at, updated_at, notes

## activity_logs
id, user_id, user_name, category, action, description, metadata(JSONB), created_at

## 마이그레이션 스크립트
- `scripts/migrate-price-compare.sql`: vendors, unified_products, vendor_products
- `scripts/migrate-activity-logs.sql`: activity_logs
- `scripts/migrate-blood-records.sql`: blood_records
- `scripts/migrate-position.sql`: profiles.position 추가
- `scripts/migrate-drop-quantity.sql`: quantity 컬럼 변경
- `scripts/migrate-inspection-memo.sql`: inspection_notes 추가
- `scripts/migrate-return-photos.sql`: 반품 사진 지원
- `scripts/activity-logs-auto-cleanup.sql`: pg_cron 30일 자동 정리
- `scripts/dashboard-rpc.sql`: get_dashboard_stats() RPC
