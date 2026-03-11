-- 활동 로그 자동 정리: 30일 이상 된 로그 매일 삭제
-- Supabase Dashboard > SQL Editor 에서 실행

-- 1. pg_cron 확장 활성화 (이미 활성화되어 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 매일 새벽 3시(UTC, KST 12시) 30일 이상 된 로그 삭제
SELECT cron.schedule(
  'cleanup-activity-logs',
  '0 3 * * *',
  $$DELETE FROM public.activity_logs WHERE created_at < now() - interval '30 days'$$
);
    