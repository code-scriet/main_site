import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Bell, Calendar, ArrowRight, Megaphone, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { Announcement } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';

const priorityConfig = {
  LOW: { 
    bg: 'bg-gray-50 border-gray-200', 
    badge: 'bg-gray-100 text-gray-700',
    icon: Info,
    iconColor: 'text-gray-500'
  },
  MEDIUM: { 
    bg: 'bg-blue-50 border-blue-200', 
    badge: 'bg-blue-100 text-blue-700',
    icon: CheckCircle,
    iconColor: 'text-blue-500'
  },
  HIGH: { 
    bg: 'bg-orange-50 border-orange-200', 
    badge: 'bg-orange-100 text-orange-700',
    icon: Bell,
    iconColor: 'text-orange-500'
  },
  URGENT: { 
    bg: 'bg-red-50 border-red-200', 
    badge: 'bg-red-100 text-red-700',
    icon: AlertTriangle,
    iconColor: 'text-red-500'
  },
};

export function LatestAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnnouncements()
      .then((data) => setAnnouncements(data.slice(0, 3)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (announcements.length === 0) return null;

  return (
    <section className="py-24 bg-white relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-50 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 opacity-50" />
      
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-700 mb-6"
          >
            <Megaphone className="h-4 w-4" />
            <span className="text-sm font-medium">Stay Updated</span>
          </motion.div>
          
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Latest{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-violet-600">
              Announcements
            </span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Stay informed with our latest updates, news, and important notices
          </p>
        </motion.div>

        {/* Announcements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {announcements.map((announcement, index) => {
            const config = priorityConfig[announcement.priority];
            const Icon = config.icon;
            
            return (
              <motion.div
                key={announcement.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
                className="group"
              >
                <div className={`h-full p-6 rounded-2xl border-2 transition-all duration-300 hover:shadow-lg ${config.bg}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-2 rounded-lg bg-white shadow-sm ${config.iconColor}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge className={config.badge}>
                      {announcement.priority}
                    </Badge>
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-purple-700 transition-colors">
                    {announcement.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {announcement.body}
                  </p>
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200/50">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {formatDate(announcement.createdAt)}
                    </div>
                    {announcement.creator && (
                      <p className="text-xs text-gray-500">
                        by <span className="font-medium text-gray-700">{announcement.creator.name}</span>
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link to="/announcements">
            <Button 
              variant="outline" 
              size="lg" 
              className="group border-gray-300 hover:border-purple-500 hover:bg-purple-50"
            >
              View All Announcements
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
