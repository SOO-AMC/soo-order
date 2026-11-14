-- =============================================================
-- 약품 이름 → 표준 품목 연결
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   주문의 품목은 글자로만 저장돼서 "메로페넴 주", "메로페넴 주 500mg" 이 서로 다른 품목처럼 기록됩니다.
--   표준 품목(가격 비교표의 품목, unified_products)과의 연결은 "품목 매칭"(item_name_aliases)에 있지만
--   가격 찾기에만 쓰이고, 직원은 표준 품목 목록을 볼 수 없어 계속 제각각 적게 됩니다.
--
-- 무엇을 하나
--   1) item_key() — 품목 이름 비교용 열쇠(소문자 + 공백 제거). 앱의 normalizeItemName() 과 같은 규칙.
--   2) 직원용 표준 품목 검색 — 이름과 구분만 돌려줍니다. **가격은 돌려주지 않습니다.**
--   3) 정리함용 집계 — 주문에 적힌 이름 중 표준 품목과 연결되지 않은 것을 많이 쓰인 순으로.
--   4) 비교표에 안 보이는 가격 품목(업체 품목)을 표준 품목에 연결하는 함수.
--   5) item_name_ignores — 정리함에서 "약품 아님"으로 숨긴 이름 (물티슈·휴지 같은 소모품).
--
-- 이 파일은 **주문을 한 건도 고치지 않습니다.** 연결은 "품목 매칭" 표에 한 줄 더하는 것으로 끝나고,
-- 같은 이름으로 적힌 과거·미래 주문이 모두 그 표준 품목으로 묶입니다. (되돌리려면 그 한 줄을 지우면 됩니다.)
-- =============================================================

-- ── 1. 이름 열쇠 ─────────────────────────────────────────────
-- 앱의 normalizeItemName() (src/lib/utils/normalize-item-name.ts) 과 반드시 같은 규칙:
--   소문자로 바꾸고 모든 공백(전각 공백·줄바꿈 없는 공백 포함)을 뺀다.
create or replace function public.item_key(p text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p, ''), '[\s   -     　﻿]+', '', 'g'));
$$;

-- 주문을 이름 열쇠로 빨리 찾기 위한 색인 (주문 내용은 바뀌지 않습니다)
create index if not exists orders_item_key_idx on public.orders (public.item_key(item_name));

-- LIKE 검색어의 특수문자(% _ \) 를 글자 그대로 찾게 바꾼다
create or replace function public.like_escape(p text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- 로그인한 직원인가 (세미나실 화면 계정 제외)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.role, 'user') <> 'display');
$$;

-- 로그인 사용자인데 관리자가 아니면 막는다. (SQL Editor·서버는 통과)
create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception '관리자만 할 수 있어요' using errcode = '42501';
  end if;
end;
$$;

