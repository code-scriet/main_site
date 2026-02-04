import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { 
  Trophy, Calendar, Users, Loader2, ArrowLeft, Tag, Share2, X,
  ChevronLeft, ChevronRight, Image as ImageIcon
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl, processImageGallery } from '@/lib/imageUtils';

// Image Gallery Component with Lightbox
function ImageGallery({ images }: { images: string[] }) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  
  const processedImages = processImageGallery(images, 'gallery');
  const thumbnails = processImageGallery(images, 'square');
  
  if (!images || !images.length) {
    return (
      <div className="text-center py-8 text-gray-500">
        <ImageIcon className="h-12 w-12 mx-auto mb-2 text-gray-400" />
        <p>No images in gallery</p>
      </div>
    );
  }

  return (
    <>
      {/* Gallery Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {thumbnails.map((thumb, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="aspect-square rounded-lg overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-shadow"
            onClick={() => setSelectedImage(index)}
          >
            <img
              src={thumb}
              alt={`Achievement image ${index + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400?text=Image+Not+Found';
              }}
            />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <button
              className="absolute top-4 right-4 text-white hover:text-gray-300 z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-8 w-8" />
            </button>
            
            {/* Navigation */}
            <button
              className="absolute left-4 text-white hover:text-gray-300 p-2 disabled:opacity-30"
              disabled={selectedImage === 0}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(prev => prev !== null ? prev - 1 : null);
              }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            
            <motion.img
              key={selectedImage}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              src={processedImages[selectedImage]}
              alt={`Achievement image ${selectedImage + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            
            <button
              className="absolute right-4 text-white hover:text-gray-300 p-2 disabled:opacity-30"
              disabled={selectedImage === processedImages.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(prev => prev !== null ? prev + 1 : null);
              }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
            
            {/* Image counter */}
            <div className="absolute bottom-4 text-white text-sm">
              {selectedImage + 1} / {processedImages.length}
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
        <div className="min-h-screen flex items-center justify-center bg-amber-50">
          <Loader2 className="h-12 w-12 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (error || !achievement) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 p-4">
          <Trophy className="h-16 w-16 text-amber-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Achievement Not Found</h1>
          <p className="text-gray-600 mb-6">{error || 'The achievement you are looking for does not exist.'}</p>
          <Button onClick={() => navigate('/achievements')}>
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

      {/* Hero Section */}
      <section className="relative">
        {/* Cover Image */}
        {coverImage ? (
          <div className="h-64 sm:h-80 md:h-96 relative overflow-hidden">
            <img
              src={coverImage}
              alt={achievement.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          </div>
        ) : (
          <div className="h-64 sm:h-80 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <Trophy className="h-24 w-24 text-white/30" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
        )}

        {/* Back Button */}
        <div className="absolute top-4 left-4 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/achievements')}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-sm"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        {/* Share Button */}
        <div className="absolute top-4 right-4 z-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShare}
            className="bg-white/90 hover:bg-white text-gray-900 backdrop-blur-sm"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>

        {/* Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8">
          <div className="container mx-auto">
            {achievement.eventName && (
              <Badge variant="secondary" className="mb-2 bg-amber-500 text-white border-0">
                {achievement.eventName}
              </Badge>
            )}
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2">
              {achievement.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm sm:text-base">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{achievement.achievedBy}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(achievement.date)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-8 sm:py-12 bg-amber-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Tags */}
            {achievement.tags && achievement.tags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-wrap gap-2 mb-6"
              >
                {achievement.tags.map((tag, index) => (
                  <Badge key={index} variant="outline" className="bg-white border-amber-300 text-amber-700">
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </motion.div>
            )}

            {/* Description Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="mb-8 border-amber-200">
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold text-amber-900 mb-4 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    About This Achievement
                  </h2>
                  <p className="text-gray-700 text-lg leading-relaxed">
                    {achievement.description}
                  </p>
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
                <Card className="mb-8 border-amber-200">
                  <CardContent className="p-6">
                    <div className="prose prose-amber max-w-none">
                      <Markdown>{achievement.content}</Markdown>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Image Gallery */}
            {hasGallery && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="mb-8 border-amber-200">
                  <CardContent className="p-6">
                    <h2 className="text-xl font-semibold text-amber-900 mb-4 flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-amber-600" />
                      Photo Gallery
                    </h2>
                    <ImageGallery images={achievement.imageGallery!} />
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Navigation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex justify-center"
            >
              <Button
                size="lg"
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                asChild
              >
                <Link to="/achievements">
                  <Trophy className="h-4 w-4 mr-2" />
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
