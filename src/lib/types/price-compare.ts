export interface Vendor {
  id: string;
  name: string;
  discount_rate: number;
  created_at: string;
  updated_at: string;
}

export interface VendorProduct {
  id: string;
  vendor_id: string;
  product_name: string;
  manufacturer: string;
  spec: string;
  unit_price: number | null;
  ingredient: string;
  category: string;
  unified_product_id: string | null;
  created_at: string;
}

export interface UnifiedProduct {
  id: string;
  name: string;
  mg: string;
  tab: string;
  notes: string;
  remarks: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VendorProductRow {
  product_name: string;
  manufacturer: string;
  spec: string;
  unit_price: number | null;
  ingredient: string;
  category: string;
}

export interface ItemNameAlias {
  id: string;
  item_name: string;            // 정규화된 품목명 (normalizeItemName)
  unified_product_id: string;
  created_by: string | null;
  created_at: string;
}
