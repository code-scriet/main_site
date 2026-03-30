import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { AchievementSchema, BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import { LightboxGallery } from '@/components/media/LightboxGallery';
import { 
  Trophy, Calendar, Loader2, ArrowLeft, Tag, Share2,
  ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles, Award, Star,
  Play, Pause
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl, processImageGallery } from '@/lib/imageUtils';

// ============================================
// PREMIUM CINEMATIC IMAGE GALLERY
// With Slideshow, Ken Burns Effect & Elegant Lightbox
// ============================================

function CinematicGallery({ images }: { images: string[] }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const processedImages = processImageGallery(images, 'gallery');
  const hasImages = processedImages.length > 0;

  useEffect(() => {
    if (!isPlaying || processedImages.length <= 1) return;

    const intervalId = window.setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % processedImages.length);
      }, 4500);

    return () => window.clearInterval(intervalId);
  }, [isPlaying, processedImages.length]);

  useEffect(() => {
    if (activeSlide < processedImages.length) return;
    setActiveSlide(0);
  }, [activeSlide, processedImages.length]);

  if (!hasImages) {
    return <LightboxGallery images={[]} imageAltPrefix="Achievement photo" />;
  }

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-amber-200 bg-black shadow-xl">
        <div className="relative aspect-[16/9]">
          <img
            src={processedImages[activeSlide]}
            alt={`Slide ${activeSlide + 1}`}
            className="h-full w-full object-cover"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/25" />

          <button
            type="button"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/25 bg-black/35 p-2 text-white transition hover:bg-black/60 disabled:opacity-35"
            disabled={activeSlide === 0}
            onClick={() => {
              setIsPlaying(false);
              setActiveSlide((prev) => Math.max(0, prev - 1));
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/25 bg-black/35 p-2 text-white transition hover:bg-black/60 disabled:opacity-35"
            disabled={activeSlide === processedImages.length - 1}
            onClick={() => {
              setIsPlaying(false);
              setActiveSlide((prev) => Math.min(processedImages.length - 1, prev + 1));
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute left-3 top-3 z-10 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-sm text-white">
            {activeSlide + 1} / {processedImages.length}
          </div>

          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            className="absolute right-3 top-3 z-10 rounded-full border border-white/20 bg-black/40 p-2 text-white transition hover:bg-black/60"
            aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <LightboxGallery images={images} imageAltPrefix="Achievement photo" />
    </div>
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
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-xl border border-white/20 rounded-xl px-3 sm:px-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Back</span>
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
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-md shadow-xl border border-white/20 rounded-xl px-3 sm:px-4"
          >
            <Share2 className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Share</span>
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
              className="text-balance mb-6 text-[clamp(2rem,5vw,4.25rem)] font-black leading-[1.1] tracking-tight text-white drop-shadow-2xl font-display"
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
                        <div className="text-base font-medium leading-relaxed text-gray-800 sm:text-lg">
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
