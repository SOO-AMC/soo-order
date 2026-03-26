-- 검수 메모 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inspection_memo text;
