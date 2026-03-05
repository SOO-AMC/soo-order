/**
 * 가격 비교 테스트용 샘플 데이터 시드 스크립트
 *
 * 사용법: pnpm tsx scripts/seed-price-compare.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  console.log("🌱 가격 비교 샘플 데이터 시드 시작...\n");

  // 1. 업체 생성
  const vendorNames = ["VS팜", "메디팜", "삼성팜"];
  const vendors: { id: string; name: string }[] = [];

  for (const name of vendorNames) {
    const { data, error } = await supabase
      .from("vendors")
      .upsert({ name }, { onConflict: "name" })
      .select("id, name")
      .single();

    if (error) {
      console.error(`❌ 업체 "${name}" 생성 실패:`, error.message);
      return;
    }
    vendors.push(data);
    console.log(`✅ 업체: ${name} (${data.id})`);
  }

  // 2. 통합 제품 생성
  const unifiedItems = [
    { name: "타이레놀", mg: "500mg", tab: "100T" },
    { name: "아목시실린", mg: "250mg", tab: "100C" },
    { name: "세파클러", mg: "250mg", tab: "20T" },
    { name: "덱사메타손", mg: "0.5mg", tab: "100T" },
    { name: "프레드니솔론", mg: "5mg", tab: "100T" },
    { name: "엔로플록사신", mg: "50mg", tab: "100T" },
    { name: "메트로니다졸", mg: "250mg", tab: "100T" },
    { name: "트라마돌", mg: "50mg", tab: "100T" },
  ];

  const unifiedProducts: { id: string; name: string }[] = [];

  for (let i = 0; i < unifiedItems.length; i++) {
    const item = unifiedItems[i];
    const { data, error } = await supabase
      .from("unified_products")
      .insert({ ...item, sort_order: i + 1 })
      .select("id, name")
      .single();

    if (error) {
      console.error(`❌ 통합 제품 "${item.name}" 생성 실패:`, error.message);
      return;
    }
    unifiedProducts.push(data);
    console.log(`✅ 통합 제품: ${item.name} ${item.mg} ${item.tab}`);
  }

  // 3. 업체별 제품 + 매핑
  const vendorProductsData: {
    vendorIdx: number;
    unifiedIdx: number;
    product_name: string;
    manufacturer: string;
    unit_price: number;
    spec: string;
    category: string;
  }[] = [
    // VS팜
    { vendorIdx: 0, unifiedIdx: 0, product_name: "타이레놀정 500mg", manufacturer: "한국존슨앤드존슨", unit_price: 45, spec: "500mg x 100T", category: "진통제" },
    { vendorIdx: 0, unifiedIdx: 1, product_name: "아목시실린캡슐 250mg", manufacturer: "종근당", unit_price: 62, spec: "250mg x 100C", category: "항생제" },
    { vendorIdx: 0, unifiedIdx: 2, product_name: "세파클러캡슐 250mg", manufacturer: "대웅제약", unit_price: 185, spec: "250mg x 20C", category: "항생제" },
    { vendorIdx: 0, unifiedIdx: 3, product_name: "덱사메타손정 0.5mg", manufacturer: "일동제약", unit_price: 28, spec: "0.5mg x 100T", category: "스테로이드" },
    { vendorIdx: 0, unifiedIdx: 4, product_name: "프레드니솔론정 5mg", manufacturer: "유한양행", unit_price: 35, spec: "5mg x 100T", category: "스테로이드" },
    { vendorIdx: 0, unifiedIdx: 5, product_name: "엔로플록사신정 50mg", manufacturer: "바이엘", unit_price: 120, spec: "50mg x 100T", category: "항생제" },
    { vendorIdx: 0, unifiedIdx: 6, product_name: "메트로니다졸정 250mg", manufacturer: "삼진제약", unit_price: 22, spec: "250mg x 100T", category: "항생제" },
    { vendorIdx: 0, unifiedIdx: 7, product_name: "트라마돌캡슐 50mg", manufacturer: "한림제약", unit_price: 55, spec: "50mg x 100C", category: "진통제" },

    // 메디팜
    { vendorIdx: 1, unifiedIdx: 0, product_name: "타이레놀 500mg 100정", manufacturer: "한국존슨앤드존슨", unit_price: 42, spec: "100T", category: "해열진통제" },
    { vendorIdx: 1, unifiedIdx: 1, product_name: "아목시실린 250mg 캡슐", manufacturer: "종근당", unit_price: 58, spec: "100C", category: "항생제" },
    { vendorIdx: 1, unifiedIdx: 2, product_name: "세파클러 250mg", manufacturer: "대웅제약", unit_price: 195, spec: "20T", category: "항생제" },
    { vendorIdx: 1, unifiedIdx: 3, product_name: "덱사메타손 0.5mg 100정", manufacturer: "일동제약", unit_price: 32, spec: "100T", category: "호르몬제" },
    { vendorIdx: 1, unifiedIdx: 4, product_name: "프레드니솔론 5mg 100정", manufacturer: "유한양행", unit_price: 30, spec: "100T", category: "호르몬제" },
    { vendorIdx: 1, unifiedIdx: 5, product_name: "엔로플록사신 50mg 정", manufacturer: "바이엘", unit_price: 115, spec: "100T", category: "항생제" },
    { vendorIdx: 1, unifiedIdx: 7, product_name: "트라마돌HCl 50mg", manufacturer: "한림제약", unit_price: 60, spec: "100C", category: "진통제" },

    // 삼성팜
    { vendorIdx: 2, unifiedIdx: 0, product_name: "타이레놀정500밀리", manufacturer: "존슨앤드존슨", unit_price: 48, spec: "500mg/100T", category: "소염진통" },
    { vendorIdx: 2, unifiedIdx: 1, product_name: "아목시실린Cap250", manufacturer: "종근당", unit_price: 65, spec: "250mg/100C", category: "항균제" },
    { vendorIdx: 2, unifiedIdx: 3, product_name: "덱사메타손Tab0.5", manufacturer: "일동", unit_price: 25, spec: "0.5mg/100T", category: "부신피질" },
    { vendorIdx: 2, unifiedIdx: 5, product_name: "엔로플록사신Tab50", manufacturer: "바이엘코리아", unit_price: 125, spec: "50mg/100T", category: "항균제" },
    { vendorIdx: 2, unifiedIdx: 6, product_name: "메트로니다졸Tab250", manufacturer: "삼진", unit_price: 18, spec: "250mg/100T", category: "항균제" },
    { vendorIdx: 2, unifiedIdx: 7, product_name: "트라마돌Cap50", manufacturer: "한림", unit_price: 52, spec: "50mg/100C", category: "진통제" },
  ];

  const rows = vendorProductsData.map((p) => ({
    vendor_id: vendors[p.vendorIdx].id,
    unified_product_id: unifiedProducts[p.unifiedIdx].id,
    product_name: p.product_name,
    manufacturer: p.manufacturer,
    unit_price: p.unit_price,
    spec: p.spec,
    category: p.category,
  }));

  const { error: insertError } = await supabase
    .from("vendor_products")
    .insert(rows);

  if (insertError) {
    console.error("❌ 업체 제품 생성 실패:", insertError.message);
    return;
  }

  console.log(`\n✅ 업체 제품 ${rows.length}개 생성 완료`);
  console.log("\n🎉 시드 완료!");
  console.log(`   - 업체: ${vendors.length}개`);
  console.log(`   - 통합 제품: ${unifiedProducts.length}개`);
  console.log(`   - 업체 제품: ${rows.length}개 (매핑 포함)`);
}

seed().catch(console.error);
