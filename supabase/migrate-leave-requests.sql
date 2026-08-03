-- 연차 수정요청 게시판 (변경요청 워크플로)
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('add', 'modify', 'delete')),
  target_entry_id UUID REFERENCES public.leave_entries(id) ON DELETE SET NULL,
  target_label TEXT,                 -- 원본 스냅샷 (예: "6/15 연차")
  leave_date DATE,                   -- 희망 날짜 (add/modify)
  leave_type_id UUID REFERENCES public.leave_types(id),
  day_portion TEXT CHECK (day_portion IN ('full', 'am', 'pm')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  handled_by UUID REFERENCES public.profiles(id),
  handled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON public.leave_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS leave_requests_requester_idx ON public.leave_requests (requester_id);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT
  USING (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "leave_requests_insert" ON public.leave_requests;
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "leave_requests_delete" ON public.leave_requests;
CREATE POLICY "leave_requests_delete" ON public.leave_requests FOR DELETE
  USING ((requester_id = auth.uid() AND status = 'pending') OR public.is_admin());
