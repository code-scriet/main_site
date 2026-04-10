import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { BreadcrumbSchema } from '@/components/ui/schema';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bell, Calendar, AlertCircle, Info, AlertTriangle, Megaphone, Pin, Star, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement, Poll } from '@/lib/api';
import { PollCard } from '@/components/polls/PollCard';
import { formatDate } from '@/lib/dateUtils';
import { processImageUrl } from '@/lib/imageUtils';

const priorityConfig = {
  LOW: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: Info },
  MEDIUM: { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Bell },
  HIGH: { color: 'bg-orange-100 text-orange-700 border-orange-300', icon: AlertTriangle },
  URGENT: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertCircle },
};

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const [announcementData, pollData] = await Promise.all([
          api.getAnnouncements(),
          api.getPolls({ limit: 6 }),
        ]);
        setAnnouncements(announcementData);
        setPolls(pollData);
        setError(null);
      } catch (err) {
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
        description="Latest news and updates from codescriet, the official coding club of SCRIET."
        url="/announcements"
      />
      <BreadcrumbSchema
        items={[
          { name: 'Home', url: 'https://codescriet.dev' },
          { name: 'Announcements', url: 'https://codescriet.dev/announcements' },
        ]}
      />
      <section className="py-12 sm:py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 min-h-screen">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8 sm:mb-12"
          >
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 mb-3 sm:mb-4">
              <Megaphone className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-amber-900 mb-3 sm:mb-4">
              Announcements
            </h1>
            <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-2">
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
                aria-pressed={filter === priority}
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
          {!loading && !error && filteredAnnouncements.length === 0 && polls.length === 0 && (
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

          {!loading && !error && polls.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-10"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-amber-900">Open Polls</h2>
                  <p className="text-sm text-gray-600">
                    Vote anytime, then leave feedback below each poll.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {polls.map((poll) => (
                  <PollCard key={poll.id} poll={poll} actionLabel="Vote now" />
                ))}
              </div>
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
              const displayText = announcement.shortDescription || announcement.body;
              const hasImage = !!announcement.imageUrl;

              return (
                <motion.div
                  key={announcement.id}
                  variants={itemVariants}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <Link to={`/announcements/${announcement.slug || announcement.id}`} className="block h-full">
                    <Card className="h-full hover:shadow-xl transition-all duration-300 border-amber-200 bg-white/80 backdrop-blur-sm overflow-hidden group">
                      {/* Image Header */}
                      {hasImage && (
                        <div className="relative h-40 overflow-hidden">
                          <img
                            src={processImageUrl(announcement.imageUrl!, 'card')}
                            alt={announcement.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                          {/* Overlay badges */}
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                            {announcement.pinned && (
                              <Badge className="bg-amber-500/90 text-white border-0 text-xs">
                                <Pin className="h-3 w-3 mr-1" />
                                Pinned
                              </Badge>
                            )}
                            {announcement.featured && (
                              <Badge className="bg-purple-500/90 text-white border-0 text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Featured
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${config.color}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {announcement.priority}
                            </div>
                            {!hasImage && announcement.pinned && (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                                <Pin className="h-3 w-3 mr-1" />
                                Pinned
                              </Badge>
                            )}
                            {!hasImage && announcement.featured && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs">
                                <Star className="h-3 w-3 mr-1" />
                                Featured
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(announcement.createdAt)}
                          </div>
                        </div>
                        <CardTitle className="text-lg sm:text-xl text-amber-900 leading-tight group-hover:text-amber-700 transition-colors line-clamp-2">
                          {announcement.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
                          {displayText.replace(/[#*_`~[\]]/g, '').slice(0, 150)}
                          {displayText.length > 150 ? '...' : ''}
                        </p>
                        
                        {/* Tags */}
                        {announcement.tags && announcement.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {announcement.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                            {announcement.tags.length > 3 && (
                              <span className="text-xs text-gray-500">+{announcement.tags.length - 3} more</span>
                            )}
                          </div>
                        )}
                        
                        {/* Footer */}
                        <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between">
                          {announcement.creator && (
                            <p className="text-xs text-gray-500">
                              By <span className="font-medium text-amber-700">{announcement.creator.name}</span>
                            </p>
                          )}
                          <span className="text-xs text-amber-600 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                            Read more <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
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
