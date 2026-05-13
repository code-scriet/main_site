import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api } from '@/lib/api';
import type { Registration, Announcement, Poll } from '@/lib/api';
import {
  Calendar, Bell, ArrowRight, Loader2, Users, CheckCircle,
  Clock, XCircle, Zap, AlertCircle, Award, ExternalLink,
  LayoutDashboard, Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { QuizDashboardWidget } from '@/components/dashboard/QuizDashboardWidget';
import { PlaygroundCard } from '@/components/dashboard/PlaygroundCard';
import { PlaygroundSnippetsCard } from '@/components/dashboard/PlaygroundSnippetsCard';
import { AdminPendingRequestsCard } from '@/components/dashboard/AdminPendingRequestsCard';
import { QOTDStreakWidget } from '@/components/dashboard/QOTDStreakWidget';
import { PollCard } from '@/components/polls/PollCard';
import AttendanceHistory from '@/components/attendance/AttendanceHistory';
import { formatDate } from '@/lib/dateUtils';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
};

function stagger(index: number) {
  return { ...fadeUp, transition: { ...fadeUp.transition, delay: index * 0.06 } };
}

const priorityConfig = {
  URGENT: { color: 'bg-red-500' },
  HIGH:   { color: 'bg-orange-400' },
  MEDIUM: { color: 'bg-amber-400' },
  LOW:    { color: 'bg-gray-300' },
};

