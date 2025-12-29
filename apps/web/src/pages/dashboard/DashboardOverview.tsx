import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
import type { Registration, Announcement } from '@/lib/api';
import { Calendar, Bell, Trophy, Code, ArrowRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QOTDWidget } from '@/components/dashboard/QOTDWidget';

export default function DashboardOverview() {
  const { user, token } = useAuth();
  const { settings } = useSettings();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const [regs, anns] = await Promise.all([
          api.getMyRegistrations(token).catch(() => []),
          api.getAnnouncements().catch(() => []),
        ]);
        setRegistrations(regs.slice(0, 3)); // Show only first 3
        setAnnouncements(anns.slice(0, 3)); // Show only first 3
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  const stats = [
    { label: 'Events Registered', value: registrations.length.toString(), icon: Calendar, color: 'bg-blue-500' },
    { label: 'Announcements', value: announcements.length.toString(), icon: Bell, color: 'bg-purple-500' },
    { label: 'Your Role', value: user?.role || 'USER', icon: Trophy, color: 'bg-amber-500' },
    { label: 'Member Since', value: 'Active', icon: Code, color: 'bg-green-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 text-white border-none">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                  Welcome back, {user?.name?.split(' ')[0]}! 👋
                </h1>
                <p className="text-amber-100">
                  Ready to solve some problems today?
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-16 w-16 rounded-full overflow-hidden ring-4 ring-white/30 bg-white/20">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
                      {user?.name?.charAt(0)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <stat.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-900">{stat.value}</p>
                    <p className="text-xs text-gray-500">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* QOTD Widget - conditionally shown */}
        {settings?.showQOTD !== false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <QOTDWidget token={token || ''} />
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className={settings?.showQOTD === false ? 'lg:col-span-2' : ''}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-amber-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link to="/dashboard/events" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-3" />
                  Browse Events
                </Button>
              </Link>
              <Link to="/dashboard/announcements" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Bell className="h-4 w-4 mr-3" />
                  View Announcements
                </Button>
              </Link>
              <Link to="/events" className="block">
                <Button variant="outline" className="w-full justify-start">
                  <ArrowRight className="h-4 w-4 mr-3" />
                  Explore All Events
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* My Events */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-600" />
                My Events
              </CardTitle>
              <Link to="/dashboard/events">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {registrations.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <p>No registered events yet.</p>
                  <Link to="/dashboard/events" className="text-amber-600 hover:underline text-sm">
                    Browse events
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                    >
                      <div>
                        <p className="font-medium text-amber-900">{reg.event.title}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(reg.event.startDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={reg.event.status === 'UPCOMING' ? 'success' : 'warning'}>
                        {reg.event.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Announcements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.5 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              Recent Announcements
            </CardTitle>
            <Link to="/dashboard/announcements">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <p>No announcements yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-amber-200 hover:shadow-md transition-all"
                  >
                    <div>
                      <p className="font-medium text-amber-900">{announcement.title}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(announcement.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={
                      announcement.priority === 'HIGH' || announcement.priority === 'URGENT' ? 'destructive' :
                      announcement.priority === 'MEDIUM' ? 'warning' : 'secondary'
                    }>
                      {announcement.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
