-- =============================================================
-- 명세서 확정을 한 번에 처리하기 + 업체별 품목 이름 기억
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
-- (먼저 migrate-product-link.sql 이 실행돼 있어야 합니다 — item_key, assert_admin 을 씁니다)
--
-- 왜 필요한가
--   명세서 확정은 주문 검수 · 단가 갱신 · 새 품목 등록 · 원장 기록을 차례로 따로 저장했습니다.
--   중간에 하나가 실패하면 "검수는 됐는데 원장에는 없는" 반쪽 상태가 남았습니다.
--
-- 무엇을 하나
--   1) confirm_invoice(내용) — 위 작업을 **한 묶음**으로 처리합니다. 전부 되거나 전부 안 됩니다.
--      · 같은 업체 · 같은 날짜 · 같은 금액의 명세서가 이미 있으면 멈추고 알려 줍니다(두 번 올리기 방지).
--      · 다른 업체로 발주했던 주문에 맞춘 경우, 그 주문의 업체를 실제로 산 업체로 바꾸고 발주 비고에 원래 업체를 남깁니다.
--   2) vendor_item_memory — "이 업체의 명세서에 이 이름으로 찍힌 품목 = 가격표의 이 품목" 기억.
--      한 번 확정하면 다음 명세서부터는 이름을 추측하지 않고 그대로 연결합니다.
--
-- 이 파일을 실행해도 기존 주문·명세서는 바뀌지 않습니다.
-- =============================================================

