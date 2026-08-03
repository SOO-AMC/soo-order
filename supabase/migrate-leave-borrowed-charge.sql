-- =============================================================
-- 선사용(가불) 연차 지원 — "어느 주기에서 차감할지"를 날짜와 분리
--
-- 배경: 지난 주기 연차를 다 쓴 직원에게 "다음 주기 것 1개를 미리 당겨쓰도록" 허가하는
--       실제 운영이 있다. 지금까지는 leave_date 가 속한 주기로만 차감처를 정해서
--       이런 항목이 어느 주기에도 안 잡히고 집계에서 증발했다.
--       (예: 최소연 2026-03-15 → 주기 2026-03-16~2027-03-15 밖)
--
-- 해결: leave_entries.balance_id 로 차감할 주기를 명시.
--       NULL 이면 종전대로 leave_date 가 속한 주기에서 차감(기본 동작).
--
-- 선행: migrate-leave-periods-grants-snapshots.sql, migrate-leave-quota-guards.sql
-- Supabase SQL Editor 에서 실행. (재실행 안전)
-- =============================================================

ALTER TABLE public.leave_entries
  ADD COLUMN IF NOT EXISTS balance_id UUID REFERENCES public.leave_balances(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leave_entries.balance_id IS
  '차감할 연차 주기. NULL이면 leave_date가 속한 주기에서 자동 차감. 선사용(가불) 등 예외에만 지정.';

CREATE INDEX IF NOT EXISTS leave_entries_balance_idx
  ON public.leave_entries (balance_id) WHERE balance_id IS NOT NULL;

-- -------------------------------------------------------------
-- 기존 데이터 보정
--  최소연 2026-03-15 : 지난 주기 연차를 다 써서 이번 주기 것 1일을 당겨쓰도록 허가한 건.
--  날짜가 현재 주기(2026-03-16~2027-03-15) 하루 앞이라 집계에서 빠져 있었다.
--  → 현재 주기에서 차감되도록 연결. (balance_id IS NULL 가드로 재실행 안전)
-- -------------------------------------------------------------
UPDATE public.leave_entries e
SET balance_id = b.id
FROM public.profiles p, public.leave_balances b
WHERE e.user_id = p.id
  AND p.full_name = '최소연'
  AND e.leave_date = DATE '2026-03-15'
  AND e.balance_id IS NULL
  AND b.user_id = e.user_id
  AND b.status = 'active';
