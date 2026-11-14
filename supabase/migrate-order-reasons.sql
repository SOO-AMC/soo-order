-- =============================================================
-- 주문자에게 이유 알리기 — 품절 사유 · 관리자가 바꾼 이유
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   · 품절 처리할 때 적은 사유가 "발주 비고" 칸(order_notes)에 덮어써져서 원래 발주 비고가 사라지고,
--     여러 건을 한꺼번에 품절 처리하면 사유를 적을 곳이 없습니다.
--   · 관리자가 수량이나 품목을 바꿔도 주문자는 왜 바뀌었는지 알 수 없습니다.
--
-- 무엇을 하나 — orders 에 칸 6개를 더합니다. 기존 주문 내용은 바꾸지 않습니다.
--   out_of_stock_reason   품절 사유
--   out_of_stock_at       품절 처리한 때
--   out_of_stock_ack_at   주문자가 "확인했어요"를 누른 때 (내 주문 현황의 "확인이 필요해요"에서 빠짐)
--   admin_change_summary  관리자가 마지막으로 바꾼 내용 (예: "수량: 3 박스 → 2 박스")
--   admin_change_reason   그 이유
--   admin_change_at       바꾼 때
--
-- 예전에 품절 처리한 주문은 사유가 발주 비고 칸에 들어 있습니다. 옮기지 않고 그대로 두며,
-- 화면은 새 칸이 비어 있으면 예전처럼 발주 비고를 보여 줍니다.
-- =============================================================

alter table public.orders add column if not exists out_of_stock_reason text;
alter table public.orders add column if not exists out_of_stock_at timestamptz;
alter table public.orders add column if not exists out_of_stock_ack_at timestamptz;
alter table public.orders add column if not exists admin_change_summary text;
alter table public.orders add column if not exists admin_change_reason text;
alter table public.orders add column if not exists admin_change_at timestamptz;

-- 확인: 6 이 나오면 적용된 것입니다.
select count(*) as "더해진 칸 수"
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('out_of_stock_reason', 'out_of_stock_at', 'out_of_stock_ack_at', 'admin_change_summary', 'admin_change_reason', 'admin_change_at');
