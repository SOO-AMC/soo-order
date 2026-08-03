-- =============================================================
-- 거래명세서 OCR (invoices / invoice_items) + 부분입고 추적
-- Supabase SQL Editor 에서 실행하세요. (몇 번을 실행해도 안전 — idempotent)
-- =============================================================

-- 1. invoices: 거래명세서 헤더 (스캔 1건 = 1 invoice)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES public.vendors(id),       -- 매칭된 업체(없을 수 있음)
  vendor_name TEXT NOT NULL DEFAULT '',                -- 명세서에서 읽은 공급자명
  invoice_date DATE,                                   -- 거래일자
  image_urls TEXT[] NOT NULL DEFAULT '{}',             -- Storage 경로(원본 PDF/이미지)
  total_amount NUMERIC NOT NULL DEFAULT 0,             -- 합계(할인후 환산 기준)
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_vendor_date_idx
  ON public.invoices (vendor_id, invoice_date DESC);

-- 2. invoice_items: 명세서 라인 (거래처원장의 원천 데이터)
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  list_price NUMERIC NOT NULL DEFAULT 0,               -- 할인전 정가(명세서 단가)
  unit_price NUMERIC NOT NULL DEFAULT 0,               -- 할인후 환산 단가
  amount NUMERIC NOT NULL DEFAULT 0,                   -- quantity * unit_price
  matched_order_id UUID REFERENCES public.orders(id),  -- 매칭된 검수대기 주문(대표)
  unified_product_id UUID REFERENCES public.unified_products(id),
  is_new_product BOOLEAN NOT NULL DEFAULT false,       -- 단가표에 없던 신규 품목
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx
  ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_items_order_idx
  ON public.invoice_items (matched_order_id);

-- 3. orders 부분입고 추적 (누적 입고 수량)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER NOT NULL DEFAULT 0;

-- 4. vendors: 가격비교 표시 여부 (기존 업체 = true, 명세서로 자동등록되는 신규 업체 = false)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS show_in_compare BOOLEAN NOT NULL DEFAULT true;

-- =============================================================
-- RLS (관리자 전용 기능)
-- =============================================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_admin_all" ON public.invoices;
CREATE POLICY "invoices_admin_all"
  ON public.invoices FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "invoice_items_admin_all" ON public.invoice_items;
CREATE POLICY "invoice_items_admin_all"
  ON public.invoice_items FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================
-- Storage: 명세서 원본 보관 버킷
-- =============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "invoices_storage_select_admin" ON storage.objects;
CREATE POLICY "invoices_storage_select_admin"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND public.is_admin());

DROP POLICY IF EXISTS "invoices_storage_insert_admin" ON storage.objects;
CREATE POLICY "invoices_storage_insert_admin"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND public.is_admin());

DROP POLICY IF EXISTS "invoices_storage_delete_admin" ON storage.objects;
CREATE POLICY "invoices_storage_delete_admin"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoices' AND public.is_admin());
