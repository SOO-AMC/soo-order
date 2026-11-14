-- =============================================================
-- 가격표(vendor_products)의 똑같은 중복 줄 정리
-- Supabase SQL Editor 에서 실행하세요. **지우는 작업입니다** — 아래 설명을 먼저 읽어 주세요.
--
-- 무엇을 지우나
--   업체 · 표준 품목 · 단가 · 품목 이름이 **전부 같은** 줄이 여러 개면 가장 먼저 만들어진 한 줄만 남깁니다.
--   가격 비교표·주문 화면에 보이는 값은 달라지지 않습니다(같은 값의 줄만 지우므로).
--
-- 무엇을 지우지 않나
--   · 단가가 서로 다른 줄 — 포장이 다른 품목이 한 표준 품목에 묶인 것일 수 있어 직접 봐야 합니다.
--   · 단가는 같지만 품목 이름이 다른 줄 — 명세서의 품목 이름을 맞추는 데 쓰이므로 남깁니다.
--   · 표준 품목에 연결되지 않은 줄.
--
-- 되돌리기
--   지우기 전에 표 전체를 vendor_products_backup_20261115 로 복사해 둡니다.
--   문제가 있으면 그 표에서 지운 줄을 되살릴 수 있습니다. 확인이 끝나면 그 표는 지워도 됩니다.
--
-- 한 번에(한 묶음으로) 실행되므로 중간에 실패하면 아무것도 바뀌지 않습니다. 여러 번 실행해도 안전합니다.
-- =============================================================

do $$
declare
  n_before integer;
  n_deleted integer;
begin
  select count(*) into n_before from public.vendor_products;

  -- 1) 백업 (이미 있으면 다시 만들지 않는다)
  if to_regclass('public.vendor_products_backup_20261115') is null then
    execute 'create table public.vendor_products_backup_20261115 as select * from public.vendor_products';
    execute 'alter table public.vendor_products_backup_20261115 enable row level security';
  end if;

  -- 2) 똑같은 줄 중 가장 먼저 만들어진 한 줄만 남기고 지운다
  with ranked as (
    select id,
           row_number() over (
             partition by vendor_id, unified_product_id, unit_price, product_name
             order by created_at, id
           ) as rn
    from public.vendor_products
    where unified_product_id is not null
  )
  delete from public.vendor_products vp
  using ranked r
  where vp.id = r.id and r.rn > 1;
  get diagnostics n_deleted = row_count;

  raise notice '가격표 %줄 중 %줄을 지웠습니다. 남은 줄: %', n_before, n_deleted, n_before - n_deleted;
end;
$$;

-- 확인
select
  (select count(*) from public.vendor_products_backup_20261115) as "정리 전 줄 수(백업)",
  (select count(*) from public.vendor_products) as "지금 줄 수",
  (select count(*) from (
     select 1 from public.vendor_products where unified_product_id is not null
     group by vendor_id, unified_product_id having count(*) > 1) t) as "아직 줄이 여러 개인 묶음",
  (select count(*) from (
     select 1 from public.vendor_products where unified_product_id is not null
     group by vendor_id, unified_product_id having count(distinct unit_price) > 1) t) as "그중 단가가 서로 다른 묶음";
