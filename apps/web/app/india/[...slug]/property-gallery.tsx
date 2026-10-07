'use client';

import { useState, useEffect, useCallback } from 'react';
import { titleCase } from '@/lib/format';

export type PropertyImage = {
  id: number;
  storage_key: string;
  caption?: string;
  room_tag?: string;
  is_cover?: boolean;
};

interface PropertyGalleryProps {
  images: PropertyImage[];
  title: string;
}

export function PropertyGallery({ images = [], title }: PropertyGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const total = images.length;

  const openLightbox = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, total - 1)));
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const nextPhoto = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevPhoto = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextPhoto();
      if (e.key === 'ArrowLeft') prevPhoto();
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [lightboxOpen, nextPhoto, prevPhoto]);

  const getImageUrl = (key: string) => `/api/storage/${key.replace(/^\/+/, '')}`;

  // 0 Images State
  if (total === 0) {
    return (
      <div className="relative mt-4 flex h-[320px] w-full flex-col items-center justify-center rounded-2xl border border-line bg-slate-100 text-center text-muted sm:h-[420px]">
        <svg
          className="h-12 w-12 text-muted/50 mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted">
          No Photographs Uploaded
        </p>
        <p className="text-xs text-muted/70 mt-1">Listing photos will appear here once verified</p>
      </div>
    );
  }

  return (
    <>
      {/* ============================================================ */}
      {/* MAIN GALLERY CONTAINER                                       */}
      {/* ============================================================ */}
      <div className="relative mt-4 w-full select-none">
        {/* DESKTOP / TABLET GALLERY (md and above) */}
        <div
          className={`hidden md:grid h-[420px] lg:h-[460px] w-full gap-2.5 overflow-hidden rounded-2xl border border-line bg-slate-900 ${
            total === 1
              ? 'grid-cols-1'
              : 'grid-cols-[68%_1fr]'
          }`}
        >
          {/* Main / Cover Image (Left) */}
          <div
            onClick={() => openLightbox(0)}
            className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl(images[0].storage_key)}
              alt={images[0].caption || title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            {images[0].room_tag && (
              <span className="absolute bottom-3.5 left-3.5 rounded-md bg-black/70 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
                {titleCase(images[0].room_tag)}
              </span>
            )}
          </div>

          {/* Right Column Variants depending on total images */}
          {total === 2 && (
            <div
              onClick={() => openLightbox(1)}
              className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(images[1].storage_key)}
                alt={images[1].caption || `Photo 2`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              {images[1].room_tag && (
                <span className="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur-xs">
                  {titleCase(images[1].room_tag)}
                </span>
              )}
            </div>
          )}

          {total === 3 && (
            <div className="grid h-full grid-rows-2 gap-2.5">
              {[1, 2].map((idx) => (
                <div
                  key={idx}
                  onClick={() => openLightbox(idx)}
                  className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(images[idx].storage_key)}
                    alt={images[idx].caption || `Photo ${idx + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                  {images[idx].room_tag && (
                    <span className="absolute bottom-2.5 left-2.5 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur-xs">
                      {titleCase(images[idx].room_tag)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {total >= 4 && (
            <div className="grid h-full grid-rows-2 gap-2.5">
              {/* Top Photo 2 */}
              <div
                onClick={() => openLightbox(1)}
                className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getImageUrl(images[1].storage_key)}
                  alt={images[1].caption || `Photo 2`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                {images[1].room_tag && (
                  <span className="absolute bottom-2.5 left-2.5 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur-xs">
                    {titleCase(images[1].room_tag)}
                  </span>
                )}
              </div>

              {/* Bottom 2-split (Photo 3 and Photo 4 / +More) */}
              <div className="grid h-full grid-cols-2 gap-2.5">
                {/* Photo 3 */}
                <div
                  onClick={() => openLightbox(2)}
                  className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(images[2].storage_key)}
                    alt={images[2].caption || `Photo 3`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                  {images[2].room_tag && (
                    <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white backdrop-blur-xs">
                      {titleCase(images[2].room_tag)}
                    </span>
                  )}
                </div>

                {/* Photo 4 with +More Overlay if total > 4 */}
                <div
                  onClick={() => openLightbox(3)}
                  className="group relative h-full w-full cursor-pointer overflow-hidden bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(images[3].storage_key)}
                    alt={images[3].caption || `Photo 4`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-102"
                  />
                  {total > 4 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-2xs transition-colors group-hover:bg-black/70">
                      <span className="font-display text-xl font-bold text-white">
                        +{total - 3}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-white/90">
                        Photos
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                      {images[3].room_tag && (
                        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white backdrop-blur-xs">
                          {titleCase(images[3].room_tag)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MOBILE GALLERY (< md) */}
        <div className="block md:hidden">
          <div
            onClick={() => openLightbox(0)}
            className="relative aspect-[16/10] w-full cursor-pointer overflow-hidden rounded-xl border border-line bg-slate-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl(images[0].storage_key)}
              alt={images[0].caption || title}
              className="h-full w-full object-cover"
            />
            <div className="absolute top-3 right-3 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur-xs">
              1 / {total}
            </div>
            {images[0].room_tag && (
              <span className="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur-xs">
                {titleCase(images[0].room_tag)}
              </span>
            )}
          </div>

          {/* Mobile Thumbnail Strip if >= 2 photos */}
          {total > 1 && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {images.map((img, idx) => (
                <div
                  key={img.id || idx}
                  onClick={() => openLightbox(idx)}
                  className="relative h-16 w-24 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line bg-slate-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getImageUrl(img.storage_key)}
                    alt={img.caption || `Thumbnail ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {idx === 0 && (
                    <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[8px] font-mono uppercase text-white">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating View All Photos Button (bottom right of gallery) */}
        {total > 1 && (
          <button
            type="button"
            onClick={() => openLightbox(0)}
            className="absolute bottom-3.5 right-3.5 z-20 flex items-center gap-1.5 rounded-lg bg-black/80 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-black active:scale-95"
            aria-label="View all photos"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>View all {total} photos</span>
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* INTERACTIVE FULLSCREEN LIGHTBOX MODAL                         */}
      {/* ============================================================ */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between bg-black/95 text-white backdrop-blur-md animate-fade-in select-none"
          role="dialog"
          aria-modal="true"
          aria-label="Photo gallery lightbox"
        >
          {/* Top Lightbox Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <div className="flex items-center gap-3 truncate">
              <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-xs font-bold text-white">
                {currentIndex + 1} / {total}
              </span>
              <span className="truncate text-sm font-medium text-white/90">
                {images[currentIndex].caption || title}
              </span>
              {images[currentIndex].room_tag && (
                <span className="hidden sm:inline-block rounded bg-seal/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
                  {titleCase(images[currentIndex].room_tag)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={closeLightbox}
              className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
              aria-label="Close lightbox"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Center Main Stage with Left / Right Navigation */}
          <div className="relative flex flex-1 items-center justify-center p-4">
            {/* Previous Button */}
            {total > 1 && (
              <button
                type="button"
                onClick={prevPhoto}
                className="absolute left-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white/90 shadow-xl backdrop-blur-xs transition-all hover:bg-black hover:scale-105 active:scale-95 focus:outline-none"
                aria-label="Previous photo"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}

            {/* Active Photograph */}
            <div className="flex max-h-[72vh] max-w-[90vw] items-center justify-center overflow-hidden rounded-xl shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(images[currentIndex].storage_key)}
                alt={images[currentIndex].caption || `Photo ${currentIndex + 1}`}
                className="max-h-[72vh] max-w-[90vw] object-contain transition-all duration-200"
              />
            </div>

            {/* Next Button */}
            {total > 1 && (
              <button
                type="button"
                onClick={nextPhoto}
                className="absolute right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white/90 shadow-xl backdrop-blur-xs transition-all hover:bg-black hover:scale-105 active:scale-95 focus:outline-none"
                aria-label="Next photo"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom Thumbnail Carousel Strip */}
          {total > 1 && (
            <div className="border-t border-white/10 bg-black/70 px-4 py-3 backdrop-blur-xs">
              <div className="mx-auto flex max-w-4xl justify-center gap-2 overflow-x-auto py-1 no-scrollbar">
                {images.map((img, idx) => {
                  const isActive = idx === currentIndex;
                  return (
                    <button
                      key={img.id || idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                        isActive
                          ? 'border-emerald-400 scale-105 opacity-100 ring-2 ring-emerald-400/40'
                          : 'border-transparent opacity-50 hover:opacity-100'
                      }`}
                      aria-label={`View photo ${idx + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getImageUrl(img.storage_key)}
                        alt={`Thumbnail ${idx + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
