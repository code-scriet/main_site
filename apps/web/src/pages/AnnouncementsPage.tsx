import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Calendar, AlertCircle, Info, AlertTriangle, Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement } from '@/lib/api';

const priorityConfig = {
  LOW: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Info },
  MEDIUM: { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Bell },
  HIGH: { color: 'bg-orange-100 text-orange-700 border-orange-300', icon: AlertTriangle },
  URGENT: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircle },
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        console.log('Fetching announcements...');
        const data = await api.getAnnouncements();
        console.log('Announcements loaded:', data);
        setAnnouncements(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load announcements:', err);
        setError(err instanceof Error ? err.message : 'Failed to load announcements');
      } finally {
        setLoading(false);
      }
    };
    loadAnnouncements();
  }, []);

  const filteredAnnouncements = filter === 'ALL' 
    ? announcements 
    : announcements.filter(a => a.priority === filter);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <Layout>
      <SEO 
        title="Announcements"
        description="Stay updated with the latest news, updates, and announcements from code.scriet - SCRIET's official coding club."
        url="/announcements"
        keywords="code.scriet announcements, SCRIET coding club news, club updates"
      />
      <section className="py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 min-h-screen">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-4">
              <Megaphone className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-amber-900 mb-4">
              Announcements
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Stay updated with the latest news, events, and important information from code.scriet
            </p>
          </motion.div>

          {/* Priority Filter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-2 justify-center mb-8"
          >
            {(['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((priority) => (
              <button
                key={priority}
                onClick={() => setFilter(priority)}
                className={`px-4 py-2 rounded-full font-medium transition-all ${
                  filter === priority
                    ? 'bg-amber-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                {priority}
              </button>
            ))}
          </motion.div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-amber-600 border-r-transparent"></div>
              <p className="mt-4 text-gray-600">Loading announcements...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-12">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-700 mb-2">Error Loading Announcements</h3>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredAnnouncements.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <Bell className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                No announcements found
              </h3>
              <p className="text-gray-500">
                {filter === 'ALL' 
                  ? 'Check back later for updates!' 
                  : `No ${filter.toLowerCase()} priority announcements at the moment.`}
              </p>
            </motion.div>
          )}

          {/* Announcements Grid */}
          {!loading && !error && filteredAnnouncements.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto"
            >
            {filteredAnnouncements.map((announcement) => {
              const config = priorityConfig[announcement.priority];
              const Icon = config.icon;

              return (
                <motion.div
                  key={announcement.id}
                  variants={itemVariants}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <Card className="h-full hover:shadow-xl transition-all duration-300 border-amber-200 bg-white/80 backdrop-blur-sm">
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config.color}`}>
                          <Icon className="h-4 w-4" />
                          <span className="text-xs font-semibold">{announcement.priority}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="h-4 w-4" />
                          {new Date(announcement.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <CardTitle className="text-xl text-amber-900 leading-tight">
                        {announcement.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                        {announcement.body}
                      </p>
                      {announcement.creator && (
                        <div className="mt-4 pt-4 border-t border-amber-100">
                          <p className="text-sm text-gray-500">
                            Posted by <span className="font-medium text-amber-700">{announcement.creator.name}</span>
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
          )}
        </div>
      </section>
    </Layout>
  );
}
