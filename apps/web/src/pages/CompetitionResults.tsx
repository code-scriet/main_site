import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { api } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

function podiumItemClass(rank: number) {
  if (rank === 1) return 'from-yellow-100 to-yellow-50 border-yellow-300 text-yellow-900';
  if (rank === 2) return 'from-gray-100 to-gray-50 border-gray-300 text-gray-800';
  return 'from-orange-100 to-orange-50 border-orange-300 text-orange-900';
}

function getRankLabel(rank: number) {
  if (rank === 1) return '🥇 #1';
  if (rank === 2) return '🥈 #2';
  return '🥉 #3';
}

function formatElapsed(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return '--';
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function CompetitionResults() {
  const { roundId = '' } = useParams();
  const resultsQuery = useQuery({
    queryKey: ['competition-results', roundId],
    enabled: Boolean(roundId),
    queryFn: () => api.getCompetitionResults(roundId),
  });

  const roundTitle = resultsQuery.data?.round.title || '';
  const eventTitle = resultsQuery.data?.round.eventTitle || '';
  const results = useMemo(() => resultsQuery.data?.results ?? [], [resultsQuery.data?.results]);
  const errorMessage = resultsQuery.error
    ? extractApiErrorMessage(resultsQuery.error, 'Failed to load results')
    : null;

  const topThree = useMemo(
    () =>
      results
        .filter((entry) => typeof entry.rank === 'number')
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .slice(0, 3),
    [results],
  );

  const podiumOrder = [1, 0, 2];

  return (
    <Layout>
      <SEO
        title={roundTitle ? `${roundTitle} Results` : 'Competition Results'}
        description="Competition leaderboard and standings."
      />
      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-amber-600" />
              Competition Results
            </CardTitle>
            <p className="text-sm text-gray-600">
              {roundTitle || 'Round'}{eventTitle ? ` · ${eventTitle}` : ''}
            </p>
          </CardHeader>
        </Card>

        {resultsQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        )}

        {!resultsQuery.isLoading && errorMessage && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5 text-sm text-red-700">{errorMessage}</CardContent>
          </Card>
        )}

        {!resultsQuery.isLoading && !errorMessage && (
          <>
            {topThree.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Podium</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-end justify-center gap-2 sm:gap-4">
                    {podiumOrder.map((index) => {
                      const entry = topThree[index];
                      if (!entry || !entry.rank) return null;
                      const rank = entry.rank;
                      const delay = rank === 3 ? 0.45 : rank === 2 ? 0.75 : 1.05;
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 50 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay, type: 'spring', stiffness: 180, damping: 16 }}
                          className="flex flex-col items-center flex-1 max-w-[150px]"
                        >
                          <div className={cn('w-full rounded-xl border bg-gradient-to-b p-3 text-center', podiumItemClass(rank))}>
                            <p className="text-sm font-bold">{getRankLabel(rank)}</p>
                            <p className="mt-1 text-sm font-semibold truncate">{entry.teamName}</p>
                            <p className="text-xs mt-1">Score: {entry.score ?? '--'}</p>
                            <p className="text-[11px] mt-2 opacity-80 line-clamp-2">{entry.members.join(', ')}</p>
                          </div>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: rank === 1 ? 118 : rank === 2 ? 92 : 70 }}
                            transition={{ delay: delay - 0.12, duration: 0.45, ease: 'easeOut' }}
                            className={cn(
                              'w-full rounded-t-xl mt-1',
                              rank === 1 ? 'bg-yellow-200/70 border-t-2 border-yellow-300' : rank === 2
                                ? 'bg-gray-200/70 border-t-2 border-gray-300'
                                : 'bg-orange-200/70 border-t-2 border-orange-300',
                            )}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Full Standings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-amber-100 text-left text-gray-500">
                        <th className="py-2 pr-3">Rank</th>
                        <th className="py-2 pr-3">Team</th>
                        <th className="py-2 pr-3">Score</th>
                        <th className="py-2 pr-3">Members</th>
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">Mode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((entry) => (
                        <tr key={entry.id} className="border-b border-amber-50">
                          <td className="py-2 pr-3 font-semibold">{entry.rank ?? '--'}</td>
                          <td className="py-2 pr-3">{entry.teamName}</td>
                          <td className="py-2 pr-3">{entry.score ?? '--'}</td>
                          <td className="py-2 pr-3">{entry.members.join(', ')}</td>
                          <td className="py-2 pr-3">
                            <span className="tabular-nums">{formatElapsed(entry.elapsedSeconds)}</span>
                            {entry.isAutoSubmit ? '*' : ''}
                          </td>
                          <td className="py-2 pr-3">
                            {entry.isAutoSubmit ? (
                              <Badge variant="outline" className="border-yellow-300 bg-yellow-100 text-yellow-700">Auto</Badge>
                            ) : (
                              <Badge variant="outline" className="border-green-300 bg-green-100 text-green-700">Manual</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 mt-3">* Auto-submitted at timer expiry.</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </Layout>
  );
}
