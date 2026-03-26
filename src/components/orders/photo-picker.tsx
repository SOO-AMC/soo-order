"use client";

import { useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPhotoUrl, MAX_PHOTOS, ACCEPTED_IMAGE_TYPES } from "@/lib/utils/photo";
import { useMediaQuery } from "@/hooks/use-media-query";

export type PhotoItem =
  | { type: "existing"; path: string; url: string }
  | { type: "new"; file: File; preview: string };

interface PhotoPickerProps {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
}

export function photoItemsFromPaths(paths: string[]): PhotoItem[] {
  return paths.map((path) => ({
    type: "existing" as const,
    path,
    url: getPhotoUrl(path),
  }));
}

export function PhotoPicker({
  photos,
  onChange,
  maxPhotos = MAX_PHOTOS,
}: PhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const remaining = maxPhotos - photos.length;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: PhotoItem[] = [];
    const limit = Math.min(files.length, remaining);
    for (let i = 0; i < limit; i++) {
      const file = files[i];
      newItems.push({
        type: "new",
        file,
        preview: URL.createObjectURL(file),
      });
    }
    onChange([...photos, ...newItems]);
  };

  const removePhoto = (index: number) => {
    const item = photos[index];
    if (item.type === "new") {
      URL.revokeObjectURL(item.preview);
    }
    onChange(photos.filter((_, i) => i !== index));
  };

  const getThumbUrl = (item: PhotoItem) =>
    item.type === "existing" ? item.url : item.preview;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium leading-none">
          사진 {photos.length}/{maxPhotos}
        </span>
      </div>

      {/* Thumbnail grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {photos.map((item, i) => (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              <img
                src={getThumbUrl(item)}
                alt={`사진 ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add buttons */}
      {remaining > 0 && (
        <div className="flex gap-2">
          {isDesktop ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                파일 선택
              </Button>
              <input
                ref={galleryRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cameraRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                촬영
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => galleryRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
                갤러리
              </Button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
