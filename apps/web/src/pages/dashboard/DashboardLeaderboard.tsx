import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import { api, type ProblemLeaderboardEntry } from '@/lib/api';
import { Trophy, Medal, Award, Loader2, Crown, Flame, AlertCircle, Clock } from 'lucide-react';

type LeaderboardTab = 'today' | 'total';

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatIstTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatIstDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function DashboardLeaderboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [tab, setTab] = useState<LeaderboardTab>('today');

  const todayQuery = useQuery({
    queryKey: ['qotd', 'today'],
    queryFn: () => api.getTodayQOTD(),
    staleTime: 60_000,
  });
  const dailyQuery = useQuery({
    queryKey: ['qotd', 'leaderboard', 'daily', todayQuery.data?.id],
    queryFn: () => api.getQOTDDailyLeaderboard(todayQuery.data!.id),
    enabled: Boolean(todayQuery.data?.id),
    staleTime: 60_000,
  });
  const totalQuery = useQuery({
    queryKey: ['qotd', 'leaderboard', 'total'],
    queryFn: () => api.getQOTDTotalLeaderboard(),
    staleTime: 60_000,
  });

  const entries: ProblemLeaderboardEntry[] = useMemo(() => {
    return tab === 'today' ? dailyQuery.data?.entries ?? [] : totalQuery.data?.entries ?? [];
  }, [tab, dailyQuery.data, totalQuery.data]);

  const loading = tab === 'today'
    ? todayQuery.isLoading || dailyQuery.isLoading
    : totalQuery.isLoading;
  const errorObj = tab === 'today' ? dailyQuery.error : totalQuery.error;
  const error = errorObj instanceof Error ? errorObj.message : errorObj ? 'Failed to load leaderboard' : null;

  const userEntryIndex = entries.findIndex((entry) => entry.userId === user?.id);
  const userRank = userEntryIndex >= 0 ? userEntryIndex + 1 : null;
  const userEntry = userEntryIndex >= 0 ? entries[userEntryIndex] : null;

  if (settings?.showLeaderboard === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Leaderboard</h1>
          <p className="text-gray-600">Top QOTD performers ranked by score</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-600">Leaderboard is currently disabled</p>
            <p className="text-sm text-gray-500 mt-2">Check back later!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-gray-500 tabular-nums">#{rank}</span>;
    }
  };

  const getRankBg = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200';
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
      case 3:
        return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
      default:
        return 'bg-white border-amber-100';
    }
  };

  const userStatLabel = tab === 'today' ? "Today's score" : 'All-time score';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Leaderboard</h1>
        <p className="text-gray-600">
          {tab === 'today'
            ? "Today's QOTD top performers — ranked by score, then time-to-solve"
            : 'All-time QOTD rankings — total score across every day you solved'}
        </p>
      </div>

      {user && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Card className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 text-white border-none">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="h-14 w-14 rounded-full overflow-hidden ring-4 ring-white/30 bg-white/20 flex-shrink-0">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                        {user.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-amber-100 text-sm">Your ranking</p>
                    <p className="text-xl sm:text-2xl font-bold break-words">{user.name}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Trophy className="h-6 w-6" />
                    <span className="text-3xl font-bold tabular-nums">
                      {userRank ? `#${userRank}` : 'Unranked'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:justify-end mt-1">
                    <Flame className="h-4 w-4" />
                    <span className="text-amber-100 text-sm">
                      {userEntry ? `${userStatLabel}: ${userEntry.score}` : 'Solve today’s QOTD to rank!'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="inline-flex rounded-lg bg-gray-200 p-1">
        <button
          type="button"
          onClick={() => setTab('today')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${tab === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setTab('total')}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${tab === 'total' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
        >
          All Time
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Top performers
          </CardTitle>
          <CardDescription>
            {tab === 'today'
              ? dailyQuery.data?.publishedAt
                ? `Today’s QOTD published at ${formatIstTime(dailyQuery.data.publishedAt)} IST`
                : "Today's QOTD"
              : 'Aggregated across every QOTD solved on its IST day'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-600 font-medium">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => (tab === 'today' ? dailyQuery.refetch() : totalQuery.refetch())}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Trophy className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">
                {tab === 'today'
                  ? todayQuery.data
                    ? 'No solves yet today'
                    : 'No QOTD published today yet'
                  : 'No rankings yet!'}
              </p>
              <p className="text-sm">
                {tab === 'today'
                  ? todayQuery.data
                    ? 'Be the first — solve today’s QOTD to claim #1.'
                    : 'Check back later, or switch to All Time.'
                  : 'Solve QOTD problems to appear on the leaderboard.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, index) => {
                const rank = entry.rank ?? index + 1;
                const isYou = entry.userId === user?.id;
                return (
                  <motion.div
                    key={`${entry.userId}-${rank}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.3) }}
                    className={`flex items-center justify-between gap-3 p-4 rounded-lg border ${getRankBg(rank)} ${isYou ? 'ring-2 ring-amber-500' : ''}`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-8 flex justify-center">{getRankIcon(rank)}</div>
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                        {entry.avatar ? (
                          <img src={entry.avatar} alt={entry.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold">
                            {entry.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-amber-900 break-words">
                          {entry.name}
                          {isYou && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">You</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {tab === 'today'
                            ? entry.timeTakenMs !== undefined
                              ? `Solved in ${formatDurationMs(entry.timeTakenMs)} (at ${formatIstTime(entry.submittedAt)} IST)`
                              : `Solved at ${formatIstTime(entry.submittedAt)} IST`
                            : `Last solve ${formatIstDateTime(entry.submittedAt)}${entry.solveDays ? ` · ${entry.solveDays} day${entry.solveDays === 1 ? '' : 's'}` : ''}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="font-bold text-amber-900 tabular-nums">{entry.score}</span>
                      <span className="text-sm text-gray-500">{tab === 'today' ? 'pts' : 'total'}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
