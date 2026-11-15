-- 논문 브리핑: 대기함 + 자동 배정 (여러 번 실행해도 안전)
--
-- 1) briefing_settings : 하루 발행 건수(기본 3)와 최소 건수. 한 줄만 있는 표.
-- 2) briefing_apply_plan() : 앱이 계산한 "논문 → 날짜·순서" 배치를 한 번에(전부 또는 전무) 적용한다.
--
-- 대기함은 새 표가 아니다. 날짜가 9999-12-31 인 묶음 하나가 대기함이고(절대 발행되지 않는다),
-- 검수를 마친 논문을 앱이 다음 발행일부터 하루 N건씩 차례로 날짜 묶음에 옮긴다.

-- ── 1) 설정 ─────────────────────────────────────────────────────────────
create table if not exists public.briefing_settings (
  id boolean primary key default true check (id),            -- 항상 한 줄
  papers_per_day int not null default 3 check (papers_per_day between 1 and 6),
  min_papers int not null default 3 check (min_papers between 1 and 6),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint briefing_settings_min_le_per_day check (min_papers <= papers_per_day)
);

insert into public.briefing_settings (id) values (true) on conflict (id) do nothing;

alter table public.briefing_settings enable row level security;

drop policy if exists "briefing_settings_admin" on public.briefing_settings;
create policy "briefing_settings_admin" on public.briefing_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2) 배치 적용 ────────────────────────────────────────────────────────
-- p_items : [{"id": 논문 id, "date": "YYYY-MM-DD", "ord": 1}, …]   옮길 논문의 최종 위치
-- p_days  : [{"date": "YYYY-MM-DD", "status": "draft"|"scheduled", "scheduled_at": 시각 또는 null}, …]
--
-- 지키는 것:
--  - 관리자만 (호출한 사람 권한으로 돈다 — 표의 접근 규칙도 그대로 적용된다)
--  - 발행된 묶음, 이미 직원에게 보이는 예약 묶음은 건드리지 않는다 → 그런 묶음이 끼어 있으면 전부 취소(BRIEFING_LOCKED)
--  - 옮기는 도중의 순서 겹침은 끝에서 한 번에 검사한다
--  - 자리만 옮기는 것이라 논문의 "수정됨" 시각은 바꾸지 않는다
create or replace function public.briefing_apply_plan(p_items jsonb, p_days jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  -- 날짜 묶음이 없으면 만든다
  insert into public.briefing_issues (issue_date, created_by)
  select distinct (d->>'date')::date, auth.uid()
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) d
  on conflict (issue_date) do nothing;

  -- 잠긴 묶음(발행됨 · 이미 보이는 예약)에서 논문을 빼거나, 그런 묶음으로 넣으려는 배치는 받지 않는다
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
      join public.briefing_papers p on p.id = (it->>'id')::uuid
      join public.briefing_issues i on i.id = p.issue_id
     where i.status = 'published' or (i.status = 'scheduled' and i.scheduled_at <= v_now)
  ) or exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
      join public.briefing_issues i on i.issue_date = (it->>'date')::date
     where i.status = 'published' or (i.status = 'scheduled' and i.scheduled_at <= v_now)
  ) or exists (
    select 1
      from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) d
      join public.briefing_issues i on i.issue_date = (d->>'date')::date
     where i.status = 'published' or (i.status = 'scheduled' and i.scheduled_at <= v_now)
  ) then
    raise exception 'BRIEFING_LOCKED';
  end if;

  -- 목적지 날짜 묶음이 없는 논문이 있으면 잘못된 배치다
  if exists (
    select 1
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
      left join public.briefing_issues i on i.issue_date = (it->>'date')::date
     where i.id is null
  ) then
    raise exception 'BRIEFING_NO_ISSUE';
  end if;

  perform set_config('soo.keep_updated_at', 'on', true);
  set constraints public.briefing_papers_order_unique deferred;

  update public.briefing_papers p
     set issue_id = i.id,
         display_order = (it->>'ord')::int
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) it
    join public.briefing_issues i on i.issue_date = (it->>'date')::date
   where p.id = (it->>'id')::uuid
     and (p.issue_id is distinct from i.id or p.display_order is distinct from (it->>'ord')::int);

  update public.briefing_issues i
     set status = d->>'status',
         scheduled_at = nullif(d->>'scheduled_at', '')::timestamptz
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) d
   where i.issue_date = (d->>'date')::date
     and i.status <> 'published'
     and (d->>'status') in ('draft', 'scheduled')
     and (i.status is distinct from d->>'status'
          or i.scheduled_at is distinct from nullif(d->>'scheduled_at', '')::timestamptz);
end;
$$;

-- 확인: 설정 줄 수(1)와 만들어진 함수 수(1)
select
  (select count(*) from public.briefing_settings) as "설정 줄",
  (select count(*) from pg_proc where proname = 'briefing_apply_plan') as "배치 함수";
