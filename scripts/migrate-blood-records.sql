-- 혈액 대장 (Blood Ledger) 테이블
CREATE TABLE blood_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('received', 'sent')),
  record_date DATE NOT NULL,
  hospital_name TEXT NOT NULL,
  animal_type TEXT NOT NULL CHECK (animal_type IN ('dog', 'cat')),
  blood_type TEXT NOT NULL,
  volume_ml INTEGER NOT NULL,
  collection_date DATE NOT NULL,
  receiver TEXT,
  shipper TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  settlement_type TEXT CHECK (settlement_type IN ('invoice', 'transfer')),
  confirmed_by UUID REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT DEFAULT ''
);

-- RLS
ALTER TABLE blood_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "모든 인증 사용자 읽기" ON blood_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "인증 사용자 생성" ON blood_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "본인 또는 관리자 수정" ON blood_records
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_admin());

CREATE POLICY "관리자 삭제" ON blood_records
  FOR DELETE TO authenticated USING (is_admin());