-- ── 2. 직원용 표준 품목 검색 (가격 없음) ───────────────────────
-- 띄어쓰기를 무시하고 찾는다: "메로페넴 주" 로 "메로페넴주500mg 10V" 를 찾을 수 있다.
create or replace function public.search_standard_products(p_q text, p_limit integer default 25)
returns table (id uuid, name text, notes text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, coalesce(u.notes, '')
  from public.unified_products u
  where public.is_staff()
    and public.item_key(p_q) <> ''
    and public.item_key(u.name) like '%' || public.like_escape(public.item_key(p_q)) || '%'
  order by
    case when public.item_key(u.name) like public.like_escape(public.item_key(p_q)) || '%' then 0 else 1 end,
    length(u.name),
    u.name
  limit least(greatest(coalesce(p_limit, 25), 1), 50);
$$;

-- 적힌 이름에 연결된 표준 품목 (품목 매칭에 있거나, 표준 품목 이름과 띄어쓰기만 다른 경우). 없으면 null.
create or replace function public.standard_product_for(p_name text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', u.id, 'name', u.name, 'notes', coalesce(u.notes, ''))
  from public.unified_products u
  left join public.item_name_aliases a
    on a.unified_product_id = u.id and a.item_name = public.item_key(p_name)
  where public.is_staff()
    and public.item_key(p_name) <> ''
    and (a.id is not null or public.item_key(u.name) = public.item_key(p_name))
  order by (a.id is not null) desc, u.name
  limit 1;
$$;

-- ── 정리함에서 숨긴 이름 ("약품 아님") ────────────────────────
-- 표준 품목으로 만들 필요가 없는 소모품 이름을 정리함 목록에서 뺀다. 주문에는 아무 영향이 없다.
create table if not exists public.item_name_ignores (
  item_key text primary key,                    -- item_key(이름)
  name text not null,                           -- 숨길 때 보이던 글자
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint item_name_ignores_key_not_empty check (item_key <> '')
);

alter table public.item_name_ignores enable row level security;

drop policy if exists "item_name_ignores admin all" on public.item_name_ignores;
create policy "item_name_ignores admin all"
  on public.item_name_ignores for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 3. 정리함: 연결 안 된 주문 이름 ───────────────────────────
-- 주문(type='order')에 적힌 이름을 열쇠로 묶어, 표준 품목과 연결되지 않은 것만 많이 쓰인 순으로 돌려준다.
--   숨긴 이름(item_name_ignores)은 목록에서 빠지고 hidden_names / hidden_orders 로만 센다.
--   name        : 그 열쇠로 가장 최근에 적힌 글자
--   inv_product : 그 주문들이 명세서로 검수될 때 연결된 표준 품목 (있으면 강한 근거)
create or replace function public.order_item_usage(p_limit integer default 300, p_query text default null)
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

  with o as (
    select id, public.item_key(item_name) as k, item_name, created_at
    from public.orders
    where type = 'order' and public.item_key(item_name) <> ''
  ),
  g as (
    select k, count(*) as n, max(created_at) as last_at,
           (array_agg(item_name order by created_at desc))[1] as name
    from o
    group by k
  ),
  uk as (
    select distinct on (public.item_key(name)) public.item_key(name) as k, id
    from public.unified_products
    order by public.item_key(name), sort_order
  ),
  l as (
    select g.*, coalesce(a.unified_product_id, uk.id) as product_id
    from g
    left join public.item_name_aliases a on a.item_name = g.k
    left join uk on uk.k = g.k
  ),
  ev as (
    select o.k, count(*) as inv_n, mode() within group (order by it.unified_product_id) as inv_product_id
    from o
    join public.invoice_items it on it.matched_order_id = o.id
    where it.unified_product_id is not null
    group by o.k
  ),
  -- 연결도 안 됐고 숨기지도 않은 이름
  open_names as (
    select l.*
    from l
    where l.product_id is null
      and not exists (select 1 from public.item_name_ignores ig where ig.item_key = l.k)
  ),
  u as (
    select l.k, l.name, l.n, l.last_at, coalesce(ev.inv_n, 0) as inv_n, ev.inv_product_id
    from open_names l
    left join ev on ev.k = l.k
    where (coalesce(btrim(p_query), '') = '' or l.k like '%' || public.like_escape(public.item_key(p_query)) || '%')
  )
  select jsonb_build_object(
    'total_names', (select count(*) from l),
    'total_orders', (select coalesce(sum(n), 0) from l),
    'linked_names', (select count(*) from l where product_id is not null),
    'linked_orders', (select coalesce(sum(n), 0) from l where product_id is not null),
    'unlinked_names', (select count(*) from u),
    'unlinked_orders', (select coalesce(sum(n), 0) from u),
    'hidden_names', (select count(*) from l where product_id is null) - (select count(*) from open_names),
    'hidden_orders', (select coalesce(sum(n), 0) from l where product_id is null) - (select coalesce(sum(n), 0) from open_names),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', t.k, 'name', t.name, 'n', t.n, 'last_at', t.last_at,
               'inv_n', t.inv_n, 'inv_product_id', t.inv_product_id) order by t.n desc, t.k)
      from (select * from u order by n desc, k limit least(greatest(coalesce(p_limit, 300), 1), 1000)) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ── 4. 비교표에 안 보이는 업체 품목 → 표준 품목 ────────────────
-- 명세서로 새로 들어온 업체 품목(vendor_products.unified_product_id 가 비어 있음)을 표준 품목에 연결한다.
--   같은 업체가 그 표준 품목의 가격을 이미 갖고 있으면 바로 고치지 않고 'conflict' 를 돌려준다.
--     p_mode = 'replace' → 이 품목의 가격으로 바꾸고 이 줄은 지운다
--     p_mode = 'keep'    → 기존 가격을 두고 이 줄은 지운다
--   같은 이름의 명세서 줄(그 업체 것, 아직 연결 안 된 것)도 함께 그 표준 품목으로 연결한다 → 단가 추이가 이어진다.
create or replace function public.link_vendor_product(p_vp_id uuid, p_unified_id uuid, p_mode text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  vp record;
  ex record;
  n_lines integer;
begin
  perform public.assert_admin();

  select id, vendor_id, product_name, unit_price, unified_product_id into vp
  from public.vendor_products where id = p_vp_id;
  if not found then
    raise exception '품목을 찾을 수 없어요';
  end if;
  if vp.unified_product_id is not null then
    raise exception '이미 표준 품목에 연결된 품목이에요';
  end if;
  if not exists (select 1 from public.unified_products where id = p_unified_id) then
    raise exception '표준 품목을 찾을 수 없어요';
  end if;

  select id, unit_price into ex
  from public.vendor_products
  where vendor_id = vp.vendor_id and unified_product_id = p_unified_id
  order by id
  limit 1;

  if found then
    if p_mode is null or p_mode not in ('replace', 'keep') then
      return jsonb_build_object('status', 'conflict', 'existing_price', ex.unit_price, 'new_price', vp.unit_price);
    end if;
    if p_mode = 'replace' then
      update public.vendor_products set unit_price = vp.unit_price where id = ex.id;
    end if;
    delete from public.vendor_products where id = p_vp_id;
  else
    update public.vendor_products set unified_product_id = p_unified_id where id = p_vp_id;
  end if;

  update public.invoice_items it
     set unified_product_id = p_unified_id
    from public.invoices i
   where i.id = it.invoice_id
     and i.vendor_id = vp.vendor_id
     and it.unified_product_id is null
     and public.item_key(it.item_name) = public.item_key(vp.product_name);
  get diagnostics n_lines = row_count;

  return jsonb_build_object('status', 'linked', 'invoice_lines', n_lines);
end;
$$;

grant execute on function public.item_key(text) to authenticated;
grant execute on function public.search_standard_products(text, integer) to authenticated;
grant execute on function public.standard_product_for(text) to authenticated;
grant execute on function public.order_item_usage(integer, text) to authenticated;
grant execute on function public.link_vendor_product(uuid, uuid, text) to authenticated;

-- ── 확인 ─────────────────────────────────────────────────────
select
  (select count(*) from public.unified_products) as "표준 품목",
  (select count(*) from public.item_name_aliases) as "품목 매칭",
  (public.order_item_usage(1) ->> 'total_names')::int as "주문에 적힌 이름 가짓수",
  (public.order_item_usage(1) ->> 'linked_names')::int as "그중 연결된 이름",
  (public.order_item_usage(1) ->> 'unlinked_orders')::int as "연결 안 된 주문 수",
  (select count(*) from public.item_name_ignores) as "숨긴 이름",
  (select count(*) from public.vendor_products where unified_product_id is null) as "비교표에 없는 업체 품목";
