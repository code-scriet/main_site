import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineMarkdown } from '@/components/ui/markdown';
import { 
  Trophy, Calendar, Loader2, 
  Award, ChevronRight, Image as ImageIcon, Handshake, Sparkles, Star,
  Zap, TrendingUp, Target, Users, Medal
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { useSettings } from '@/context/SettingsContext';

// ============================================
// PREMIUM ACHIEVEMENT CARD
// Elegant glassmorphism with hover effects
// ============================================

function AchievementCard({ achievement, index, featured = false }: { 
  achievement: Achievement; 
  index: number;
  featured?: boolean;
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
        duration: 0.6, 
        delay: index * 0.1, 
        ease: [0.22, 1, 0.36, 1] 
      }}
      whileHover={{ y: -12, transition: { duration: 0.3 } }}
      className={`group h-full ${featured ? 'md:col-span-2 lg:col-span-1' : ''}`}
    >
      <Link to={`/achievements/${achievement.slug || achievement.id}`} className="block h-full">
        <div className="relative h-full bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 border border-amber-100/50">
          {/* Animated gradient border on hover */}
          <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-[-2px] rounded-3xl bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400 blur-sm" />
          </div>
          <div className="absolute inset-[1px] bg-white rounded-3xl" />
          
          {/* Image Container */}
          <div className="relative aspect-[4/3] overflow-hidden">
            {coverImage ? (
              <>
                <motion.img
                  src={coverImage}
                  alt={achievement.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                />
                {/* Premium multi-layer gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-br from-amber-600/20 to-orange-600/20 mix-blend-overlay" />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center relative overflow-hidden">
                {/* Animated background orbs */}
                <motion.div 
                  animate={{ 
                    x: [0, 20, 0], 
                    y: [0, -20, 0],
                    scale: [1, 1.2, 1]
                  }}
                  transition={{ duration: 8, repeat: Infinity }}
                  className="absolute top-4 left-4 w-24 h-24 bg-white/20 rounded-full blur-2xl" 
                />
                <motion.div 
                  animate={{ 
                    x: [0, -20, 0], 
                    y: [0, 20, 0],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 6, repeat: Infinity, delay: 1 }}
                  className="absolute bottom-4 right-4 w-32 h-32 bg-white/20 rounded-full blur-2xl" 
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
                <div className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/40 backdrop-blur-sm">
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
              <h3 className="text-white font-bold text-xl leading-tight line-clamp-2 drop-shadow-2xl group-hover:text-amber-100 transition-colors">
                {achievement.title}
              </h3>
            </div>

            {/* Hover shine effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            </div>
          </div>
          
          <CardContent className="p-5 relative bg-white">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
            
            {/* Description */}
            <div className="text-gray-600 text-sm line-clamp-2 mb-4 min-h-[2.5rem] leading-relaxed">
              <InlineMarkdown>{achievement.shortDescription || achievement.description}</InlineMarkdown>
            </div>
            
            {/* Achiever info with premium avatar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
                    {achievement.achievedBy?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                    <Star className="h-2 w-2 text-white" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">{achievement.achievedBy}</p>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="h-3 w-3" />
                    <span className="text-xs">{formatDate(achievement.date)}</span>
                  </div>
                </div>
              </div>
              <motion.div 
                whileHover={{ rotate: 12, scale: 1.1 }}
                className="p-2 rounded-xl bg-amber-50 group-hover:bg-amber-100 transition-colors"
              >
                <Trophy className="h-5 w-5 text-amber-500" />
              </motion.div>
            </div>
            
            {/* Tags */}
            {achievement.tags && achievement.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {achievement.tags.slice(0, 3).map((tag, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200/50"
                  >
                    {tag}
                  </span>
                ))}
                {achievement.tags.length > 3 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-500">
                    +{achievement.tags.length - 3}
                  </span>
                )}
              </div>
            )}
            
            {/* Premium CTA */}
            <div className="flex items-center justify-between pt-4 border-t border-amber-100/50">
              <span className="text-sm font-semibold text-amber-600 group-hover:text-amber-700 transition-colors">
                Explore Achievement
              </span>
              <motion.div 
                whileHover={{ x: 4 }}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-100 group-hover:bg-gradient-to-br group-hover:from-amber-500 group-hover:to-orange-500 transition-all duration-300"
              >
                <ChevronRight className="h-5 w-5 text-amber-600 group-hover:text-white transition-colors duration-300" />
              </motion.div>
            </div>
          </CardContent>
        </div>
      </Link>
    </motion.div>
  );
}

// ============================================
// STATS COUNTER COMPONENT
// ============================================

