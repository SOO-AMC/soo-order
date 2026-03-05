-- 가격 비교 기능 DB 마이그레이션
-- Supabase SQL Editor에서 실행

-- 통합 제품 (관리자 직접 등록)
CREATE TABLE public.unified_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  mg TEXT DEFAULT '',
  tab TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 업체
CREATE TABLE public.vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 업체별 원본 제품 (엑셀에서 파싱)
CREATE TABLE public.vendor_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  manufacturer TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  unit_price INTEGER,
  ingredient TEXT DEFAULT '',
  category TEXT DEFAULT '',
  unified_product_id UUID REFERENCES public.unified_products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON public.vendors FOR ALL USING (public.is_admin());
CREATE POLICY "Admin full access" ON public.vendor_products FOR ALL USING (public.is_admin());
CREATE POLICY "Admin full access" ON public.unified_products FOR ALL USING (public.is_admin());

-- 인덱스
CREATE INDEX idx_vendor_products_vendor ON public.vendor_products(vendor_id);
CREATE INDEX idx_vendor_products_unified ON public.vendor_products(unified_product_id);

-- updated_at 트리거 (기존 update_updated_at() 함수 재사용)
CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_unified_products_updated_at BEFORE UPDATE ON public.unified_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
