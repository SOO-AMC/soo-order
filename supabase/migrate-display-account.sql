-- =============================================================
-- 세미나실 화면 전용 계정 (profiles.role = 'display') 접근 제한
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 이 계정이 할 수 있는 것
--   · 로그인 · 자기 프로필 1줄 읽기 (권한 확인용)
--   · 발행된 논문 브리핑 읽기 (라운딩 화면)
-- 그 밖의 모든 표 — 주문·품절·반품·검수·혈액·가격·업체·명세서·직원·알림·활동 로그·연차·근무표 —
--   는 읽기·쓰기 모두 막습니다. 사진 저장소(storage)도 막습니다.
--
-- 방식: 기존 정책은 하나도 고치지 않고 "restrictive" 정책을 덧붙입니다.
--   restrictive 정책은 기존 허용 정책과 AND 로 묶이므로, 세미나실 계정이 아닌 사람에게는 아무 변화가 없습니다.
-- 표를 새로 만들었다면 이 파일을 다시 실행하세요. 그 표에도 적용됩니다.
-- =============================================================

-- 0. 지금 로그인한 사람이 세미나실 화면 계정인가
create or replace function public.is_display()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'display');
$$;

grant execute on function public.is_display() to authenticated;

-- 1. public 의 모든 표: 세미나실 계정은 읽기·쓰기 모두 막기
--    (profiles 와 논문 브리핑 읽기용 2개 표는 아래에서 따로)
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname not in ('profiles', 'briefing_issues', 'briefing_papers')
  loop
    execute format('drop policy if exists "block_display_account" on public.%I', t.relname);
    execute format(
      'create policy "block_display_account" on public.%I as restrictive for all to authenticated '
      'using (not (select public.is_display())) with check (not (select public.is_display()))',
      t.relname
    );
  end loop;
end $$;

-- 2. 논문 브리핑 묶음·논문: 읽기만 허용 (쓰기는 원래도 관리자만)
do $$
declare
  t text;
begin
  foreach t in array array['briefing_issues', 'briefing_papers'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "block_display_insert" on public.%I', t);
    execute format('drop policy if exists "block_display_update" on public.%I', t);
    execute format('drop policy if exists "block_display_delete" on public.%I', t);
    execute format('create policy "block_display_insert" on public.%I as restrictive for insert to authenticated with check (not (select public.is_display()))', t);
    execute format('create policy "block_display_update" on public.%I as restrictive for update to authenticated using (not (select public.is_display())) with check (not (select public.is_display()))', t);
    execute format('create policy "block_display_delete" on public.%I as restrictive for delete to authenticated using (not (select public.is_display()))', t);
  end loop;
end $$;

-- 3. 직원 프로필: 세미나실 계정은 자기 1줄만 읽기, 고치기·지우기 불가
drop policy if exists "display_own_profile_only" on public.profiles;
create policy "display_own_profile_only" on public.profiles
  as restrictive for select to authenticated
  using (id = auth.uid() or not (select public.is_display()));

drop policy if exists "block_display_insert" on public.profiles;
create policy "block_display_insert" on public.profiles
  as restrictive for insert to authenticated
  with check (not (select public.is_display()));

drop policy if exists "block_display_update" on public.profiles;
create policy "block_display_update" on public.profiles
  as restrictive for update to authenticated
  using (not (select public.is_display()))
  with check (not (select public.is_display()));

drop policy if exists "block_display_delete" on public.profiles;
create policy "block_display_delete" on public.profiles
  as restrictive for delete to authenticated
  using (not (select public.is_display()));

-- 4. 사진·명세서 저장소: 세미나실 계정은 막기
do $$
begin
  execute 'drop policy if exists "block_display_account" on storage.objects';
  execute 'create policy "block_display_account" on storage.objects as restrictive for all to authenticated '
          'using (not (select public.is_display())) with check (not (select public.is_display()))';
exception when others then
  raise notice '저장소(storage.objects) 제한은 만들지 못했어요: %', sqlerrm;
end $$;

-- =============================================================
-- 확인 (실행 후 결과를 보면 됩니다)
-- =============================================================
-- (1) 제한이 걸린 표 목록 — 주문·혈액·알림 등 public 표가 다 나와야 합니다
select tablename from pg_policies
 where policyname = 'block_display_account'
 order by schemaname, tablename;

-- (2) RLS 가 꺼져 있는 public 표 — 여기 나오는 표에는 제한이 적용되지 않습니다
--     (원래부터 로그인한 누구나 접근할 수 있는 상태입니다. 비어 있어야 정상)
select c.relname as rls_off_table
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
