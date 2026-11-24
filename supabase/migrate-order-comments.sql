-- =============================================================
-- 주문 코멘트 (order_comments)
-- 관리자가 주문 한 건에 코멘트를 남기면 주문 등록한 사람이 앱에서 보고 답글을 단다.
-- Supabase SQL Editor 에서 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 orders 에 칸을 만들지 않나: orders 를 고치면 updated_at 이 바뀌어
-- 조회 화면의 "발주 날짜" 검색·"수정됨" 표시가 흔들린다. 코멘트는 따로 둔다.
-- =============================================================

create table if not exists public.order_comments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  -- 받는 쪽이 읽은 시각: 관리자 코멘트 → 주문자가, 주문자 답글 → 관리자가 읽은 시각
  read_at timestamptz
);

create index if not exists order_comments_order_idx on public.order_comments (order_id, created_at);
create index if not exists order_comments_unread_idx on public.order_comments (order_id) where read_at is null;

alter table public.order_comments enable row level security;

-- 읽기: 관리자는 전부, 주문자는 자기 주문의 코멘트만
drop policy if exists "order_comments_select" on public.order_comments;
create policy "order_comments_select" on public.order_comments for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.requester_id = auth.uid())
  );

-- 이 주문에 내가 아닌 사람이 쓴 코멘트가 있는가 (주문자 답글 조건). 같은 표를 정책 안에서 다시 읽지 않으려고 함수로 둔다
create or replace function public.order_has_other_comment(p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.order_comments c where c.order_id = p_order and c.author_id <> auth.uid());
$$;

grant execute on function public.order_has_other_comment(uuid) to authenticated;

-- 쓰기: 본인 이름으로만. 관리자는 아무 주문에나, 주문자는 관리자가 먼저 코멘트를 단 자기 주문에만(답글)
drop policy if exists "order_comments_insert" on public.order_comments;
create policy "order_comments_insert" on public.order_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and read_at is null
    and (
      public.is_admin()
      or (
        exists (select 1 from public.orders o where o.id = order_id and o.requester_id = auth.uid())
        and public.order_has_other_comment(order_id)
      )
    )
  );

-- 고치기·지우기 정책은 두지 않는다 (기록으로 남긴다). 읽음 표시는 아래 함수로만.

-- 읽음 표시: 내가 받은 쪽(내가 쓰지 않은 코멘트)만, 내가 볼 수 있는 주문에서만
create or replace function public.mark_order_comments_read(p_order uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  is_requester boolean;
begin
  select exists (select 1 from public.orders o where o.id = p_order and o.requester_id = auth.uid()) into is_requester;
  if not (public.is_admin() or is_requester) then
    return 0;
  end if;

  update public.order_comments c
     set read_at = now()
   where c.order_id = p_order
     and c.read_at is null
     and c.author_id <> auth.uid()
     -- 주문자는 관리자 코멘트를, 관리자는 주문자 답글을 읽음 처리한다 (관리자끼리 쓴 것은 건드리지 않음)
     and (
       is_requester
       or (public.is_admin() and c.author_id = (select o.requester_id from public.orders o where o.id = p_order))
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_order_comments_read(uuid) to authenticated;

-- 세미나실 화면 계정 막기 (migrate-display-account.sql 과 같은 규칙. 그 파일을 다시 실행해도 된다)
do $$
begin
  if to_regprocedure('public.is_display()') is not null then
    execute 'drop policy if exists "block_display_account" on public.order_comments';
    execute 'create policy "block_display_account" on public.order_comments as restrictive for all to authenticated '
            'using (not (select public.is_display())) with check (not (select public.is_display()))';
  end if;
end $$;

-- 확인: 표와 정책이 생겼는지
select policyname from pg_policies where tablename = 'order_comments' order by policyname;
