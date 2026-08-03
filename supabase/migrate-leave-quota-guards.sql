-- =============================================================
-- 연차 정합성 가드 (P0)
--  1. leave_entries 중복을 DB 레벨에서 차단 (동시 클릭 레이스)
--  2. 미래 주기 선생성을 위한 status 'scheduled' 허용
--  3. 사람당 주기 중복 방지
--
-- 선행: migrate-leave-periods-grants-snapshots.sql
-- Supabase SQL Editor 에서 실행. (재실행 안전)
-- =============================================================

-- -------------------------------------------------------------
-- 1. 같은 사람 · 같은 날 · 같은 구분 중복 등록 차단
--    앱은 "조회 후 삽입"으로 막고 있어 동시 클릭이면 둘 다 통과했음.
--    ※ 기존 데이터에 중복이 있으면 인덱스 생성이 실패한다. 아래로 먼저 확인:
--      SELECT user_id, leave_date, day_portion, count(*)
--      FROM public.leave_entries GROUP BY 1,2,3 HAVING count(*) > 1;
-- -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS leave_entries_user_date_portion_uniq
  ON public.leave_entries (user_id, leave_date, day_portion);

-- -------------------------------------------------------------
-- 2. status 에 'scheduled' 추가
--    신청주기가 "전달 1~10일"이라 다음 달 연차를 미리 신청하는데,
--    그 날짜가 현재 주기 밖이면 어느 주기에도 안 잡혀 사용 집계에서 증발했음.
--    → 날짜가 속할 다음 주기를 미리 만들어 두고(scheduled) 거기에 차감한다.
--    scheduled 는 '아직 시작 안 한 주기'이며, 롤오버 cron 이 active 로 승격시킨다.
-- -------------------------------------------------------------
ALTER TABLE public.leave_balances DROP CONSTRAINT IF EXISTS leave_balances_status_chk;
ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_status_chk CHECK (status IN ('active', 'scheduled', 'closed'));

-- 사람당 같은 시작일 주기가 두 번 생기지 않도록
CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_user_start_uniq
  ON public.leave_balances (user_id, period_start) WHERE period_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS leave_balances_user_range_idx
  ON public.leave_balances (user_id, period_start, period_end);
