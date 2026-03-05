/**
 * Firebase Items 컬렉션 상세 분석
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

const FIREBASE_KEY_PATH = path.resolve(process.cwd(), "firebase-key.json");
const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, "utf-8"));
initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore();

async function main() {
  const snapshot = await firestore.collection("Items").get();
  console.log(`\n총 문서 수: ${snapshot.size}\n`);

  const items = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      type: d.type as string,
      name: d.name as string,
      createdAt: d.createdAt?.toDate?.() as Date | undefined,
      requester: d.requester as string,
      requestQty: d.requestQty as string,
      companyNm: d.companyNm as string | undefined,
      orderer: d.orderer as string | undefined,
      orderAt: d.orderAt?.toDate?.() as Date | undefined,
      recievedAt: d.recievedAt?.toDate?.() as Date | undefined,
      confirmQty: d.confirmQty as string | undefined,
      inspector: d.inspector as string | undefined,
      progress: d.progress as number | undefined,
      hasTS: d.hasTS as boolean | undefined,
      lastEditer: d.lastEditer as string | undefined,
    };
  });

  // 1. 날짜 범위
  const dates = items.filter(i => i.createdAt).map(i => i.createdAt!.getTime());
  console.log(`=== 데이터 기간 ===`);
  console.log(`  최초: ${new Date(Math.min(...dates)).toISOString().slice(0, 10)}`);
  console.log(`  최근: ${new Date(Math.max(...dates)).toISOString().slice(0, 10)}`);

  // 2. type 분포
  const typeCounts = new Map<string, number>();
  items.forEach(i => typeCounts.set(i.type, (typeCounts.get(i.type) ?? 0) + 1));
  console.log(`\n=== 유형별 분포 ===`);
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}건`);
  }

  // 3. progress(상태) 분포
  const progressCounts = new Map<number | string, number>();
  items.forEach(i => {
    const key = i.progress ?? "없음";
    progressCounts.set(key, (progressCounts.get(key) ?? 0) + 1);
  });
  console.log(`\n=== progress(상태) 분포 ===`);
  for (const [prog, count] of [...progressCounts.entries()].sort()) {
    console.log(`  ${prog}: ${count}건`);
  }

  // 4. 품목명 TOP 20
  const nameCounts = new Map<string, number>();
  items.forEach(i => nameCounts.set(i.name, (nameCounts.get(i.name) ?? 0) + 1));
  console.log(`\n=== 품목명 TOP 20 (총 ${nameCounts.size}개 고유 품목) ===`);
  [...nameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count], idx) => console.log(`  ${idx + 1}. ${name}: ${count}건`));

  // 5. 업체 분포
  const companyCounts = new Map<string, number>();
  items.filter(i => i.companyNm).forEach(i => companyCounts.set(i.companyNm!, (companyCounts.get(i.companyNm!) ?? 0) + 1));
  console.log(`\n=== 업체별 분포 TOP 15 (총 ${companyCounts.size}개) ===`);
  [...companyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([name, count], idx) => console.log(`  ${idx + 1}. ${name}: ${count}건`));

  // 6. 요청자 분포
  const requesterCounts = new Map<string, number>();
  items.forEach(i => requesterCounts.set(i.requester, (requesterCounts.get(i.requester) ?? 0) + 1));
  console.log(`\n=== 요청자별 분포 ===`);
  [...requesterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}건`));

  // 7. 발주자 분포
  const ordererCounts = new Map<string, number>();
  items.filter(i => i.orderer).forEach(i => ordererCounts.set(i.orderer!, (ordererCounts.get(i.orderer!) ?? 0) + 1));
  console.log(`\n=== 발주자별 분포 ===`);
  [...ordererCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}건`));

  // 8. 검수자 분포
  const inspectorCounts = new Map<string, number>();
  items.filter(i => i.inspector).forEach(i => inspectorCounts.set(i.inspector!, (inspectorCounts.get(i.inspector!) ?? 0) + 1));
  console.log(`\n=== 검수자별 분포 ===`);
  [...inspectorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`  ${name}: ${count}건`));

  // 9. 거래명세서 수령 분포
  const hasTSCounts = { true: 0, false: 0, undefined: 0 };
  items.forEach(i => {
    if (i.hasTS === true) hasTSCounts.true++;
    else if (i.hasTS === false) hasTSCounts.false++;
    else hasTSCounts.undefined++;
  });
  console.log(`\n=== 거래명세서 수령 (hasTS) ===`);
  console.log(`  수령: ${hasTSCounts.true}건`);
  console.log(`  미수령: ${hasTSCounts.false}건`);
  console.log(`  미입력: ${hasTSCounts.undefined}건`);

  // 10. 월별 추이
  const monthlyMap = new Map<string, number>();
  items.filter(i => i.createdAt).forEach(i => {
    const month = i.createdAt!.toISOString().slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + 1);
  });
  console.log(`\n=== 월별 주문 추이 ===`);
  [...monthlyMap.entries()]
    .sort()
    .forEach(([month, count]) => console.log(`  ${month}: ${count}건 ${"█".repeat(Math.ceil(count / 5))}`));

  // 11. 처리 속도 (createdAt → recievedAt)
  const durations = items
    .filter(i => i.createdAt && i.recievedAt)
    .map(i => (i.recievedAt!.getTime() - i.createdAt!.getTime()) / (1000 * 60 * 60));
  if (durations.length > 0) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const sorted = [...durations].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    console.log(`\n=== 처리 속도 (요청→검수, ${durations.length}건) ===`);
    console.log(`  평균: ${avg.toFixed(1)}시간 (${(avg / 24).toFixed(1)}일)`);
    console.log(`  중앙값: ${med.toFixed(1)}시간 (${(med / 24).toFixed(1)}일)`);
    console.log(`  최소: ${min.toFixed(1)}시간`);
    console.log(`  최대: ${max.toFixed(1)}시간 (${(max / 24).toFixed(1)}일)`);
  }

  // 12. 요일별 분포
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const dayCounts = new Array(7).fill(0);
  items.filter(i => i.createdAt).forEach(i => {
    // KST로 변환
    const kst = new Date(i.createdAt!.getTime() + 9 * 60 * 60 * 1000);
    dayCounts[kst.getUTCDay()]++;
  });
  console.log(`\n=== 요일별 주문 분포 (KST) ===`);
  dayCounts.forEach((count, idx) => console.log(`  ${dayNames[idx]}요일: ${count}건 ${"█".repeat(Math.ceil(count / 3))}`));

  // 13. 시간대별 분포
  const hourCounts = new Array(24).fill(0);
  items.filter(i => i.createdAt).forEach(i => {
    const kst = new Date(i.createdAt!.getTime() + 9 * 60 * 60 * 1000);
    hourCounts[kst.getUTCHours()]++;
  });
  console.log(`\n=== 시간대별 주문 분포 (KST) ===`);
  hourCounts.forEach((count, idx) => {
    if (count > 0) console.log(`  ${String(idx).padStart(2, "0")}시: ${count}건 ${"█".repeat(Math.ceil(count / 2))}`);
  });

  // 14. 품목-업체 매핑 (같은 품목이 여러 업체에서 주문된 경우)
  const itemVendorMap = new Map<string, Set<string>>();
  items.filter(i => i.companyNm).forEach(i => {
    if (!itemVendorMap.has(i.name)) itemVendorMap.set(i.name, new Set());
    itemVendorMap.get(i.name)!.add(i.companyNm!);
  });
  const multiVendorItems = [...itemVendorMap.entries()].filter(([, vendors]) => vendors.size > 1);
  console.log(`\n=== 복수 업체 주문 품목 (${multiVendorItems.length}개) ===`);
  multiVendorItems
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 15)
    .forEach(([name, vendors]) => console.log(`  ${name}: ${[...vendors].join(", ")}`));
}

main().catch(console.error);
