-- =============================================================
-- 업체 이름 통일
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   발주할 때 업체 이름을 손으로 적어서 " vs팜", "(주)한미", "(주) 한미" 처럼 같은 업체가
--   여러 이름으로 기록돼 있습니다. 명세서로 만들어진 주문에는 명세서에 찍힌 글자가 그대로 들어갑니다.
--
-- 무엇을 하나
--   1) vendor_aliases — 업체의 "다른 이름" 목록 (예: 브이에스팜(주) → vs팜)
--   2) orders.vendor_name_raw — 이름을 표준 이름으로 고칠 때 원래 적혀 있던 글자를 보관
--   3) 주문에 업체 이름이 들어올 때마다 표준 이름으로 맞추는 장치(trigger)
--      · 등록된 업체 이름과 정확히 같으면 그대로
--      · "다른 이름"으로 등록돼 있으면 그 업체의 표준 이름으로
--      · (주)·띄어쓰기·대소문자만 다르면 그 업체의 표준 이름으로 (후보가 하나일 때만)
--      · 어디에도 안 맞으면 적힌 그대로 둠 → 업체 관리 화면의 "정리할 이름"에 나타남
--   4) 업체 관리 화면이 쓰는 함수들 (관리자만 실행 가능)
--
-- 이 파일은 **기존 주문을 한 건도 고치지 않습니다.** 기존 기록 정리는 업체 관리 화면에서
-- 관리자가 버튼을 누를 때만 일어나고, 그때도 주문의 "수정 시각"은 바뀌지 않습니다.
-- =============================================================

-- ── 1. 다른 이름 목록 ─────────────────────────────────────────

-- 이름 비교용 열쇠: (주)·주식회사 등과 띄어쓰기·기호·대소문자를 뺀 글자
--   "(주) 한미" = "㈜한미" = "주식회사 한미" → "한미"
-- 앱의 vendorKey() (src/lib/utils/vendor-name.ts) 와 반드시 같은 규칙이어야 합니다.
create or replace function public.vendor_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             lower(normalize(coalesce(p, ''), NFKC)),
             '\(주\)|주식회사|\(유\)|유한회사|\(사\)|\(재\)', '', 'g'),
           '[^0-9a-z가-힣]', '', 'g');
$$;

create table if not exists public.vendor_aliases (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  alias text not null,
  alias_key text generated always as (public.vendor_key(alias)) stored,
  created_at timestamptz not null default now(),
  constraint vendor_aliases_key_unique unique (alias_key),
  constraint vendor_aliases_key_not_empty check (alias_key <> '')
);

create index if not exists vendor_aliases_vendor_idx on public.vendor_aliases (vendor_id);

alter table public.vendor_aliases enable row level security;

drop policy if exists "vendor_aliases admin all" on public.vendor_aliases;
create policy "vendor_aliases admin all"
  on public.vendor_aliases for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2. 원래 적혀 있던 이름 보관 ───────────────────────────────

alter table public.orders add column if not exists vendor_name_raw text;

-- ── 3. 이름 → 표준 이름 ──────────────────────────────────────

-- 적힌 이름에 해당하는 업체의 표준 이름. 못 찾으면 null.
create or replace function public.canonical_vendor_name(p text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text := public.vendor_key(p);
  r text;
  c integer;
begin
  if k = '' then
    return null;
  end if;

  -- 1) 등록된 업체 이름과 정확히 같다
  select name into r from public.vendors where name = p limit 1;
  if found then
    return r;
  end if;

  -- 2) "다른 이름"으로 등록돼 있다
  select v.name into r
  from public.vendor_aliases a
  join public.vendors v on v.id = a.vendor_id
  where a.alias_key = k
  limit 1;
  if found then
    return r;
  end if;

  -- 3) (주)·띄어쓰기만 다르다 — 그런 업체가 딱 하나일 때만
  select min(name), count(*) into r, c from public.vendors where public.vendor_key(name) = k;
  if c = 1 then
    return r;
  end if;

  return null;
end;
$$;

-- 주문에 업체 이름이 들어오거나 바뀔 때 표준 이름으로 맞춘다
create or replace function public.orders_canonical_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if tg_op = 'UPDATE' and new.vendor_name is not distinct from old.vendor_name then
    return new;
  end if;
  if coalesce(btrim(new.vendor_name), '') = '' then
    return new;
  end if;

  v_name := public.canonical_vendor_name(new.vendor_name);
  if v_name is not null and v_name <> new.vendor_name then
    new.vendor_name_raw := new.vendor_name;
    new.vendor_name := v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_canonical_vendor on public.orders;
