-- 팀별 연차 신청 잠금/해제 (자동/상시열림/잠금)
CREATE TABLE IF NOT EXISTS public.leave_locks (
  team TEXT PRIMARY KEY,
  submit_mode TEXT NOT NULL DEFAULT 'auto' CHECK (submit_mode IN ('auto', 'open', 'locked')),
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_locks_select" ON public.leave_locks;
CREATE POLICY "leave_locks_select" ON public.leave_locks FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "leave_locks_admin" ON public.leave_locks;
CREATE POLICY "leave_locks_admin" ON public.leave_locks FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
