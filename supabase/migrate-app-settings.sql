-- =============================================================
-- 앱 설정 (app_settings) — 관리자 화면에서 바꾸는 값을 담는 작은 표
-- 지금 쓰는 값: login_video (로그인 화면 배경 유튜브 영상)
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다. 기존 표는 건드리지 않습니다.
-- =============================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.update_updated_at();

alter table public.app_settings enable row level security;

-- 로그인 화면은 로그인 전에 보이므로 영상 설정만은 누구나 읽을 수 있다 (다른 키는 관리자만)
drop policy if exists "app_settings_public_read" on public.app_settings;
create policy "app_settings_public_read" on public.app_settings
  for select to anon, authenticated
  using (key in ('login_video'));

-- 바꾸기는 관리자만
drop policy if exists "app_settings_admin_all" on public.app_settings;
create policy "app_settings_admin_all" on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 확인: true 가 나오면 정상
select relrowsecurity as rls_on from pg_class where oid = 'public.app_settings'::regclass;
