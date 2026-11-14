import type { ComponentType } from "react";
import {
  Package,
  PackageX,
  Undo2,
  ClipboardCheck,
  Search,
  Droplets,
  Scale,
  Users,
  BarChart3,
  ScanLine,
  BookText,
  TrendingUp,
  LayoutDashboard,
  Inbox,
} from "lucide-react";

/** 앱 메뉴 구성. 사이드바와 빠른 실행(Ctrl K)이 같이 쓴다. 인사(연차·근무표)는 앱에서 빠짐. */
export type CountKey = "orders" | "outOfStock" | "returns" | "inspection" | "blood";
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  countKey?: CountKey;
};
export type NavGroup = { label?: string; items: NavItem[]; adminOnly?: boolean };

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "내 주문 현황", icon: BarChart3 }] },
  {
    label: "약품",
    items: [
      { href: "/orders", label: "주문", icon: Package, countKey: "orders" },
      { href: "/out-of-stock", label: "품절", icon: PackageX, countKey: "outOfStock" },
      { href: "/returns", label: "반품", icon: Undo2, countKey: "returns" },
      { href: "/inspection", label: "검수", icon: ClipboardCheck, countKey: "inspection" },
      { href: "/search", label: "조회", icon: Search },
      { href: "/blood", label: "혈액 대장", icon: Droplets, countKey: "blood" },
    ],
  },
  {
    label: "관리자",
    adminOnly: true,
    items: [
      { href: "/todo", label: "처리할 일", icon: Inbox },
      { href: "/dashboard/admin", label: "대시보드", icon: LayoutDashboard },
      { href: "/invoice-scan", label: "명세서 스캔", icon: ScanLine },
      { href: "/price-compare", label: "가격 비교", icon: Scale },
      { href: "/vendor-ledger", label: "거래처원장", icon: BookText },
      { href: "/price-analysis", label: "단가 분석", icon: TrendingUp },
      { href: "/members", label: "직원 관리", icon: Users },
    ],
  },
];
