-- =============================================================
-- 품목명 별칭(item_name_aliases) 테이블 추가
-- "이 품목명은 = 이 통합제품" 학습 매핑. Supabase SQL Editor 에서 실행하세요.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.item_name_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL UNIQUE,                       -- 정규화된 품목명(소문자/공백제거)
  unified_product_id UUID NOT NULL REFERENCES public.unified_products(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_name_aliases_unified_idx
  ON public.item_name_aliases (unified_product_id);

ALTER TABLE public.item_name_aliases ENABLE ROW LEVEL SECURITY;

-- 로그인한 사용자 조회 가능 (주문 탭 드롭다운에서 사용)
CREATE POLICY "item_aliases_select_authenticated"
  ON public.item_name_aliases FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 관리자만 추가/수정/삭제
CREATE POLICY "item_aliases_insert_admin"
  ON public.item_name_aliases FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "item_aliases_update_admin"
  ON public.item_name_aliases FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "item_aliases_delete_admin"
  ON public.item_name_aliases FOR DELETE
  USING (public.is_admin());
