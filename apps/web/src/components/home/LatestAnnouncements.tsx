import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Bell, Calendar, ArrowRight, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { useMotionConfig } from '@/hooks/useMotionConfig';
import { useHomePageData } from '@/hooks/useHomePageData';

// Priority drives the icon, its tint, and the card's left-border accent. All
// values read against the charcoal glass surface.
const priorityConfig = {
  LOW: { icon: Info, color: '#9ca3af', label: 'text-zinc-300' },
  MEDIUM: { icon: CheckCircle, color: '#60a5fa', label: 'text-blue-300' },
  HIGH: { icon: Bell, color: '#fb923c', label: 'text-orange-300' },
  URGENT: { icon: AlertTriangle, color: '#f87171', label: 'text-red-300' },
};

function getAnnouncementPreview(shortDescription?: string | null, body?: string | null): string {
  if (shortDescription?.trim()) {
    return shortDescription;
  }

  return body?.replace(/[#*_`~[\]]/g, '').slice(0, 150) ?? '';
}

export function LatestAnnouncements() {
  const { data: homeData, isLoading } = useHomePageData();
  const announcements = homeData?.latestAnnouncements ?? [];
  const { isMobile, shouldReduceMotion } = useMotionConfig();

  if (isLoading) return null;
  if (announcements.length === 0) return null;

  const animationDuration = shouldReduceMotion ? 0.3 : 0.6;
  const animationY = shouldReduceMotion ? 15 : 30;
  const staggerDelay = shouldReduceMotion ? 0.05 : 0.1;

  return (
    <section className="relative overflow-hidden py-16 sm:py-24">
      <div className="container mx-auto px-4 relative">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center mb-8 sm:mb-12"
        >
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
            Latest <span className="hx-grad-text">Announcements</span>
          </h2>
          <p className="text-base sm:text-lg text-white/55 max-w-2xl mx-auto px-2">
            Stay informed with our latest updates, news, and important notices
          </p>
        </motion.div>

        {/* Announcements Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {announcements.map((announcement, index) => {
            const config = priorityConfig[announcement.priority];
            const Icon = config.icon;

            return (
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, y: animationY }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: animationDuration, delay: index * staggerDelay }}
                viewport={{ once: true, margin: '-50px' }}
                whileHover={!isMobile ? { y: -5 } : undefined}
                className="group"
              >
                <Link to={`/announcements/${announcement.slug || announcement.id}`} className="block h-full">
                  <div
                    className="glass-card h-full p-6 border-l-2"
                    style={{ borderLeftColor: config.color }}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="grid h-10 w-10 place-items-center rounded-xl border"
                        style={{
                          color: config.color,
                          background: `${config.color}1f`,
                          borderColor: `${config.color}40`,
                        }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${config.label}`}>
                        {announcement.priority}
                      </span>
                    </div>

                    {/* Content */}
                    <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 transition-colors group-hover:text-amber-300">
                      {announcement.title}
                    </h3>
                    <p className="text-white/55 text-sm mb-4 line-clamp-3">
                      {getAnnouncementPreview(announcement.shortDescription, announcement.body)}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-white/8">
                      <div className="flex items-center gap-1 text-xs text-white/40">
                        <Calendar className="h-3 w-3" />
                        {formatDate(announcement.createdAt)}
                      </div>
                      {announcement.creator && (
                        <p className="text-xs text-white/40">
                          by <span className="font-medium text-white/70">{announcement.creator.name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 10 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: animationDuration, delay: shouldReduceMotion ? 0.1 : 0.4 }}
          viewport={{ once: true, margin: '-50px' }}
          className="text-center"
        >
          <Link
            to="/announcements"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 text-sm font-medium text-white/90 backdrop-blur-md transition-all duration-200 hover:border-[#f97316]/50 hover:bg-white/[0.07]"
          >
            View All Announcements
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
