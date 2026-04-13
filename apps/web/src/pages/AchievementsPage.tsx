import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion, useInView } from 'framer-motion';
import { CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import { 
  Trophy, Calendar, Loader2, 
  Award, ChevronRight, Image as ImageIcon, Sparkles, Star,
  Zap, Target, Users
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { useSettings } from '@/context/SettingsContext';
import { useMotionConfig } from '@/hooks/useMotionConfig';

// ============================================
// PREMIUM ACHIEVEMENT CARD
// Elegant glassmorphism with hover effects
// ============================================

function AchievementCard({
  achievement,
  index,
  featured = false,
  isMobile,
  shouldReduceMotion,
}: {
  achievement: Achievement; 
  index: number;
  featured?: boolean;
  isMobile: boolean;
  shouldReduceMotion: boolean;
}) {
  const coverImage = achievement.imageUrl ? processImageUrl(achievement.imageUrl, 'card') : null;
  const hasGallery = achievement.imageGallery && achievement.imageGallery.length > 0;
  const cardRef = useRef(null);
  const isInView = useInView(cardRef, { once: true, margin: "-50px" });
  
  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ 
        duration: shouldReduceMotion ? 0.35 : 0.6, 
        delay: index * 0.1, 
        ease: [0.22, 1, 0.36, 1] 
      }}
      whileHover={isMobile ? undefined : { y: -12, transition: { duration: 0.3 } }}
      className={`group h-full ${featured ? 'md:col-span-2 lg:col-span-1' : ''}`}
    >
      <Link to={`/achievements/${achievement.slug || achievement.id}`} className="block h-full">
        <div className="relative h-full overflow-hidden rounded-3xl border border-amber-100/50 bg-white shadow-lg transition-all duration-500 hover:shadow-2xl dark:border-zinc-800 dark:bg-[#0c0d12] dark:hover:shadow-black/30">
          {/* Animated gradient border on hover */}
          <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-[-2px] rounded-3xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 blur-sm" />
          </div>
            <div className="absolute inset-[1px] rounded-3xl bg-white dark:bg-[#0f1015]" />
          
          {/* Image Container */}
          <div className="relative aspect-[4/3] overflow-hidden">
            {coverImage ? (
              <>
                <motion.img
                  src={coverImage}
                  alt={achievement.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={isMobile ? undefined : { scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                {/* Premium multi-layer gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-br from-amber-600/20 to-orange-600/20 mix-blend-overlay" />
              </>
            ) : (
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 dark:from-rose-700 dark:via-red-600 dark:to-orange-600">
                {/* Animated background orbs */}
                <motion.div 
                  animate={
                    shouldReduceMotion
                      ? { opacity: [0.3, 0.45, 0.3] }
                      : {
                          x: [0, 20, 0],
                          y: [0, -20, 0],
                          scale: [1, 1.2, 1],
                        }
                  }
                  transition={{ duration: shouldReduceMotion ? 6 : 8, repeat: Infinity }}
                  className={`absolute top-4 left-4 rounded-full bg-white/20 ${
                    isMobile ? 'h-16 w-16 blur-xl' : 'h-24 w-24 blur-2xl'
                  }`} 
                />
                <motion.div 
                  animate={
                    shouldReduceMotion
                      ? { opacity: [0.25, 0.35, 0.25] }
                      : {
                          x: [0, -20, 0],
                          y: [0, 20, 0],
                          scale: [1, 1.1, 1],
                        }
                  }
                  transition={{ duration: shouldReduceMotion ? 5 : 6, repeat: Infinity, delay: 1 }}
                  className={`absolute bottom-4 right-4 rounded-full bg-white/20 ${
                    isMobile ? 'h-20 w-20 blur-xl' : 'h-32 w-32 blur-2xl'
                  }`} 
                />
                <Trophy className="h-20 w-20 text-white/40 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            )}
            
            {/* Featured Badge - Premium glass style */}
            {achievement.featured && (
              <motion.div 
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="absolute top-4 left-4 z-10"
              >
                <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 shadow-lg shadow-amber-500/40 backdrop-blur-sm dark:from-rose-600 dark:to-orange-500 dark:shadow-red-950/40">
                  <Sparkles className="h-4 w-4 text-white animate-pulse" />
                  <span className="text-white text-xs font-bold tracking-wider">FEATURED</span>
                </div>
              </motion.div>
            )}
            
            {/* Gallery Indicator */}
            {hasGallery && (
              <div className="absolute top-4 right-4 z-10">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/20 shadow-lg">
                  <ImageIcon className="h-3.5 w-3.5 text-white" />
                  <span className="text-white text-xs font-semibold">{achievement.imageGallery!.length}</span>
                </div>
              </div>
            )}
            
            {/* Title overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
              {achievement.eventName && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 mb-2"
                >
                  <div className="h-px flex-1 bg-gradient-to-r from-amber-400/80 to-transparent" />
                  <span className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                    {achievement.eventName}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-amber-400/80 to-transparent" />
                </motion.div>
              )}
              <h3 className="text-lg font-bold leading-tight text-white line-clamp-2 drop-shadow-2xl transition-colors group-hover:text-amber-100 sm:text-xl">
                {achievement.title}
              </h3>
            </div>

            {/* Hover shine effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </div>
          </div>
          
          <CardContent className="relative bg-white p-5 dark:bg-[#0f1015]">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
            
            {/* Description */}
            <div className="mb-4 min-h-[2.5rem] line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
              <InlineMarkdown>{achievement.shortDescription || achievement.description}</InlineMarkdown>
            </div>
            
            {/* Achiever info with premium avatar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-shadow group-hover:shadow-amber-500/40 dark:from-rose-600 dark:to-orange-500 dark:shadow-red-950/30">
                    {achievement.achievedBy?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-green-400 to-emerald-500 shadow-sm dark:border-[#0f1015]">
                    <Star className="h-2 w-2 text-white" />
                  </div>
                </div>
                <div>
                  <p className="line-clamp-1 text-sm font-semibold text-gray-900 dark:text-zinc-100">{achievement.achievedBy}</p>
                  <div className="flex items-center gap-1 text-gray-500 dark:text-zinc-500">
                    <Calendar className="h-3 w-3" />
                    <span className="text-xs">{formatDate(achievement.date)}</span>
                  </div>
                </div>
              </div>
              <motion.div 
                whileHover={isMobile ? undefined : { rotate: 12, scale: 1.1 }}
                className="rounded-xl bg-amber-50 p-2 transition-colors group-hover:bg-amber-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800"
              >
                <Trophy className="h-5 w-5 text-amber-500 dark:text-rose-400" />
              </motion.div>
            </div>
            
            {/* Tags */}
            {achievement.tags && achievement.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {achievement.tags.slice(0, 3).map((tag, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center rounded-lg border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {tag}
                  </span>
                ))}
                {achievement.tags.length > 3 && (
                  <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-zinc-900 dark:text-zinc-500">
                    +{achievement.tags.length - 3}
                  </span>
                )}
              </div>
            )}
            
            {/* Premium CTA */}
            <div className="flex items-center justify-between border-t border-amber-100/50 pt-4 dark:border-zinc-800">
              <span className="text-sm font-semibold text-amber-600 transition-colors group-hover:text-amber-700 dark:text-rose-400 dark:group-hover:text-rose-300">
                Explore Achievement
              </span>
              <motion.div 
                whileHover={isMobile ? undefined : { x: 4 }}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 transition-all duration-300 group-hover:bg-gradient-to-br group-hover:from-amber-500 group-hover:to-orange-500 dark:bg-zinc-900 dark:group-hover:from-rose-600 dark:group-hover:to-orange-500"
              >
                <ChevronRight className="h-5 w-5 text-amber-600 transition-colors duration-300 group-hover:text-white dark:text-rose-400" />
              </motion.div>
            </div>
          </CardContent>
        </div>
      </Link>
    </motion.div>
  );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function AchievementsPage() {
  const [activeYear, setActiveYear] = useState('All');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const { isMobile, shouldReduceMotion } = useMotionConfig();
  // TODO: Replace with a dynamic member impact count from the API or settings when available.
  const memberImpactCount = '300+';

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAchievements();
        setAchievements(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load achievements');
      } finally {
        setLoading(false);
      }
    };
    fetchAchievements();
  }, []);

  // Get unique years from data
  const years = ['All', ...new Set(achievements.map(a => new Date(a.date).getFullYear().toString()))].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return parseInt(b) - parseInt(a);
  });

  const filteredAchievements = activeYear === 'All'
    ? achievements
    : achievements.filter(a => new Date(a.date).getFullYear().toString() === activeYear);

  // Separate featured and regular achievements
  const featuredAchievements = filteredAchievements.filter(a => a.featured);
  const regularAchievements = filteredAchievements.filter(a => !a.featured);

  return (
    <Layout>
      <SEO 
        title="Achievements"
        description="Achievements and milestones of codescriet, the official coding club of SCRIET, CCS University Meerut."
        url="/achievements"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Achievements', url: 'https://codescriet.dev/achievements' },
        ]}
      />
      
      {/* REFINED HERO - Compact two-column layout */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50/50 to-amber-100/50 py-14 dark:from-[#07080c] dark:via-[#0b0c11] dark:to-[#101116] sm:py-20">
        {/* Background texture */}
        <div className="absolute inset-0 opacity-20 dark:opacity-10">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '50px 50px',
            }}
          />
        </div>
        
        <div className="container relative z-10 mx-auto max-w-7xl px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-7xl mx-auto">
            {/* Left Column - Content */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="space-y-6"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <Badge className="border-amber-200 bg-amber-100 px-4 py-2 text-amber-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Our Journey
                </Badge>
              </motion.div>
              
              {/* Heading */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <h1 className="text-balance text-[clamp(2rem,5vw,3.75rem)] font-black leading-tight text-gray-900 dark:text-zinc-100">
                  Learning
                  <br />
                  <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent dark:from-rose-500 dark:to-red-400">
                    Through Doing
                  </span>
                </h1>
              </motion.div>
              
              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="text-base leading-relaxed text-gray-700 dark:text-zinc-400 sm:text-lg"
              >
                These aren't just milestones—they're proof of what happens when students commit 
                to learning together. Every workshop taught, every project built, every problem 
                solved represents our collective growth as builders and thinkers.
              </motion.p>
              
              {/* Tagline */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="flex items-center gap-2 font-bold text-amber-700 dark:text-rose-400"
              >
                <Target className="h-5 w-5" />
                <span>Growth over glory</span>
              </motion.div>
            </motion.div>
            
            {/* Right Column - Stats Grid */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="grid grid-cols-2 gap-4 sm:gap-6"
            >
              {/* Large stat card - Total Achievements */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                whileHover={isMobile ? undefined : { y: -4, scale: 1.02 }}
                className="col-span-2 relative group"
              >
                <div className="relative rounded-2xl border border-amber-100 bg-white p-6 shadow-xl transition-all duration-300 hover:shadow-2xl dark:border-zinc-800 dark:bg-[#0c0d12] dark:hover:shadow-black/30">
                  <div className="flex items-start justify-between mb-3">
                    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
                      <Trophy className="h-7 w-7 text-amber-600 dark:text-rose-400" />
                    </div>
                    <motion.div
                      animate={shouldReduceMotion ? undefined : { rotate: [0, 5, -5, 0] }}
                      transition={shouldReduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Zap className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                    </motion.div>
                  </div>
                  <div className="mb-1 text-3xl font-black text-gray-900 dark:text-zinc-100 sm:text-4xl">
                    {achievements.length || "0"}
                  </div>
                  <div className="text-sm font-bold text-amber-700 dark:text-rose-400">Milestones</div>
                  <div className="mt-1 text-xs text-gray-600 dark:text-zinc-500">Learning moments captured</div>
                </div>
              </motion.div>
              
              {/* Featured */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                whileHover={isMobile ? undefined : { y: -4, scale: 1.05 }}
                className="relative group"
              >
                <div className="h-full rounded-2xl border border-amber-100 bg-white p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-zinc-800 dark:bg-[#0c0d12] dark:hover:shadow-black/30">
                  <div className="mb-3 w-fit rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                    <Star className="h-5 w-5 text-amber-600 dark:text-rose-400" />
                  </div>
                  <div className="mb-1 text-2xl font-black text-gray-900 dark:text-zinc-100 sm:text-3xl">
                    {featuredAchievements.length || "0"}
                  </div>
                  <div className="text-xs font-bold text-amber-700 dark:text-rose-400">Featured</div>
                </div>
              </motion.div>
              
              {/* Members Impacted */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                whileHover={isMobile ? undefined : { y: -4, scale: 1.05 }}
                className="relative group"
              >
                <div className="h-full rounded-2xl border border-amber-100 bg-white p-5 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-zinc-800 dark:bg-[#0c0d12] dark:hover:shadow-black/30">
                  <div className="mb-3 w-fit rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                    <Users className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="mb-1 text-2xl font-black text-gray-900 dark:text-zinc-100 sm:text-3xl">{memberImpactCount}</div>
                  <div className="text-xs font-bold text-amber-700 dark:text-rose-400">Members</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ACHIEVEMENT CARDS SECTION */}
      <section className="bg-gradient-to-b from-white via-amber-50/30 to-white py-16 dark:from-[#08090d] dark:via-[#0b0c11] dark:to-[#090a0e] sm:py-20">
        <div className="container mx-auto max-w-7xl px-4">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge className="mb-4 border-amber-200 bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-2 text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <Award className="h-4 w-4 mr-2" />
              Our Milestones
            </Badge>
            <h2 className="text-balance mb-4 text-[clamp(1.9rem,4.8vw,3.2rem)] font-black text-gray-900 dark:text-zinc-100">
              What We've{' '}
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent dark:from-rose-500 dark:to-red-400">
                Achieved
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-base text-gray-600 dark:text-zinc-400 sm:text-lg">
              Click on any achievement to explore the full story, photos, and details
            </p>
          </motion.div>

          {/* Year Filter Tabs */}
          {achievements.length > 0 && years.length > 1 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="flex flex-wrap justify-center gap-2 mb-12"
            >
              {years.map((year, index) => (
                <motion.div
                  key={year}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Button
                    variant={activeYear === year ? 'default' : 'outline'}
                    onClick={() => setActiveYear(year)}
                    className={`rounded-xl transition-all duration-300 ${
                      activeYear === year 
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/30 border-0' 
                        : 'border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:border-zinc-600'
                    }`}
                    size="sm"
                  >
                    {year}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="mb-6"
              >
                <Trophy className="h-16 w-16 text-amber-400 dark:text-rose-400" />
              </motion.div>
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-amber-500 dark:text-rose-400" />
              <p className="text-lg text-gray-500 dark:text-zinc-500">Loading achievements...</p>
            </div>
          ) : error ? (
            <div className="text-center py-24">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
              className="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-red-100 dark:bg-red-950/30"
              >
                <Trophy className="h-12 w-12 text-red-400 dark:text-rose-400" />
              </motion.div>
              <p className="text-red-500 mb-4 text-lg">{error}</p>
              <Button onClick={() => window.location.reload()} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                Try Again
              </Button>
            </div>
          ) : filteredAchievements.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-24"
            >
              <div className="mb-6 inline-flex h-28 w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 shadow-xl dark:bg-zinc-900">
                <Trophy className="h-14 w-14 text-amber-400 dark:text-rose-400" />
              </div>
              <h3 className="mb-3 text-2xl font-bold text-gray-900 dark:text-zinc-100 sm:text-3xl">No achievements yet</h3>
              <p className="mx-auto max-w-md text-base text-gray-500 dark:text-zinc-500 sm:text-lg">
                We're working on amazing things. Check back soon!
              </p>
            </motion.div>
          ) : (
            <>
              {/* Featured Achievements */}
              {featuredAchievements.length > 0 && (
                <div className="mb-20">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-10"
                  >
                    <div className="mb-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-white shadow-xl shadow-amber-500/30 dark:from-rose-600 dark:to-orange-500 dark:shadow-red-950/40">
                      <Sparkles className="h-5 w-5 animate-pulse" />
                      <span className="font-bold text-lg">Featured Achievements</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 sm:text-3xl">Our Proudest Moments</h3>
                  </motion.div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {featuredAchievements.map((achievement, index) => (
                      <AchievementCard 
                        key={achievement.id} 
                        achievement={achievement} 
                        index={index} 
                        featured
                        isMobile={isMobile}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All/Regular Achievements */}
              {regularAchievements.length > 0 && (
                <div>
                  {featuredAchievements.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6 }}
                      viewport={{ once: true }}
                      className="text-center mb-10"
                    >
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 sm:text-3xl">All Achievements</h3>
                      <p className="mt-2 text-base text-gray-600 dark:text-zinc-400 sm:text-lg">Every milestone matters in our journey</p>
                    </motion.div>
                  )}
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {regularAchievements.map((achievement, index) => (
                      <AchievementCard
                        key={achievement.id}
                        achievement={achievement}
                        index={index}
                        isMobile={isMobile}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Show all if nothing is featured */}
              {featuredAchievements.length === 0 && regularAchievements.length === 0 && filteredAchievements.length > 0 && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredAchievements.map((achievement, index) => (
                    <AchievementCard
                      key={achievement.id}
                      achievement={achievement}
                      index={index}
                      isMobile={isMobile}
                      shouldReduceMotion={shouldReduceMotion}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* CTA SECTION - Collaboration & Partnership */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-amber-900 via-amber-800 to-orange-900 relative overflow-hidden">
        {/* Subtle texture */}
        <div className="absolute inset-0 opacity-10">
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(rgba(251,191,36,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.1) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
        </div>
        
        <div className="container relative z-10 mx-auto max-w-7xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto"
          >
            <div className="text-center mb-12">
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.6 }}
                viewport={{ once: true }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-400/20 border border-amber-400/30 mb-6"
              >
                <Users className="h-8 w-8 text-amber-300" />
              </motion.div>
              
              <h2 className="mb-6 text-balance text-[clamp(2rem,4.4vw,3.2rem)] font-black leading-tight text-white">
                Partner With Us
              </h2>
              
              <p className="mx-auto mb-10 max-w-3xl text-base leading-relaxed text-gray-300 sm:text-lg">
                Looking to sponsor events, collaborate on projects, or support our community? 
                We're always open to partnerships that help students learn and grow. Let's build something meaningful together.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 mb-10">
              <motion.div 
                whileHover={isMobile ? undefined : { y: -4, scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="bg-amber-950/30 backdrop-blur-sm rounded-2xl p-5 border border-amber-700/30 hover:border-amber-600/50 transition-all duration-300"
              >
                <h3 className="text-lg font-bold text-white mb-2">For Sponsors</h3>
                <p className="text-amber-200 text-sm leading-relaxed">
                  Support student development through workshop sponsorships, event partnerships, or resource contributions.
                </p>
              </motion.div>
              <motion.div 
                whileHover={isMobile ? undefined : { y: -4, scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="bg-amber-950/30 backdrop-blur-sm rounded-2xl p-5 border border-amber-700/30 hover:border-amber-600/50 transition-all duration-300"
              >
                <h3 className="text-lg font-bold text-white mb-2">For Organizations</h3>
                <p className="text-amber-200 text-sm leading-relaxed">
                  Collaborate on projects, host technical sessions, or provide mentorship opportunities for our members.
                </p>
              </motion.div>
            </div>
            
            <div className="text-center">
              <Button 
                size="lg" 
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-base px-10 py-6 h-auto rounded-xl font-bold shadow-lg shadow-amber-500/20"
                asChild
              >
                <a href={`mailto:${settings?.clubEmail || 'contact@codescriet.com'}`}>
                  Get in Touch
                  <ChevronRight className="h-5 w-5 ml-2" />
                </a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
