-- 연차 항목 변경 이력 + 자동 기록 트리거 (복구용)
CREATE TABLE IF NOT EXISTS public.leave_entry_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID,                       -- leave_entries.id (삭제 후에도 보존, FK 아님)
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_data JSONB,                      -- 변경 전 스냅샷 (update/delete)
  new_data JSONB,                      -- 변경 후 스냅샷 (create/update)
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leave_entry_history_created_idx
  ON public.leave_entry_history (created_at DESC);

-- 변경 기록 트리거 함수 (auth.uid()로 행위자 기록)
CREATE OR REPLACE FUNCTION public.log_leave_entry_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.leave_entry_history (entry_id, action, new_data, actor_id)
      VALUES (NEW.id, 'create', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.leave_entry_history (entry_id, action, old_data, new_data, actor_id)
      VALUES (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.leave_entry_history (entry_id, action, old_data, actor_id)
      VALUES (OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS leave_entries_audit ON public.leave_entries;
CREATE TRIGGER leave_entries_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.leave_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_leave_entry_change();

ALTER TABLE public.leave_entry_history ENABLE ROW LEVEL SECURITY;

-- 관리자만 조회 (기록은 SECURITY DEFINER 트리거가 RLS 우회)
DROP POLICY IF EXISTS "leave_entry_history_select" ON public.leave_entry_history;
CREATE POLICY "leave_entry_history_select" ON public.leave_entry_history FOR SELECT
  USING (public.is_admin());
