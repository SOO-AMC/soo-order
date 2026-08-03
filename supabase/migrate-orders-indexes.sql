-- orders(10,770행) 풀스캔 제거용 인덱스.
-- 측정: pg_stat_user_tables에서 orders seq_scan≈15,900 (활성 행은 ~76건뿐).
-- 테이블이 작아 일반 CREATE INDEX도 1초 미만 락 → CONCURRENTLY 불필요.
-- Supabase SQL Editor에서 실행. IF NOT EXISTS라 재실행 안전.
--
-- ⚠️ 먼저 기존 인덱스를 확인해 중복 생성을 피할 것:
--   select indexname, indexdef from pg_indexes
--   where schemaname='public' and tablename='orders';

-- 부분일치 ILIKE 검색 인덱스(gin_trgm)용 확장
create extension if not exists pg_trgm;

-- 1) 리스트·카운트·검수·반품·품절: status 필터 + created_at 정렬
--    (order-list eq pending / inspection eq ordered / returns in / out-of-stock eq
--     / tab-counts in(...) / 조회탭 status 필터)
create index if not exists idx_orders_status_created
  on orders (status, created_at desc);

-- 2) 조회탭 무필터 정렬 + 요청일 범위
create index if not exists idx_orders_created_at
  on orders (created_at desc);

-- 3) 조회탭 텍스트 검색: item_name / vendor_name ILIKE '%...%'
create index if not exists idx_orders_item_name_trgm
  on orders using gin (item_name gin_trgm_ops);
create index if not exists idx_orders_vendor_name_trgm
  on orders using gin (vendor_name gin_trgm_ops);

-- 4) 요청자별 조회/필터 (FK는 자동 인덱스 안 됨) — 전체검색 recentOrder, 조회탭 요청자 필터
create index if not exists idx_orders_requester_id
  on orders (requester_id);
