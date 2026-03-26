-- 반품 사진 컬럼 추가
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_photo_urls text[] DEFAULT '{}';