export default function DashboardOverview() {
  const { user, token } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [hiringStatus, setHiringStatus] = useState<{
    hasApplied: boolean;
    hasApplication?: boolean;
    application?: { id: string; applyingRole: string; status: string; createdAt: string };
  } | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [teamMemberId, setTeamMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [totalAnnouncements, setTotalAnnouncements] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const [regsResult, annsResult, pollsResult, hiringResult, myTeamProfileResult] = await Promise.allSettled([
          api.getMyRegistrations(token),
          api.getAnnouncements(),
          api.getPolls({ limit: 2 }, token),
          api.getMyHiringApplication(token),
          api.getMyTeamProfile(token),
        ]);

        const regs = regsResult.status === 'fulfilled' ? regsResult.value : [];
        const anns = annsResult.status === 'fulfilled' ? annsResult.value : [];
        const pollData = pollsResult.status === 'fulfilled' ? pollsResult.value : [];
        const hiring = hiringResult.status === 'fulfilled' ? hiringResult.value : null;
        const myTeamProfile = myTeamProfileResult.status === 'fulfilled' ? myTeamProfileResult.value : null;

        setPartialError(
          [regsResult, annsResult, pollsResult, hiringResult, myTeamProfileResult].some((result) => result.status === 'rejected')
            ? 'Some dashboard data could not be loaded. You can still use the rest of the dashboard.'
            : null
        );

        setTotalRegistrations(regs.length);
        setTotalAnnouncements(anns.length);
        setRegistrations(regs.slice(0, 5));
        setAnnouncements(anns.slice(0, 10));
        setPolls(pollData.slice(0, 2));
        setHiringStatus(hiring);
        setIsTeamMember(!!myTeamProfile);
        if (myTeamProfile && 'id' in myTeamProfile) {
          setTeamMemberId((myTeamProfile as { id: string }).id);
        }
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  const firstName = user?.name?.split(' ')[0] || 'there';
  const showHiring = !isTeamMember &&
    (user?.role === 'USER' || user?.role === 'MEMBER') &&
    !settingsLoading &&
    settings?.hiringEnabled === true;

  const playgroundEnabled = settings?.playgroundEnabled !== false;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT' || user?.isSuperAdmin === true;

  return (
    <div className="space-y-6 w-full">

      {/* ─── Welcome Banner ─────────────────────────────────────────── */}
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 text-white"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(221,212,191,0.12) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start gap-3 sm:gap-5 px-4 sm:px-7 py-5 sm:py-6">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl overflow-hidden bg-white/20 ring-2 ring-white/30 shrink-0 shadow-lg">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="text-white/70 text-sm font-medium">Good {getGreeting()}</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5 break-words">{firstName}</h1>
            <p className="text-white/70 text-sm mt-0.5 break-all sm:break-normal sm:truncate">{user?.email}</p>
          </div>
          <div className="flex shrink-0 w-full sm:w-auto">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
              <Trophy className="h-4 w-4 text-amber-200" />
              <span className="truncate">{user?.role?.replace(/_/g, ' ')}</span>
            </span>
          </div>
        </div>
      </motion.div>

      {isAdmin && (
        <motion.div {...stagger(1)}>
          <AdminPendingRequestsCard />
        </motion.div>
      )}

      {/* ─── Stat Cards (3 equal, full width) ───────────────────────── */}
      <motion.div {...stagger(1)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={<Calendar className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label="Registered Events"
          value={totalRegistrations}
          linkTo="/dashboard/events"
        />
        <StatCard
          icon={<Bell className="h-5 w-5 text-purple-500" />}
          iconBg="bg-purple-50"
          label="Announcements"
          value={totalAnnouncements}
          linkTo="/dashboard/announcements"
        />
        <StatCard
          icon={<LayoutDashboard className="h-5 w-5 text-blue-500" />}
          iconBg="bg-blue-50"
          label="Your Role"
          valueText={user?.role?.replace(/_/g, ' ')}
        />
      </motion.div>

      {partialError && (
        <motion.div {...stagger(2)}>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-3 px-4 py-3 text-sm text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p>{partialError}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ─── Quick Actions ───────────────────────────────────────────── */}
      <motion.div {...stagger(2)} className="flex gap-2 flex-wrap">
        {[
          { to: '/dashboard/events', icon: Calendar, label: 'My Events', hover: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' },
          { to: '/dashboard/announcements', icon: Bell, label: 'Announcements', hover: 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200' },
          { to: '/quiz', icon: Zap, label: 'Live Quizzes', hover: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200' },
          {
            to: isTeamMember && teamMemberId ? `/dashboard/team/${teamMemberId}/edit` : '/dashboard/profile',
            icon: Users,
            label: isTeamMember ? 'Team Profile' : 'My Profile',
            hover: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200',
          },
          ...(settings?.certificatesEnabled !== false
            ? [{ to: '/dashboard/certificates', icon: Award, label: 'Certificates', hover: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' }]
            : []),
        ].map((item) => (
          <Link key={item.to} to={item.to} className="w-full sm:w-auto">
            <Button
              variant="outline"
              className={`h-10 w-full sm:w-auto px-4 text-sm font-medium border-gray-200 text-gray-600 rounded-xl transition-all ${item.hover}`}
            >
              <item.icon className="h-4 w-4 mr-2" />
              {item.label}
            </Button>
          </Link>
        ))}
      </motion.div>

      {/* ─── Playground CTA (full width) ───────────────────────────── */}
      {playgroundEnabled && (
        <motion.div {...stagger(3)}>
          <PlaygroundCard />
        </motion.div>
      )}

      {/* ─── QOTD streak / badges (full width) ─────────────────────── */}
      {settings?.showQOTD !== false && token && (
        <motion.div {...stagger(3)}>
          <QOTDStreakWidget token={token} />
        </motion.div>
      )}

      {/* ─── Main Grid: 2/3 content + 1/3 sidebar ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN: Events → Attendance History → Quiz */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          {/* My Events */}
          <motion.div {...stagger(4)}>
            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-50">
                <CardTitle className="text-[15px] font-semibold text-gray-900 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                    <Calendar className="h-4 w-4 text-amber-600" />
                  </span>
                  My Events
                </CardTitle>
                <Link to="/dashboard/events">
                  <Button variant="ghost" size="sm" className="h-8 text-sm text-gray-400 hover:text-amber-600 rounded-lg gap-1">
                    View all <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {registrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">No registered events</p>
                    <Link to="/dashboard/events" className="text-sm text-amber-600 font-medium hover:underline inline-flex items-center gap-1 mt-1">
                      Browse events <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {registrations.map((reg) => (
                      <Link
                        key={reg.id}
                        to={`/events/${reg.event.slug || reg.event.id}`}
                        className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-amber-50/40 transition-colors group"
                      >
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          reg.event.status === 'ONGOING'
                            ? 'bg-green-400 shadow-[0_0_0_3px_rgb(134,239,172,0.3)]'
                            : reg.event.status === 'UPCOMING'
                            ? 'bg-amber-400'
                            : 'bg-gray-300'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm break-words sm:truncate group-hover:text-amber-700 transition-colors">
                            {reg.event.title}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{formatDate(reg.event.startDate)}</p>
                        </div>
                        <Badge
                          variant={reg.event.status === 'UPCOMING' ? 'success' : reg.event.status === 'ONGOING' ? 'warning' : 'secondary'}
                          className="shrink-0 text-xs whitespace-nowrap"
                        >
                          {reg.event.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Attendance History */}
          {token && (
            <motion.div {...stagger(5)}>
              <AttendanceHistory token={token} />
            </motion.div>
          )}

          {/* Quiz Widget */}
          <motion.div {...stagger(6)} className="flex-1">
            <QuizDashboardWidget token={token || ''} />
          </motion.div>
        </div>

        {/* RIGHT COLUMN: Announcements → Hiring CTA → Playground Activity */}
        <div className="flex flex-col gap-6">

          {/* Polls */}
          <motion.div {...stagger(4)}>
            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-50">
                <CardTitle className="text-[15px] font-semibold text-gray-900 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                    <Zap className="h-4 w-4 text-amber-600" />
                  </span>
                  Active Polls
                </CardTitle>
                <Link to="/dashboard/announcements">
                  <Button variant="ghost" size="sm" className="h-8 text-sm text-gray-400 hover:text-amber-600 rounded-lg gap-1">
                    All <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                {polls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">No active polls right now</p>
                  </div>
                ) : (
                  polls.map((poll) => (
                    <PollCard key={poll.id} poll={poll} compact actionLabel="Vote" />
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Announcements — stretched vertically with more items */}
          <motion.div {...stagger(4)}>
            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-50">
                <CardTitle className="text-[15px] font-semibold text-gray-900 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50">
                    <Bell className="h-4 w-4 text-purple-500" />
                  </span>
                  Announcements
                </CardTitle>
                <Link to="/dashboard/announcements">
                  <Button variant="ghost" size="sm" className="h-8 text-sm text-gray-400 hover:text-purple-600 rounded-lg gap-1">
                    All <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                {announcements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                      <Bell className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">No announcements yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {announcements.map((a) => {
                      const p = priorityConfig[a.priority as keyof typeof priorityConfig] ?? priorityConfig.LOW;
                      return (
                        <Link
                          key={a.id}
                          to={`/announcements/${a.slug || a.id}`}
                          className="flex items-start gap-3 px-4 py-3.5 hover:bg-purple-50/30 transition-colors group"
                        >
                          <div className={`mt-1.5 w-1 rounded-full shrink-0 self-stretch min-h-[1.75rem] ${p.color}`} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 break-words group-hover:text-purple-700 transition-colors">
                              {a.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">{formatDate(a.createdAt)}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Hiring CTA / Status */}
          {showHiring && (
            <motion.div {...stagger(5)}>
              <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
                <CardContent className="p-5">
                  {(hiringStatus?.hasApplied || hiringStatus?.hasApplication) ? (
                     <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50">
                      {hiringStatus.application?.status === 'PENDING' && <Clock className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />}
                      {(hiringStatus.application?.status === 'SELECTED' || hiringStatus.application?.status === 'APPROVED') && (
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      )}
                      {hiringStatus.application?.status === 'REJECTED' && (
                        <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">Application submitted</p>
                         <p className="text-sm text-gray-500 mt-0.5 break-words">
                           {hiringStatus.application?.applyingRole?.replace(/_/g, ' ')}
                         </p>
                        <Badge
                          variant={
                            hiringStatus.application?.status === 'SELECTED' || hiringStatus.application?.status === 'APPROVED'
                              ? 'success'
                              : hiringStatus.application?.status === 'REJECTED'
                              ? 'destructive'
                              : 'warning'
                          }
                          className="text-xs mt-2"
                        >
                          {hiringStatus.application?.status}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <Link to="/join-us" className="flex items-center gap-4 group">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                        <Users className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">Join the Club</p>
                        <p className="text-sm text-gray-400 mt-0.5 leading-tight">Apply to become a core member</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all shrink-0" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Playground Activity — last item, fills remaining column space */}
          {playgroundEnabled && (
            <motion.div {...stagger(6)} className="flex-1">
              <PlaygroundSnippetsCard />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: number;
  valueText?: string;
  linkTo?: string;
}

function StatCard({ icon, iconBg, label, value, valueText, linkTo }: StatCardProps) {
  const inner = (
    <Card className={`rounded-2xl border-gray-100 shadow-sm hover:shadow-md transition-shadow h-full ${linkTo ? 'cursor-pointer' : ''}`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide leading-tight">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 leading-none">
            {value !== undefined ? value : <span className="text-base font-semibold capitalize">{valueText}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (linkTo) return <Link to={linkTo} className="h-full">{inner}</Link>;
  return inner;
}
