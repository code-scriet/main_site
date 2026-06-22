// Public per-round competition results. Redesigned onto the dashboard-v2 design system
// (rust/accent tokens, dash primitives) — the legacy amber/yellow/gray palette is retired.
// Preserves every prior feature: DSA standings (ICPC penalty + per-problem breakdown +
// runtime + team members), the IMAGE_TARGET animated podium + full standings (elapsed time,
// auto/manual badge + footnote), and loading/error/empty states.

import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Layout } from '@/components/layout/Layout';
import { SEO } from '@/components/SEO';
import { api } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { useSettings } from '@/context/SettingsContext';
import { Avatar, DSCard, EmptyState, Pill } from '@/components/dash';
import { AlertCircle, Award, Crown, Loader2, Medal, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

function rankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-4 w-4 text-[var(--accent)]" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-[var(--ds-text-2)]" />;
  return <Award className="h-4 w-4 text-[var(--ds-text-3)]" />;
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
  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';
  const resultsQuery = useQuery({
    queryKey: ['competition-results', roundId],
    enabled: Boolean(roundId),
    queryFn: () => api.getCompetitionResults(roundId),
  });

  const roundTitle = resultsQuery.data?.round.title || '';
  const eventTitle = resultsQuery.data?.round.eventTitle || '';
  const results = useMemo(() => resultsQuery.data?.results ?? [], [resultsQuery.data?.results]);
  const isDsaRound = resultsQuery.data?.round.roundType === 'DSA';
  const isIcpc = resultsQuery.data?.round.penaltyModel === 'ICPC';
  const isTeamRound = results.some((entry) => entry.isTeam);
  const errorMessage = resultsQuery.error ? extractApiErrorMessage(resultsQuery.error, 'Failed to load results') : null;

  const topThree = useMemo(
    () => results.filter((e) => typeof e.rank === 'number').sort((a, b) => (a.rank as number) - (b.rank as number)).slice(0, 3),
    [results],
  );
  const podiumOrder = topThree.length === 3 ? [1, 0, 2] : topThree.map((_, i) => i);

  return (
    <Layout>
      <SEO title={roundTitle ? `${roundTitle} Results` : 'Competition Results'} description="Competition leaderboard and standings." />
      <div data-dashboard data-accent={accent}>
        <main className="container mx-auto px-4 py-8 space-y-5 max-w-5xl">
          {/* Header */}
          <DSCard>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-[12px] bg-[var(--accent)]/12 flex items-center justify-center shrink-0">
                <Trophy className="h-5 w-5 text-[var(--accent)]" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[20px] font-semibold tracking-tight">Competition Results</h1>
                <p className="text-[12.5px] text-[var(--ds-text-3)] truncate">
                  {roundTitle || 'Round'}{eventTitle ? ` · ${eventTitle}` : ''}
                </p>
              </div>
            </div>
          </DSCard>

          {resultsQuery.isLoading && (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" /></div>
          )}

          {!resultsQuery.isLoading && errorMessage && (
            <DSCard><EmptyState icon={<AlertCircle size={18} />} title="Couldn't load results" body={errorMessage} /></DSCard>
          )}

          {!resultsQuery.isLoading && !errorMessage && (
            <>
              {results.length === 0 && (
                <DSCard>
                  <EmptyState icon={<Trophy size={18} />} title="No results yet" body="Check back after judging is complete." />
                </DSCard>
              )}

              {/* IMAGE_TARGET podium */}
              {!isDsaRound && topThree.length > 0 && (
                <DSCard>
                  <div className="text-[13.5px] font-semibold mb-3">Podium</div>
                  <div className="flex items-end justify-center gap-2 sm:gap-4">
                    {podiumOrder.map((index) => {
                      const entry = topThree[index];
                      if (!entry || !entry.rank) return null;
                      const rank = entry.rank;
                      const delay = rank === 3 ? 0.45 : rank === 2 ? 0.75 : 1.05;
                      const top = rank === 1;
                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 50 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay, type: 'spring', stiffness: 180, damping: 16 }}
                          className="flex flex-col items-center flex-1 max-w-[150px]"
                        >
                          <div className={cn('w-full rounded-[12px] border p-3 text-center', top ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-[var(--border-default)] bg-[var(--surface-soft)]')}>
                            <p className="inline-flex items-center justify-center gap-1.5 text-[13px] font-bold">{rankIcon(rank)}#{rank}</p>
                            <p className="mt-1 text-[12.5px] font-semibold truncate">{entry.teamName}</p>
                            <p className="text-[11.5px] mt-1 text-[var(--ds-text-3)] font-mono tabular-nums">Score {entry.score ?? '--'}</p>
                            <p className="text-[10.5px] mt-1.5 text-[var(--ds-text-3)] line-clamp-2">{entry.members.join(', ')}</p>
                          </div>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: rank === 1 ? 110 : rank === 2 ? 86 : 64 }}
                            transition={{ delay: delay - 0.12, duration: 0.45, ease: 'easeOut' }}
                            className={cn('w-full rounded-t-[10px] mt-1 border-t-2', top ? 'bg-[var(--accent)]/15 border-[var(--accent)]' : 'bg-[var(--surface-soft)] border-[var(--border-default)]')}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                </DSCard>
              )}

              {/* DSA standings */}
              {isDsaRound && results.length > 0 && (
                <DSCard padded={false}>
                  <div className="p-3 border-b border-[var(--border-subtle)] text-[13.5px] font-semibold">DSA standings</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-[13px]">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                          <th className="py-2 px-3 w-14">Rank</th>
                          <th className="py-2 px-3">{isTeamRound ? 'Team' : 'Participant'}</th>
                          <th className="py-2 px-3 text-right">Score</th>
                          {isIcpc && <th className="py-2 px-3 text-right">Penalty</th>}
                          <th className="py-2 px-3 text-right">Runtime</th>
                          <th className="py-2 px-3">Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((entry) => (
                          <tr key={entry.userId ?? entry.id ?? entry.rank} className="border-b border-[var(--border-subtle)] align-top hover:bg-[var(--surface-soft)]/40">
                            <td className="py-3 px-3 font-mono font-semibold tabular-nums">
                              <span className="inline-flex items-center gap-1.5">{entry.rank && entry.rank <= 3 ? rankIcon(entry.rank) : null}#{entry.rank ?? '--'}</span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Avatar name={entry.userName ?? entry.teamName} size={24} />
                                <div className="min-w-0">
                                  <span className="font-medium block truncate">{entry.userName ?? entry.teamName}</span>
                                  {entry.isTeam && entry.members && entry.members.length > 0 && (
                                    <span className="block text-[11px] text-[var(--ds-text-3)] truncate max-w-[240px]">{entry.members.join(', ')}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums">{entry.totalScore ?? entry.score ?? 0}</td>
                            {isIcpc && <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--ds-text-3)]">{entry.penalty ?? 0}</td>}
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--ds-text-2)]">{entry.totalRuntimeMs ?? 0} ms</td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap gap-1.5">
                                {(entry.problems ?? []).map((problem) => (
                                  <Pill key={problem.problemId} tone="info" size="xs">{problem.title}: {problem.weightedScore}</Pill>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DSCard>
              )}

              {/* IMAGE_TARGET full standings */}
              {!isDsaRound && results.length > 0 && (
                <DSCard padded={false}>
                  <div className="p-3 border-b border-[var(--border-subtle)] text-[13.5px] font-semibold">Full standings</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-[13px]">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                          <th className="py-2 px-3 w-14">Rank</th>
                          <th className="py-2 px-3">Team</th>
                          <th className="py-2 px-3 text-right">Score</th>
                          <th className="py-2 px-3">Members</th>
                          <th className="py-2 px-3 text-right">Time</th>
                          <th className="py-2 px-3">Mode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((entry) => (
                          <tr key={entry.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/40">
                            <td className="py-2.5 px-3 font-mono font-semibold tabular-nums">{entry.rank ?? '--'}</td>
                            <td className="py-2.5 px-3 font-medium">{entry.teamName}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">{entry.score ?? '--'}</td>
                            <td className="py-2.5 px-3 text-[var(--ds-text-2)] truncate max-w-[240px]">{entry.members.join(', ')}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatElapsed(entry.elapsedSeconds)}{entry.isAutoSubmit ? '*' : ''}</td>
                            <td className="py-2.5 px-3">
                              <Pill tone={entry.isAutoSubmit ? 'warning' : 'success'} size="xs">{entry.isAutoSubmit ? 'Auto' : 'Manual'}</Pill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-3 py-2 text-[11px] text-[var(--ds-text-3)] border-t border-[var(--border-subtle)]">* Auto-submitted at timer expiry.</p>
                </DSCard>
              )}
            </>
          )}
        </main>
      </div>
    </Layout>
  );
}
