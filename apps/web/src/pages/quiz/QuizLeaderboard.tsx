/**
 * QuizLeaderboard — ranked list of quiz participants.
 * Used both mid-quiz (compact top-5) and final (full list with podium + confetti).
 *
 * Final leaderboard features:
 * - Physical podium: rank 3 first (500ms), rank 2 (800ms), rank 1 (1100ms)
 * - Crown 👑 for rank 1, CSS confetti burst
 * - Enhanced table with accuracy bars, alternating rows
 */

import { memo, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Zap } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/quizStore';

/* ── CSS confetti ── */
const confettiCSS = `
@keyframes quiz-confetti-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
}
@keyframes quiz-confetti-fall2 {
  0% { transform: translateY(-10px) rotate(45deg); opacity: 1; }
  100% { transform: translateY(180px) rotate(-540deg); opacity: 0; }
}
`;

const MEDAL_COLORS = {
  1: '#FFD700',
  2: '#C0C0C0',
  3: '#CD7F32',
} as const;

const CONFETTI_COLORS = ['#FFD700', '#f59e0b', '#fb923c', '#a855f7', '#3b82f6', '#ef4444'];

interface QuizLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  myUserId: string | null;
  compact?: boolean;
  totalQuestions?: number;
}

export const QuizLeaderboard = memo(function QuizLeaderboard({
  leaderboard,
  myUserId,
  compact = false,
  totalQuestions,
}: QuizLeaderboardProps) {
  const shouldReduceMotion = useReducedMotion();
  const entries = compact ? leaderboard.slice(0, 5) : leaderboard;

  const tieGroups = new Map<number, string[]>();
  leaderboard.forEach((e) => {
    if (!tieGroups.has(e.score)) tieGroups.set(e.score, []);
    tieGroups.get(e.score)!.push(e.userId);
  });

  const isFastestInTie = (entry: LeaderboardEntry) => {
    const group = tieGroups.get(entry.score);
    return group && group.length > 1 && group[0] === entry.userId;
  };

  const meInTop3 = useMemo(
    () => myUserId && leaderboard.slice(0, 3).some((e) => e.userId === myUserId),
    [leaderboard, myUserId],
  );

  const showPodium = !compact && leaderboard.length >= 3;
  const showConfetti = Boolean(meInTop3 && !compact && !shouldReduceMotion);

  // Podium animation delays: rank3 first (builds anticipation), then rank2, then rank1
  const podiumDelays = { 3: 0.5, 2: 0.8, 1: 1.1 };

  return (
    <div className="w-full">
      {/* Confetti style injection */}
      {showConfetti && (
        <style dangerouslySetInnerHTML={{ __html: confettiCSS }} />
      )}

      {/* ═══════════ Podium ═══════════ */}
      {showPodium && (
        <div className="mb-8 relative">
          {/* Confetti particles */}
          {showConfetti && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-10" aria-hidden="true">
              {Array.from({ length: 20 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute block rounded-sm"
                  style={{
                    width: `${6 + (i % 4) * 2}px`,
                    height: `${6 + (i % 3) * 2}px`,
                    left: `${3 + (i * 4.8) % 94}%`,
                    top: '-12px',
                    background: CONFETTI_COLORS[i % 6],
                    animation: `${i % 2 === 0 ? 'quiz-confetti-fall' : 'quiz-confetti-fall2'} ${2 + (i % 5) * 0.4}s ease-in ${(i % 7) * 0.15}s forwards`,
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
          )}

          {/* Podium layout: 2nd — 1st — 3rd */}
          <div className="flex items-end justify-center gap-2 sm:gap-4">
            {[1, 0, 2].map((podiumIdx) => {
              const entry = leaderboard[podiumIdx];
              if (!entry) return null;
              const rank = entry.rank;
              const isMe = entry.userId === myUserId;
              const medalColor = MEDAL_COLORS[rank as 1 | 2 | 3];
              const delay = podiumDelays[rank as 1 | 2 | 3] ?? 0.5;

              return (
                <motion.div
                  key={entry.userId}
                  initial={{ opacity: 0, y: 60 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={shouldReduceMotion ? { duration: 0.2 } : { delay, type: 'spring', stiffness: 180, damping: 16 }}
                  className="flex flex-col items-center flex-1 max-w-[100px] sm:max-w-[150px]"
                  aria-label={`Rank ${rank}: ${entry.displayName} with ${entry.score} points`}
                >
                  {/* Crown for rank 1 */}
                  {rank === 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, rotate: -15 }}
                      animate={{ opacity: 1, y: 0, rotate: 0 }}
                      transition={{ delay: delay + 0.2, type: 'spring', stiffness: 200 }}
                      className="mb-0.5"
                    >
                      <span className="text-2xl">👑</span>
                    </motion.div>
                  )}

                  {/* Avatar circle */}
                  <div
                    className={cn(
                      'rounded-full flex items-center justify-center font-black text-white shadow-lg mb-2',
                      rank === 1 ? 'w-14 h-14 sm:w-16 sm:h-16 text-lg sm:text-xl' : 'w-11 h-11 sm:w-13 sm:h-13 text-sm sm:text-base',
                    )}
                    style={{
                      background: `linear-gradient(135deg, ${medalColor}, ${medalColor}cc)`,
                      boxShadow: `0 4px 16px ${medalColor}40`,
                    }}
                  >
                    {entry.displayName.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + score */}
                  <p className={cn(
                    'text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-[130px] text-center',
                    isMe ? 'text-amber-600' : 'text-amber-900',
                  )}>
                    {entry.displayName}
                    {isMe && <span className="text-amber-400 ml-1">(you)</span>}
                  </p>
                  <p className="text-sm font-bold text-amber-700 tabular-nums">{entry.score} pts</p>

                  {/* Podium block */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: rank === 1 ? 128 : rank === 2 ? 96 : 72 }}
                    transition={{ delay: delay - 0.1, duration: 0.5, ease: 'easeOut' }}
                    className="w-full rounded-t-xl mt-1"
                    style={{
                      background: `linear-gradient(to top, ${medalColor}20, ${medalColor}66)`,
                      borderTop: `3px solid ${medalColor}`,
                    }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ Table ═══════════ */}
      <Card className="border-amber-200/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {!compact && (
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Trophy className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-900 tracking-tight">
                Full Rankings
              </h3>
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 border-b border-amber-100 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700/50 sm:text-xs" role="row">
            <span className="col-span-1">#</span>
            <span className="col-span-3">Name</span>
            <span className="col-span-2 text-right">Score ↓</span>
            <span className="col-span-2 text-right">Correct</span>
            <span className="col-span-2 text-right">Accuracy</span>
            <span className="col-span-2 text-right">Avg</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-amber-50" role="table" aria-label={compact ? 'Top quiz leaderboard' : 'Full quiz leaderboard'}>
            {entries.map((entry, idx) => {
              const isMe = entry.userId === myUserId;
              const avgSpeed = entry.correctCount > 0
                ? `${(entry.totalAnswerTimeMs / entry.correctCount / 1000).toFixed(1)}s`
                : '-';
              const accuracy = totalQuestions && totalQuestions > 0
                ? Math.round((entry.correctCount / totalQuestions) * 100)
                : null;

              return (
                <motion.div
                  key={entry.userId}
                  initial={compact ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={shouldReduceMotion ? { duration: 0.2 } : { delay: compact ? 0 : 0.05 * idx }}
                  className={cn(
                    'grid grid-cols-12 gap-2 px-4 py-2.5 text-sm transition-colors',
                    isMe
                      ? 'bg-amber-50 font-semibold'
                      : idx % 2 === 1 ? 'bg-amber-50/20' : '',
                    !isMe && 'hover:bg-amber-50/40',
                  )}
                  role="row"
                >
                  <span className="col-span-1 flex items-center font-bold text-amber-800 text-xs">
                    {entry.rank <= 3
                      ? <span style={{ color: MEDAL_COLORS[entry.rank as 1 | 2 | 3] }} className="text-base">
                          {['🥇', '🥈', '🥉'][entry.rank - 1]}
                        </span>
                      : entry.rank
                    }
                  </span>
                  <span className="col-span-3 flex items-center gap-1 truncate text-amber-900">
                    {entry.displayName}
                    {isFastestInTie(entry) && (
                      <Zap className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    )}
                    {isMe && <span className="text-[10px] text-amber-500 font-medium">(you)</span>}
                  </span>
                  <span className="col-span-2 text-right tabular-nums font-semibold text-amber-800">
                    {entry.score}
                  </span>
                  <span className="col-span-2 text-right tabular-nums text-amber-700/60">
                    {entry.correctCount}{totalQuestions ? `/${totalQuestions}` : ''}
                  </span>
                  <span className="col-span-2 text-right">
                    {accuracy !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs tabular-nums text-amber-700/60">{accuracy}%</span>
                        <span
                          className="inline-block h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(accuracy * 0.3, 4)}px`,
                            background: accuracy >= 75 ? '#10b981' : accuracy >= 40 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </span>
                    ) : (
                      <span className="text-amber-700/40">-</span>
                    )}
                  </span>
                  <span className="col-span-2 text-right tabular-nums text-amber-700/50 text-xs">
                    {avgSpeed}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {compact && leaderboard.length > 5 && (
        <p className="text-[10px] text-amber-700/40 text-center mt-2 tracking-wide">
          +{leaderboard.length - 5} more players
        </p>
      )}

      {/* User's rank if not in compact view */}
      {compact && myUserId && !entries.find((e) => e.userId === myUserId) && (
        <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 text-sm">
          {(() => {
            const myEntry = leaderboard.find((e) => e.userId === myUserId);
            if (!myEntry) return <span className="text-amber-700/50">You haven't scored yet</span>;
            return (
              <span className="font-semibold text-amber-800">
                Your rank: <span className="text-amber-600">#{myEntry.rank}</span> — {myEntry.score} pts
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
});
