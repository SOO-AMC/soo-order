import type {
  FirebaseItem,
  FirebaseAnalyticsData,
  ReorderIntervalData,
  ItemVendorMapping,
  VendorDeliverySpeed,
} from "@/lib/types/dashboard";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_HOUR = 1000 * 60 * 60;

export function computeFirebaseAnalytics(
  items: FirebaseItem[]
): FirebaseAnalyticsData {
  const withDate = items.filter((i) => i.createdAt);
  const dates = withDate.map((i) => new Date(i.createdAt!).getTime());
  const dateRange = {
    from: new Date(Math.min(...dates)).toISOString().slice(0, 10),
    to: new Date(Math.max(...dates)).toISOString().slice(0, 10),
  };

  return {
    totalItems: items.length,
    dateRange,
    reorderIntervals: computeReorderIntervals(withDate),
    itemVendorMappings: computeItemVendorMappings(items),
    vendorDeliverySpeeds: computeVendorDeliverySpeeds(items),
  };
}

// 1. 품목 주문 주기 분석
function computeReorderIntervals(
  items: FirebaseItem[]
): ReorderIntervalData[] {
  const now = Date.now();
  const byName = new Map<string, string[]>();

  for (const item of items) {
    if (!item.createdAt) continue;
    const list = byName.get(item.name) ?? [];
    list.push(item.createdAt);
    byName.set(item.name, list);
  }

  const results: ReorderIntervalData[] = [];

  for (const [name, dates] of byName) {
    if (dates.length < 3) continue;

    const sorted = dates.map((d) => new Date(d).getTime()).sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push((sorted[i] - sorted[i - 1]) / MS_PER_DAY);
    }

    const avgDays = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const lastOrderDate = new Date(sorted[sorted.length - 1]).toISOString();
    const daysSinceLastOrder = Math.floor(
      (now - sorted[sorted.length - 1]) / MS_PER_DAY
    );

    results.push({
      name,
      avgDays: Math.round(avgDays * 10) / 10,
      orderCount: dates.length,
      lastOrderDate,
      daysSinceLastOrder,
    });
  }

  return results
    .sort((a, b) => {
      const aOverdue = a.daysSinceLastOrder > a.avgDays * 1.2 ? 1 : 0;
      const bOverdue = b.daysSinceLastOrder > b.avgDays * 1.2 ? 1 : 0;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;
      return b.orderCount - a.orderCount;
    })
    .slice(0, 50);
}

// 2. 품목-업체 매핑
function computeItemVendorMappings(items: FirebaseItem[]): ItemVendorMapping[] {
  const byName = new Map<string, Map<string, number>>();

  for (const item of items) {
    if (!item.companyNm) continue;
    const vendorMap = byName.get(item.name) ?? new Map<string, number>();
    vendorMap.set(item.companyNm, (vendorMap.get(item.companyNm) ?? 0) + 1);
    byName.set(item.name, vendorMap);
  }

  const results: ItemVendorMapping[] = [];

  for (const [name, vendorMap] of byName) {
    const vendors = [...vendorMap.entries()]
      .map(([vendor, count]) => ({ vendor, count }))
      .sort((a, b) => b.count - a.count);
    const totalOrders = vendors.reduce((sum, v) => sum + v.count, 0);
    results.push({ name, vendors, totalOrders });
  }

  return results
    .sort((a, b) => {
      if (b.vendors.length !== a.vendors.length)
        return b.vendors.length - a.vendors.length;
      return b.totalOrders - a.totalOrders;
    })
    .slice(0, 100);
}

// 3. 업체별 납품 속도
function computeVendorDeliverySpeeds(
  items: FirebaseItem[]
): VendorDeliverySpeed[] {
  const byVendor = new Map<string, number[]>();

  for (const item of items) {
    if (!item.companyNm || !item.orderAt || !item.recievedAt) continue;
    const hours =
      (new Date(item.recievedAt).getTime() -
        new Date(item.orderAt).getTime()) /
      MS_PER_HOUR;
    if (hours < 0 || hours > 720) continue;

    const list = byVendor.get(item.companyNm) ?? [];
    list.push(hours);
    byVendor.set(item.companyNm, list);
  }

  const results: VendorDeliverySpeed[] = [];

  for (const [vendor, hours] of byVendor) {
    if (hours.length < 3) continue;
    const sorted = [...hours].sort((a, b) => a - b);
    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    results.push({
      vendor,
      avgHours: Math.round(avg * 10) / 10,
      medianHours: Math.round(median * 10) / 10,
      count: hours.length,
    });
  }

  return results.sort((a, b) => a.medianHours - b.medianHours);
}
