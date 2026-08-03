-- =============================================================
-- 연차 주기(period) 다회차화 + 특별연차 부여(leave_grants) + 연차표 스냅샷
-- Supabase SQL Editor 에서 실행. (재실행 안전)
--
-- 배경: leave_balances 가 user_id UNIQUE 라 사람당 1행 = "현재 주기"만 보관.
--       만료 후 새 주기를 설정하면 직전 주기의 부여량이 영구 소멸했음.
--       → 주기를 여러 행으로 보관하고, 총 연차 = total_days(기본) + leave_grants 합 으로 변경.
-- =============================================================

-- -------------------------------------------------------------
-- 1. leave_balances : 주기 원장으로 확장
--    total_days = 그 주기의 "기본" 부여 일수 (특별연차는 leave_grants)
-- -------------------------------------------------------------
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
-- confirmed=false : 롤오버가 직전 값을 복사해 자동 생성한 "미확정" 주기 (관리자 확인 대기)
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.leave_balances'::regclass AND conname = 'leave_balances_status_chk'
  ) THEN
    ALTER TABLE public.leave_balances
      ADD CONSTRAINT leave_balances_status_chk CHECK (status IN ('active', 'closed'));
  END IF;
END $$;

-- 기존 user_id 단독 UNIQUE 제거 (이름이 다를 수 있어 동적 처리)
DO $$
DECLARE con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leave_balances'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%user_id%'
      AND pg_get_constraintdef(oid) NOT ILIKE '%period_start%'
  LOOP
    EXECUTE format('ALTER TABLE public.leave_balances DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- 사람당 active 주기는 항상 1개 (period_start 가 NULL 인 기존 행도 안전하게 커버)
CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_one_active_idx
  ON public.leave_balances (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS leave_balances_user_period_idx
  ON public.leave_balances (user_id, period_start DESC);

-- 기존 행은 전부 현재 주기 = active/확정
UPDATE public.leave_balances SET status = 'active' WHERE status IS NULL;

-- -------------------------------------------------------------
-- 2. leave_grants : 특별연차(추가 부여) 원장
--    days 는 0.5 단위. 음수 허용 → 잘못 부여한 건을 이력 남기고 되돌림.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance_id UUID REFERENCES public.leave_balances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  days NUMERIC NOT NULL CHECK (days <> 0),
  reason TEXT NOT NULL,
  granted_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_grants_balance_idx ON public.leave_grants (balance_id);
CREATE INDEX IF NOT EXISTS leave_grants_user_idx ON public.leave_grants (user_id);

-- -------------------------------------------------------------
-- 3. leave_grid_snapshots : 연차표 버전 보관
--    data = LeaveGridColumn[] 통째로. 퇴사/개명 뒤에도 당시 표가 그대로 재현되도록 자기완결.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_grid_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('monthly', 'cycle_end', 'manual')),
  snapshot_date DATE NOT NULL,
  team TEXT,                -- monthly/manual = 팀 단위
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- cycle_end = 개인 단위
  user_name TEXT,           -- 당시 이름 (개명/퇴사 대비)
  period_start DATE,
  period_end DATE,
  data JSONB NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_snapshots_kind_date_idx
  ON public.leave_grid_snapshots (kind, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS leave_snapshots_team_date_idx
  ON public.leave_grid_snapshots (team, snapshot_date DESC);
-- 같은 날 같은 대상 중복 저장 방지 (수동은 여러 번 가능하도록 제외)
CREATE UNIQUE INDEX IF NOT EXISTS leave_snapshots_monthly_uniq
  ON public.leave_grid_snapshots (kind, snapshot_date, team) WHERE kind = 'monthly';
CREATE UNIQUE INDEX IF NOT EXISTS leave_snapshots_cycle_uniq
  ON public.leave_grid_snapshots (kind, user_id, period_end) WHERE kind = 'cycle_end';

-- =============================================================
-- RLS
-- =============================================================
ALTER TABLE public.leave_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_grid_snapshots ENABLE ROW LEVEL SECURITY;

-- 특별연차: 본인 것 + 전체관리자 조회. 부여는 전체관리자만.
DROP POLICY IF EXISTS "leave_grants_select" ON public.leave_grants;
CREATE POLICY "leave_grants_select" ON public.leave_grants FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- ⚠ DELETE 정책을 일부러 만들지 않는다 — 부여 내역은 삭제 불가(감사 이력 보존).
--   잘못 부여한 건은 days 를 음수로 한 건 더 넣어 되돌린다.
--   (service_role 은 RLS 를 우회하므로 DB 유지보수는 여전히 가능)
DROP POLICY IF EXISTS "leave_grants_admin" ON public.leave_grants;  -- 구버전 FOR ALL 정책 제거
DROP POLICY IF EXISTS "leave_grants_insert" ON public.leave_grants;
CREATE POLICY "leave_grants_insert" ON public.leave_grants FOR INSERT
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "leave_grants_update" ON public.leave_grants;
CREATE POLICY "leave_grants_update" ON public.leave_grants FOR UPDATE
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 스냅샷: 연차현황 탭이 전체관리자 전용이므로 조회도 전체관리자만.
DROP POLICY IF EXISTS "leave_snapshots_admin" ON public.leave_grid_snapshots;
CREATE POLICY "leave_snapshots_admin" ON public.leave_grid_snapshots FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());
