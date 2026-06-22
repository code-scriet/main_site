// Dashboard v2 — Overview.
// Everything dynamic from real API calls. No fixtures.
// Admin variant prepends a 12-tile insights strip + AdminPendingRequestsCard.
// Design source: code-scriet-innerdashboard/project/js/screen-overview.jsx.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Zap, Calendar, Trophy, Terminal, Inbox, Briefcase,
  ChevronRight, ArrowRight, Flame, Check, Bookmark, Activity, TrendingUp,
  Circle, User,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type OnboardingStatus } from '@/lib/api';
import {
  Avatar, DSCard, Difficulty, MonoChip, Pill, Section, roleTone,
} from '@/components/dash';
import { Button } from '@/components/ui/button';
import { AdminPendingRequestsCardV2 } from '@/components/dashboard/AdminPendingRequestsCardV2';
import { CertificateCard, getCertificateCover, type CertificateCardData } from '@/components/dashboard/CertificateCard';
import { ShareStreakButton } from '@/components/dashboard/ShareStreakButton';
import { relativeTime } from '@/lib/dateUtils';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { cn } from '@/lib/utils';

function greetingFromIST(): string {
  const istHour = new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' });
  const h = parseInt(istHour, 10) || new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatISTDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function pct(num: number, denom: number): number {
  if (!denom) return 0;
  return Math.round((num / denom) * 100);
}

const PRIORITY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
  MED: 'info',
};
const VERDICT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACCEPTED: 'success',
  WRONG_ANSWER: 'danger',
  TIME_LIMIT_EXCEEDED: 'warning',
  RUNTIME_ERROR: 'warning',
  COMPILATION_ERROR: 'neutral',
  PENDING: 'neutral',
  JUDGE_ERROR: 'neutral',
};

export default function DashboardOverview() {
  const { user, token } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const isNetwork = user?.role === 'NETWORK';

  const regsQ = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () => api.getMyRegistrations(token!),
    enabled: Boolean(token),
    refetchOnWindowFocus: true,
  });
  const qotdStatsQ = useQuery({
    queryKey: ['qotd-stats'],
    queryFn: () => api.getQOTDStats(token!),
    enabled: Boolean(token) && settings?.showQOTD !== false,
    refetchOnWindowFocus: true,
  });
  const todayQOTDQ = useQuery({
    queryKey: ['qotd-today'],
    queryFn: () => api.getTodayQOTD(),
    enabled: settings?.showQOTD !== false,
  });
  const announcementsQ = useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.getAnnouncements(),
    refetchOnWindowFocus: true,
  });
  const pollsQ = useQuery({
    queryKey: ['polls', 'public'],
    queryFn: () => api.getPolls({ limit: 2 }, token ?? undefined),
  });
  const recentSubsQ = useQuery({
    queryKey: ['my-recent-submissions'],
    queryFn: () => api.getMyRecentSubmissions(token!, 5),
    enabled: Boolean(token),
    refetchOnWindowFocus: true,
  });
  const aroundMeQ = useQuery({
    queryKey: ['leaderboard-around-me'],
    queryFn: () => api.getQOTDLeaderboardAroundMe(token!, 2),
    enabled: Boolean(token) && settings?.showLeaderboard !== false,
  });
  const certsQ = useQuery({
    queryKey: ['my-certificates'],
    queryFn: async () => {
      const res = await api.getMyCertificates(token!);
      return (res.certificates as CertificateCardData[]) ?? [];
    },
    enabled: Boolean(token) && settings?.certificatesEnabled !== false,
    refetchOnWindowFocus: true,
  });
  const hiringQ = useQuery({
    queryKey: ['my-hiring'],
    queryFn: () => api.getMyHiringApplication(token!),
    enabled: Boolean(token),
  });
  // S-06 — first-week checklist. Once everything's done we set a localStorage flag
  // and never query again, so established members pay nothing for this.
  const [onboardingDismissed] = useState(() => {
    try { return localStorage.getItem('cs_onboarding_done_v1') === '1'; } catch { return false; }
  });
  const onboardingQ = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => api.getOnboarding(token!),
    enabled: Boolean(token) && !isAdmin && !isNetwork && !onboardingDismissed,
  });
  useEffect(() => {
    if (onboardingQ.data?.allDone) {
      try { localStorage.setItem('cs_onboarding_done_v1', '1'); } catch { /* ignore */ }
    }
  }, [onboardingQ.data?.allDone]);
  const adminStatsQ = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: () => api.getAdminDashboardStats(token!),
    enabled: Boolean(token) && isAdmin,
    // Free-tier-friendly cadence: refresh every 120s while the tab is in focus
    // so admins see live attendance counts, scan rate, etc. without the page
    // hammering the API endpoint on the 512 MB Render instance (~25 queries
    // per refresh — an idle admin tab at 60s was ~2,000 queries/hour).
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const registrations = regsQ.data ?? [];
  void registrations;

  // Compute this-week stats from QOTD stats' last30Days + recent submissions
  const last30 = qotdStatsQ.data?.last30Days ?? [];
  const solvedThisWeek = useMemo(() => last30.slice(-7).filter((d) => d.solved).length, [last30]);
  const attemptsThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return (recentSubsQ.data ?? []).filter((s) => new Date(s.submittedAt).getTime() >= cutoff).length;
  }, [recentSubsQ.data]);
  const pointsThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return (recentSubsQ.data ?? [])
      .filter((s) => new Date(s.submittedAt).getTime() >= cutoff && s.verdict === 'ACCEPTED')
      .reduce((sum, s) => sum + (s.score ?? 0), 0);
  }, [recentSubsQ.data]);
  const totalSolved = qotdStatsQ.data?.totalSolved ?? 0;
  const avgWeekly = totalSolved > 0 ? Math.round((totalSolved / 4) * 100) / 100 : null; // rough 4-week-avg
  const pointsDeltaPct = avgWeekly && avgWeekly > 0 && pointsThisWeek > 0
    ? Math.round(((pointsThisWeek - avgWeekly * 100) / (avgWeekly * 100)) * 100)
    : null;
  const myRank = aroundMeQ.data?.myRank ?? null;

  // Live countdown to midnight IST — re-render periodically, but pause while the tab is
  // hidden (a backgrounded dashboard shouldn't re-render every 30s for an off-screen clock).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30 * 1000);
    const onVis = () => { if (!document.hidden) setNow(Date.now()); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  void now;
  const secsLeft = secondsUntilMidnightIST();

  const todaysQOTD = todayQOTDQ.data ?? null;
  const todaySolved = qotdStatsQ.data?.todaySolved ?? false;

  if (!user) return null;
  if (isNetwork) return <NetworkOverview />;

  return (
    <div className="flex flex-col gap-10">
      <WelcomeStrip
        role={user.role}
        firstName={user.name?.split(' ')[0] ?? 'there'}
        qotdLive={Boolean(todaysQOTD)}
        qotdSolved={todaySolved}
        secondsUntilMidnightIST={secsLeft}
        onSolve={() => navigate('/qotd/today')}
      />

      {isAdmin && adminStatsQ.data && <AdminStatStrip data={adminStatsQ.data} />}
      {isAdmin && <AdminPendingRequestsCardV2 />}

      {!isAdmin && onboardingQ.data && !onboardingQ.data.allDone && (
        <StartHereSection status={onboardingQ.data} onNavigate={(to) => navigate(to)} />
      )}

      <QOTDHero
        loading={todayQOTDQ.isLoading || qotdStatsQ.isLoading}
        qotd={todayQOTDQ.data ?? null}
        currentStreak={qotdStatsQ.data?.currentStreak ?? 0}
        longestStreak={qotdStatsQ.data?.longestStreak ?? 0}
        totalSolved={totalSolved}
        todaySolved={qotdStatsQ.data?.todaySolved ?? false}
        last30Days={last30}
        onSolve={() => navigate('/qotd/today')}
        onHistory={() => navigate('/dashboard/coding?tab=qotd')}
      />

      <StatsRow
        solvedThisWeek={solvedThisWeek}
        attemptsThisWeek={attemptsThisWeek}
        pointsThisWeek={pointsThisWeek}
        pointsDeltaPct={pointsDeltaPct}
        myRank={myRank}
        rankDelta={null}
      />

      <MyEventsSection
        loading={regsQ.isLoading}
        registrations={registrations}
        onAll={() => navigate('/dashboard/events')}
      />

      <ReadUpSection
        announcements={(announcementsQ.data ?? []).slice(0, 3)}
        polls={(pollsQ.data ?? []).filter((p) => p.isPublished !== false).slice(0, 1)}
        onAll={() => navigate('/dashboard/announcements')}
      />

      {settings?.showLeaderboard !== false && (
        <StandingSection
          loading={aroundMeQ.isLoading}
          data={aroundMeQ.data}
          onAll={() => navigate('/dashboard/coding?tab=leaderboard')}
          onSolveQotd={() => navigate('/qotd/today')}
        />
      )}

      <MyCodeSection
        loading={recentSubsQ.isLoading}
        subs={recentSubsQ.data ?? []}
        onAll={() => navigate('/dashboard/coding?tab=practice')}
        onSolveQotd={() => navigate('/qotd/today')}
      />

      {settings?.certificatesEnabled !== false && (
        <EarnedSection
          loading={certsQ.isLoading}
          certs={certsQ.data ?? []}
          onAll={() => navigate('/dashboard/certificates')}
        />
      )}

      {hiringQ.data?.hasApplied && hiringQ.data.application && (
        <HiringStatusSection application={hiringQ.data.application} />
      )}

      {settings?.playgroundEnabled !== false && <PlaygroundPromoSection />}
    </div>
  );
}

