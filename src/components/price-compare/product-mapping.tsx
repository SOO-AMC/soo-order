"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Link2, Unlink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createUnifiedProduct,
  updateUnifiedProduct,
  deleteUnifiedProduct,
  mapProduct,
  unmapProduct,
} from "@/app/(main)/price-compare/actions";
import type {
  Vendor,
  VendorProduct,
  UnifiedProduct,
} from "@/lib/types/price-compare";

interface ProductMappingProps {
  vendors: Vendor[];
  vendorProducts: VendorProduct[];
  unifiedProducts: UnifiedProduct[];
}

export function ProductMapping({
  vendors,
  vendorProducts,
  unifiedProducts,
}: ProductMappingProps) {
  const [selectedProduct, setSelectedProduct] = useState<UnifiedProduct | null>(null);
  const [dialogType, setDialogType] = useState<"create" | "edit" | "delete" | null>(null);
  const [formName, setFormName] = useState("");
  const [formMg, setFormMg] = useState("");
  const [formTab, setFormTab] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mappingSearch, setMappingSearch] = useState("");

  // Vendor lookup map
  const vendorMap = useMemo(() => {
    const map = new Map<string, Vendor>();
    for (const v of vendors) map.set(v.id, v);
    return map;
  }, [vendors]);

  // Index: unified_product_id → VendorProduct[]
  const productsByUnified = useMemo(() => {
    const map = new Map<string, VendorProduct[]>();
    for (const vp of vendorProducts) {
      if (!vp.unified_product_id) continue;
      const list = map.get(vp.unified_product_id);
      if (list) list.push(vp);
      else map.set(vp.unified_product_id, [vp]);
    }
    return map;
  }, [vendorProducts]);

  // Unmapped products (memoized)
  const unmappedProducts = useMemo(
    () => vendorProducts.filter((p) => !p.unified_product_id),
    [vendorProducts]
  );

  const openCreate = () => {
    setFormName("");
    setFormMg("");
    setFormTab("");
    setFormNotes("");
    setError(null);
    setDialogType("create");
  };

  const openEdit = (p: UnifiedProduct) => {
    setSelectedProduct(p);
    setFormName(p.name);
    setFormMg(p.mg);
    setFormTab(p.tab);
    setFormNotes(p.notes);
    setError(null);
    setDialogType("edit");
  };

  const openDelete = (p: UnifiedProduct) => {
    setSelectedProduct(p);
    setError(null);
    setDialogType("delete");
  };

  const closeDialog = () => {
    setDialogType(null);
    setSelectedProduct(null);
  };

  const handleCreate = async () => {
    setIsSubmitting(true);
    try {
      const result = await createUnifiedProduct(formName, formMg, formTab, formNotes);
      if (result.error) {
        setError(result.error);
      } else {
        closeDialog();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const result = await updateUnifiedProduct(selectedProduct.id, formName, formMg, formTab, formNotes);
      if (result.error) {
        setError(result.error);
      } else {
        closeDialog();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      const result = await deleteUnifiedProduct(selectedProduct.id);
      if (result.error) {
        setError(result.error);
      } else {
        closeDialog();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMap = async (vendorProductId: string, unifiedProductId: string) => {
    await mapProduct(vendorProductId, unifiedProductId);
  };

  const handleUnmap = async (vendorProductId: string) => {
    await unmapProduct(vendorProductId);
  };

  const filteredUnified = useMemo(() => {
    if (!searchQuery) return unifiedProducts;
    const q = searchQuery.toLowerCase();
    return unifiedProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [unifiedProducts, searchQuery]);

  const filteredUnmapped = useMemo(() => {
    if (!mappingSearch) return unmappedProducts;
    const q = mappingSearch.toLowerCase();
    return unmappedProducts.filter((p) => p.product_name.toLowerCase().includes(q));
  }, [unmappedProducts, mappingSearch]);

  return (
    <div className="space-y-4">
      {/* 통합 제품 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          통합 제품 <Badge variant="secondary">{unifiedProducts.length}</Badge>
        </h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          제품 추가
        </Button>
      </div>

      {/* 통합 제품 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="통합 제품 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-card"
        />
      </div>

      {/* 통합 제품 리스트 */}
      {filteredUnified.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {unifiedProducts.length === 0 ? "등록된 통합 제품이 없습니다." : "검색 결과가 없습니다."}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredUnified.map((product) => {
            const mapped = productsByUnified.get(product.id) ?? [];
            return (
              <Card key={product.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{product.name}</span>
                      {product.mg && (
                        <Badge variant="outline" className="text-xs">{product.mg}</Badge>
                      )}
                      {product.tab && (
                        <Badge variant="outline" className="text-xs">{product.tab}</Badge>
                      )}
                      {product.notes && (
                        <span className="text-xs text-muted-foreground">({product.notes})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => openDelete(product)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* 매핑된 업체 제품 */}
                  {mapped.length > 0 && (
                    <div className="space-y-1 pl-2 border-l-2 border-primary/20">
                      {mapped.map((vp) => (
                        <div
                          key={vp.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {vendorMap.get(vp.vendor_id)?.name ?? "?"}
                            </Badge>
                            <span className="text-muted-foreground">{vp.product_name}</span>
                            {vp.unit_price != null && (
                              <span className="font-medium">
                                {vp.unit_price.toLocaleString()}원
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleUnmap(vp.id)}
                          >
                            <Unlink className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 매핑 추가: 미매핑 제품 검색 */}
                  <MappingAdder
                    unifiedProductId={product.id}
                    unmappedProducts={unmappedProducts}
                    vendorMap={vendorMap}
                    onMap={handleMap}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 미매핑 제품 섹션 */}
      <div className="pt-4 border-t">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          미매핑 업체 제품 <Badge variant="secondary">{unmappedProducts.length}</Badge>
        </h2>
        {unmappedProducts.length > 0 && (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="미매핑 제품 검색..."
                value={mappingSearch}
                onChange={(e) => setMappingSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {filteredUnmapped.slice(0, 50).map((vp) => (
                <div
                  key={vp.id}
                  className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-accent/50"
                >
                  <Badge variant="outline" className="text-xs shrink-0">
                    {vendorMap.get(vp.vendor_id)?.name ?? "?"}
                  </Badge>
                  <span className="truncate">{vp.product_name}</span>
                  {vp.unit_price != null && (
                    <span className="text-muted-foreground shrink-0">
                      {vp.unit_price.toLocaleString()}원
                    </span>
                  )}
                </div>
              ))}
              {filteredUnmapped.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  외 {filteredUnmapped.length - 50}개...
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* 생성/수정 Dialog */}
      <Dialog
        open={dialogType === "create" || dialogType === "edit"}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogType === "create" ? "통합 제품 추가" : "통합 제품 수정"}
            </DialogTitle>
            <DialogDescription>
              {dialogType === "create"
                ? "가격 비교에 사용할 통합 제품을 등록합니다."
                : "통합 제품 정보를 수정합니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="unified-name">제품명</Label>
              <Input
                id="unified-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="예: 타이레놀"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="unified-mg">mg (용량)</Label>
                <Input
                  id="unified-mg"
                  value={formMg}
                  onChange={(e) => setFormMg(e.target.value)}
                  placeholder="예: 500mg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unified-tab">T (정수)</Label>
                <Input
                  id="unified-tab"
                  value={formTab}
                  onChange={(e) => setFormTab(e.target.value)}
                  placeholder="예: 100T"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unified-notes">비고</Label>
              <Input
                id="unified-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="예: 대체약품, 단종 등"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button
              onClick={dialogType === "create" ? handleCreate : handleUpdate}
              disabled={isSubmitting || !formName.trim()}
            >
              {isSubmitting
                ? dialogType === "create"
                  ? "추가 중..."
                  : "수정 중..."
                : dialogType === "create"
                  ? "추가"
                  : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 Dialog */}
      <Dialog
        open={dialogType === "delete"}
        onOpenChange={(o) => !o && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>통합 제품 삭제</DialogTitle>
            <DialogDescription>
              <strong>{selectedProduct?.name}</strong>을(를) 삭제하시겠습니까?
              <br />매핑된 업체 제품의 연결이 해제됩니다.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 인라인 매핑 추가 컴포넌트
function MappingAdder({
  unifiedProductId,
  unmappedProducts,
  vendorMap,
  onMap,
}: {
  unifiedProductId: string;
  unmappedProducts: VendorProduct[];
  vendorMap: Map<string, Vendor>;
  onMap: (vendorProductId: string, unifiedProductId: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return unmappedProducts;
    const q = search.toLowerCase();
    return unmappedProducts.filter((p) => p.product_name.toLowerCase().includes(q));
  }, [unmappedProducts, search]);

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground"
        onClick={() => setIsOpen(true)}
      >
        <Link2 className="h-3 w-3 mr-1" />
        업체 제품 연결
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <Input
        placeholder="업체 제품 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
        autoFocus
      />
      <div className="max-h-32 overflow-y-auto space-y-1">
        {filtered.slice(0, 20).map((vp) => (
          <button
            key={vp.id}
            type="button"
            className="flex items-center gap-2 text-xs w-full py-1 px-2 rounded hover:bg-accent/50 text-left"
            onClick={async () => {
              await onMap(vp.id, unifiedProductId);
              setSearch("");
              setIsOpen(false);
            }}
          >
            <Badge variant="outline" className="text-[10px] shrink-0">
              {vendorMap.get(vp.vendor_id)?.name ?? "?"}
            </Badge>
            <span className="truncate">{vp.product_name}</span>
            {vp.unit_price != null && (
              <span className="text-muted-foreground shrink-0 ml-auto">
                {vp.unit_price.toLocaleString()}원
              </span>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {unmappedProducts.length === 0 ? "미매핑 제품 없음" : "검색 결과 없음"}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs w-full"
        onClick={() => setIsOpen(false)}
      >
        닫기
      </Button>
    </div>
  );
}
