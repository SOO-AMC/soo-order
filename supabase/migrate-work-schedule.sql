-- 근무표 (월간 전체 근무 스케줄)
-- 시프트 정의
CREATE TABLE IF NOT EXISTS public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,            -- 'HH:MM'
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.work_shifts (name, start_time, sort_order) VALUES
  ('오전 8:50', '08:50', 1),
  ('오전 11:00', '11:00', 2),
  ('야간 21:50', '21:50', 3)
ON CONFLICT DO NOTHING;

-- 날짜 x 직원 배정 (관리자가 입력하는 근무 상태; 연차/반차는 leave_entries에서 오버레이)
CREATE TABLE IF NOT EXISTS public.schedule_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES public.work_shifts(id),
  status TEXT NOT NULL DEFAULT 'work' CHECK (status IN ('work', 'off', 'extra', 'off_change')),
  surgery_assist BOOLEAN NOT NULL DEFAULT false,   -- 술방보조 (노랑)
  pathology BOOLEAN NOT NULL DEFAULT false,        -- 임상병리담당 (분홍)
  note TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_date, user_id)
);

CREATE INDEX IF NOT EXISTS schedule_entries_date_idx ON public.schedule_entries (work_date);

ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

-- 시프트: 인증 조회, 관리자 쓰기
DROP POLICY IF EXISTS "work_shifts_select" ON public.work_shifts;
CREATE POLICY "work_shifts_select" ON public.work_shifts FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "work_shifts_admin" ON public.work_shifts;
CREATE POLICY "work_shifts_admin" ON public.work_shifts FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 근무표: 전 직원 조회(병원 전체 공유), 관리자 쓰기
DROP POLICY IF EXISTS "schedule_entries_select" ON public.schedule_entries;
CREATE POLICY "schedule_entries_select" ON public.schedule_entries FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "schedule_entries_admin" ON public.schedule_entries;
CREATE POLICY "schedule_entries_admin" ON public.schedule_entries FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
