-- 명세서별 페이지 범위 저장 — 합본 PDF 자동분리 시 각 명세서가 같은 파일의 어느 페이지에
-- 해당하는지 기록해야 거래처원장의 vendor별 PDF 합본에 다른 vendor 페이지가 섞이지 않는다.
-- NULL이면 "전체 페이지"(단일 invoice = 한 파일 = 그 전체) 의미.
-- Supabase SQL Editor에서 실행.

alter table invoices
  add column if not exists page_start integer,
  add column if not exists page_end integer;
