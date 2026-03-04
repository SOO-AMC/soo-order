"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getPhotoUrl } from "@/lib/utils/photo";

interface PhotoGalleryProps {
  photoUrls: string[];
}

export function PhotoGallery({ photoUrls }: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photoUrls.length === 0) return null;

  const urls = photoUrls.map(getPhotoUrl);

  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="relative aspect-square overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-80"
          >
            <img
              src={url}
              alt={`사진 ${i + 1}`}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null);
        }}
      >
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-black/95 [&>button]:hidden">
          {lightboxIndex !== null && (
            <div className="relative flex h-[90vh] items-center justify-center">
              {/* Close */}
              <button
                type="button"
                onClick={() => setLightboxIndex(null)}
                className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Counter */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                {lightboxIndex + 1} / {urls.length}
              </div>

              {/* Previous */}
              {lightboxIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex - 1)}
                  className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              {/* Image */}
              <img
                src={urls[lightboxIndex]}
                alt={`사진 ${lightboxIndex + 1}`}
                className="max-h-full max-w-full object-contain"
              />

              {/* Next */}
              {lightboxIndex < urls.length - 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex + 1)}
                  className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
