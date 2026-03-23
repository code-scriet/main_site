import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { AchievementSchema, BreadcrumbSchema } from '@/components/ui/schema';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import { 
  Trophy, Calendar, Loader2, ArrowLeft, Tag, Share2, X,
  ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles, Award, Star,
  Play, Pause, Maximize2, ZoomIn, ZoomOut
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl, processImageGallery } from '@/lib/imageUtils';

// ============================================
// PREMIUM CINEMATIC IMAGE GALLERY
// With Slideshow, Ken Burns Effect & Elegant Lightbox
// ============================================

function CinematicGallery({ images }: { images: string[] }) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [activeSlide, setActiveSlide] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const processedImages = processImageGallery(images, 'gallery');
  const thumbnails = processImageGallery(images, 'square');
  
  // Auto slideshow effect
  useEffect(() => {
    if (isPlaying && selectedImage === null) {
      intervalRef.current = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % processedImages.length);
      }, 4000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, selectedImage, processedImages.length]);

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set([...prev, index]));
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (selectedImage === null) return;
    const threshold = 100;
    if (info.offset.x > threshold && selectedImage > 0) {
      setSelectedImage(selectedImage - 1);
    } else if (info.offset.x < -threshold && selectedImage < processedImages.length - 1) {
      setSelectedImage(selectedImage + 1);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (selectedImage === null) return;
    if (e.key === 'ArrowLeft' && selectedImage > 0) {
      setSelectedImage(selectedImage - 1);
    } else if (e.key === 'ArrowRight' && selectedImage < processedImages.length - 1) {
      setSelectedImage(selectedImage + 1);
    } else if (e.key === 'Escape') {
      setSelectedImage(null);
      setZoomLevel(1);
    }
  }, [selectedImage, processedImages.length]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
  
  if (!images || !images.length) {
    return (
      <div className="text-center py-16 bg-gradient-to-br from-amber-50/80 via-orange-50/80 to-amber-50/80 rounded-3xl border border-amber-200/50 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.6 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 mb-4 shadow-lg"
        >
          <ImageIcon className="h-10 w-10 text-amber-400" />
        </motion.div>
        <p className="text-gray-500 font-medium text-lg">No images in gallery</p>
      </div>
    );
  }

  // Ken Burns animation variants for slideshow
  const kenBurnsVariants = [
    { scale: 1, x: 0, y: 0 },
    { scale: 1.15, x: '-3%', y: '-2%' },
    { scale: 1.1, x: '2%', y: '-3%' },
    { scale: 1.2, x: '-2%', y: '2%' },
  ];

  return (
    <>
      {/* FEATURED SLIDESHOW HERO */}
      <div className="relative mb-8 rounded-3xl overflow-hidden shadow-2xl">
        {/* Main Slideshow Display */}
        <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-gray-900 to-black">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlide}
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                ...kenBurnsVariants[activeSlide % kenBurnsVariants.length]
              }}
              exit={{ opacity: 0 }}
              transition={{ 
                opacity: { duration: 0.8 },
                scale: { duration: 8, ease: "linear" },
                x: { duration: 8, ease: "linear" },
                y: { duration: 8, ease: "linear" }
              }}
              className="absolute inset-0"
            >
              <img
                src={processedImages[activeSlide]}
                alt={`Slide ${activeSlide + 1}`}
                className="w-full h-full object-cover"
              />
            </motion.div>
          </AnimatePresence>

          {/* Cinematic Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />
          
          {/* Elegant Vignette Effect */}
          <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.7)]" />

          {/* Slide Navigation Arrows */}
          <motion.button
            whileHover={{ scale: 1.1, x: -2 }}
            whileTap={{ scale: 0.95 }}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all z-10 shadow-lg"
            onClick={() => {
              setIsPlaying(false);
              setActiveSlide((prev) => (prev - 1 + processedImages.length) % processedImages.length);
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.1, x: 2 }}
            whileTap={{ scale: 0.95 }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all z-10 shadow-lg"
            onClick={() => {
              setIsPlaying(false);
              setActiveSlide((prev) => (prev + 1) % processedImages.length);
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </motion.button>

          {/* Slideshow Controls */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
            {/* Play/Pause Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/30 transition-all"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </motion.button>
            
            {/* Slide Indicators */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md">
              {processedImages.slice(0, 8).map((_, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.3 }}
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveSlide(index);
                  }}
                  className={`transition-all duration-300 ${
                    index === activeSlide 
                      ? 'w-8 h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-400' 
                      : 'w-2 h-2 rounded-full bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
              {processedImages.length > 8 && (
                <span className="text-white/70 text-xs ml-1">+{processedImages.length - 8}</span>
              )}
            </div>

            {/* Fullscreen Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedImage(activeSlide)}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-white hover:bg-white/30 transition-all"
            >
              <Maximize2 className="h-4 w-4" />
            </motion.button>
          </div>

          {/* Image Counter */}
          <div className="absolute top-4 right-4 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 z-10">
            <span className="text-white font-medium text-sm">
              {activeSlide + 1} / {processedImages.length}
            </span>
          </div>

          {/* Click to expand */}
          <button
            className="absolute inset-0 cursor-pointer z-0"
            onClick={() => setSelectedImage(activeSlide)}
            aria-label="View full image"
          />
        </div>
      </div>

      {/* THUMBNAIL GRID with Stagger Animation */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {thumbnails.map((thumb, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.05, y: -4, zIndex: 10 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedImage(index)}
            className={`group relative aspect-square rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${
              index === activeSlide ? 'ring-2 ring-amber-400 ring-offset-2' : ''
            }`}
          >
            {/* Loading Shimmer */}
            {!loadedImages.has(index) && (
              <div className="absolute inset-0 bg-gradient-to-r from-amber-100 via-orange-50 to-amber-100 animate-pulse" />
            )}
            
            <img
              src={thumb}
              alt={`Gallery ${index + 1}`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              onLoad={() => handleImageLoad(index)}
              onError={(event) => {
                event.currentTarget.src = '/fallback-image.svg';
                handleImageLoad(index);
              }}
            />
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <span className="text-white text-xs font-medium bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
                  {index + 1}
                </span>
                <ZoomIn className="h-4 w-4 text-white" />
              </div>
            </div>

            {/* Active indicator dot */}
            {index === activeSlide && (
              <motion.div 
                layoutId="activeIndicator"
                className="absolute top-2 right-2 w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/50"
              />
            )}
          </motion.button>
        ))}
      </div>

      {/* PREMIUM LIGHTBOX with Gestures */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-xl flex items-center justify-center"
            onClick={() => {
              setSelectedImage(null);
              setZoomLevel(1);
            }}
          >
            {/* Ambient background glow */}
            <div className="absolute inset-0 overflow-hidden">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="absolute inset-0 scale-150 blur-3xl"
                style={{
                  backgroundImage: `url(${processedImages[selectedImage]})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}
              />
            </div>

            {/* Close Button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.1, rotate: 90 }}
              className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all z-50"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(null);
                setZoomLevel(1);
              }}
            >
              <X className="h-6 w-6" />
            </motion.button>

            {/* Navigation - Previous */}
            <motion.button
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              whileHover={{ scale: 1.1, x: -4 }}
              whileTap={{ scale: 0.95 }}
              className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all z-50 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={selectedImage === 0}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(selectedImage - 1);
                setZoomLevel(1);
              }}
            >
              <ChevronLeft className="h-7 w-7" />
            </motion.button>

            {/* Main Image with Pan & Zoom */}
            <motion.div
              drag={zoomLevel === 1}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="relative max-w-[90vw] max-h-[85vh] z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.img
                key={selectedImage}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: zoomLevel }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                src={processedImages[selectedImage]}
                alt={`Full view ${selectedImage + 1}`}
                className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing"
                draggable={false}
              />
            </motion.div>

            {/* Navigation - Next */}
            <motion.button
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              whileHover={{ scale: 1.1, x: 4 }}
              whileTap={{ scale: 0.95 }}
              className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-all z-50 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={selectedImage === processedImages.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(selectedImage + 1);
                setZoomLevel(1);
              }}
            >
              <ChevronRight className="h-7 w-7" />
            </motion.button>

            {/* Bottom Controls Bar */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-5 py-3 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/30 z-50"
            >
              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLevel(Math.max(1, zoomLevel - 0.5));
                  }}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all disabled:opacity-50"
                  disabled={zoomLevel <= 1}
                >
                  <ZoomOut className="h-4 w-4" />
                </motion.button>
                <span className="text-white/70 text-sm w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLevel(Math.min(3, zoomLevel + 0.5));
                  }}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all disabled:opacity-50"
                  disabled={zoomLevel >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </motion.button>
              </div>

              <div className="w-px h-6 bg-white/20" />

              {/* Thumbnail Strip */}
              <div className="flex items-center gap-2 max-w-[52vw] overflow-x-auto scrollbar-hide rounded-xl px-2 py-1 bg-white/5 border border-white/10">
                {thumbnails.slice(0, 10).map((thumb, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedImage(index);
                      setZoomLevel(1);
                    }}
                    className={`w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 transition-all duration-300 ${
                      index === selectedImage 
                        ? 'ring-2 ring-amber-400/80 shadow-lg shadow-amber-400/30 scale-105 bg-white/10' 
                        : 'opacity-60 hover:opacity-100 hover:ring-1 hover:ring-white/30'
                    }`}
                  >
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  </motion.button>
                ))}
              </div>

              <div className="w-px h-6 bg-white/20" />

              {/* Counter */}
              <div className="flex items-center gap-2 text-white">
                <span className="text-amber-400 font-bold">{selectedImage + 1}</span>
                <span className="text-white/50">/</span>
                <span className="text-white/70">{processedImages.length}</span>
              </div>
            </motion.div>

            {/* Keyboard hints */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="absolute top-6 left-6 flex items-center gap-3 text-white/40 text-xs z-50"
            >
              <span className="px-2 py-1 rounded bg-white/10">←</span>
              <span className="px-2 py-1 rounded bg-white/10">→</span>
              <span>Navigate</span>
              <span className="px-2 py-1 rounded bg-white/10">ESC</span>
              <span>Close</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function AchievementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAchievement = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAchievement(id);
        setAchievement(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load achievement');
      } finally {
        setLoading(false);
      }
    };
    fetchAchievement();
  }, [id]);

  const handleShare = async () => {
    if (!achievement) return;
    
    const url = window.location.href;
    const text = `Check out this achievement: ${achievement.title}`;
    
    if (navigator.share) {
      try {
        await navigator.share({ title: achievement.title, text, url });
      } catch {
        // User cancelled or share failed
      }
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-amber-50/30">
          <motion.div
            animate={{ 
              rotateY: 360,
              scale: [1, 1.1, 1]
            }}
            transition={{ 
              rotateY: { duration: 2, repeat: Infinity, ease: "linear" },
              scale: { duration: 1, repeat: Infinity }
            }}
            className="mb-6 relative"
          >
            <div className="absolute inset-0 bg-amber-400 rounded-full blur-xl opacity-30 animate-pulse" />
            <Trophy className="h-16 w-16 text-amber-500 relative" />
          </motion.div>
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-4" />
          <p className="text-gray-600 font-medium text-lg">Loading achievement...</p>
        </div>
      </Layout>
    );
  }

  if (error || !achievement) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-amber-50/30 p-4">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 mb-6 shadow-xl"
          >
            <Trophy className="h-14 w-14 text-amber-400" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Achievement Not Found</h1>
          <p className="text-gray-600 mb-8 text-center max-w-md">{error || 'The achievement you are looking for does not exist or has been removed.'}</p>
          <Button 
            onClick={() => navigate('/achievements')}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Achievements
          </Button>
        </div>
      </Layout>
    );
  }

  const coverImage = achievement.imageUrl ? processImageUrl(achievement.imageUrl, 'cover') : null;
  const hasGallery = achievement.imageGallery && achievement.imageGallery.length > 0;

  return (
    <Layout>
      <SEO 
        title={achievement.title}
        description={achievement.shortDescription || achievement.description}
        url={`/achievements/${achievement.slug || achievement.id}`}
        image={achievement.imageUrl}
      />
      
      <AchievementSchema
        title={achievement.title}
        description={achievement.shortDescription || achievement.description}
        image={achievement.imageUrl || 'https://codescriet.dev/logo.png'}
        datePublished={achievement.createdAt}
        dateModified={achievement.updatedAt || achievement.createdAt}
        slug={achievement.slug || achievement.id}
      />
      
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Achievements', url: 'https://codescriet.dev/achievements' },
          { name: achievement.title, url: `https://codescriet.dev/achievements/${achievement.slug || achievement.id}` },
        ]}
      />

      {/* CINEMATIC HERO SECTION */}
      <section className="relative min-h-[55vh] md:min-h-[65vh] overflow-hidden">
        {/* Parallax Cover Image */}
        {coverImage ? (
          <motion.div 
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.5 }}
            className="absolute inset-0"
          >
            <img
              src={coverImage}
              alt={achievement.title}
              className="w-full h-full object-cover"
            />
            {/* Multi-layer cinematic gradients */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/40 to-orange-900/40 mix-blend-multiply" />
            <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-transparent to-black/40" />
            {/* Film grain texture */}
            <div className="absolute inset-0 opacity-[0.03] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')]" />
          </motion.div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 overflow-hidden">
            <motion.div 
              animate={{ 
                rotate: 360,
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                rotate: { duration: 30, repeat: Infinity, ease: "linear" },
                scale: { duration: 5, repeat: Infinity }
              }}
              className="absolute inset-0"
            >
              <div className="absolute top-20 left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute bottom-20 right-20 w-64 h-64 sm:w-80 sm:h-80 md:w-[500px] md:h-[500px] bg-white/10 rounded-full blur-3xl" />{/* responsive: scale decorative blob */}
            </motion.div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <Trophy className="h-56 w-56 text-white/10" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
        )}

        {/* Navigation Buttons */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-6 left-6 z-20"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/achievements')}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-xl border border-white/20 rounded-xl px-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute top-6 right-6 z-20"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-xl border border-white/20 rounded-xl px-4"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </motion.div>

        {/* Hero Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 md:p-14 z-10">
          <div className="container mx-auto max-w-5xl">
            {/* Badges Row */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap items-center gap-3 mb-5"
            >
              {achievement.featured && (
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/40">
                  <Sparkles className="h-4 w-4 text-white" />
                  <span className="text-white text-sm font-bold tracking-wide">FEATURED</span>
                </span>
              )}
              {achievement.eventName && (
                <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-md text-sm px-4 py-2 rounded-full">
                  <Award className="h-4 w-4 mr-2" />
                  {achievement.eventName}
                </Badge>
              )}
            </motion.div>
            
            {/* Title */}
            <motion.h1 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.7 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white mb-6 leading-[1.1] tracking-tight drop-shadow-2xl font-display"
            >
              {achievement.title}
            </motion.h1>
            
            {/* Meta Pills */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap items-center gap-4"
            >
              <div className="flex items-center gap-3 bg-white/15 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {achievement.achievedBy?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold text-white">{achievement.achievedBy}</p>
                  <p className="text-xs text-white/60">Achiever</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20">
                <Calendar className="h-5 w-5 text-amber-300" />
                <span className="font-semibold text-white">{formatDate(achievement.date)}</span>
              </div>
              
              {hasGallery && (
                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/20">
                  <ImageIcon className="h-5 w-5 text-amber-300" />
                  <span className="font-semibold text-white">{achievement.imageGallery!.length} Photos</span>
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 8, 0] }}
          transition={{ delay: 1, y: { duration: 2, repeat: Infinity } }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 hidden md:block"
        >
          <div className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2">
            <div className="w-1.5 h-3 rounded-full bg-white/60" />
          </div>
        </motion.div>
      </section>

      {/* PREMIUM CONTENT SECTION */}
      <section className="py-14 sm:py-20 bg-gradient-to-br from-amber-50 via-orange-50/30 to-amber-50/50 relative overflow-hidden">
        {/* Decorative Elements */}
        <div className="absolute top-0 left-0 w-72 h-72 sm:w-96 sm:h-96 md:w-[600px] md:h-[600px] bg-amber-200/20 rounded-full blur-[140px] -translate-x-1/2 -translate-y-1/2" />{/* responsive: scale decorative blob */}
        <div className="absolute bottom-0 right-0 w-72 h-72 sm:w-96 sm:h-96 md:w-[600px] md:h-[600px] bg-orange-200/15 rounded-full blur-[140px] translate-x-1/2 translate-y-1/2" />{/* responsive: scale decorative blob */}
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-5xl mx-auto">
            {/* Tags */}
            {achievement.tags && achievement.tags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-2 mb-10"
              >
                {achievement.tags.map((tag, index) => (
                  <motion.span 
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 text-amber-700 shadow-sm hover:shadow-lg hover:border-amber-300 transition-all cursor-default"
                  >
                    <Tag className="h-4 w-4" />
                    <span className="font-semibold text-sm">{tag}</span>
                  </motion.span>
                ))}
              </motion.div>
            )}

            {/* Short Description Highlight */}
            {achievement.shortDescription && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                whileHover={{ y: -4, scale: 1.01 }}
              >
                <Card className="mb-10 border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg hover:shadow-2xl overflow-hidden transition-all duration-300 group">
                  <CardContent className="p-6 sm:p-7">
                    <div className="flex items-start gap-4">
                      <motion.div 
                        whileHover={{ rotate: 360, scale: 1.1 }}
                        transition={{ duration: 0.6 }}
                        className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md group-hover:shadow-lg"
                      >
                        <Star className="h-6 w-6 text-white" />
                      </motion.div>
                      <div className="flex-1">
                        <h2 className="text-sm font-bold text-amber-700 mb-2 uppercase tracking-wider">Highlights</h2>
                        <div className="text-gray-800 text-lg sm:text-xl font-medium leading-relaxed">
                          <InlineMarkdown>{achievement.shortDescription}</InlineMarkdown>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Main Description */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              whileHover={{ y: -4, scale: 1.01 }}
            >
              <Card className="mb-10 border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg hover:shadow-2xl overflow-hidden transition-all duration-300 group">
                <CardContent className="p-6 sm:p-7">
                  <div className="flex items-center gap-4 mb-6">
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.6 }}
                      className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md group-hover:shadow-lg"
                    >
                      <Sparkles className="h-6 w-6 text-white" />
                    </motion.div>
                    <div>
                      <h2 className="text-xl font-bold text-amber-900 font-display">Impact & Outcome</h2>
                      <p className="text-amber-700 text-sm">What we built, learned, and delivered for our community.</p>
                    </div>
                  </div>
                  <div className="text-gray-700 text-base leading-relaxed prose prose-amber max-w-none">
                    <Markdown>{achievement.description}</Markdown>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Full Content */}
            {achievement.content && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                whileHover={{ y: -4, scale: 1.01 }}
              >
                <Card className="mb-10 border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg hover:shadow-2xl overflow-hidden transition-all duration-300 group">
                  <CardContent className="p-6 sm:p-7">
                    <div className="prose prose-base prose-amber max-w-none">
                      <Markdown>{achievement.content}</Markdown>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* PREMIUM IMAGE GALLERY */}
            {hasGallery && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                whileHover={{ y: -4, scale: 1.01 }}
              >
                <Card className="mb-10 border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg hover:shadow-2xl overflow-hidden transition-all duration-300 group">
                  <CardContent className="p-6 sm:p-7">
                    <div className="flex items-center gap-4 mb-6">
                      <motion.div
                        whileHover={{ rotate: 360, scale: 1.1 }}
                        transition={{ duration: 0.6 }}
                        className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md group-hover:shadow-lg"
                      >
                        <ImageIcon className="h-6 w-6 text-white" />
                      </motion.div>
                      <div>
                        <h2 className="text-xl font-bold text-amber-900">Photo Gallery</h2>
                        <p className="text-amber-700 text-sm">{achievement.imageGallery!.length} photos capturing this milestone</p>
                      </div>
                    </div>
                    <CinematicGallery images={achievement.imageGallery!} />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Navigation CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center pt-8"
            >
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-600 hover:via-orange-600 hover:to-amber-600 shadow-2xl shadow-amber-500/40 px-12 h-16 text-lg font-bold rounded-2xl hover:scale-105 transition-all duration-300"
                asChild
              >
                <Link to="/achievements" className="flex items-center gap-3">
                  <Trophy className="h-6 w-6" />
                  View All Achievements
                </Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
