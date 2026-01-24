import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Calendar, Users, Loader2, Rocket, Target, Zap, Award, TrendingUp, Globe, Handshake, ArrowRight } from 'lucide-react';
import { api, type Achievement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { useSettings } from '@/context/SettingsContext';

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

  return (
    <Layout>
      <SEO 
        title="Achievements & Momentum"
        description="Code.Scriet — Built Different. In just three months, we've empowered 300+ students, hosted 3 high-engagement events, and built a culture that puts students first."
        url="/achievements"
        keywords="code.scriet achievements, SCRIET coding club awards, student empowerment, coding community impact"
      />
      
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <Trophy className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Achievements & Momentum</h1>
            <p className="text-2xl text-amber-50 font-semibold mb-4">Code.Scriet — Built Different.</p>
            <div className="max-w-2xl mx-auto">
              <p className="text-lg text-amber-50 mb-4">
                Code.Scriet was founded with one belief:
              </p>
              <blockquote className="text-xl italic text-white font-medium border-l-4 border-white pl-4 mb-4">
                "Students don't need more clubs. They need ecosystems."
              </blockquote>
              <p className="text-amber-50">
                In just three months, we've moved fast—building skills, confidence, leadership, and a culture that puts students first. Aggressively first.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Early Impact Stats */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-amber-900 mb-4">Early Impact, Real Momentum</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              We're young. But we're not idle.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Zap, value: '3', label: 'Months since inception', subtext: 'Continuous on-ground activity' },
              { icon: Users, value: '300+', label: 'Students empowered', subtext: 'Hands-on learning & mentorship' },
              { icon: Rocket, value: '3', label: 'High-engagement events', subtext: 'Focused on practical growth' },
              { icon: Target, value: '1', label: 'Foundational workshop', subtext: 'Git & GitHub mastery' },
              { icon: Award, value: '1', label: 'Media mention secured', subtext: 'Public recognition achieved' },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full text-center hover:shadow-lg transition-all duration-300 border-amber-200">
                  <CardContent className="p-6">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
                      <stat.icon className="h-7 w-7 text-white" />
                    </div>
                    <p className="text-4xl font-bold text-amber-600 mb-2">{stat.value}</p>
                    <p className="text-gray-900 font-semibold mb-1">{stat.label}</p>
                    <p className="text-gray-500 text-sm">{stat.subtext}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
            className="text-center mt-8"
          >
            <p className="text-xl font-semibold text-amber-900">Not experiments. Execution.</p>
          </motion.div>
        </div>
      </section>

      {/* What We've Built */}
      <section className="py-16 bg-amber-50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-amber-900 mb-4">What We've Actually Built on Campus</h2>
            <p className="text-gray-600 text-xl max-w-2xl mx-auto mb-2">
              Code.Scriet isn't "just tech."
            </p>
            <p className="text-amber-700 text-2xl font-bold">
              It's a student-development engine.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {[
              { icon: Target, title: 'Practical Real-World Skills', description: 'Introduced early in students\' academic journeys' },
              { icon: Zap, title: 'Learning by Doing Culture', description: 'Active participation, not passive listening' },
              { icon: TrendingUp, title: 'Curiosity to Confidence', description: 'Especially for those with zero prior exposure' },
              { icon: Users, title: 'Growing Network', description: 'Learners, leaders, and collaborators united' },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                        <item.icon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-amber-900 mb-2">{item.title}</h3>
                        <p className="text-gray-600">{item.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-center mt-8"
          >
            <p className="text-lg text-gray-600 italic">This is groundwork. The kind that lasts.</p>
          </motion.div>
        </div>
      </section>

      {/* Why We're Different */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-amber-900 mb-6">Why Code.Scriet Is Different</h2>
            <blockquote className="text-2xl text-gray-700 max-w-3xl mx-auto mb-8">
              <p className="mb-2">Most clubs organize events.</p>
              <p className="text-amber-700 font-bold">We design trajectories.</p>
            </blockquote>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
            {[
              { title: 'Tech as a Tool', description: 'Not the end goal—empowering people is' },
              { title: 'Holistic Focus', description: 'Skills, mindset, leadership, and collaboration' },
              { title: 'Systems Over Shortcuts', description: 'Building depth before chasing scale' },
              { title: 'Campus to Global', description: 'Built to grow from local to international' },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200"
              >
                <ArrowRight className="h-5 w-5 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-900 mb-1">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <Card className="inline-block bg-gradient-to-br from-amber-100 to-orange-100 border-amber-300">
              <CardContent className="p-8">
                <p className="text-lg text-gray-700 mb-2">Our mission is simple, borderline audacious:</p>
                <p className="text-2xl font-bold text-amber-900 mb-2">
                  "Building an environment where curiosity becomes capability."
                </p>
                <p className="text-gray-700">And we're serious about making it happen.</p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Momentum Philosophy */}
      <section className="py-16 bg-gradient-to-br from-amber-900 to-amber-950 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center max-w-3xl mx-auto"
          >
            <h2 className="text-4xl font-bold mb-6">Momentum Over Milestones</h2>
            <p className="text-xl text-amber-100 mb-6">
              We don't believe achievements are endpoints. They're signals.
            </p>
            <div className="p-6 bg-amber-900/50 rounded-xl backdrop-blur-sm border border-amber-700">
              <p className="text-lg text-amber-50">
                In our first phase, we've proven one thing clearly:
              </p>
              <p className="text-2xl font-bold text-white mt-2">
                When given the right environment, students rise fast.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* What's Next */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
              <Rocket className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-4xl font-bold text-amber-900 mb-4">What's Next</h2>
            <p className="text-gray-600 text-lg">The next chapter is already in motion</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {[
              { icon: Target, title: 'Structured Learning Tracks', description: 'Moving beyond single workshops to comprehensive pathways' },
              { icon: Users, title: 'Cross-Campus Collaboration', description: 'Partnering with other clubs and institutions' },
              { icon: Globe, title: 'National-Level Initiatives', description: 'Expanding our reach and impact' },
              { icon: Handshake, title: 'Strategic Partnerships', description: 'Accelerating scale and creating opportunities' },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <Card className="h-full text-center hover:shadow-lg transition-all duration-300 border-amber-200">
                  <CardContent className="p-6">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 mb-4">
                      <item.icon className="h-7 w-7 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">{item.title}</h3>
                    <p className="text-gray-600 text-sm">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            viewport={{ once: true }}
            className="text-center mt-8"
          >
            <p className="text-lg text-gray-700">
              We're not asking for belief. <span className="font-bold text-amber-900">We're offering alignment.</span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Invitation/CTA */}
      <section className="py-16 bg-gradient-to-br from-amber-50 to-orange-50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <Card className="border-amber-300 bg-white/80 backdrop-blur-sm">
              <CardContent className="p-8 md:p-12 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-6">
                  <Handshake className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-amber-900 mb-4">Open to Collaboration</h2>
                <p className="text-lg text-gray-700 mb-6">
                  If you're an organization, sponsor, or club that believes in <span className="font-bold text-amber-900">building people before brands</span>—Code.Scriet is open to collaboration.
                </p>
                <div className="flex flex-col items-center gap-4">
                  <div className="flex flex-col md:flex-row items-center gap-4 text-lg text-gray-700">
                    <span className="font-semibold text-amber-900">We're early.</span>
                    <span className="font-semibold text-amber-900">We're moving.</span>
                    <span className="font-bold text-amber-900 text-xl">And we're just getting started.</span>
                  </div>
                  <Button 
                    size="lg" 
                    className="mt-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                    asChild
                  >
                    <a href={`mailto:${settings?.clubEmail || 'contact@codescriet.com'}`}>
                      Get in Touch
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Filter Tabs - Only show when there are achievements */}
      {achievements.length > 0 && years.length > 1 && (
        <section className="py-6 bg-amber-100 border-b border-amber-300">
          <div className="container mx-auto px-4">
            <h3 className="text-2xl font-bold text-amber-900 text-center mb-4">Member Achievements</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {years.map((year) => (
                <Button
                  key={year}
                  variant={activeYear === year ? 'default' : 'outline'}
                  onClick={() => setActiveYear(year)}
                  className="min-w-20"
                >
                  {year}
                </Button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Achievements Grid - Only show when there are achievements */}
      {achievements.length > 0 && (
      <section className="py-12 bg-amber-50 min-h-[40vh]">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Try Again
              </Button>
            </div>
          ) : filteredAchievements.length === 0 ? null : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredAchievements.map((achievement, index) => (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                >
                  <Card className="h-full overflow-hidden group hover:shadow-xl transition-all duration-300">
                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-amber-200 to-orange-200">
                      {achievement.imageUrl ? (
                        <img
                          src={achievement.imageUrl}
                          alt={achievement.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Trophy className="h-16 w-16 text-amber-400" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        {achievement.eventName && (
                          <p className="text-amber-200 text-xs font-medium">{achievement.eventName}</p>
                        )}
                        <h3 className="text-white font-bold line-clamp-2">{achievement.title}</h3>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <p className="text-gray-600 text-sm line-clamp-3 mb-3">{achievement.description}</p>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1 text-amber-600">
                          <Users className="h-4 w-4" />
                          <span>{achievement.achievedBy}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <Calendar className="h-4 w-4" />
                          <span>{formatDate(achievement.date)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
      )}
    </Layout>
  );
}
