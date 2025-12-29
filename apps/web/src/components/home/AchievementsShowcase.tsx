import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Trophy, ArrowRight, Loader2, Award, Star, Medal } from 'lucide-react';
import { api, type Achievement } from '@/lib/api';

export function AchievementsShowcase() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100" />
      
      {/* Decorative Elements */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-amber-200/50 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-orange-200/50 rounded-full blur-3xl" />
      
      {/* Trophy Pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        {[...Array(20)].map((_, i) => (
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
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-200 text-amber-800 mb-6"
          >
            <Award className="h-4 w-4" />
            <span className="text-sm font-medium">Pride of code.scriet</span>
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Our{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">
              Achievements
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
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
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="group"
              >
                <div className="h-full bg-white rounded-2xl shadow-lg overflow-hidden border border-amber-100 hover:shadow-2xl transition-all duration-500">
                  {/* Image */}
                  <div className="relative h-44 overflow-hidden">
                    {achievement.imageUrl ? (
                      <img
                        src={achievement.imageUrl}
                        alt={achievement.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 flex items-center justify-center">
                        <Trophy className="h-16 w-16 text-white/40" />
                      </div>
                    )}
                    
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    
                    {/* Medal Icon */}
                    <motion.div 
                      className="absolute top-4 right-4"
                      whileHover={{ rotate: 15, scale: 1.1 }}
                    >
                      <div className="p-2 bg-white/90 rounded-full shadow-lg backdrop-blur-sm">
                        <Medal className="h-5 w-5 text-amber-600" />
                      </div>
                    </motion.div>
                    
                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      {achievement.eventName && (
                        <p className="text-amber-300 text-xs font-medium mb-1">{achievement.eventName}</p>
                      )}
                      <h3 className="text-white font-bold text-lg line-clamp-1">{achievement.title}</h3>
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="p-5">
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {achievement.description}
                    </p>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                          {achievement.achievedBy?.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">
                            {achievement.achievedBy}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(achievement.date).toLocaleDateString('en-US', { 
                              month: 'short', 
                              year: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>
                      <Star className="h-5 w-5 text-amber-500" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
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
