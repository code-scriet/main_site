import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import { processImageGallery } from '@/lib/imageUtils';
import { cn } from '@/lib/utils';

type LightboxGalleryProps = {
  images: string[];
  imageAltPrefix?: string;
  emptyMessage?: string;
  className?: string;
  gridClassName?: string;
};

export function LightboxGallery({
  images,
  imageAltPrefix = 'Gallery image',
  emptyMessage = 'No images in gallery',
  className,
  gridClassName,
}: LightboxGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  const processedImages = useMemo(() => processImageGallery(images, 'gallery'), [images]);
  const thumbnails = useMemo(() => processImageGallery(images, 'square'), [images]);

  const hasImages = thumbnails.length > 0;

  useEffect(() => {
    if (selectedImage === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedImage(null);
        return;
      }

      if (event.key === 'ArrowLeft') {
        setSelectedImage((current) => {
          if (current === null) return current;
          return Math.max(0, current - 1);
        });
      }

      if (event.key === 'ArrowRight') {
        setSelectedImage((current) => {
          if (current === null) return current;
          return Math.min(processedImages.length - 1, current + 1);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [processedImages.length, selectedImage]);

  if (!hasImages) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/40 py-12 text-center text-gray-500">
        <ImageIcon className="mx-auto mb-3 h-10 w-10 text-amber-300" />
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  const canGoPrev = selectedImage !== null && selectedImage > 0;
  const canGoNext = selectedImage !== null && selectedImage < processedImages.length - 1;

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className={cn(
          'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4',
          gridClassName,
        )}
      >
        {thumbnails.map((thumb, index) => (
          <button
            key={`${thumb}-${index}`}
            type="button"
            onClick={() => setSelectedImage(index)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-amber-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <img
              src={thumb}
              alt={`${imageAltPrefix} ${index + 1}`}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              onError={(event) => {
                event.currentTarget.src = '/fallback-image.svg';
              }}
            />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/92 p-4 backdrop-blur-sm sm:p-6"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative flex h-full w-full items-center justify-center">
              <button
                type="button"
                className="absolute right-0 top-0 z-20 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/70"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedImage(null);
                }}
              >
                <X className="h-6 w-6" />
              </button>

              <div className="absolute left-0 top-0 z-20 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-sm text-white">
                {selectedImage + 1} / {processedImages.length}
              </div>

              <button
                type="button"
                className="absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canGoPrev}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedImage((current) => (current === null ? current : Math.max(0, current - 1)));
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>

              <button
                type="button"
                className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-35"
                disabled={!canGoNext}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedImage((current) =>
                    current === null ? current : Math.min(processedImages.length - 1, current + 1),
                  );
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              <motion.img
                key={processedImages[selectedImage]}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                src={processedImages[selectedImage]}
                alt={`${imageAltPrefix} ${selectedImage + 1}`}
                className="max-h-[82vh] w-auto max-w-[min(95vw,1200px)] rounded-xl object-contain shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              />

              {thumbnails.length > 1 && (
                <div className="absolute bottom-0 left-1/2 z-20 flex w-[min(94vw,780px)] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-2 no-scrollbar">
                  {thumbnails.map((thumb, index) => (
                    <button
                      key={`lightbox-thumb-${index}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedImage(index);
                      }}
                      className={cn(
                        'h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border transition',
                        index === selectedImage
                          ? 'border-amber-300 opacity-100'
                          : 'border-white/20 opacity-65 hover:opacity-100',
                      )}
                    >
                      <img src={thumb} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