create trigger orders_canonical_vendor
  before insert or update of vendor_name on public.orders
  for each row
  execute function public.orders_canonical_vendor();

-- ── 4. 정리 작업 때 "수정 시각"을 건드리지 않기 ──────────────
-- 조회 화면의 "발주 날짜" 검색과 "수정됨" 표시가 updated_at 을 씁니다.
-- 이름 정리로 수백 건의 수정 시각이 오늘로 바뀌면 안 되므로,
-- 아래 정리 함수들이 켜는 표시(soo.keep_updated_at)가 있을 때만 수정 시각을 그대로 둡니다.
-- 그 밖의 모든 수정은 전과 똑같이 수정 시각이 갱신됩니다.
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('soo.keep_updated_at', true), '') = '1' then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- ── 5. 업체 관리 화면용 함수 (관리자만) ───────────────────────

-- 로그인 사용자인데 관리자가 아니면 막는다. (SQL Editor·서버는 통과)
create or replace function public.assert_vendor_admin()
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

-- 주문에 적힌 업체 이름별 건수 + (명세서로 확인된 업체가 있으면) 그 업체
create or replace function public.order_vendor_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.assert_vendor_admin();

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t.vendor_name,
           'n', t.n,
           'last_at', t.last_at,
           'inv_n', t.inv_n,
           'inv_vendor_id', t.inv_vendor_id) order by t.n desc), '[]'::jsonb)
  into result
  from (
    select o.vendor_name,
           count(*) as n,
           max(o.created_at) as last_at,
           count(m.vendor_id) as inv_n,
           mode() within group (order by m.vendor_id) as inv_vendor_id
    from public.orders o
    left join lateral (
      select i.vendor_id
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      where it.matched_order_id = o.id and i.vendor_id is not null
      order by i.created_at desc
      limit 1
    ) m on true
    where coalesce(btrim(o.vendor_name), '') <> ''
    group by o.vendor_name
  ) t;

  return result;
end;
$$;