// ─── S-06: first-week "start here" checklist (new members only; self-hides when done)
function StartHereSection({
  status, onNavigate,
}: {
  status: OnboardingStatus;
  onNavigate: (to: string) => void;
}) {
  const items = [
    { done: status.profileCompleted, Icon: User, label: 'Complete your profile', desc: 'Add your branch, year and links', action: () => onNavigate('/dashboard/profile') },
    { done: status.solvedQotd, Icon: Zap, label: 'Solve your first daily problem', desc: 'QOTD is the heartbeat — start a streak', action: () => onNavigate('/qotd/today') },
    { done: status.registeredEvent, Icon: Calendar, label: 'Register for an event', desc: 'Workshops, contests and quiz nights', action: () => onNavigate('/events') },
    { done: status.savedSnippet, Icon: Terminal, label: 'Save a playground snippet', desc: 'Write and run code in the browser', action: () => window.open(getPlaygroundLaunchUrl(), '_blank', 'noopener,noreferrer') },
  ];
  const completed = items.filter((i) => i.done).length;
  return (
    <Section eyebrow="Getting started" title="Your first week">
      <DSCard className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-[13.5px] text-[var(--ds-text-3)]">
            Four steps to get the most out of code.scriet.
          </p>
          <span className="text-[12px] font-mono tabular-nums text-[var(--ds-text-3)] shrink-0">{completed}/{items.length}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--surface-soft)] overflow-hidden mb-5">
          <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500" style={{ width: `${(completed / items.length) * 100}%` }} />
        </div>
        <ul className="flex flex-col gap-1.5">
          {items.map((it) => (
            <li
              key={it.label}
              className={cn(
                'flex items-center gap-3 rounded-[10px] px-3 py-2.5',
                it.done ? 'opacity-65' : 'hover:bg-[var(--surface-soft)]',
              )}
            >
              <span
                className={cn(
                  'shrink-0 grid place-items-center w-7 h-7 rounded-full',
                  it.done ? 'bg-[var(--success)]/15 text-[var(--success)]' : 'bg-[var(--accent-subtle)] text-[var(--accent)]',
                )}
              >
                {it.done ? <Check size={15} /> : <it.Icon size={15} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className={cn('text-[13.5px] font-medium', it.done && 'line-through text-[var(--ds-text-3)]')}>{it.label}</div>
                <div className="text-[12px] text-[var(--ds-text-3)] truncate">{it.desc}</div>
              </div>
              {it.done ? (
                <Circle size={6} className="fill-[var(--success)] text-[var(--success)] shrink-0" />
              ) : (
                <Button size="sm" variant="outline" onClick={it.action} className="shrink-0">
                  Go <ArrowRight size={13} className="ml-1" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DSCard>
    </Section>
  );
}

// ─── Playground + brand promotion (user side)
function PlaygroundPromoSection() {
  return (
    <DSCard padded={false} className="overflow-hidden relative">
      <div
        className="pointer-events-none absolute -top-20 -right-20 w-[320px] h-[320px] rounded-full opacity-[0.10]"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
      />
      <div className="flex flex-col md:flex-row gap-6 p-6 md:p-7 relative">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={14} className="text-[var(--accent)]" />
            <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--accent)]">code.scriet · playground</span>
          </div>
          <h3 className="text-[24px] font-semibold tracking-tight leading-[1.15]">
            Run code instantly. <span className="text-[var(--accent)]">Solve, save, submit.</span>
          </h3>
          <p className="text-[13.5px] text-[var(--ds-text-3)] mt-2.5 max-w-prose leading-relaxed">
            A full in-browser playground for Python, JavaScript, C++ and Java. Save snippets,
            track your daily quota, and submit to QOTD / contests in the same tab.
          </p>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <a
              href={getPlaygroundLaunchUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[var(--accent)] text-[var(--accent-fg)] text-[13.5px] font-medium hover:bg-[var(--accent-hover)]"
            >
              Open playground <ArrowRight size={13} />
            </a>
            <a
              href="/dashboard/coding?tab=practice"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-default)] text-[var(--ds-text-1)] text-[13px] font-medium hover:border-[var(--border-strong)]"
            >
              Browse practice problems
            </a>
          </div>
        </div>
        <div className="md:w-[280px] shrink-0 grid grid-cols-2 gap-2.5">
          {[
            { l: 'Python', v: 'Pyodide' },
            { l: 'JavaScript', v: 'Node 20' },
            { l: 'C++', v: 'GCC 13' },
            { l: 'Java', v: 'OpenJDK 17' },
          ].map((s) => (
            <div key={s.l} className="bg-[var(--surface-soft)] rounded-[10px] px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{s.l}</div>
              <div className="text-[12.5px] font-mono tabular-nums text-[var(--ds-text-1)] font-medium mt-0.5">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </DSCard>
  );
}

// ─── Welcome strip with contextual QOTD chip on the right
function WelcomeStrip({
  role, firstName, qotdLive, qotdSolved, secondsUntilMidnightIST, onSolve,
}: {
  role: string;
  firstName: string;
  qotdLive: boolean;
  qotdSolved: boolean;
  secondsUntilMidnightIST: number;
  onSolve: () => void;
}) {
  const greet = greetingFromIST();
  const date = formatISTDate();
  const h = Math.floor(secondsUntilMidnightIST / 3600);
  const m = Math.floor((secondsUntilMidnightIST % 3600) / 60);
  const ttl = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--ds-text-3)] mb-1.5 whitespace-nowrap">
          <span className="font-mono tabular-nums">{date}</span>
          <span className="inline-block w-px h-4 bg-[var(--border-default)]" />
          <Pill tone={roleTone(role)} size="xs">{role.replace(/_/g, ' ')}</Pill>
        </div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[var(--ds-text-1)] leading-[1.05]">
          {greet}, <span>{firstName}</span>.
        </h1>
      </div>
      {qotdLive && !qotdSolved && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 h-9 px-3 rounded-[8px] bg-[var(--accent-subtle)] text-[var(--accent)] text-[12.5px] font-medium border border-transparent">
            <Zap size={13} />
            <span>QOTD closes in</span>
            <span className="font-mono tabular-nums font-semibold">{ttl}</span>
          </div>
          <Button
            size="sm"
            onClick={onSolve}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]"
          >
            Solve now <ArrowRight size={13} className="ml-1" />
          </Button>
        </div>
      )}
      {qotdLive && qotdSolved && (
        <div className="inline-flex items-center gap-2 h-9 px-3 rounded-[8px] bg-[var(--success-bg)] text-[var(--success)] text-[12.5px] font-medium border border-[var(--success-border)]">
          <Check size={13} />
          <span>Today&apos;s QOTD solved</span>
        </div>
      )}
    </div>
  );
}

