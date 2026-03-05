"use client";

import { useState, useRef } from "react";
import { Plus, Trash2, Upload, FileSpreadsheet } from "lucide-react";
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
  createVendor,
  deleteVendor,
  uploadVendorProducts,
} from "@/app/(main)/price-compare/actions";
import { parseVendorExcel } from "@/lib/utils/parse-vendor-excel";
import type { Vendor } from "@/lib/types/price-compare";

interface VendorManagementProps {
  vendors: (Vendor & { product_count: number })[];
}

export function VendorManagement({ vendors }: VendorManagementProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [uploadTarget, setUploadTarget] = useState<Vendor | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createVendor(newName);
      if (result.error) {
        setError(result.error);
      } else {
        setNewName("");
        setShowAddDialog(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await deleteVendor(deleteTarget.id);
      if (result.error) {
        setError(result.error);
      } else {
        setDeleteTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    setUploadStatus("파싱 중...");
    try {
      const products = await parseVendorExcel(file);
      if (products.length === 0) {
        setUploadStatus(null);
        setError("엑셀에서 제품을 찾을 수 없습니다. 제품명과 단가 컬럼이 있는지 확인해주세요.");
        return;
      }

      setUploadStatus(`${products.length}개 제품 업로드 중...`);
      const result = await uploadVendorProducts(uploadTarget.id, products);
      if (result.error) {
        setError(result.error);
      } else {
        setUploadStatus(null);
        setUploadTarget(null);
      }
    } catch {
      setError("엑셀 파일 파싱에 실패했습니다.");
    }
    setUploadStatus(null);

    // reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          등록된 업체 <Badge variant="secondary">{vendors.length}</Badge>
        </h2>
        <Button size="sm" onClick={() => { setError(null); setShowAddDialog(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          업체 추가
        </Button>
      </div>

      {vendors.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          등록된 업체가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {vendors.map((vendor) => (
              <Card key={vendor.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{vendor.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {vendor.product_count}개 제품
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setError(null);
                        setUploadTarget(vendor);
                      }}
                    >
                      <Upload className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        setError(null);
                        setDeleteTarget(vendor);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
          ))}
        </div>
      )}

      {/* 업체 추가 Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => !o && setShowAddDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>업체 추가</DialogTitle>
            <DialogDescription>새 업체를 등록합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="vendor-name">업체명</Label>
              <Input
                id="vendor-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="업체명"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button onClick={handleAdd} disabled={isSubmitting || !newName.trim()}>
              {isSubmitting ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>업체 삭제</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong>을(를) 삭제하시겠습니까?
              <br />해당 업체의 모든 제품 데이터가 함께 삭제됩니다.
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

      {/* 엑셀 업로드 Dialog */}
      <Dialog open={!!uploadTarget} onOpenChange={(o) => !o && setUploadTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>엑셀 업로드</DialogTitle>
            <DialogDescription>
              <strong>{uploadTarget?.name}</strong>의 제품 목록을 엑셀 파일로 업로드합니다.
              <br />기존 제품은 대체되며, 매핑된 통합 제품은 유지됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                xlsx, xls 파일을 선택해주세요
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!uploadStatus}
              >
                {uploadStatus || "파일 선택"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