function StatCard({ icon: Icon, value, label, delay }: { 
  icon: React.ElementType; 
  value: string | number; 
  label: string;
  delay: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.5, delay }}
      className="group"
    >
      <div className="text-center relative">
        {/* Glass card background with gradient border */}
        <div className="relative inline-block">
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/50 to-orange-500/50 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-opacity duration-300" />
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-3 shadow-xl">
            <Icon className="h-8 w-8 text-amber-400" />
          </div>
        </div>
        <motion.div 
          initial={{ scale: 0.5 }}
          animate={isInView ? { scale: 1 } : {}}
          transition={{ duration: 0.3, delay: delay + 0.2, type: "spring" }}
          className="text-4xl md:text-5xl font-black text-white mb-1"
        >
          {value}
        </motion.div>
        <div className="text-amber-200 text-sm font-medium">{label}</div>
      </div>
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
  const heroRef = useRef(null);
  
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });
  
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 1.1]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);

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
        description="Discover Code.Scriet's journey of empowering students through technology. From workshops to hackathons, see how we're building a culture of innovation and growth."
        url="/achievements"
        keywords="code.scriet achievements, SCRIET coding club awards, student empowerment, coding community impact, hackathon wins"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Achievements', url: 'https://codescriet.dev/achievements' },
        ]}
      />
      
      {/* PREMIUM HERO SECTION with Parallax */}
      <section ref={heroRef} className="relative min-h-[70vh] md:min-h-[80vh] flex items-center overflow-hidden">
        {/* Animated Background - Dark Slate/Amber theme */}
        <motion.div 
          style={{ scale: heroScale, y: heroY }}
          className="absolute inset-0 bg-gradient-to-br from-slate-950 via-amber-950 to-orange-950"
        >
          {/* Mesh Gradient Overlay */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(251,191,36,0.3),rgba(255,255,255,0))]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_0%_100%,rgba(234,88,12,0.2),rgba(255,255,255,0))]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_100%_50%,rgba(251,146,60,0.15),rgba(255,255,255,0))]" />
          </div>

          {/* Grid Pattern */}
          <div 
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />

          {/* Subtle Animated Orbs */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.3, 0.2]
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-20 left-20 w-72 h-72 bg-amber-500/20 rounded-full blur-[100px]" 
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.15, 0.25, 0.15]
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-20 right-20 w-96 h-96 bg-orange-600/20 rounded-full blur-[120px]" 
          />
        </motion.div>
        
        {/* Hero Content */}
        <motion.div 
          style={{ opacity: heroOpacity }}
          className="container mx-auto px-4 relative z-10"
        >
          <div className="text-center max-w-5xl mx-auto">
            {/* Floating Trophy Icon */}
            <motion.div 
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.8, type: "spring", delay: 0.2 }}
              className="relative inline-block mb-8"
            >
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-amber-500/30 rounded-3xl blur-2xl" />
              <motion.div 
                animate={{ 
                  boxShadow: [
                    "0 0 0 0 rgba(251,191,36,0.4)",
                    "0 0 0 20px rgba(251,191,36,0)",
                    "0 0 0 0 rgba(251,191,36,0)"
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl"
              >
                <Trophy className="h-12 w-12 text-amber-400" />
              </motion.div>
            </motion.div>
            
            {/* Main Heading */}
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white mb-6 tracking-tight"
            >
              Our{' '}
              <span className="relative">
                <span className="relative z-10">Achievements</span>
                <motion.span 
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 0.8 }}
                  className="absolute bottom-2 left-0 right-0 h-4 bg-white/30 -z-0 origin-left"
                />
              </span>
            </motion.h1>
            
            {/* Subtitle */}
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="text-xl sm:text-2xl md:text-3xl text-amber-200 font-medium mb-4"
            >
              Celebrating milestones that define our journey
            </motion.p>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed mb-12"
            >
              Every achievement here represents countless hours of learning, collaboration, 
              and the unwavering spirit of our community. These aren't just trophies—they're 
              stories of growth.
            </motion.p>

            {/* Stats Row */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 max-w-3xl mx-auto"
            >
              <StatCard icon={Trophy} value={achievements.length || "0"} label="Achievements" delay={0.8} />
              <StatCard icon={Medal} value={featuredAchievements.length || "0"} label="Featured" delay={0.9} />
              <StatCard icon={Users} value="300+" label="Members" delay={1.0} />
              <StatCard icon={TrendingUp} value="50+" label="Events" delay={1.1} />
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, 10, 0] }}
          transition={{ delay: 1.5, y: { duration: 2, repeat: Infinity } }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 rounded-full border-2 border-amber-400/40 flex items-start justify-center p-2">
            <motion.div 
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-3 rounded-full bg-amber-400/80" 
            />
          </div>
        </motion.div>
      </section>

      {/* ACHIEVEMENT CARDS SECTION */}
      <section className="py-20 sm:py-28 bg-gradient-to-b from-amber-50 via-white to-amber-50/30">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge className="bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 border-amber-200 mb-4 px-4 py-2">
              <Award className="h-4 w-4 mr-2" />
              Our Milestones
            </Badge>
            <h2 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              What We've{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
                Achieved
              </span>
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
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
                        : 'border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400'
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
                <Trophy className="h-16 w-16 text-amber-400" />
              </motion.div>
              <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
              <p className="text-gray-500 text-lg">Loading achievements...</p>
            </div>
          ) : error ? (
            <div className="text-center py-24">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-red-100 mb-6"
              >
                <Trophy className="h-12 w-12 text-red-400" />
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
              <div className="inline-flex items-center justify-center w-28 h-28 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 mb-6 shadow-xl">
                <Trophy className="h-14 w-14 text-amber-400" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-3">No achievements yet</h3>
              <p className="text-gray-500 text-lg max-w-md mx-auto">
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
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-xl shadow-amber-500/30 mb-4">
                      <Sparkles className="h-5 w-5 animate-pulse" />
                      <span className="font-bold text-lg">Featured Achievements</span>
                    </div>
                    <h3 className="text-3xl font-bold text-gray-900">Our Proudest Moments</h3>
                  </motion.div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {featuredAchievements.map((achievement, index) => (
                      <AchievementCard 
                        key={achievement.id} 
                        achievement={achievement} 
                        index={index} 
                        featured 
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
                      <h3 className="text-3xl font-bold text-gray-900">All Achievements</h3>
                      <p className="text-gray-600 mt-2 text-lg">Every milestone matters in our journey</p>
                    </motion.div>
                  )}
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {regularAchievements.map((achievement, index) => (
                      <AchievementCard key={achievement.id} achievement={achievement} index={index} />
                    ))}
                  </div>
                </div>
              )}

              {/* Show all if nothing is featured */}
              {featuredAchievements.length === 0 && regularAchievements.length === 0 && filteredAchievements.length > 0 && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredAchievements.map((achievement, index) => (
                    <AchievementCard key={achievement.id} achievement={achievement} index={index} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* CTA SECTION - Premium Design */}
      <section className="py-24 sm:py-32 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0">
          <motion.div 
            animate={{ 
              x: [0, 50, 0], 
              y: [0, -30, 0],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute top-20 left-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl" 
          />
          <motion.div 
            animate={{ 
              x: [0, -50, 0], 
              y: [0, 30, 0],
              opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ duration: 12, repeat: Infinity, delay: 2 }}
            className="absolute bottom-20 right-1/4 w-[500px] h-[500px] bg-orange-500/20 rounded-full blur-3xl" 
          />
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            {/* Icon with glow effect */}
            <motion.div 
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.8 }}
              viewport={{ once: true }}
              className="relative inline-block mb-8"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl blur-2xl opacity-60" />
              <div className="relative inline-flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-2xl">
                <Handshake className="h-12 w-12 text-white" />
              </div>
            </motion.div>
            
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 leading-tight">
              Want to Be Part of{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
                the Journey?
              </span>
            </h2>
            
            <p className="text-gray-300 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
              Whether you're a student looking to grow, an organization seeking collaboration, 
              or someone who believes in building people—we'd love to connect.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-2xl shadow-amber-500/40 text-lg px-10 py-7 h-auto rounded-2xl font-bold"
                  asChild
                >
                  <Link to="/events">
                    <Zap className="h-5 w-5 mr-2" />
                    Explore Events
                  </Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="border-2 border-amber-400/50 text-amber-400 hover:bg-amber-400/10 hover:border-amber-400 text-lg px-10 py-7 h-auto rounded-2xl font-bold"
                  asChild
                >
                  <a href={`mailto:${settings?.clubEmail || 'contact@codescriet.com'}`}>
                    <Target className="h-5 w-5 mr-2" />
                    Get in Touch
                  </a>
                </Button>
              </motion.div>
            </div>
            
            {/* Bottom tagline */}
            <motion.div 
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              viewport={{ once: true }}
              className="mt-16 pt-8 border-t border-white/10"
            >
              <p className="text-gray-400 text-sm font-medium">
                Join <span className="text-amber-400 font-bold">300+</span> students already building the future
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
