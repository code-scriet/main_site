import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Trophy } from 'lucide-react';
import { api, type ProblemLeaderboardEntry } from '@/lib/api';
import { SEO } from '@/components/SEO';

function LeaderboardTable({ entries }: { entries: ProblemLeaderboardEntry[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Submitted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <tr key={`${entry.rank}-${entry.userId}`}>
              <td className="px-4 py-3 font-bold text-gray-900">#{entry.rank}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {entry.avatar ? <img src={entry.avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{entry.name.slice(0, 1)}</div>}
                  <span className="font-semibold text-gray-900">{entry.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 font-semibold text-gray-900">{entry.score}</td>
              <td className="px-4 py-3 text-gray-500">{entry.submittedAt ? new Date(entry.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '-'}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-gray-500">No submissions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function QOTDLeaderboardPage() {
  const [tab, setTab] = useState<'today' | 'total'>('today');
  const todayQuery = useQuery({ queryKey: ['qotd', 'today'], queryFn: () => api.getTodayQOTD() });
  const dailyQuery = useQuery({
    queryKey: ['qotd', 'leaderboard', 'daily', todayQuery.data?.id],
    queryFn: () => api.getQOTDDailyLeaderboard(todayQuery.data!.id),
    enabled: Boolean(todayQuery.data?.id),
  });
  const totalQuery = useQuery({
    queryKey: ['qotd', 'leaderboard', 'total'],
    queryFn: () => api.getQOTDTotalLeaderboard(),
  });

  const activeEntries = tab === 'today' ? dailyQuery.data?.entries ?? [] : totalQuery.data?.entries ?? [];
  const loading = tab === 'today' ? todayQuery.isLoading || dailyQuery.isLoading : totalQuery.isLoading;

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
          <p className="mt-2 text-gray-600">Daily scores and all-time in-day totals use IST dates.</p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-200 p-1">
          <button type="button" onClick={() => setTab('today')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'today' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>Today</button>
          <button type="button" onClick={() => setTab('total')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'total' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>All Time</button>
        </div>
        {loading ? (
          <div className="grid min-h-[320px] place-items-center rounded-lg border border-gray-200 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
          </div>
        ) : (
          <LeaderboardTable entries={activeEntries} />
        )}
      </div>
    </main>
  );
}
