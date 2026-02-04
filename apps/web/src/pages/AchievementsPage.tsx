import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InlineMarkdown } from '@/components/ui/markdown';
import { 
  Trophy, Calendar, Loader2, 
  Award, ChevronRight, Image as ImageIcon, Handshake, Sparkles, Star
} from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';
import { useSettings } from '@/context/SettingsContext';

// Premium Achievement Card Component with glassmorphism and elegant design
function AchievementCard({ achievement, index }: { achievement: Achievement; index: number }) {
  const coverImage = achievement.imageUrl ? processImageUrl(achievement.imageUrl, 'card') : null;
  const hasGallery = achievement.imageGallery && achievement.imageGallery.length > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true }}
      whileHover={{ y: -8 }}
      className="group h-full"
    >
      <Link to={`/achievements/${achievement.slug || achievement.id}`} className="block h-full">
        <div className="relative h-full bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 border border-amber-100/50">
          {/* Decorative gradient border effect */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-400/20 via-transparent to-orange-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          {/* Image Container */}
          <div className="relative aspect-[4/3] overflow-hidden">
            {coverImage ? (
              <>
                <img
                  src={coverImage}
                  alt={achievement.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  loading="lazy"
                />
                {/* Premium multi-layer gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-br from-amber-600/20 to-orange-600/20 mix-blend-overlay" />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center relative">
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute top-4 left-4 w-20 h-20 bg-white/20 rounded-full blur-2xl" />
                  <div className="absolute bottom-4 right-4 w-32 h-32 bg-white/20 rounded-full blur-2xl" />
                </div>
                <Trophy className="h-20 w-20 text-white/40" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
            )}
            
            {/* Featured Badge - Premium style */}
            {achievement.featured && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="absolute top-4 left-4 z-10"
              >
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-lg shadow-amber-500/30">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                  <span className="text-white text-xs font-bold tracking-wide">FEATURED</span>
                </div>
              </motion.div>
            )}
            
            {/* Gallery Indicator - Glassmorphism style */}
            {hasGallery && (
              <div className="absolute top-4 right-4 z-10">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/30 shadow-lg">
                  <ImageIcon className="h-3.5 w-3.5 text-white" />
                  <span className="text-white text-xs font-semibold">{achievement.imageGallery!.length}</span>
                </div>
              </div>
            )}
            
            {/* Title overlay with elegant typography */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              {achievement.eventName && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-amber-400/80 to-transparent" />
                  <span className="text-amber-300 text-xs font-bold uppercase tracking-widest">
                    {achievement.eventName}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-amber-400/80 to-transparent" />
                </div>
              )}
              <h3 className="text-white font-bold text-xl leading-tight line-clamp-2 drop-shadow-2xl">
                {achievement.title}
              </h3>
            </div>
          </div>
          
          <CardContent className="p-5 relative">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
            
            {/* Description with markdown support */}
            <div className="text-gray-600 text-sm line-clamp-2 mb-4 min-h-[2.5rem] leading-relaxed">
              <InlineMarkdown>{achievement.shortDescription || achievement.description}</InlineMarkdown>
            </div>
            
            {/* Achiever info with premium avatar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-amber-500/20">
                    {achievement.achievedBy?.charAt(0) || '?'}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
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
              <Trophy className="h-5 w-5 text-amber-400" />
            </div>
            
            {/* Tags with premium styling */}
            {achievement.tags && achievement.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {achievement.tags.slice(0, 3).map((tag, i) => (
                  <span 
                    key={i} 
                    className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border border-amber-200/50"
                  >
                    {tag}
                  </span>
                ))}
                {achievement.tags.length > 3 && (
                  <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
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
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 group-hover:bg-amber-500 transition-all duration-300">
                <ChevronRight className="h-4 w-4 text-amber-600 group-hover:text-white group-hover:translate-x-0.5 transition-all duration-300" />
              </div>
            </div>
          </CardContent>
        </div>
      </Link>
    </motion.div>
  );
}

export default function AchievementsPage() {
  const [activeYear, setActiveYear] = useState('All');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

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
      
      {/* Hero Section - Clean and Focused */}
      <section className="py-16 sm:py-24 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mb-6 shadow-2xl"
            >
              <Trophy className="h-10 w-10 text-white" />
            </motion.div>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 tracking-tight">
              Our Achievements
            </h1>
            
            <p className="text-xl sm:text-2xl text-amber-50 font-medium mb-6">
              Celebrating milestones that define our journey
            </p>
            
            <p className="text-base sm:text-lg text-amber-100 max-w-2xl mx-auto leading-relaxed">
              Every achievement here represents countless hours of learning, collaboration, 
              and the unwavering spirit of our community. These aren't just trophies—they're 
              stories of growth.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Achievement Cards Section */}
      <section className="py-16 sm:py-20 bg-amber-50">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 mb-4">
              <Trophy className="h-3 w-3 mr-1" />
              Our Milestones
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              What We've Achieved
            </h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Click on any achievement to explore the full story, photos, and details
            </p>
          </motion.div>

          {/* Year Filter Tabs */}
          {achievements.length > 0 && years.length > 1 && (
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {years.map((year) => (
                <Button
                  key={year}
                  variant={activeYear === year ? 'default' : 'outline'}
                  onClick={() => setActiveYear(year)}
                  className={activeYear === year 
                    ? 'bg-amber-500 hover:bg-amber-600 shadow-lg' 
                    : 'border-amber-300 text-amber-700 hover:bg-amber-100'
                  }
                  size="sm"
                >
                  {year}
                </Button>
              ))}
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
              <p className="text-gray-500">Loading achievements...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-100 mb-6">
                <Trophy className="h-10 w-10 text-red-400" />
              </div>
              <p className="text-red-500 mb-4 text-lg">{error}</p>
              <Button onClick={() => window.location.reload()} className="bg-amber-500 hover:bg-amber-600">
                Try Again
              </Button>
            </div>
          ) : filteredAchievements.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 mb-6">
                <Trophy className="h-12 w-12 text-amber-400" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">No achievements yet</h3>
              <p className="text-gray-500 text-lg">
                We're working on amazing things. Check back soon!
              </p>
            </motion.div>
          ) : (
            <>
              {/* Featured Achievements */}
              {featuredAchievements.length > 0 && (
                <div className="mb-16">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    viewport={{ once: true }}
                    className="text-center mb-8"
                  >
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-full shadow-lg mb-4">
                      <Award className="h-4 w-4" />
                      <span className="font-semibold">Featured Achievements</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">Our Proudest Moments</h3>
                  </motion.div>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {featuredAchievements.map((achievement, index) => (
                      <AchievementCard key={achievement.id} achievement={achievement} index={index} />
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
                      className="text-center mb-8"
                    >
                      <h3 className="text-2xl font-bold text-gray-900">All Achievements</h3>
                      <p className="text-gray-600 mt-2">Every milestone matters in our journey</p>
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

      {/* CTA Section - Premium Design */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-300 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-300 rounded-full blur-3xl" />
        </div>
        
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <Card className="bg-white/80 backdrop-blur-xl border-amber-200/50 shadow-2xl overflow-hidden">
              <CardContent className="p-12 sm:p-16 text-center">
                {/* Icon with glow effect */}
                <div className="relative inline-block mb-8">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full blur-xl opacity-50" />
                  <div className="relative inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl">
                    <Handshake className="h-10 w-10 text-white" />
                  </div>
                </div>
                
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                  Want to Be Part of the Journey?
                </h2>
                
                <p className="text-gray-700 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
                  Whether you're a student looking to grow, an organization seeking collaboration, 
                  or someone who believes in building people—we'd love to connect.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <Button 
                    size="lg" 
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-xl hover:shadow-2xl transition-all duration-300 text-lg px-8 py-6 h-auto"
                    asChild
                  >
                    <Link to="/events">
                      <Calendar className="h-5 w-5 mr-2" />
                      Explore Events
                    </Link>
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-2 border-amber-400 text-amber-700 hover:bg-amber-50 hover:border-amber-500 shadow-lg hover:shadow-xl transition-all duration-300 text-lg px-8 py-6 h-auto"
                    asChild
                  >
                    <a href={`mailto:${settings?.clubEmail || 'contact@codescriet.com'}`}>
                      Get in Touch
                    </a>
                  </Button>
                </div>
                
                {/* Decorative bottom accent */}
                <div className="mt-10 pt-8 border-t border-amber-200">
                  <p className="text-sm text-gray-600 font-medium">
                    Join <span className="text-amber-700 font-bold">300+</span> students already building the future
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
