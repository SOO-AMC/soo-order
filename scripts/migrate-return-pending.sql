-- return_pending 상태 추가 (반품신청 → 반품대기 → 반품완료 플로우)
-- status 컬럼이 CHECK 제약을 가진 경우 아래 실행
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'ordered', 'inspecting', 'return_requested', 'return_pending', 'return_completed', 'out_of_stock'));
