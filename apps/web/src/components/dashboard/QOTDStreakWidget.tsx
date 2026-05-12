import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Flame, Trophy, ExternalLink, Calendar, ChevronRight, Lock } from 'lucide-react';
import { api, type QOTDStats } from '@/lib/api';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { cn } from '@/lib/utils';

interface QOTDStreakWidgetProps {
  token: string;
}

function streakHeadline(streak: number, todaySolved: boolean): string {
  if (streak === 0) return 'Start your streak';
  if (streak === 1) return todaySolved ? 'Day 1 — locked in' : 'Day 1 — keep it alive';
  return `${streak} days in a row`;
}

function streakSubcopy(streak: number, todaySolved: boolean): string {
  if (streak === 0) return "Solve today's QOTD to light the flame.";
  if (todaySolved) return "You're set for today. See you tomorrow.";
  return 'Solve today before midnight IST to keep it going.';
}

export function QOTDStreakWidget({ token }: QOTDStreakWidgetProps) {
  const statsQuery = useQuery<QOTDStats>({
    queryKey: ['qotd-stats', token],
    queryFn: () => api.getQOTDStats(token),
    enabled: Boolean(token),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const stats = statsQuery.data ?? null;

  const weeks = useMemo(() => {
    if (!stats?.last30Days?.length) return [];
    // 28 days → 4 weeks × 7 columns, ending on the most recent day.
    const tail = stats.last30Days.slice(-28);
    const rows: Array<Array<{ date: string; solved: boolean }>> = [[], [], [], []];
    tail.forEach((entry, index) => {
      rows[Math.floor(index / 7)].push(entry);
    });
    return rows;
  }, [stats?.last30Days]);

  if (statsQuery.isLoading || statsQuery.isFetching && !stats) {
    return (
      <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-6 text-sm text-gray-400">Loading streak…</CardContent>
      </Card>
    );
  }

  if (statsQuery.isError || !stats) {
    return null;
  }

  const earnedBadges = stats.badges.filter((badge) => badge.earned);
  const lockedBadges = stats.badges.filter((badge) => !badge.earned).slice(0, 3);
  const next = stats.nextMilestone;
  const todaySolved = stats.todaySolved;
  const flameTone = stats.currentStreak >= 30
    ? 'from-rose-500 to-orange-500'
    : stats.currentStreak >= 7
      ? 'from-amber-500 to-orange-500'
      : stats.currentStreak >= 1
        ? 'from-amber-400 to-amber-500'
        : 'from-gray-300 to-gray-400';

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-0">
          {/* LEFT: Big flame + current streak */}
          <div className="relative p-6 lg:p-7 overflow-hidden bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50">
            <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-amber-300/20 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <motion.div
                initial={{ scale: 0.9, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
                className={cn(
                  'flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg',
                  flameTone,
                )}
              >
                <Flame className="h-8 w-8 sm:h-10 sm:w-10 text-white drop-shadow" />
              </motion.div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold text-amber-900 tabular-nums">{stats.currentStreak}</span>
                  <span className="text-sm font-semibold text-amber-700">day{stats.currentStreak === 1 ? '' : 's'}</span>
                </div>
                <p className="text-sm font-semibold text-amber-900">{streakHeadline(stats.currentStreak, todaySolved)}</p>
                <p className="mt-0.5 text-xs text-amber-800/80">{streakSubcopy(stats.currentStreak, todaySolved)}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
                <Trophy className="h-3.5 w-3.5 text-amber-600" />
                Longest {stats.longestStreak}d
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
                <Calendar className="h-3.5 w-3.5 text-amber-600" />
                {stats.totalSolved} solved
              </div>
            </div>

            <div className="mt-4">
              {!todaySolved ? (
                <a href={getPlaygroundLaunchUrl('/?qotd=today')} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
                    Solve in Playground
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </a>
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                  ✓ Solved today
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE: 4×7 activity heatmap */}
          <div className="border-t lg:border-t-0 lg:border-l border-gray-100 p-6 lg:p-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Last 4 weeks</p>
              <p className="text-[11px] text-gray-400">IST</p>
            </div>
            <div className="space-y-1.5">
              {weeks.map((week, rowIndex) => (
                <div key={rowIndex} className="flex gap-1.5">
                  {week.map((day) => {
                    const isToday = day.date === stats.last30Days[stats.last30Days.length - 1]?.date;
                    return (
                      <div
                        key={day.date}
                        title={`${day.date} — ${day.solved ? 'solved' : 'no solve'}`}
                        className={cn(
                          'h-6 w-6 sm:h-7 sm:w-7 rounded-md border transition-colors',
                          day.solved
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 border-amber-500/40'
                            : 'bg-gray-100 border-gray-200',
                          isToday && 'ring-2 ring-amber-500 ring-offset-1',
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            {next && (
              <div className="mt-5">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">
                    Next: {next.icon} {next.label}
                  </span>
                  <span className="font-semibold text-gray-500 tabular-nums">{next.progress}/{next.target}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{ width: `${Math.min(100, (next.progress / next.target) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {next.remaining === 1 ? '1 more to go.' : `${next.remaining} more to go.`}
                </p>
              </div>
            )}
          </div>

          {/* RIGHT: Badges */}
          <div className="border-t lg:border-t-0 lg:border-l border-gray-100 p-6 lg:p-7 lg:w-[240px]">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Badges</p>
            {earnedBadges.length === 0 ? (
              <p className="text-xs text-gray-400">Solve a QOTD to earn your first badge.</p>
            ) : (
              <ul className="space-y-2">
                {earnedBadges.slice(0, 4).map((badge) => (
                  <motion.li
                    key={badge.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 rounded-md bg-amber-50/70 px-2.5 py-1.5 ring-1 ring-amber-200"
                  >
                    <span className="text-lg leading-none">{badge.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-amber-900">{badge.label}</p>
                      <p className="truncate text-[10px] text-amber-700/80">{badge.description}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            )}
            {lockedBadges.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Up next</p>
                <ul className="space-y-1.5">
                  {lockedBadges.map((badge) => (
                    <li key={badge.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-gray-500">
                      <Lock className="h-3 w-3 text-gray-400" />
                      <span className="truncate text-[11px] font-medium">{badge.label}</span>
                      <ChevronRight className="ml-auto h-3 w-3 text-gray-300" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default QOTDStreakWidget;
