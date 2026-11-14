-- 속도 개선용 인덱스 (여러 번 실행해도 안전)
--
-- 관리자 대시보드의 "검수 이력"(최근 130일에 검수한 주문) 조회가 주문 표 전체를 흩어 읽느라
-- 제한 시간(8초)에 걸려 취소되고, 그동안 다른 조회까지 느려졌다.
-- 검수일 순 인덱스를 두면 해당 기간의 줄만 바로 읽는다.
create index if not exists orders_inspected_at_idx
  on public.orders (inspected_at, id)
  where inspected_at is not null;

-- 확인: 만들어진 인덱스 수 (1 이면 정상)
select count(*) as "만들어진 인덱스"
from pg_indexes
where schemaname = 'public' and indexname = 'orders_inspected_at_idx';
