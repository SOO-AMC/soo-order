-- 신청 주기(leave_cycles)를 팀별로 — team 컬럼 추가 + (year_month, team) 유니크
ALTER TABLE public.leave_cycles ADD COLUMN IF NOT EXISTS team TEXT;

-- 기존 year_month 단독 유니크 제거 (이름이 다를 수 있어 동적 처리)
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.leave_cycles'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%year_month%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%team%'
  LOOP
    EXECUTE format('ALTER TABLE public.leave_cycles DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- 팀이 없던 기존 행은 정리(미배포 신규 기능이라 안전)
DELETE FROM public.leave_cycles WHERE team IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leave_cycles_ym_team_idx
  ON public.leave_cycles (year_month, team);
