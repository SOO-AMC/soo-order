"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, FileDown, Database, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { parsePriceExcel, type ParsedPriceExcel } from "@/lib/utils/parse-price-excel";
import { uploadPriceExcel } from "@/app/(main)/price-compare/actions";
import { fetchPriceCompareData } from "@/lib/actions/price-compare-action";

interface ExcelUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ExistingDataSummary {
  productCount: number;
  vendorCount: number;
  vendorNames: string[];
}

interface ComparisonSummary {
  existing: ExistingDataSummary;
  uploaded: { productCount: number; vendorCount: number; vendorNames: string[] };
  newVendors: string[];
  overlappingProducts: number;
}

type Step = "upload" | "parsing" | "compare" | "uploading";

export function ExcelUploadDialog({ open, onClose, onSuccess }: ExcelUploadDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedPriceExcel | null>(null);
  const [comparison, setComparison] = useState<ComparisonSummary | null>(null);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("upload");
    setParsed(null);
    setComparison(null);
    setError("");
    setIsDragOver(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTemplateDownload = async () => {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("가격비교");

    const headerBg = "FF2563EB";
    const headerFont = "FFFFFFFF";
    const borderColor = "FF1D4ED8";
    const guideBg = "FFF8FAFC";
    const guideFont = "FF94A3B8";

    const headers = ["구분", "제품명", "수량", "비고", "업체1", "업체2", "업체3"];

    // 헤더 행
    const headerRow = sheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10, color: { argb: headerFont } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerBg } };
      cell.alignment = { vertical: "middle", horizontal: colNumber >= 5 ? "right" : "center" };
      cell.border = {
        top: { style: "thin" as const, color: { argb: borderColor } },
        bottom: { style: "medium" as const, color: { argb: borderColor } },
        left: { style: "thin" as const, color: { argb: borderColor } },
        right: { style: "thin" as const, color: { argb: borderColor } },
      };
    });

    // 안내 행 (예시 데이터)
    const guideRow = sheet.addRow(["약품", "예시 제품명", "100T", "", 1500, 1400, 1600]);
    guideRow.height = 22;
    guideRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { size: 10, italic: true, color: { argb: guideFont } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: guideBg } };
      cell.alignment = { vertical: "middle", horizontal: colNumber >= 5 ? "right" : colNumber === 1 ? "center" : "left" };
      if (colNumber >= 5 && typeof cell.value === "number") {
        cell.numFmt = "#,##0";
      }
    });

    // 열 너비
    const widths = [8, 20, 10, 12, 14, 14, 14];
    sheet.columns.forEach((col, idx) => {
      col.width = widths[idx] ?? 14;
    });

    // 틀 고정
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "단가비교_양식.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.xlsx?$/i)) {
      setError("엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.");
      return;
    }

    setError("");
    setStep("parsing");

    try {
      const [result, existingData] = await Promise.all([
        parsePriceExcel(file),
        fetchPriceCompareData(),
      ]);

      if (result.products.length === 0) {
        setError("파싱된 제품이 없습니다. 양식을 확인해주세요.");
        setStep("upload");
        return;
      }

      setParsed(result);

      // Build comparison summary — 유니크 이름 기준으로 비교
      const existingProductNames = new Set(existingData.unifiedProducts.map((p) => p.name));
      const uploadedProductNames = new Set(result.products.map((p) => p.name));
      const existingVendorNames = existingData.vendors.map((v) => v.name);

      const overlappingProducts = result.products.filter((p) =>
        existingProductNames.has(p.name)
      ).length;

      const newVendors = result.vendorNames.filter(
        (name) => !existingVendorNames.includes(name)
      );

      setComparison({
        existing: {
          productCount: existingData.unifiedProducts.length,
          vendorCount: existingData.vendors.length,
          vendorNames: existingVendorNames,
        },
        uploaded: {
          productCount: result.products.length,
          vendorCount: result.vendorNames.length,
          vendorNames: result.vendorNames,
        },
        newVendors,
        overlappingProducts,
      });

      setStep("compare");
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일 파싱에 실패했습니다.");
      setStep("upload");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleUpload = async (mode: "overwrite" | "merge") => {
    if (!parsed) return;
    setStep("uploading");
    setError("");

    const products = parsed.products.map((p) => ({
      category: p.category,
      name: p.name,
      quantity: p.quantity,
      remarks: p.remarks,
      vendorPrices: Object.fromEntries(p.vendorPrices),
    }));

    const result = await uploadPriceExcel(products, parsed.vendorNames, mode);

    if (result.error) {
      setError(result.error);
      setStep("compare");
      return;
    }

    handleClose();
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>엑셀 업로드</DialogTitle>
          <DialogDescription>
            가격비교 데이터를 엑셀 파일로 업로드합니다.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-3">
            <div
              className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">
                  파일을 드래그하거나 클릭하여 선택
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  .xlsx, .xls 파일만 가능
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                양식: A열=구분, B열=제품명, C열=수량, D열=비고, E열~=업체별 단가
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTemplateDownload();
                }}
              >
                <FileDown className="h-3.5 w-3.5 mr-1" />
                양식 다운로드
              </Button>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        {step === "parsing" && (
          <div className="flex items-center justify-center py-8">
            <Spinner text="파일 분석 중..." />
          </div>
        )}

        {step === "compare" && parsed && comparison && (
          <div className="space-y-4">
            {/* 현재 상태 */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">현재 데이터</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                <span className="text-muted-foreground">제품</span>
                <span className="font-medium">{comparison.existing.productCount}개</span>
                <span className="text-muted-foreground">업체</span>
                <span className="font-medium">
                  {comparison.existing.vendorCount > 0
                    ? `${comparison.existing.vendorCount}개 (${comparison.existing.vendorNames.join(", ")})`
                    : "없음"}
                </span>
              </div>
            </div>

            {/* 업로드 파일 */}
            <div className="flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">업로드 파일</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                <span className="text-muted-foreground">제품</span>
                <span className="font-medium">{comparison.uploaded.productCount}개</span>
                <span className="text-muted-foreground">업체</span>
                <span className="font-medium">
                  {comparison.uploaded.vendorCount}개 ({comparison.uploaded.vendorNames.join(", ")})
                </span>
                {comparison.overlappingProducts > 0 && (
                  <>
                    <span className="text-muted-foreground">겹치는 제품</span>
                    <span className="font-medium text-amber-600">{comparison.overlappingProducts}개</span>
                  </>
                )}
                {comparison.newVendors.length > 0 && (
                  <>
                    <span className="text-muted-foreground">새 업체</span>
                    <span className="font-medium text-blue-600">{comparison.newVendors.join(", ")}</span>
                  </>
                )}
              </div>
            </div>

            {/* 액션 선택 */}
            <div className="space-y-2">
              <p className="text-sm font-medium">업로드 방식을 선택하세요</p>

              {comparison.existing.productCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-800">
                    덮어쓰기를 선택하면 기존 {comparison.existing.productCount}개 제품과 업체별 단가가 모두 삭제됩니다.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {comparison.existing.productCount > 0 && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => handleUpload("merge")}
                  >
                    병합
                    <span className="text-xs text-muted-foreground">
                      — 기존 유지, 겹치는 {comparison.overlappingProducts}개 업데이트
                    </span>
                  </Button>
                )}
                <Button
                  variant={comparison.existing.productCount > 0 ? "destructive" : "default"}
                  className="w-full justify-start gap-2"
                  onClick={() => handleUpload("overwrite")}
                >
                  {comparison.existing.productCount > 0 ? "전체 덮어쓰기" : "업로드"}
                  <span className="text-xs opacity-80">
                    {comparison.existing.productCount > 0
                      ? "— 기존 데이터 삭제 후 새로 저장"
                      : `— ${comparison.uploaded.productCount}개 제품 저장`}
                  </span>
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                다시 선택
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "uploading" && (
          <div className="flex items-center justify-center py-8">
            <Spinner text="업로드 중..." />
          </div>
        )}

        {step === "upload" && (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