// Compute seconds until next midnight in IST (UTC+5:30)
function secondsUntilMidnightIST(): number {
  const now = new Date();
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const ms = (24 - istNow.getHours()) * 3600 * 1000 - istNow.getMinutes() * 60 * 1000 - istNow.getSeconds() * 1000;
  return Math.max(0, Math.floor(ms / 1000));
}

// ─── QOTD Hero
function QOTDHero({
  loading, qotd, currentStreak, longestStreak, totalSolved, todaySolved, last30Days, onSolve, onHistory,
}: {
  loading: boolean;
  qotd: { id: string; date: string; title?: string | null; question?: string; difficulty?: string; tags?: string[]; problemId?: string | null } | null;
  currentStreak: number;
  longestStreak: number;
  totalSolved: number;
  todaySolved: boolean;
  last30Days?: Array<{ date: string; solved: boolean }>;
  onSolve: () => void;
  onHistory: () => void;
}) {
  const c = 2 * Math.PI * 28;
  const r = Math.min(1, currentStreak / 30);
  const dash = c * r;

  if (loading) {
    return (
      <DSCard padded={false} className="overflow-hidden">
        <div className="p-6 animate-pulse">
          <div className="h-3 w-32 bg-[var(--surface-soft)] rounded mb-3" />
          <div className="h-8 w-2/3 bg-[var(--surface-soft)] rounded mb-2" />
          <div className="h-4 w-1/2 bg-[var(--surface-soft)] rounded" />
        </div>
      </DSCard>
    );
  }

  if (!qotd) {
    return (
      <DSCard padded={false} className="overflow-hidden">
        <div className="p-6 flex items-center gap-5 flex-wrap">
          <Zap size={22} className="text-[var(--ds-text-3)]" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Question of the day</div>
            <h3 className="text-[20px] font-semibold tracking-tight mt-1">No question today</h3>
            <p className="text-[13px] text-[var(--ds-text-3)] mt-1.5 max-w-prose">
              Catch up on missed days from the QOTD history — every solved question counts toward your lifetime total.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onHistory}>
            View history <ArrowRight size={12} className="ml-1" />
          </Button>
        </div>
      </DSCard>
    );
  }

  const title = qotd.title ?? qotd.question ?? "Today's problem";
  const diff = qotd.difficulty?.toUpperCase() ?? 'EASY';
  const tags = qotd.tags ?? [];
  const headline =
    currentStreak === 0
      ? 'Start your streak'
      : todaySolved
      ? `Day ${currentStreak} · locked in`
      : `${currentStreak} days in a row`;
  const sub =
    currentStreak === 0
      ? "Solve today's QOTD to light the flame."
      : todaySolved
      ? "You're set for today. See you tomorrow."
      : 'Solve today before midnight IST to keep it going.';

  return (
    <DSCard padded={false} className="overflow-hidden relative">
      <div
        className="pointer-events-none absolute -top-24 -right-24 w-[280px] h-[280px] rounded-full opacity-[0.12]"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
      />
      <div className="flex flex-col md:flex-row relative">
        <div className="flex-1 p-6 md:p-7 min-w-0">
          <div className="flex items-center gap-2 mb-3 whitespace-nowrap flex-wrap">
            <span className="size-[6px] rounded-full bg-[var(--accent)] live-dot" />
            <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--accent)]">
              Question of the day · live
            </span>
            {todaySolved && (
              <Pill tone="success" size="xs" icon={<Check size={9} />}>Solved</Pill>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Difficulty level={diff} />
            {tags.slice(0, 3).map((t) => (
              <MonoChip key={t}>{t}</MonoChip>
            ))}
          </div>
          <h3 className="text-[28px] font-semibold tracking-tight text-[var(--ds-text-1)] mt-3 leading-[1.1]">{title}</h3>
          <p className="text-[13.5px] text-[var(--ds-text-3)] mt-2.5 max-w-prose leading-relaxed">{sub}</p>
          <div className="flex items-center gap-2 mt-6 flex-wrap">
            {!todaySolved ? (
              <Button size="sm" onClick={onSolve} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]">
                Solve <ArrowRight size={13} className="ml-1" />
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={onSolve}>View solution</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onHistory}>History</Button>
          </div>
        </div>

        <div className="border-t md:border-t-0 md:border-l border-[var(--border-subtle)] p-6 md:w-[260px] shrink-0 flex flex-col items-center justify-center bg-[var(--surface-soft)]/30 relative overflow-hidden">
          <div className="relative size-[112px]">
            <svg viewBox="0 0 64 64" className="size-full -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border-default)" strokeWidth="3" />
              <circle
                cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
                style={{
                  strokeDasharray: c,
                  strokeDashoffset: c - dash,
                  transition: 'stroke-dashoffset 1s var(--ease-out)',
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Flame size={15} className={currentStreak > 0 ? 'text-[var(--accent)]' : 'text-[var(--ds-text-3)]'} />
              <span className="text-[34px] font-semibold tabular-nums leading-none mt-0.5">{currentStreak}</span>
              <span className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--ds-text-3)] mt-1">day streak</span>
            </div>
          </div>
          <div className="text-[11px] text-[var(--ds-text-1)] font-medium mt-3 text-center leading-tight">{headline}</div>
          {last30Days && last30Days.length > 0 && (
            <div className="flex items-center gap-[3px] mt-3 max-w-full">
              {last30Days.slice(-30).map((d, i) => (
                <span
                  key={i}
                  title={`${d.date}: ${d.solved ? 'solved' : 'missed'}`}
                  className={cn(
                    'inline-block size-[7px] rounded-[2px]',
                    d.solved ? 'bg-[var(--accent)]' : 'bg-[var(--border-default)]',
                  )}
                />
              ))}
            </div>
          )}
          <div className="text-[10.5px] text-[var(--ds-text-3)] mt-1.5 whitespace-nowrap font-mono tabular-nums">
            longest {longestStreak}
          </div>
          <ShareStreakButton
            stats={{ currentStreak, longestStreak, totalSolved }}
            className="mt-3"
            label="Share streak"
          />
        </div>
      </div>
    </DSCard>
  );
}

