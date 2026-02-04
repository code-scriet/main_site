import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight, Loader2, Award, Star, Medal, ChevronRight, Image as ImageIcon, Sparkles, Calendar } from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { InlineMarkdown } from '@/components/ui/markdown';

export function AchievementsShowcase() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        const data = await api.getAchievements();
        setAchievements(data.slice(0, 4));
      } catch (err) {
        console.error('Failed to fetch achievements:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAchievements();
  }, []);

  // Animation configs based on device
  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100" />
      
      {/* Decorative Elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-amber-200/50 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-orange-200/50 rounded-full blur-3xl" />
      
      {/* Trophy Pattern - reduce on mobile */}
      <div className="absolute inset-0 opacity-[0.03]">
        {[...Array(isMobile ? 8 : 20)].map((_, i) => (
          <Trophy 
            key={i} 
            className="absolute h-8 w-8 text-amber-900"
            style={{
              left: `${(i % 5) * 25 + 5}%`,
              top: `${Math.floor(i / 5) * 25 + 10}%`,
            }}
          />
        ))}
      </div>
      
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-12"
        >
          <motion.div 
            initial={{ opacity: 0, scale: shouldReduceMotion ? 0.95 : 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: shouldReduceMotion ? 0.3 : 0.5 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-amber-200 text-amber-800 mb-4 sm:mb-6"
          >
            <Award className="h-4 w-4" />
            <span className="text-sm font-medium">Pride of code.scriet</span>
          </motion.div>
          
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 sm:mb-4">
            Our{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
              Achievements
            </span>
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-2">
            Celebrating the success and accomplishments of our talented community members
          </p>
        </motion.div>

        {/* Achievements Grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
          </div>
        ) : achievements.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-200 mb-6">
              <Trophy className="h-10 w-10 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Achievements coming soon!</h3>
            <p className="text-gray-500">Stay tuned for our community's accomplishments</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {achievements.map((achievement, index) => (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: animationY }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: animationDuration, delay: index * staggerDelay, ease: [0.22, 1, 0.36, 1] }}
                viewport={{ once: true }}
                whileHover={!isMobile ? { y: -10, scale: 1.02 } : undefined}
                className="group h-full"
              >
                <Link to={`/achievements/${achievement.slug || achievement.id}`} className="block h-full">
                <div className="h-full bg-white rounded-3xl shadow-lg overflow-hidden border border-amber-100/50 hover:shadow-2xl hover:border-amber-200 transition-all duration-500">
                  {/* Image with premium overlay */}
                  <div className="relative h-48 overflow-hidden">
                    {achievement.imageUrl ? (
                      <>
                        <img
                          src={processImageUrl(achievement.imageUrl, 'thumbnail')}
                          alt={achievement.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                        />
                        {/* Premium gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-br from-amber-600/10 to-orange-600/10 mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0">
                          <div className="absolute top-4 left-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                          <div className="absolute bottom-4 right-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                        </div>
                        <Trophy className="h-16 w-16 text-white/30" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                    )}
                    
                    {/* Featured badge - Premium */}
                    {achievement.featured && (
                      <div className="absolute top-4 left-4 z-10">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/30">
                          <Sparkles className="h-3 w-3 text-white" />
                          <span className="text-white text-xs font-bold tracking-wide">FEATURED</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Gallery count - Glassmorphism */}
                    {achievement.imageGallery && achievement.imageGallery.length > 0 && (
                      <div className="absolute top-4 right-4 z-10">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30">
                          <ImageIcon className="h-3 w-3 text-white" />
                          <span className="text-white text-xs font-semibold">{achievement.imageGallery.length}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Medal for non-featured without gallery */}
                    {!achievement.featured && !(achievement.imageGallery && achievement.imageGallery.length > 0) && (
                    <motion.div 
                      className="absolute top-4 right-4 z-10"
                      whileHover={!isMobile ? { rotate: 15, scale: 1.1 } : undefined}
                    >
                      <div className="p-2 bg-white/90 rounded-full shadow-lg backdrop-blur-sm">
                        <Medal className="h-5 w-5 text-amber-600" />
                      </div>
                    </motion.div>
                    )}
                    
                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      {achievement.eventName && (
                        <p className="text-amber-300 text-xs font-bold mb-1 uppercase tracking-wider">{achievement.eventName}</p>
                      )}
                      <h3 className="text-white font-bold text-lg line-clamp-2 drop-shadow-lg">{achievement.title}</h3>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="p-5 relative">
                    {/* Accent line */}
                    <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
                    
                    {/* Description with markdown */}
                    <div className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
                      <InlineMarkdown>{achievement.shortDescription || achievement.description}</InlineMarkdown>
                    </div>
                    
                    {/* Achiever info */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-amber-500/20">
                            {achievement.achievedBy?.charAt(0) || '?'}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                            <Star className="h-1.5 w-1.5 text-white" />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                            {achievement.achievedBy}
                          </p>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Calendar className="h-3 w-3" />
                            <span className="text-xs">{formatDate(achievement.date)}</span>
                          </div>
                        </div>
                      </div>
                      <Trophy className="h-5 w-5 text-amber-400" />
                    </div>
                    
                    {/* Premium CTA */}
                    <div className="flex items-center justify-between pt-4 border-t border-amber-100/50">
                      <span className="text-sm font-semibold text-amber-600 group-hover:text-amber-700">View Details</span>
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 group-hover:bg-amber-500 transition-all duration-300">
                        <ChevronRight className="h-4 w-4 text-amber-600 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </div>
                </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.5 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link to="/achievements">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 h-14 text-lg group shadow-lg shadow-amber-500/25"
            >
              View All Achievements
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
