-- 주문탭 "품목별 최근 업체" 힌트를 위한 서버 집계 함수.
-- 기존엔 클라이언트가 주문 이력 1,500행을 받아 JS로 집계했는데(매 로드·재조회마다),
-- 이 함수로 품목(정규화 키)당 최근 업체를 서버에서 집계해 전송량을 급감시킨다.
-- normalizeItemName(JS) = lower + 모든 공백 제거 와 동일하게 정규화한다.
--
-- 행(setof) 반환은 PostgREST의 max-rows(기본 1000)에 잘리므로,
-- 단일 jsonb 객체({ item_key: vendor_name, ... })로 반환해 상한을 우회한다.
--
-- Supabase SQL Editor에서 실행. (반환 타입 변경이 있어 drop 후 재생성)

drop function if exists latest_vendor_by_item();

create or replace function latest_vendor_by_item()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_object_agg(item_key, vendor_name), '{}'::jsonb)
  from (
    select distinct on (lower(regexp_replace(o.item_name, '\s+', '', 'g')))
      lower(regexp_replace(o.item_name, '\s+', '', 'g')) as item_key,
      o.vendor_name
    from orders o
    where o.type = 'order'
      and o.vendor_name is not null
      and o.vendor_name <> ''
    order by
      lower(regexp_replace(o.item_name, '\s+', '', 'g')),
      o.created_at desc
  ) t;
$$;

grant execute on function latest_vendor_by_item() to authenticated;