create table if not exists public.vendor_item_memory (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name_key text not null,                      -- item_key(명세서에 찍힌 품목 이름)
  item_name text not null,                     -- 찍힌 그대로
  vendor_product_id uuid not null references public.vendor_products(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (vendor_id, name_key),
  constraint vendor_item_memory_key_not_empty check (name_key <> '')
);

create index if not exists vendor_item_memory_product_idx on public.vendor_item_memory (vendor_product_id);

alter table public.vendor_item_memory enable row level security;

drop policy if exists "vendor_item_memory admin all" on public.vendor_item_memory;
create policy "vendor_item_memory admin all"
  on public.vendor_item_memory for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 명세서 확정 (한 묶음). 돌려주는 값: { invoice_id, touched: { 주문id: {requester_id, item_name, unit, quantity, received} } }
create or replace function public.confirm_invoice(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_vendor uuid := nullif(p->>'vendor_id', '')::uuid;
  v_order_vendor text := coalesce(p->>'order_vendor_name', '');
  v_date date := nullif(p->>'invoice_date', '')::date;
  v_now timestamptz := now();
  v_total numeric := 0;
  v_invoice uuid;
  v_touched jsonb := '{}'::jsonb;
  r jsonb;
  a jsonb;
  o record;
  b record;
  v_rep uuid;
  v_qty integer;
  v_alloc integer;
  v_allocated integer;
  v_leftover integer;
  v_received integer;
  v_new uuid;
  v_vp uuid;
  v_unit_price numeric;
  v_item text;
begin
  perform public.assert_admin();
  if v_user is null then
    raise exception '로그인이 필요해요';
  end if;
  if jsonb_typeof(p->'rows') <> 'array' or jsonb_array_length(p->'rows') = 0 then
    raise exception '명세서에 품목이 없어요';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_total from jsonb_array_elements(p->'rows') x;

  -- 같은 명세서를 두 번 올리는 것을 막는다
  if not coalesce((p->>'allow_duplicate')::boolean, false)
     and v_vendor is not null and v_date is not null and v_total <> 0
     and exists (select 1 from public.invoices i where i.vendor_id = v_vendor and i.invoice_date = v_date and i.total_amount = v_total) then
    raise exception 'DUPLICATE_INVOICE';
  end if;

  insert into public.invoices (vendor_id, vendor_name, invoice_date, image_urls, page_start, page_end, total_amount, created_by)
  values (
    v_vendor,
    coalesce(p->>'vendor_name', ''),
    v_date,
    case when coalesce(p->>'image_path', '') <> '' then array[p->>'image_path'] else array[]::text[] end,
    nullif(p->>'page_start', '')::integer,
    nullif(p->>'page_end', '')::integer,
    v_total,
    v_user
  )
  returning id into v_invoice;

  for r in select * from jsonb_array_elements(p->'rows') loop
    v_rep := null;
    v_allocated := 0;
    v_item := coalesce(r->>'item_name', '');
    v_qty := round((r->>'quantity')::numeric)::integer;
    v_unit_price := (r->>'unit_price')::numeric;

    -- 1) 검수대기 주문에 받은 수량 반영
    for a in select * from jsonb_array_elements(coalesce(r->'allocations', '[]'::jsonb)) loop
      v_alloc := round((a->>'quantity')::numeric)::integer;
      continue when v_alloc <= 0;
      if v_rep is null then
        v_rep := (a->>'order_id')::uuid;
      end if;
      v_allocated := v_allocated + v_alloc;

      select id, quantity, coalesce(received_quantity, 0) as rq, requester_id, item_name, unit, vendor_name, order_notes
        into o from public.orders where id = (a->>'order_id')::uuid for update;
      continue when not found;

      v_received := o.rq + v_alloc;
      if o.quantity > 0 and v_received < o.quantity then
        update public.orders
           set received_quantity = v_received, invoice_received = true, updated_by = v_user
         where id = o.id;
      else
        update public.orders
           set status = 'inspecting', confirmed_quantity = v_received, received_quantity = v_received,
               invoice_received = true, inspected_by = v_user, inspected_at = v_now, updated_by = v_user
         where id = o.id;
      end if;

      -- 다른 업체로 발주했던 주문이면 실제로 산 업체로 바꾸고, 원래 업체를 발주 비고에 남긴다
      if v_order_vendor <> '' and coalesce(o.vendor_name, '') <> v_order_vendor then
        update public.orders
           set vendor_name = v_order_vendor,
               order_notes = case
                 when coalesce(o.vendor_name, '') = '' then order_notes
                 else btrim(concat_ws(' · ', nullif(btrim(coalesce(o.order_notes, '')), ''), '원래 발주 업체: ' || o.vendor_name))
               end
         where id = o.id;
      end if;

      v_touched := v_touched || jsonb_build_object(o.id::text, jsonb_build_object(
        'requester_id', o.requester_id, 'item_name', o.item_name, 'unit', o.unit, 'quantity', o.quantity, 'received', v_received));
    end loop;

    -- 2) 주문에 맞추지 못한 수량
    v_leftover := v_qty - v_allocated;
    if v_leftover > 0 and r->>'leftover_action' = 'inspect' then
      insert into public.orders (type, status, item_name, quantity, unit, requester_id, vendor_name,
                                 confirmed_quantity, received_quantity, invoice_received, inspected_by, inspected_at,
                                 notes, order_notes, inspection_notes)
      values ('order', 'inspecting', v_item, v_leftover, '', v_user, v_order_vendor,
              v_leftover, v_leftover, true, v_user, v_now, '', '', '')
      returning id into v_new;
      v_rep := coalesce(v_rep, v_new);
    elsif v_leftover > 0 and r->>'leftover_action' = 'return' then
      insert into public.orders (type, status, item_name, quantity, unit, requester_id, vendor_name,
                                 return_quantity, return_reason, return_requested_by, return_requested_at,
                                 notes, order_notes, inspection_notes)
      values ('return', 'return_requested', v_item, v_leftover, '', v_user, v_order_vendor,
              v_leftover, '명세서에 있으나 주문 내역 없음(오류건)', v_user, v_now, '', '', '')
      returning id into v_new;
      v_rep := coalesce(v_rep, v_new);
    end if;

    -- 3) 단가 갱신: 고른 줄 + 같은 값으로 중복 저장된 줄 (값이 다른 줄은 포장이 다른 품목일 수 있어 두지 않는다)
    v_vp := nullif(r->>'vendor_product_id', '')::uuid;
    if coalesce((r->>'update_price')::boolean, false) and v_vp is not null then
      select vendor_id, unified_product_id, unit_price into b from public.vendor_products where id = v_vp;
      if found then
        update public.vendor_products set unit_price = v_unit_price where id = v_vp;
        if b.unified_product_id is not null and b.unit_price is not null then
          update public.vendor_products
             set unit_price = v_unit_price
           where vendor_id = b.vendor_id and unified_product_id = b.unified_product_id and unit_price = b.unit_price;
        end if;
      end if;
    end if;

    -- 4) 처음 보는 품목 → 업체 가격표에 추가
    if coalesce((r->>'is_new_product')::boolean, false) and v_vendor is not null then
      insert into public.vendor_products (vendor_id, product_name, unit_price, manufacturer, spec, ingredient, category, unified_product_id)
      values (v_vendor, v_item, v_unit_price, '', '', '', '', null)
      returning id into v_vp;
    end if;

    -- 5) 이 업체의 이 이름 = 이 품목 으로 기억 (다음 명세서부터 추측하지 않는다)
    if v_vendor is not null and v_vp is not null and public.item_key(v_item) <> ''
       and exists (select 1 from public.vendor_products where id = v_vp) then
      insert into public.vendor_item_memory (vendor_id, name_key, item_name, vendor_product_id, updated_at)
      values (v_vendor, public.item_key(v_item), v_item, v_vp, v_now)
      on conflict (vendor_id, name_key) do update
        set vendor_product_id = excluded.vendor_product_id, item_name = excluded.item_name, updated_at = excluded.updated_at;
    end if;

    -- 6) 원장 줄
    insert into public.invoice_items (invoice_id, item_name, quantity, list_price, unit_price, amount, matched_order_id, unified_product_id, is_new_product)
    values (v_invoice, v_item, v_qty, (r->>'list_price')::numeric, v_unit_price, (r->>'amount')::numeric, v_rep,
            nullif(r->>'unified_product_id', '')::uuid, coalesce((r->>'is_new_product')::boolean, false));
  end loop;

  return jsonb_build_object('invoice_id', v_invoice, 'touched', v_touched);
end;
$$;

grant execute on function public.confirm_invoice(jsonb) to authenticated;

-- 확인: 둘 다 1 이 나오면 적용된 것입니다.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'vendor_item_memory') as "기억 표",
  (select count(*) from pg_proc where proname = 'confirm_invoice') as "확정 함수";
