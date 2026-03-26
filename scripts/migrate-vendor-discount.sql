-- vendors 테이블에 할인율 컬럼 추가
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0;
