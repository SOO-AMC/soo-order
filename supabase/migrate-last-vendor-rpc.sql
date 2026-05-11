-- =============================================================
-- 품목별 "가장 최근 발주 업체" 조회용 RPC + 인덱스
-- (주문 탭 업체 선택 드롭다운의 '이전 주문 업체' 바로가기)
-- Supabase SQL Editor 에서 실행하세요.
-- =============================================================

-- 발주된 적 있는 주문만 대상으로 한 부분 인덱스 (item_name별 최신순)
CREATE INDEX IF NOT EXISTS orders_dispatched_item_recent_idx
  ON public.orders (item_name, created_at DESC)
  WHERE type = 'order' AND vendor_name <> '';

CREATE OR REPLACE FUNCTION public.get_last_vendor_by_item()
RETURNS TABLE (item_name TEXT, vendor_name TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (o.item_name) o.item_name, o.vendor_name
  FROM public.orders o
  WHERE o.type = 'order' AND o.vendor_name <> ''
  ORDER BY o.item_name, o.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_last_vendor_by_item() TO authenticated;
