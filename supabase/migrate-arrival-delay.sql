-- =============================================================
-- 입고 지연 자동 알림 — 보낸 기록
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 무엇을 하나
--   order_delay_notices 표 하나를 만듭니다. "이 주문에 며칠째 알림을 이미 보냈다"를 적어 두는 곳입니다.
--   같은 주문에 같은 알림이 두 번 가지 않게 하는 용도이고(주문 + 며칠째 가 열쇠),
--   주문(orders) 자체는 건드리지 않습니다.
--
-- 이 표는 서버의 예약 실행만 읽고 씁니다. 직원·관리자 화면에서는 보이지 않습니다(정책 없음 = 접근 불가).
-- 이 파일을 실행해도 알림이 바로 나가지는 않습니다. 배포할 때 예약 실행을 등록하고
-- ARRIVAL_DELAY_NOTIFY=on 을 설정해야 실제로 보냅니다.
-- =============================================================

create table if not exists public.order_delay_notices (
  order_id uuid not null references public.orders(id) on delete cascade,
  milestone integer not null,                 -- 발주 뒤 며칠째 알림인지 (7, 14, 21 …)
  sent_at timestamptz not null default now(),
  primary key (order_id, milestone),
  constraint order_delay_notices_milestone_positive check (milestone > 0)
);

alter table public.order_delay_notices enable row level security;

-- 확인: 1 이 나오면 만들어진 것입니다.
select count(*) as "만들어진 표" from information_schema.tables where table_schema = 'public' and table_name = 'order_delay_notices';
