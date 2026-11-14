-- =============================================================
-- 직원이 자기 권한(role)을 스스로 바꾸지 못하게 막기
-- Supabase SQL Editor 에서 통째로 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 왜 필요한가
--   profiles 의 수정 정책이 "본인 줄이면 수정 가능" 으로만 되어 있고 어떤 칸인지는 보지 않습니다.
--   그래서 로그인한 직원 누구나 자기 줄의 role 을 'admin' 으로 바꿀 수 있었습니다.
--
-- 무엇을 하나
--   profiles 를 고칠 때마다 확인하는 장치(trigger)를 답니다.
--   · 서버(service_role)가 고치는 것 → 통과 (직원 관리 화면·근무표 명단이 이 길로 고칩니다)
--   · 전체관리자가 고치는 것 → 통과
--   · 그 밖의 로그인 사용자 → 이름(full_name) 말고는 어떤 칸도 바꿀 수 없음
--     (role · position · is_active · schedule_exclude · email 등)
--
-- 기존 정책은 고치지 않습니다. 앱은 지금도 profiles 를 서버 쪽에서만 고치므로 화면 동작은 그대로입니다.
-- =============================================================

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 로그인 사용자가 아닌 경우(서버 service_role, SQL Editor) 는 통과
  if auth.uid() is null then
    return new;
  end if;

  -- 전체관리자는 통과
  if public.is_admin() then
    return new;
  end if;

  -- 그 밖의 사용자: 이름과 수정 시각 말고 달라진 칸이 있으면 막는다
  if (to_jsonb(new) - 'full_name' - 'updated_at') is distinct from (to_jsonb(old) - 'full_name' - 'updated_at') then
    raise exception '권한·직책·계정 상태는 관리자만 바꿀 수 있어요'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
  before update on public.profiles
  for each row
  execute function public.guard_profile_columns();

-- 확인: 아래 결과에 guard_profile_columns 가 보이면 적용된 것입니다.
select tgname as "profiles 에 달린 장치"
from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal
order by 1;
