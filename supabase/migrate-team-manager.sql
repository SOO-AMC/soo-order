-- 팀관리자 권한: profiles.role 에 'team_manager' 허용
-- role 에 CHECK 제약이 있으면 제거 (자유 텍스트로 — 앱이 값 관리)
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- 헬퍼
CREATE OR REPLACE FUNCTION public.is_team_manager()
RETURNS boolean AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'team_manager');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.my_position()
RETURNS text AS $$
  SELECT position FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_position(uid uuid)
RETURNS text AS $$
  SELECT position FROM public.profiles WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- leave_entries: 팀관리자(본인 팀) 쓰기 허용
DROP POLICY IF EXISTS "leave_entries_insert" ON public.leave_entries;
CREATE POLICY "leave_entries_insert" ON public.leave_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));
DROP POLICY IF EXISTS "leave_entries_update" ON public.leave_entries;
CREATE POLICY "leave_entries_update" ON public.leave_entries FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin() OR (public.is_team_manager() AND team = public.my_team()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));
DROP POLICY IF EXISTS "leave_entries_delete" ON public.leave_entries;
CREATE POLICY "leave_entries_delete" ON public.leave_entries FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));

-- leave_requests: 팀관리자(본인 팀) 조회/처리
DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT
  USING (requester_id = auth.uid() OR public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));
DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE
  USING (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()))
  WITH CHECK (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));

-- leave_cycles: 팀관리자(본인 팀)
DROP POLICY IF EXISTS "leave_cycles_admin" ON public.leave_cycles;
CREATE POLICY "leave_cycles_admin" ON public.leave_cycles FOR ALL
  USING (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()))
  WITH CHECK (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));

-- leave_locks: 팀관리자(본인 팀)
DROP POLICY IF EXISTS "leave_locks_admin" ON public.leave_locks;
CREATE POLICY "leave_locks_admin" ON public.leave_locks FOR ALL
  USING (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()))
  WITH CHECK (public.is_admin() OR (public.is_team_manager() AND team = public.my_team()));

-- schedule_entries: 팀관리자(본인 직책)
DROP POLICY IF EXISTS "schedule_entries_admin" ON public.schedule_entries;
CREATE POLICY "schedule_entries_admin" ON public.schedule_entries FOR ALL
  USING (public.is_admin() OR (public.is_team_manager() AND public.user_position(user_id) = public.my_position()))
  WITH CHECK (public.is_admin() OR (public.is_team_manager() AND public.user_position(user_id) = public.my_position()));
