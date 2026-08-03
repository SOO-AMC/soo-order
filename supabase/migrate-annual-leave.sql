-- =============================================================
-- 연차 관리 (leave_types / leave_cycles / leave_entries / leave_balances)
-- Supabase SQL Editor 에서 실행. (재실행 안전)
-- 팀 = 직책: 수의사(veterinarian)=vet / 매니저(manager)=manager / 간호(technician)=tech
-- =============================================================

-- 1. 연차 종류 (종류별 연차 잔여 차감 여부 설정)
CREATE TABLE IF NOT EXISTS public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  deducts_balance BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.leave_types (name, deducts_balance, sort_order) VALUES
  ('연차', true, 1), ('병가', false, 2), ('경조사', false, 3), ('유급휴가', false, 4)
ON CONFLICT (name) DO NOTHING;

-- 2. 연차 회차 (override; 행 없으면 기본 규칙 = 달력 월 + 전달 1~10일)
CREATE TABLE IF NOT EXISTS public.leave_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE,        -- 'YYYY-MM'
  leave_start DATE NOT NULL,
  leave_end DATE NOT NULL,
  submit_start DATE NOT NULL,
  submit_end DATE NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 연차 등록
CREATE TABLE IF NOT EXISTS public.leave_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team TEXT NOT NULL,                      -- 'vet' | 'manager' | 'tech'
  leave_date DATE NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id),
  day_portion TEXT NOT NULL DEFAULT 'full' CHECK (day_portion IN ('full','am','pm')),
  note TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_entries_team_date_idx ON public.leave_entries (team, leave_date);
CREATE INDEX IF NOT EXISTS leave_entries_user_idx ON public.leave_entries (user_id);

-- 4. 연차 잔여 설정 (연차사용기간 + 총 일수)
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE,
  period_end DATE,
  total_days NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 요청자 직책 → 팀
CREATE OR REPLACE FUNCTION public.my_team()
RETURNS TEXT AS $$
  SELECT CASE position
    WHEN 'veterinarian' THEN 'vet'
    WHEN 'manager' THEN 'manager'
    WHEN 'technician' THEN 'tech'
    ELSE NULL END
  FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_types_select" ON public.leave_types;
CREATE POLICY "leave_types_select" ON public.leave_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "leave_types_admin" ON public.leave_types;
CREATE POLICY "leave_types_admin" ON public.leave_types FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leave_cycles_select" ON public.leave_cycles;
CREATE POLICY "leave_cycles_select" ON public.leave_cycles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "leave_cycles_admin" ON public.leave_cycles;
CREATE POLICY "leave_cycles_admin" ON public.leave_cycles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 같은 팀 또는 관리자만 조회
DROP POLICY IF EXISTS "leave_entries_select" ON public.leave_entries;
CREATE POLICY "leave_entries_select" ON public.leave_entries FOR SELECT
  USING (team = public.my_team() OR public.is_admin());
-- 본인 또는 관리자만 쓰기 (신청기간 잠금은 서버 액션에서 검사)
DROP POLICY IF EXISTS "leave_entries_insert" ON public.leave_entries;
CREATE POLICY "leave_entries_insert" ON public.leave_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "leave_entries_update" ON public.leave_entries;
CREATE POLICY "leave_entries_update" ON public.leave_entries FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin()) WITH CHECK (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "leave_entries_delete" ON public.leave_entries;
CREATE POLICY "leave_entries_delete" ON public.leave_entries FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin());

-- 잔여: 본인+관리자 조회, 관리자만 설정
DROP POLICY IF EXISTS "leave_balances_select" ON public.leave_balances;
CREATE POLICY "leave_balances_select" ON public.leave_balances FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "leave_balances_admin" ON public.leave_balances;
CREATE POLICY "leave_balances_admin" ON public.leave_balances FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