// ─── Stats row — pixel-port: SOLVED / ATTEMPTS / POINTS / RANK
function StatsRow({
  solvedThisWeek, attemptsThisWeek, pointsThisWeek, pointsDeltaPct, myRank, rankDelta,
}: {
  solvedThisWeek: number;
  attemptsThisWeek: number;
  pointsThisWeek: number;
  pointsDeltaPct: number | null;
  myRank: number | null;
  rankDelta: number | null;
}) {
  const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 border-y border-[var(--border-subtle)] py-5">
      <div className="min-w-0">
        <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] whitespace-nowrap">Solved</div>
        <div className="text-[32px] font-semibold tabular-nums leading-none mt-2">{solvedThisWeek}</div>
        <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5">this week</div>
      </div>
      <div className="min-w-0 md:border-l md:border-[var(--border-subtle)] md:pl-6">
        <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] whitespace-nowrap">Attempts</div>
        <div className="text-[32px] font-semibold tabular-nums leading-none mt-2">{attemptsThisWeek}</div>
        <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5">this week</div>
      </div>
      <div className="min-w-0 md:border-l md:border-[var(--border-subtle)] md:pl-6">
        <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] whitespace-nowrap">Points</div>
        <div className="text-[32px] font-semibold tabular-nums leading-none mt-2 text-[var(--accent)]">
          {fmtSigned(pointsThisWeek)}
        </div>
        <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5 font-mono tabular-nums">
          {pointsDeltaPct == null ? 'this week' : `${pointsDeltaPct >= 0 ? '+' : ''}${pointsDeltaPct}% vs avg`}
        </div>
      </div>
      <div className="min-w-0 md:border-l md:border-[var(--border-subtle)] md:pl-6">
        <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] whitespace-nowrap">Rank</div>
        <div className="text-[32px] font-semibold tabular-nums leading-none mt-2">
          {myRank ? `#${myRank}` : '—'}
        </div>
        <div className="text-[11px] text-[var(--ds-text-3)] mt-1.5 font-mono tabular-nums">
          {myRank == null ? 'not ranked yet' : rankDelta == null || rankDelta === 0 ? 'no change' : rankDelta < 0 ? <><TrendingUp size={11} className="inline" /> {Math.abs(rankDelta)} {Math.abs(rankDelta) === 1 ? 'place' : 'places'}</> : `↓ ${Math.abs(rankDelta)} ${Math.abs(rankDelta) === 1 ? 'place' : 'places'}`}
        </div>
      </div>
    </div>
  );
}

