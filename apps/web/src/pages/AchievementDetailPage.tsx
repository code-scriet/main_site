import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { AchievementSchema, BreadcrumbSchema } from '@/components/ui/schema';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown, InlineMarkdown } from '@/components/ui/markdown';
import { 
  Trophy, Calendar, Loader2, ArrowLeft, Tag, Share2, X,
  ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles, Award, Star, ExternalLink
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl, processImageGallery } from '@/lib/imageUtils';

// Premium Image Gallery Component with Lightbox
function ImageGallery({ images }: { images: string[] }) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  
  const processedImages = processImageGallery(images, 'gallery');
  const thumbnails = processImageGallery(images, 'square');
  
  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set([...prev, index]));
  };
  
  if (!images || !images.length) {
    return (
      <div className="text-center py-12 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-100">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
          <ImageIcon className="h-8 w-8 text-amber-400" />
        </div>
        <p className="text-gray-500 font-medium">No images in gallery</p>
      </div>
    );
  }

  return (
    <>
      {/* Premium Gallery Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {thumbnails.map((thumb, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="aspect-square rounded-2xl overflow-hidden cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300 relative group bg-gradient-to-br from-amber-100 to-orange-100"
            onClick={() => setSelectedImage(index)}
          >
            {/* Loading skeleton */}
            {!loadedImages.has(index) && (
              <div className="absolute inset-0 bg-gradient-to-br from-amber-200/50 via-orange-200/50 to-amber-200/50 animate-pulse" />
            )}
            <img
              src={thumb}
              alt={`Gallery image ${index + 1}`}
              className="w-full h-full object-cover"
              onLoad={() => handleImageLoad(index)}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=Image+Not+Found';
                handleImageLoad(index);
              }}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
              <span className="text-white text-sm font-medium flex items-center gap-1">
                <ExternalLink className="h-4 w-4" />
                View
              </span>
            </div>
            {/* Image number badge */}
            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white text-xs font-bold">{index + 1}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Premium Lightbox */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-4 right-4 text-white/80 hover:text-white z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-6 w-6" />
            </motion.button>
            
            {/* Navigation - Previous */}
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute left-4 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed z-20"
              disabled={selectedImage === 0}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(prev => prev !== null ? prev - 1 : null);
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </motion.button>
            
            {/* Main Image */}
            <motion.img
              key={selectedImage}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src={processedImages[selectedImage]}
              alt={`Gallery image ${selectedImage + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Navigation - Next */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute right-4 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed z-20"
              disabled={selectedImage === processedImages.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(prev => prev !== null ? prev + 1 : null);
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </motion.button>
            
            {/* Image counter */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm">
              <span className="text-white text-sm font-medium">
                {selectedImage + 1} / {processedImages.length}
              </span>
            </div>
            
            {/* Thumbnail strip */}
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto p-2">
              {thumbnails.slice(0, 8).map((thumb, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.1 }}
                  className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                    index === selectedImage ? 'border-amber-400 shadow-lg shadow-amber-400/30' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImage(index);
                  }}
                >
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

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
      } catch (err) {
        // User cancelled or share failed
      }
    } else {
      navigator.clipboard.writeText(url);
      // Could show a toast here
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mb-4"
          >
            <Trophy className="h-12 w-12 text-amber-500" />
          </motion.div>
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mb-4" />
          <p className="text-gray-600 font-medium">Loading achievement...</p>
        </div>
      </Layout>
    );
  }

  if (error || !achievement) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 mb-6"
          >
            <Trophy className="h-12 w-12 text-amber-400" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Achievement Not Found</h1>
          <p className="text-gray-600 mb-8 text-center max-w-md">{error || 'The achievement you are looking for does not exist or has been removed.'}</p>
          <Button 
            onClick={() => navigate('/achievements')}
            className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
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
        keywords={`${achievement.title}, code.scriet achievement, ${achievement.eventName || ''}, ${achievement.tags?.join(', ') || ''}`}
      />
      
      {/* Schema markup for SEO */}
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

      {/* Premium Hero Section */}
      <section className="relative min-h-[50vh] md:min-h-[60vh]">
        {/* Cover Image with premium overlays */}
        {coverImage ? (
          <div className="absolute inset-0 overflow-hidden">
            <img
              src={coverImage}
              alt={achievement.title}
              className="w-full h-full object-cover"
            />
            {/* Multi-layer premium gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 to-orange-900/30 mix-blend-multiply" />
            {/* Noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E')]" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute inset-0">
              <div className="absolute top-20 left-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute bottom-20 right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Trophy className="h-48 w-48 text-white/10" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
        )}

        {/* Back Button - Glassmorphism */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-6 left-6 z-20"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/achievements')}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-lg border border-white/20"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </motion.div>

        {/* Share Button - Glassmorphism */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-6 right-6 z-20"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-lg border border-white/20"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </motion.div>

        {/* Hero Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 md:p-12 z-10">
          <div className="container mx-auto max-w-5xl">
            {/* Featured Badge */}
            {achievement.featured && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-4"
              >
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/30">
                  <Sparkles className="h-4 w-4 text-white" />
                  <span className="text-white text-sm font-bold tracking-wide">FEATURED ACHIEVEMENT</span>
                </span>
              </motion.div>
            )}
            
            {/* Event Name */}
            {achievement.eventName && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Badge className="mb-3 bg-white/20 text-white border-white/30 backdrop-blur-sm text-sm px-4 py-1">
                  <Award className="h-3.5 w-3.5 mr-1.5" />
                  {achievement.eventName}
                </Badge>
              </motion.div>
            )}
            
            {/* Title */}
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-2xl"
            >
              {achievement.title}
            </motion.h1>
            
            {/* Meta info */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap items-center gap-6 text-white/90"
            >
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold shadow-lg">
                  {achievement.achievedBy?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-semibold">{achievement.achievedBy}</p>
                  <p className="text-xs text-white/70">Achiever</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                <Calendar className="h-5 w-5 text-amber-300" />
                <span className="font-medium">{formatDate(achievement.date)}</span>
              </div>
              {hasGallery && (
                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                  <ImageIcon className="h-5 w-5 text-amber-300" />
                  <span className="font-medium">{achievement.imageGallery!.length} Photos</span>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Premium Content Section */}
      <section className="py-12 sm:py-16 bg-gradient-to-b from-amber-50 to-white relative overflow-hidden">
        {/* Decorative background */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-200/30 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto">
            {/* Tags */}
            {achievement.tags && achievement.tags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-2 mb-8"
              >
                {achievement.tags.map((tag, index) => (
                  <motion.span 
                    key={index}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-amber-200 text-amber-700 shadow-sm hover:shadow-md hover:border-amber-300 transition-all"
                  >
                    <Tag className="h-3.5 w-3.5" />
                    <span className="font-medium text-sm">{tag}</span>
                  </motion.span>
                ))}
              </motion.div>
            )}

            {/* Short Description Card - with Markdown */}
            {achievement.shortDescription && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="mb-8 border-amber-200/50 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                        <Star className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">Highlights</h2>
                        <div className="text-gray-700 text-lg leading-relaxed">
                          <InlineMarkdown>{achievement.shortDescription}</InlineMarkdown>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Main Description Card - with Markdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <Card className="mb-8 border-amber-200/50 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                      <Trophy className="h-6 w-6 text-white" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">About This Achievement</h2>
                  </div>
                  <div className="text-gray-700 text-lg leading-relaxed">
                    <Markdown>{achievement.description}</Markdown>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Full Content (Markdown) */}
            {achievement.content && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="mb-8 border-amber-200/50 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                  <CardContent className="p-6 sm:p-8">
                    <Markdown>{achievement.content}</Markdown>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Premium Image Gallery */}
            {hasGallery && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="mb-8 border-amber-200/50 bg-white/80 backdrop-blur-sm shadow-xl overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />
                  <CardContent className="p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                        <ImageIcon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Photo Gallery</h2>
                        <p className="text-gray-500 text-sm">{achievement.imageGallery!.length} photos from this achievement</p>
                      </div>
                    </div>
                    <ImageGallery images={achievement.imageGallery!} />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Navigation CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex justify-center pt-12"
            >
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-600 hover:via-orange-600 hover:to-amber-600 shadow-2xl shadow-amber-500/40 px-10 h-16 text-lg font-bold rounded-full hover:scale-105 transition-all duration-300"
                asChild
              >
                <Link to="/achievements" className="flex items-center gap-2">
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
