import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Calendar, Users, Loader2 } from 'lucide-react';
import { api, type Achievement } from '@/lib/api';

export default function AchievementsPage() {
  const [activeYear, setActiveYear] = useState('All');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        title="Achievements"
        description="Celebrating the accomplishments of code.scriet members - hackathon wins, competition victories, and outstanding achievements."
        url="/achievements"
        keywords="code.scriet achievements, SCRIET coding club awards, hackathon winners, programming achievements"
      />
      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-br from-amber-400 via-orange-500 to-amber-900 text-white">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <Trophy className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4">Our Achievements</h1>
            <p className="text-xl text-amber-50 max-w-2xl mx-auto">
              Celebrating the success and accomplishments of our talented members
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 bg-white border-b border-amber-200">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto text-center">
            <div>
              <p className="text-3xl font-bold text-amber-600">{achievements.length}</p>
              <p className="text-gray-600 text-sm">Achievements</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-600">{years.length - 1}</p>
              <p className="text-gray-600 text-sm">Years</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-amber-600">{new Set(achievements.map(a => a.achievedBy)).size}</p>
              <p className="text-gray-600 text-sm">Winners</p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      {years.length > 1 && (
        <section className="py-6 bg-amber-50 border-b border-amber-200">
          <div className="container mx-auto px-4">
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

      {/* Achievements Grid */}
      <section className="py-12 bg-amber-50 min-h-[60vh]">
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
          ) : filteredAchievements.length === 0 ? (
            <div className="text-center py-20">
              <Trophy className="h-16 w-16 text-amber-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No achievements yet. Check back soon!</p>
            </div>
          ) : (
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
                          <span>{new Date(achievement.date).toLocaleDateString()}</span>
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
    </Layout>
  );
}