-- 주문에 p_from 이라고 적힌 것을 전부 p_to 로 고친다. 원래 글자는 vendor_name_raw 에 남긴다.
-- p_to 가 빈 글자면 "업체 없음"으로 정리한다. 고친 건수를 돌려준다.
create or replace function public.rewrite_order_vendor_name(p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform public.assert_vendor_admin();
  if coalesce(p_from, '') = '' or p_from = coalesce(p_to, '') then
    return 0;
  end if;

  perform set_config('soo.keep_updated_at', '1', true);
  update public.orders
     set vendor_name_raw = coalesce(vendor_name_raw, vendor_name),
         vendor_name = coalesce(p_to, '')
   where vendor_name = p_from;
  get diagnostics n = row_count;
  perform set_config('soo.keep_updated_at', '', true);
  return n;
end;
$$;

-- 주문에 p_name 이라고 적힌 것 중 명세서와 연결된 주문을, 그 명세서의 업체 이름으로 고친다.
-- (명세서로 만들어진 주문에 명세서에 찍힌 글자가 들어가 있는 경우를 정확히 바로잡는다)
create or replace function public.link_orders_by_invoice(p_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  perform public.assert_vendor_admin();
  if coalesce(p_name, '') = '' then
    return 0;
  end if;

  perform set_config('soo.keep_updated_at', '1', true);
  update public.orders o
     set vendor_name_raw = coalesce(o.vendor_name_raw, o.vendor_name),
         vendor_name = s.vendor_name
    from (
      select distinct on (it.matched_order_id) it.matched_order_id as order_id, v.name as vendor_name
      from public.invoice_items it
      join public.invoices i on i.id = it.invoice_id
      join public.vendors v on v.id = i.vendor_id
      where it.matched_order_id is not null
      order by it.matched_order_id, i.created_at desc
    ) s
   where o.id = s.order_id
     and o.vendor_name = p_name
     and s.vendor_name <> o.vendor_name;
  get diagnostics n = row_count;
  perform set_config('soo.keep_updated_at', '', true);
  return n;
end;
$$;

-- 업체 이름 바꾸기: 그 업체로 적힌 주문도 함께 새 이름으로, 옛 이름은 "다른 이름"으로 남긴다.
create or replace function public.rename_vendor(p_id uuid, p_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
  n integer;
begin
  perform public.assert_vendor_admin();
  if v_new = '' then
    raise exception '업체 이름을 적어 주세요';
  end if;
  select name into v_old from public.vendors where id = p_id;
  if not found then
    raise exception '업체를 찾을 수 없어요';
  end if;
  if v_old = v_new then
    return 0;
  end if;
  if exists (select 1 from public.vendors where name = v_new and id <> p_id) then
    raise exception '같은 이름의 업체가 이미 있어요';
  end if;

  update public.vendors set name = v_new where id = p_id;

  -- 옛 이름을 다른 이름으로 (새 이름과 열쇠가 같으면 필요 없음)
  if public.vendor_key(v_old) <> '' and public.vendor_key(v_old) <> public.vendor_key(v_new) then
    insert into public.vendor_aliases (vendor_id, alias) values (p_id, v_old)
    on conflict (alias_key) do nothing;
  end if;
  -- 새 이름과 같은 열쇠의 다른 이름은 이제 필요 없다
  delete from public.vendor_aliases where vendor_id = p_id and alias_key = public.vendor_key(v_new);

  perform set_config('soo.keep_updated_at', '1', true);
  update public.orders set vendor_name = v_new where vendor_name = v_old;
  get diagnostics n = row_count;
  perform set_config('soo.keep_updated_at', '', true);
  return n;
end;
$$;

-- 업체 합치기: p_from 을 p_into 에 합치고 p_from 은 지운다.
--   주문·명세서·다른 이름은 p_into 로 옮기고, p_from 의 이름은 p_into 의 다른 이름이 된다.
--   가격표 품목은 p_into 에 같은 품목이 없을 때만 옮긴다(있으면 p_into 쪽을 남긴다).
create or replace function public.merge_vendors(p_from uuid, p_into uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
  v_into text;
  n_orders integer;
  n_invoices integer;
  n_products integer;
begin
  perform public.assert_vendor_admin();
  if p_from = p_into then
    raise exception '같은 업체끼리는 합칠 수 없어요';
  end if;
  select name into v_from from public.vendors where id = p_from;
  if not found then
    raise exception '합칠 업체를 찾을 수 없어요';
  end if;
  select name into v_into from public.vendors where id = p_into;
  if not found then
    raise exception '남길 업체를 찾을 수 없어요';
  end if;

  perform set_config('soo.keep_updated_at', '1', true);
  update public.orders
     set vendor_name_raw = coalesce(vendor_name_raw, vendor_name),
         vendor_name = v_into
   where vendor_name = v_from;
  get diagnostics n_orders = row_count;
  perform set_config('soo.keep_updated_at', '', true);

  update public.invoices set vendor_id = p_into where vendor_id = p_from;
  get diagnostics n_invoices = row_count;

  -- 가격표: 같은 품목이 남길 업체에 이미 있으면 버리고, 없으면 옮긴다
  delete from public.vendor_products s
   where s.vendor_id = p_from
     and exists (
       select 1 from public.vendor_products t
        where t.vendor_id = p_into
          and (t.product_name = s.product_name
               or (s.unified_product_id is not null and t.unified_product_id = s.unified_product_id)));
  update public.vendor_products set vendor_id = p_into where vendor_id = p_from;
  get diagnostics n_products = row_count;

  update public.vendor_aliases set vendor_id = p_into where vendor_id = p_from;
  if public.vendor_key(v_from) <> '' and public.vendor_key(v_from) <> public.vendor_key(v_into) then
    insert into public.vendor_aliases (vendor_id, alias) values (p_into, v_from)
    on conflict (alias_key) do nothing;
  end if;

  delete from public.vendors where id = p_from;

  return jsonb_build_object('orders', n_orders, 'invoices', n_invoices, 'products', n_products, 'from', v_from, 'into', v_into);
end;
$$;

grant execute on function public.vendor_key(text) to authenticated;
grant execute on function public.canonical_vendor_name(text) to authenticated;
grant execute on function public.order_vendor_usage() to authenticated;
grant execute on function public.rewrite_order_vendor_name(text, text) to authenticated;
grant execute on function public.link_orders_by_invoice(text) to authenticated;
grant execute on function public.rename_vendor(uuid, text) to authenticated;
grant execute on function public.merge_vendors(uuid, uuid) to authenticated;

-- ── 확인 ─────────────────────────────────────────────────────
-- 주문에 적힌 업체 이름 중 등록된 업체 이름과 다른 것이 몇 가지인지 (정리할 이름 수)
select
  (select count(*) from public.vendors) as "등록된 업체",
  (select count(distinct o.vendor_name) from public.orders o
    where coalesce(btrim(o.vendor_name), '') <> ''
      and not exists (select 1 from public.vendors v where v.name = o.vendor_name)) as "정리할 이름 가짓수",
  (select count(*) from public.orders o
    where coalesce(btrim(o.vendor_name), '') <> ''
      and not exists (select 1 from public.vendors v where v.name = o.vendor_name)) as "그 이름이 적힌 주문 수";
