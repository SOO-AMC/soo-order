"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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

      {lightboxIndex !== null && (
        <FullscreenViewer
          urls={urls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}

// --- Fullscreen Viewer (Carousel) ---

interface FullscreenViewerProps {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}

function FullscreenViewer({ urls, initialIndex, onClose }: FullscreenViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef(0);
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartTranslateRef = useRef({ x: 0, y: 0 });

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((newIndex: number) => {
    setIndex(newIndex);
    setSwipeX(0);
    setIsSwiping(false);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [index, goTo]);

  const goNext = useCallback(() => {
    if (index < urls.length - 1) goTo(index + 1);
  }, [index, urls.length, goTo]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goPrev, goNext]);

  // Background click to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // --- Touch ---

  const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStartDistRef.current = getTouchDist(e.touches[0], e.touches[1]);
      pinchStartScaleRef.current = scale;
      panStartRef.current = null;
      touchStartRef.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();

      // Double-tap
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        if (scale > 1) {
          resetZoom();
        } else {
          setScale(2);
          setTranslate({ x: 0, y: 0 });
        }
        touchStartRef.current = null;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1) {
        panStartRef.current = { x: touch.clientX, y: touch.clientY };
        panStartTranslateRef.current = { ...translate };
        touchStartRef.current = null;
      } else {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: now };
        panStartRef.current = null;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const ratio = dist / pinchStartDistRef.current;
      let newScale = pinchStartScaleRef.current * ratio;
      newScale = Math.max(1, Math.min(3, newScale));
      setScale(newScale);
      if (newScale === 1) setTranslate({ x: 0, y: 0 });
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];

      if (scale > 1 && panStartRef.current) {
        const dx = touch.clientX - panStartRef.current.x;
        const dy = touch.clientY - panStartRef.current.y;
        setTranslate({
          x: panStartTranslateRef.current.x + dx,
          y: panStartTranslateRef.current.y + dy,
        });
        return;
      }

      if (touchStartRef.current) {
        const dx = touch.clientX - touchStartRef.current.x;
        setSwipeX(dx);
        setIsSwiping(true);
      }
    }
  };

  const handleTouchEnd = () => {
    if (scale <= 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
    pinchStartDistRef.current = 0;
    panStartRef.current = null;

    if (touchStartRef.current && isSwiping) {
      const THRESHOLD = 50;
      if (swipeX < -THRESHOLD && index < urls.length - 1) {
        goTo(index + 1);
      } else if (swipeX > THRESHOLD && index > 0) {
        goTo(index - 1);
      } else {
        setSwipeX(0);
        setIsSwiping(false);
      }
    }
    touchStartRef.current = null;
  };

  // Carousel: translate the entire strip by -(index * 100%) + swipeX
  const stripTransform = `translateX(calc(-${index * 100}% + ${swipeX}px))`;

  // Per-image zoom transform (only applied to current image)
  const zoomTransform =
    scale > 1
      ? `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`
      : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90"
      style={{ touchAction: "none" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        <div className="rounded-full bg-black/50 px-3 py-1 text-sm text-white">
          {index + 1} / {urls.length}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Carousel strip */}
      <div className="h-full w-full overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: stripTransform,
            transition: isSwiping ? "none" : "transform 0.3s ease-out",
            willChange: "transform",
          }}
        >
          {urls.map((url, i) => (
            <div
              key={i}
              className="flex h-full w-full shrink-0 items-center justify-center"
              onClick={handleBackdropClick}
            >
              <img
                src={url}
                alt={`사진 ${i + 1}`}
                className="max-h-full max-w-full object-contain select-none"
                style={
                  i === index && zoomTransform
                    ? {
                        transform: zoomTransform,
                        transition: "transform 0.2s ease-out",
                        willChange: "transform",
                      }
                    : undefined
                }
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* PC nav buttons */}
      {scale === 1 && index > 0 && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 lg:flex"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {scale === 1 && index < urls.length - 1 && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 lg:flex"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>,
    document.body
  );
}
