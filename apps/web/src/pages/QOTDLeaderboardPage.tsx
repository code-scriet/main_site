import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Trophy } from 'lucide-react';
import { api, type ProblemLeaderboardEntry } from '@/lib/api';
import { SEO } from '@/components/SEO';

function formatDurationMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
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

function LeaderboardTable({ entries, mode }: { entries: ProblemLeaderboardEntry[]; mode: 'today' | 'total' }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3 text-right">Score</th>
            <th className="px-4 py-3">{mode === 'today' ? 'Time taken' : 'Days solved'}</th>
            <th className="px-4 py-3">{mode === 'today' ? 'Solved at' : 'Last solve'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry, index) => {
            const rank = entry.rank ?? index + 1;
            return (
              <tr key={`${rank}-${entry.userId}`}>
                <td className="px-4 py-3 font-bold text-gray-900 tabular-nums">#{rank}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {entry.avatar ? (
                      <img src={entry.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        {entry.name.slice(0, 1)}
                      </div>
                    )}
                    <span className="font-semibold text-gray-900">{entry.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{entry.score}</td>
                <td className="px-4 py-3 text-gray-600 tabular-nums">
                  {mode === 'today'
                    ? formatDurationMs(entry.activeMs ?? undefined)
                    : entry.solveDays !== undefined
                      ? `${entry.solveDays} day${entry.solveDays === 1 ? '' : 's'}`
                      : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500 tabular-nums">
                  {mode === 'today' ? `${formatIstTime(entry.submittedAt)} IST` : formatIstDateTime(entry.submittedAt)}
                </td>
              </tr>
            );
          })}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                {mode === 'today' ? 'No solves yet today — be the first.' : 'No submissions yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function QOTDLeaderboardPage() {
  const [tab, setTab] = useState<'today' | 'total'>('today');
  const todayQuery = useQuery({ queryKey: ['qotd', 'today'], queryFn: () => api.getTodayQOTD(), staleTime: 60_000 });
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

  const activeEntries = tab === 'today' ? dailyQuery.data?.entries ?? [] : totalQuery.data?.entries ?? [];
  const loading = tab === 'today' ? todayQuery.isLoading || dailyQuery.isLoading : totalQuery.isLoading;
  const publishedAt = dailyQuery.data?.publishedAt ?? null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <SEO
        title="QOTD Leaderboard"
        description="Daily and all-time leaderboards for code.scriet's Question of the Day coding challenges."
        url="/qotd/leaderboard"
      />
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/qotd/today" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            QOTD
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
            <Trophy className="h-4 w-4" />
            Top 10
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">QOTD Leaderboard</h1>
          <p className="mt-2 text-gray-600">
            {tab === 'today'
              ? `Time taken is active-tab solve time reported by each solver${publishedAt ? ` (QOTD published at ${formatIstTime(publishedAt)} IST)` : ''}.`
              : 'Daily scores and all-time totals use IST dates.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-200 p-1">
          <button
            type="button"
            onClick={() => setTab('today')}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTab('total')}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'total' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
          >
            All Time
          </button>
        </div>
        {loading ? (
          <div className="grid min-h-[320px] place-items-center rounded-lg border border-gray-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : tab === 'today' && !todayQuery.data ? (
          <div className="grid min-h-[200px] place-items-center rounded-lg border border-gray-200 bg-white px-6 py-10 text-center text-gray-500">
            No QOTD published today yet — check back later, or switch to All Time.
          </div>
        ) : (
          <LeaderboardTable entries={activeEntries} mode={tab} />
        )}
      </div>
    </main>
  );
}
