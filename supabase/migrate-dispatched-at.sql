-- =============================================================
-- orders.dispatched_at 컬럼 추가 (발주 시각 — 처리 시간 인사이트/오래된 항목 알림용)
-- Supabase SQL Editor 에서 실행하세요. (추가만 하는 마이그레이션, 안전)
-- =============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- 기존에 이미 발주된(검수대기 이후) 주문은 updated_at으로 근사 보정 (한 번만)
UPDATE public.orders
  SET dispatched_at = updated_at
  WHERE dispatched_at IS NULL
    AND type = 'order'
    AND status IN ('ordered', 'inspecting', 'out_of_stock', 'return_requested', 'return_pending', 'return_completed');
