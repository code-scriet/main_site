import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight, Loader2, Star, Medal, ChevronRight, Image as ImageIcon, Sparkles, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';
import { InlineMarkdown } from '@/components/ui/inline-markdown';

export function AchievementsShowcase() {
  const { data: homeData, isLoading } = useHomePageData();
  const achievements = homeData?.featuredAchievements ?? [];
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="hsec hsec-honey py-16 sm:py-24 relative overflow-hidden">
      {/* Faint trophy pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23fbbf24' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9H4.5a2.5 2.5 0 0 1 0-5H6'/%3E%3Cpath d='M18 9h1.5a2.5 2.5 0 0 0 0-5H18'/%3E%3Cpath d='M4 22h16'/%3E%3Cpath d='M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'/%3E%3Cpath d='M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'/%3E%3Cpath d='M18 2H6v7a6 6 0 0 0 12 0V2Z'/%3E%3C/svg%3E")`,
          backgroundSize: '80px 80px',
        }}
      />

      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-12"
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold hx-t1 mb-3 sm:mb-4">
            Our <span className="hx-grad-text">Achievements</span>
          </h2>
          <p className="text-base sm:text-lg hx-t2 max-w-2xl mx-auto px-2">
            Celebrating the success and accomplishments of our talented community members
          </p>
        </motion.div>

        {/* Achievements Grid */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
          </div>
        ) : achievements.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#f97316]/15 border border-[#f97316]/25 mb-6">
              <Trophy className="h-10 w-10 text-amber-400" />
            </div>
            <h3 className="text-xl font-semibold hx-t1 mb-2">Achievements coming soon!</h3>
            <p className="hx-t3">Stay tuned for our community's accomplishments</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {achievements.map((achievement, index) => (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: animationY }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: animationDuration, delay: index * staggerDelay, ease: [0.22, 1, 0.36, 1] }}
                viewport={{ once: true, margin: '-50px' }}
                whileHover={!isMobile ? { y: -10 } : undefined}
                className="group h-full"
              >
                <Link to={`/achievements/${achievement.slug || achievement.id}`} className="block h-full">
                  <div className="glass-card glass-card--lift h-full overflow-hidden !rounded-3xl">
                    {/* Image */}
                    <div className="relative h-48 overflow-hidden">
                      {achievement.imageUrl ? (
                        <>
                          <img
                            src={processImageUrl(achievement.imageUrl, 'thumbnail')}
                            alt={achievement.title}
                            width={400}
                            height={300}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent opacity-80" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 flex items-center justify-center relative overflow-hidden">
                          <Trophy className="h-16 w-16 text-white/30" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        </div>
                      )}

                      {/* Featured badge */}
                      {achievement.featured && (
                        <div className="absolute top-4 left-4 z-10">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/30">
                            <Sparkles className="h-3 w-3 text-white" />
                            <span className="text-white text-xs font-bold tracking-wide">FEATURED</span>
                          </div>
                        </div>
                      )}

                      {/* Gallery count */}
                      {achievement.imageGallery && achievement.imageGallery.length > 0 && (
                        <div className="absolute top-4 right-4 z-10">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/15 backdrop-blur-md rounded-full border border-white/25">
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
                          <div className="p-2 bg-white/10 border border-white/15 rounded-full shadow-lg backdrop-blur-sm">
                            <Medal className="h-5 w-5 text-amber-400" />
                          </div>
                        </motion.div>
                      )}

                      {/* Title Overlay */}
                      <div className="on-media absolute bottom-0 left-0 right-0 p-4">
                        {achievement.eventName && (
                          <p className="text-amber-300 text-xs font-bold mb-1 uppercase tracking-wider">{achievement.eventName}</p>
                        )}
                        <h3 className="text-white font-bold text-lg line-clamp-2 drop-shadow-lg">{achievement.title}</h3>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 relative">
                      <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

                      <div className="hx-t2 text-sm mb-4 line-clamp-2 leading-relaxed">
                        <InlineMarkdown>{achievement.shortDescription || achievement.description}</InlineMarkdown>
                      </div>

                      {/* Achiever info */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-amber-500/20">
                              {achievement.achievedBy?.charAt(0) || '?'}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#161413] flex items-center justify-center">
                              <Star className="h-1.5 w-1.5 text-white" />
                            </div>
                          </div>
                          <div>
                            <p className="hx-t1 text-sm font-semibold line-clamp-1">{achievement.achievedBy}</p>
                            <div className="flex items-center gap-1 hx-t3">
                              <Calendar className="h-3 w-3" />
                              <span className="text-xs">{formatDate(achievement.date)}</span>
                            </div>
                          </div>
                        </div>
                        <Trophy className="h-5 w-5 text-amber-400" />
                      </div>

                      {/* CTA */}
                      <div className="flex items-center justify-between pt-4 border-t border-white/8">
                        <span className="text-sm font-semibold text-amber-300 group-hover:text-amber-200">View Details</span>
                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f97316]/15 group-hover:bg-[#f97316] transition-all duration-300">
                          <ChevronRight className="h-4 w-4 text-amber-300 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
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
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link
            to="/achievements"
            className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f97316] to-[#fb923c] px-8 text-lg font-semibold text-white shadow-[0_8px_30px_rgba(249,115,22,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_rgba(249,115,22,0.5)]"
          >
            View All Achievements
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
