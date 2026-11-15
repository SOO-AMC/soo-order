-- 네이버웍스로 로그인: 수오더 계정 ↔ 네이버웍스 계정 연결 (여러 번 실행해도 안전)
--
-- 연결을 만드는 길은 둘:
--  1) 관리자가 직원 관리에서 그 직원의 네이버웍스 계정(이메일)을 적어 둔다 → nw_login_email.
--     그 직원이 처음 "네이버웍스로 로그인"을 하면, 네이버웍스가 확인해 준 이메일이 같을 때 그 사람의 구성원 ID(nw_sub)가 붙는다.
--     → 직원은 수오더에 가입하거나 비밀번호를 정할 필요가 없다.
--  2) 직원 본인이 수오더에 로그인한 상태에서 "내 계정 → 네이버웍스 연결".
-- 이름이 같다고 짐작해서 붙이지는 않는다.
--
-- 이 표는 서버(service_role)만 읽고 쓴다. 접근 규칙을 하나도 두지 않아서 일반 로그인 사용자는 볼 수도 바꿀 수도 없다.

create table if not exists public.naverworks_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  nw_login_email text,                  -- 관리자가 적어 둔 네이버웍스 계정 (소문자)
  nw_sub text,                          -- 네이버웍스 ID 토큰의 sub (구성원 ID). 첫 로그인 때 붙는다
  nw_email text,                        -- 마지막 로그인 때 네이버웍스가 알려 준 이메일 (보기용)
  nw_name text,
  linked_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint naverworks_links_has_key check (nw_sub is not null or nw_login_email is not null)
);

-- 예전 모양(nw_sub 필수)으로 먼저 만들어 둔 경우에도 맞춘다
alter table public.naverworks_links add column if not exists nw_login_email text;
alter table public.naverworks_links alter column nw_sub drop not null;
-- 예전 모양에는 "이메일이나 구성원 ID 중 하나는 있어야 한다" 규칙이 없다 → 없을 때만 더한다
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'naverworks_links_has_key' and conrelid = 'public.naverworks_links'::regclass) then
    alter table public.naverworks_links add constraint naverworks_links_has_key check (nw_sub is not null or nw_login_email is not null);
  end if;
end $$;

create unique index if not exists naverworks_links_sub_key on public.naverworks_links (nw_sub) where nw_sub is not null;
create unique index if not exists naverworks_links_login_email_key on public.naverworks_links (lower(nw_login_email)) where nw_login_email is not null;

alter table public.naverworks_links enable row level security;
-- 정책 없음 = 로그인 사용자는 접근 불가, 서버(service_role)만 접근

-- 확인: 만들어진 표 수 (1 이면 정상)
select count(*) as "만들어진 표"
from information_schema.tables
where table_schema = 'public' and table_name = 'naverworks_links';
