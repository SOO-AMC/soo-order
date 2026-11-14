-- =============================================================
-- 약품 한눈에 보기 — 한 품목의 주문 이력과 "그때 단가"
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
-- (먼저 migrate-product-link.sql 이 실행돼 있어야 합니다 — item_key, assert_admin 을 씁니다)
--
-- 무엇을 하나
--   item_order_history(표준 품목 id, 이름) — 그 품목으로 묶이는 주문을 최근 것부터 돌려줍니다.
--     · 표준 품목이 있으면: 품목 매칭(item_name_aliases)에 연결된 모든 이름 + 표준 품목 이름
--     · 표준 품목이 없으면: 넘긴 이름과 띄어쓰기·대소문자만 다른 주문
--   주문이 명세서로 검수됐으면 그 명세서의 단가·날짜를 함께 돌려줍니다 (그때 실제로 산 값).
--
-- 읽기만 합니다. 주문·명세서를 바꾸지 않습니다. 관리자만 실행할 수 있습니다.
-- =============================================================

create or replace function public.item_order_history(p_product_id uuid, p_name text default null, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.assert_admin();

  with keys as (
    select a.item_name as k from public.item_name_aliases a where a.unified_product_id = p_product_id
    union
    select public.item_key(u.name) from public.unified_products u where u.id = p_product_id
    union
    select public.item_key(p_name) where p_product_id is null and public.item_key(p_name) <> ''
  ),
  matched as (
    select o.id, o.item_name, o.quantity, o.unit, o.status, o.vendor_name, o.created_at, o.dispatched_at, o.inspected_at,
           o.confirmed_quantity, pr.full_name as requester,
           inv.unit_price as invoice_unit_price, inv.invoice_date, inv.quantity as invoice_quantity
    from public.orders o
    join keys on keys.k = public.item_key(o.item_name)
    left join public.profiles pr on pr.id = o.requester_id
    left join lateral (
      select it.unit_price, it.quantity, i.invoice_date
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      where it.matched_order_id = o.id
      order by i.invoice_date desc nulls last, i.created_at desc
      limit 1
    ) inv on true
    where o.type = 'order'
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'total_quantity', (select coalesce(sum(quantity), 0) from matched),
    'first_at', (select min(created_at) from matched),
    'last_at', (select max(created_at) from matched),
    'names', coalesce((select jsonb_agg(t) from (
      select item_name as name, count(*) as n from matched group by item_name order by count(*) desc, item_name limit 30) t), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select * from matched order by created_at desc limit least(greatest(coalesce(p_limit, 500), 1), 2000)) t), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.item_order_history(uuid, text, integer) to authenticated;

-- 확인: 함수가 만들어졌으면 1 이 나옵니다.
select count(*) as "만들어진 함수" from pg_proc where proname = 'item_order_history';