// ─── My events
function MyEventsSection({
  loading, registrations, onAll,
}: {
  loading: boolean;
  registrations: Array<{ id: string; event?: { id?: string; slug?: string; title?: string; status?: string; startDate?: string; venue?: string | null } | null }>;
  onAll: () => void;
}) {
  const navigate = useNavigate();
  const events = registrations
    .filter((r) => r.event)
    .sort((a, b) => new Date(a.event!.startDate ?? 0).getTime() - new Date(b.event!.startDate ?? 0).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <Section eyebrow="Schedule" title="My events">
        <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-3 flex items-center gap-3 animate-pulse">
              <div className="size-[10px] rounded-full bg-[var(--surface-soft)]" />
              <div className="h-4 w-1/2 bg-[var(--surface-soft)] rounded" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (events.length === 0) {
    return (
      <Section
        eyebrow="Schedule"
        title="No registrations yet"
        action={
          <Button size="sm" variant="ghost" onClick={onAll}>
            Browse <ChevronRight size={12} />
          </Button>
        }
      >
        <div className="flex items-center gap-4 py-5 border-y border-[var(--border-subtle)]">
          <Calendar size={20} className="text-[var(--ds-text-3)]" />
          <p className="text-[13.5px] text-[var(--ds-text-2)] flex-1 max-w-prose leading-relaxed">
            Once you register for a workshop, sprint, or hackathon it&apos;ll show up here with a ticket and status.
          </p>
          <Button size="sm" variant="outline" onClick={onAll}>
            See upcoming <ArrowRight size={12} className="ml-1" />
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section
      eyebrow="Schedule"
      title="My events"
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          All <ChevronRight size={12} />
        </Button>
      }
    >
      <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
        {events.map((r) => {
          const e = r.event!;
          const status = e.status ?? 'UPCOMING';
          const startDate = e.startDate ? new Date(e.startDate) : null;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/events/${e.slug || e.id}`)}
              className="w-full py-3 flex items-center gap-3 -mx-2 px-2 hover:bg-[var(--surface-soft)] rounded-[6px] text-left transition-colors"
            >
              <span
                className={cn(
                  'size-[10px] rounded-full shrink-0',
                  status === 'ONGOING' && 'bg-[var(--success)] live-dot',
                  status === 'UPCOMING' && 'bg-[var(--accent)]',
                  status === 'PAST' && 'bg-[var(--border-strong)]',
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-[var(--ds-text-1)] truncate">{e.title}</div>
                <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">
                  <span className="font-mono tabular-nums">
                    {startDate?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {startDate && ` · ${startDate.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                  {e.venue && <span> · {e.venue}</span>}
                </div>
              </div>
              <Pill
                tone={status === 'ONGOING' ? 'success' : status === 'UPCOMING' ? 'info' : 'neutral'}
                size="xs"
                dot={status === 'ONGOING'}
              >
                {status === 'ONGOING' ? 'Live' : status === 'UPCOMING' ? 'Upcoming' : 'Past'}
              </Pill>
              <ChevronRight size={14} className="text-[var(--ds-text-3)] shrink-0" />
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Read up: announcements + polls
function ReadUpSection({
  announcements, polls, onAll,
}: {
  announcements: Array<{ id: string; slug?: string; title: string; body?: string; priority?: string; pinned?: boolean; createdAt?: string }>;
  polls: Array<{ id: string; slug: string; question: string; options: Array<{ id: string; text: string; voteCount?: number }>; totalVotes?: number }>;
  onAll: () => void;
}) {
  const navigate = useNavigate();
  if (announcements.length === 0 && polls.length === 0) return null;
  return (
    <Section
      eyebrow="Read up"
      title="Announcements & polls"
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          All <ChevronRight size={12} />
        </Button>
      }
    >
      <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
        {polls.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/polls/${p.slug}`)}
            className="w-full py-3 -mx-2 px-2 rounded-[6px] hover:bg-[var(--surface-soft)] transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <Pill tone="accent" size="xs" icon={<Activity size={9} />}>Poll · open</Pill>
              <span className="text-[13px] font-medium flex-1">{p.question}</span>
              <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">{p.totalVotes ?? 0} votes</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {p.options.slice(0, 4).map((opt) => (
                <span
                  key={opt.id}
                  className="px-2.5 h-7 rounded-[6px] text-[12px] font-medium border border-[var(--border-default)] bg-[var(--bg-raised)] text-[var(--ds-text-2)] inline-flex items-center truncate"
                >
                  {opt.text}
                </span>
              ))}
            </div>
          </button>
        ))}
        {announcements.map((a) => {
          const priority = a.priority ?? 'LOW';
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => navigate(`/announcements/${a.slug || a.id}`)}
              className="w-full py-3 flex items-start gap-3 -mx-2 px-2 rounded-[6px] hover:bg-[var(--surface-soft)] text-left transition-colors"
            >
              <span
                className={cn(
                  'w-[3px] self-stretch rounded-full shrink-0 mt-0.5',
                  priority === 'URGENT' && 'bg-[var(--danger)]',
                  priority === 'HIGH' && 'bg-[var(--warning)]',
                  (priority === 'MEDIUM' || priority === 'MED') && 'bg-[var(--info)]',
                  priority === 'LOW' && 'bg-[var(--ds-text-3)] opacity-50',
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Pill tone={PRIORITY_TONE[priority] ?? 'neutral'} size="xs">{priority}</Pill>
                  {a.pinned && <Pill tone="accent" size="xs" icon={<Bookmark size={9} />}>Pinned</Pill>}
                  {a.createdAt && (
                    <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
                      {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="text-[13.5px] font-medium leading-snug">{a.title}</div>
                {a.body && <p className="text-[12px] text-[var(--ds-text-3)] mt-1 line-clamp-1">{a.body}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Standing (leaderboard slice)
function StandingSection({
  loading, data, onAll, onSolveQotd,
}: {
  loading: boolean;
  data: { slice: Array<{ rank: number; userId: string; name: string; avatar: string | null; score: number; you: boolean }>; myRank: number | null; nextUpDelta: number | null; nextUp: { rank: number; name: string; score: number } | null } | undefined;
  onAll: () => void;
  onSolveQotd: () => void;
}) {
  if (loading) {
    return (
      <Section eyebrow="Climbing" title="Where you stand">
        <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-2.5 flex items-center gap-3 animate-pulse">
              <div className="size-6 bg-[var(--surface-soft)] rounded-full" />
              <div className="h-3 flex-1 bg-[var(--surface-soft)] rounded" />
            </div>
          ))}
        </div>
      </Section>
    );
  }
  if (!data || !data.myRank) {
    return (
      <Section
        eyebrow="Climbing"
        title="Solve to enter the leaderboard"
        action={
          <Button size="sm" variant="ghost" onClick={onAll}>
            View top <ChevronRight size={12} />
          </Button>
        }
      >
        <div className="flex items-center gap-4 py-5 border-y border-[var(--border-subtle)]">
          <Trophy size={20} className="text-[var(--ds-text-3)]" />
          <p className="text-[13.5px] text-[var(--ds-text-2)] flex-1 leading-relaxed">
            Solve QOTDs and practice problems to earn points. Your rank shows up here once you cross your first scored submission.
          </p>
          <Button size="sm" variant="outline" onClick={onSolveQotd}>Solve QOTD</Button>
        </div>
      </Section>
    );
  }
  const max = Math.max(...data.slice.map((s) => s.score));
  return (
    <Section
      eyebrow="Climbing"
      title="Where you stand"
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          Full leaderboard <ChevronRight size={12} />
        </Button>
      }
    >
      <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
        {data.slice.map((r) => {
          const w = max > 0 ? (r.score / max) * 100 : 0;
          return (
            <div
              key={r.userId}
              className={cn(
                'py-2.5 flex items-center gap-3 -mx-2 px-2 rounded-[6px] transition-colors',
                r.you ? 'bg-[var(--accent-subtle)]/50' : 'hover:bg-[var(--surface-soft)]',
              )}
            >
              <span className={cn('font-mono tabular-nums text-[12px] font-semibold w-[28px]', r.you ? 'text-[var(--accent)]' : 'text-[var(--ds-text-3)]')}>
                #{r.rank}
              </span>
              <Avatar name={r.name} src={r.avatar} size={24} />
              <span className={cn('text-[13px] truncate flex-1 min-w-0', r.you ? 'font-semibold text-[var(--ds-text-1)]' : 'font-medium text-[var(--ds-text-1)]')}>
                {r.name}
                {r.you && <span className="text-[var(--accent)] font-semibold ml-1.5">— you</span>}
              </span>
              <div className="hidden sm:block flex-1 max-w-[200px] h-[5px] rounded-full bg-[var(--surface-soft)] overflow-hidden">
                <div className={cn('h-full rounded-full', r.you ? 'bg-[var(--accent)]' : 'bg-[var(--ds-text-3)]/40')} style={{ width: `${w}%` }} />
              </div>
              <span className="font-mono tabular-nums text-[13px] font-medium w-[64px] text-right">{r.score.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      {data.nextUp && data.nextUpDelta != null && data.nextUpDelta > 0 && (
        <div className="mt-3 text-[12px] text-[var(--ds-text-3)]">
          <span className="font-mono tabular-nums text-[var(--ds-text-1)] font-semibold">{data.nextUpDelta}</span> points to overtake{' '}
          <span className="text-[var(--ds-text-2)] font-medium">{data.nextUp.name}</span> at #{data.nextUp.rank}.
        </div>
      )}
    </Section>
  );
}

// ─── My code
function MyCodeSection({
  loading, subs, onAll, onSolveQotd,
}: {
  loading: boolean;
  subs: Array<{ id: string; problemTitle: string; problemSlug: string | null; language: string; verdict: string; score: number; runtimeMs: number | null; submittedAt: string }>;
  onAll: () => void;
  onSolveQotd: () => void;
}) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <Section eyebrow="My code" title="Recent submissions">
        <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-2.5 animate-pulse">
              <div className="h-4 w-1/2 bg-[var(--surface-soft)] rounded" />
            </div>
          ))}
        </div>
      </Section>
    );
  }
  if (subs.length === 0) {
    return (
      <Section
        eyebrow="My code"
        title="No submissions yet"
        action={
          <Button size="sm" variant="ghost" onClick={onAll}>
            Browse <ChevronRight size={12} />
          </Button>
        }
      >
        <div className="flex items-center gap-4 py-5 border-y border-[var(--border-subtle)]">
          <Terminal size={20} className="text-[var(--ds-text-3)]" />
          <p className="text-[13.5px] text-[var(--ds-text-2)] flex-1 leading-relaxed">
            Submit on a QOTD or practice problem and your verdict, score, and timing show up here.
          </p>
          <Button size="sm" variant="outline" onClick={onSolveQotd}>Solve QOTD</Button>
        </div>
      </Section>
    );
  }
  return (
    <Section
      eyebrow="My code"
      title="Recent submissions"
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          All <ChevronRight size={12} />
        </Button>
      }
    >
      <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
        {subs.map((s) => {
          const tone = VERDICT_TONE[s.verdict] ?? 'neutral';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => s.problemSlug && navigate(`/dashboard/coding?tab=practice&problem=${s.problemSlug}`)}
              className="w-full py-2.5 flex items-center gap-3 hover:bg-[var(--surface-soft)] text-left -mx-2 px-2 rounded-[6px] transition-colors"
            >
              <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{s.problemTitle}</span>
              <Pill tone="neutral" size="xs">{s.language}</Pill>
              <Pill tone={tone} size="xs">{shortVerdict(s.verdict)}</Pill>
              <span className="hidden sm:inline w-[44px] text-right font-mono tabular-nums text-[12px] text-[var(--ds-text-2)] font-medium">{s.score}</span>
              <span className="hidden md:inline w-[72px] text-right text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
                {s.runtimeMs != null ? `${s.runtimeMs}ms` : '—'}
              </span>
              <span className="hidden lg:inline w-[80px] text-right text-[11.5px] text-[var(--ds-text-3)] whitespace-nowrap">
                {relativeTime(s.submittedAt)}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function shortVerdict(v: string): string {
  return v === 'ACCEPTED' ? 'AC'
    : v === 'WRONG_ANSWER' ? 'WA'
    : v === 'TIME_LIMIT_EXCEEDED' ? 'TLE'
    : v === 'RUNTIME_ERROR' ? 'RE'
    : v === 'COMPILATION_ERROR' ? 'CE'
    : v;
}

// ─── Earned: certificates
function EarnedSection({
  loading, certs, onAll,
}: {
  loading: boolean;
  certs: CertificateCardData[];
  onAll: () => void;
}) {
  if (loading || certs.length === 0) return null;
  const recent = certs.slice(0, 6);
  return (
    <Section
      eyebrow="Earned"
      title="Certificates"
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          All <ChevronRight size={12} />
        </Button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {recent.map((c, i) => (
          <Link key={c.id} to="/dashboard/certificates" className="text-left group">
            <CertificateCard cert={c} cover={getCertificateCover(i)} showActions={false} />
          </Link>
        ))}
      </div>
    </Section>
  );
}

// ─── Hiring status
function HiringStatusSection({
  application,
}: {
  application: { id: string; applyingRole: string; status: string; createdAt: string };
}) {
  const navigate = useNavigate();
  const status = application.status;
  const tone: 'warning' | 'info' | 'success' | 'danger' =
    status === 'PENDING' ? 'warning'
    : status === 'INTERVIEW_SCHEDULED' ? 'info'
    : status === 'SELECTED' ? 'success'
    : 'danger';
  return (
    <Section eyebrow="Application" title="Hiring status">
      <div className="border-y border-[var(--border-subtle)] py-4 flex items-center gap-4 flex-wrap">
        <div className="size-10 rounded-[10px] bg-[var(--info-bg)] text-[var(--info)] flex items-center justify-center shrink-0">
          <Briefcase size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold">Applied for {application.applyingRole.replace(/_/g, ' ')}</span>
            <Pill tone={tone} size="xs">{status.replace(/_/g, ' ')}</Pill>
          </div>
          <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1 font-mono tabular-nums">
            applied {new Date(application.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard/profile')}>View details</Button>
      </div>
    </Section>
  );
}

// ─── Admin: 12-tile stat strip
function AdminStatStrip({
  data,
}: {
  data: { overview: { totalUsers: number; upcomingEvents: number; totalAnnouncements: number }; insights: import('@/lib/api').AdminInsights };
}) {
  // Defensive against API contract drift: each numeric tile coerces undefined
  // to 0 and renders an em-dash if the value is still not a number. Prevents
  // the admin dashboard from showing "undefined" tiles after a schema/shape
  // change.
  const raw = (data.insights ?? {}) as Partial<import('@/lib/api').AdminInsights>;
  const num = (v: unknown, fallback = 0): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const i = {
    totalUsers: num(raw.totalUsers),
    usersDelta: num(raw.usersDelta),
    activeEvents: num(raw.activeEvents),
    upcomingEvents: num(raw.upcomingEvents),
    pendingInvitationsCount: num(raw.pendingInvitationsCount),
    certificatesThisMonth: num(raw.certificatesThisMonth),
    liveScansLastHour: num(raw.liveScansLastHour),
    quizSessionsLast7d: num(raw.quizSessionsLast7d),
    registrationsThisWeek: num(raw.registrationsThisWeek),
    attendedThisWeek: num(raw.attendedThisWeek),
    averageStreak: num(raw.averageStreak),
    longestStreakOverall: num(raw.longestStreakOverall),
    acRatePct: num(raw.acRatePct),
    submissionsThisWeek: num(raw.submissionsThisWeek),
    topContributor: raw.topContributor ?? null,
    networkPending: num(raw.networkPending),
    playgroundPressurePct: num(raw.playgroundPressurePct),
    playgroundAtCap: num(raw.playgroundAtCap),
    playgroundActiveToday: num(raw.playgroundActiveToday),
  };
  const fmt = (n: number) => n.toLocaleString();
  const tiles: Array<{ l: string; v: string; d?: string | null; tone?: 'success' | 'danger' | 'neutral' }> = [
    { l: 'Total users', v: fmt(i.totalUsers), d: i.usersDelta >= 0 ? `+${i.usersDelta} wow` : `${i.usersDelta} wow`, tone: i.usersDelta >= 0 ? 'success' : 'danger' },
    { l: 'Active events', v: `${i.activeEvents}`, d: i.upcomingEvents > 0 ? `${i.upcomingEvents} upcoming` : null, tone: 'neutral' },
    { l: 'Pending invites', v: fmt(i.pendingInvitationsCount), d: null },
    { l: 'Certs this month', v: fmt(i.certificatesThisMonth), d: null },
    { l: 'Live scans · 1h', v: fmt(i.liveScansLastHour), d: i.liveScansLastHour > 0 ? 'live' : null, tone: 'neutral' },
    { l: 'Quiz sessions · 7d', v: fmt(i.quizSessionsLast7d), d: null },
    { l: 'Reg → attended', v: `${pct(i.attendedThisWeek, i.registrationsThisWeek)}%`, d: `${i.attendedThisWeek}/${i.registrationsThisWeek}`, tone: 'neutral' },
    { l: 'Avg streak', v: `${i.averageStreak}`, d: `max ${i.longestStreakOverall}`, tone: 'neutral' },
    { l: 'AC rate · 7d', v: `${i.acRatePct}%`, d: `${fmt(i.submissionsThisWeek)} subs`, tone: 'neutral' },
    {
      l: 'Top contributor',
      v: i.topContributor?.name?.split(' ')[0] ?? '—',
      d: i.topContributor ? `${i.topContributor.count} QOTDs` : null,
      tone: 'neutral',
    },
    { l: 'Network pending', v: fmt(i.networkPending), d: null },
    { l: 'Playground cap', v: `${i.playgroundPressurePct}%`, d: `${i.playgroundAtCap}/${i.playgroundActiveToday}`, tone: i.playgroundPressurePct > 70 ? 'danger' : 'neutral' },
  ];
  return (
    <Section eyebrow="Admin" title="Today at a glance">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-y-4 border-y border-[var(--border-subtle)] py-4">
        {tiles.map((s, idx) => (
          <div
            key={idx}
            className={cn(
              'min-w-0',
              idx % 6 !== 0 && 'lg:border-l lg:border-[var(--border-subtle)] lg:pl-5',
            )}
          >
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] whitespace-nowrap">{s.l}</div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-[22px] font-semibold tabular-nums leading-none text-[var(--ds-text-1)]">{s.v}</span>
              {s.d && (
                <span
                  className={cn(
                    'text-[11px] font-mono tabular-nums font-medium',
                    s.tone === 'success' && 'text-[var(--success)]',
                    s.tone === 'danger' && 'text-[var(--danger)]',
                    (!s.tone || s.tone === 'neutral') && 'text-[var(--ds-text-3)]',
                  )}
                >
                  {s.d}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── NETWORK overview
function NetworkOverview() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name?.split(' ')[0] ?? 'there';
  const regsQ = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () => api.getMyRegistrations(token!),
    enabled: Boolean(token),
  });
  const invitationsQ = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => api.getMyInvitations(token!),
    enabled: Boolean(token),
  });
  const certsQ = useQuery({
    queryKey: ['my-certificates'],
    queryFn: async () => {
      const res = await api.getMyCertificates(token!);
      return (res.certificates as Array<{ id: string; certId: string; type: string; eventName: string; eventImageUrl?: string | null; issuedAt: string }>) ?? [];
    },
    enabled: Boolean(token),
  });
  const pending = (invitationsQ.data ?? []).filter((i) => i.status === 'PENDING');
  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="text-[12px] text-[var(--ds-text-3)] mb-1">Network member · welcome back</div>
        <h1 className="text-[28px] font-semibold tracking-tight">Welcome back, {firstName}.</h1>
      </div>

      <MyEventsSection
        loading={regsQ.isLoading}
        registrations={regsQ.data ?? []}
        onAll={() => navigate('/dashboard/events')}
      />

      <Section
        eyebrow="Invitations"
        title={pending.length > 0 ? `${pending.length} pending` : 'No invitations'}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('/dashboard/invitations')}>
            All <ChevronRight size={12} />
          </Button>
        }
      >
        {pending.length === 0 ? (
          <div className="flex items-center gap-4 py-5 border-y border-[var(--border-subtle)]">
            <Inbox size={20} className="text-[var(--ds-text-3)]" />
            <p className="text-[13.5px] text-[var(--ds-text-2)] flex-1 leading-relaxed">
              When someone invites you as a speaker, judge, or guest, the invitation appears here with full context.
            </p>
          </div>
        ) : (
          <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {pending.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => navigate(`/dashboard/invitations/${inv.id}`)}
                className="w-full py-3 flex items-start gap-4 -mx-2 px-2 rounded-[6px] hover:bg-[var(--surface-soft)] transition-colors text-left flex-wrap"
              >
                <Pill tone="accent" size="xs" className="mt-1 shrink-0">{inv.role ?? 'Guest'}</Pill>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium">{inv.event?.title ?? 'Event'}</div>
                  {inv.customMessage && <div className="text-[11.5px] text-[var(--ds-text-2)] mt-0.5 line-clamp-1">{inv.customMessage}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      <EarnedSection
        loading={certsQ.isLoading}
        certs={certsQ.data ?? []}
        onAll={() => navigate('/dashboard/certificates')}
      />
    </div>
  );
}
