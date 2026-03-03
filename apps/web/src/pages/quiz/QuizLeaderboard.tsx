/**
 * QuizLeaderboard — ranked list of quiz participants.
 * Used both mid-quiz (compact top-5) and final (full list with podium + confetti).
 */

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy, Zap } from 'lucide-react';
import type { LeaderboardEntry } from '@/lib/quizStore';

/* ---- CSS-only confetti keyframes (injected once via style tag) ---- */
const confettiCSS = `
@keyframes quiz-confetti-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(180px) rotate(720deg); opacity: 0; }
}
@keyframes quiz-confetti-fall2 {
  0% { transform: translateY(-10px) rotate(45deg); opacity: 1; }
  100% { transform: translateY(160px) rotate(-540deg); opacity: 0; }
}
`;

const MEDAL_COLORS = {
  1: '#FFD700', // Gold
  2: '#C0C0C0', // Silver
  3: '#CD7F32', // Bronze
} as const;

interface QuizLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  myUserId: string | null;
  compact?: boolean; // true = show top 5 only
  totalQuestions?: number;
}

export const QuizLeaderboard = memo(function QuizLeaderboard({
  leaderboard,
  myUserId,
  compact = false,
  totalQuestions,
}: QuizLeaderboardProps) {
  const entries = compact ? leaderboard.slice(0, 5) : leaderboard;

  // Find tied players (same score, ordered by time)
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

  return (
    <div className="w-full">
      {/* Confetti style injection */}
      {meInTop3 && !compact && (
        <style dangerouslySetInnerHTML={{ __html: confettiCSS }} />
      )}

      {/* Podium — only on full leaderboard view */}
      {showPodium && (
        <div className="mb-6 relative">
          {/* CSS confetti particles (if user in top 3) */}
          {meInTop3 && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-10" aria-hidden>
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute block rounded-sm"
                  style={{
                    width: `${6 + (i % 4) * 2}px`,
                    height: `${6 + (i % 3) * 2}px`,
                    left: `${5 + (i * 5.3) % 90}%`,
                    top: '-8px',
                    background: ['#FFD700', '#C0C0C0', '#CD7F32', '#f59e0b', '#fb923c', '#a855f7'][i % 6],
                    animation: `${i % 2 === 0 ? 'quiz-confetti-fall' : 'quiz-confetti-fall2'} ${1.5 + (i % 5) * 0.3}s ease-in ${(i % 7) * 0.15}s forwards`,
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>
          )}

          {/* Podium layout: 2nd — 1st — 3rd */}
          <div className="flex items-end justify-center gap-3 sm:gap-4">
            {[1, 0, 2].map((podiumIdx) => {
              const entry = leaderboard[podiumIdx];
              if (!entry) return null;
              const rank = entry.rank;
              const isMe = entry.userId === myUserId;
              const height = rank === 1 ? 'h-28 sm:h-32' : rank === 2 ? 'h-20 sm:h-24' : 'h-16 sm:h-20';
              const medalColor = MEDAL_COLORS[rank as 1 | 2 | 3];

              return (
                <motion.div
                  key={entry.userId}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + podiumIdx * 0.15, type: 'spring', stiffness: 200, damping: 18 }}
                  className="flex flex-col items-center flex-1 max-w-[140px]"
                >
                  {/* Medal + Name */}
                  <div className={cn(
                    'text-center mb-2',
                    rank === 1 && 'scale-105',
                  )}>
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mx-auto mb-1 font-black text-white text-sm sm:text-base shadow-md"
                      style={{ background: medalColor }}
                    >
                      {rank}
                    </div>
                    <p className={cn(
                      'text-xs sm:text-sm font-semibold truncate max-w-[120px]',
                      isMe ? 'text-amber-700' : 'text-amber-900',
                    )}>
                      {entry.displayName}
                      {isMe && <span className="text-amber-500 ml-1">(you)</span>}
                    </p>
                    <p className="text-xs font-bold text-amber-600 tabular-nums">{entry.score} pts</p>
                  </div>

                  {/* Podium bar */}
                  <div
                    className={cn(
                      'w-full rounded-t-xl',
                      height,
                    )}
                    style={{
                      background: `linear-gradient(to top, ${medalColor}33, ${medalColor}88)`,
                      borderTop: `3px solid ${medalColor}`,
                    }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table header */}
      <Card className="border-amber-200/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {!compact && (
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <Trophy className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-amber-900 tracking-tight">
                {compact ? 'Top 5' : 'Full Rankings'}
              </h3>
            </div>
          )}

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-4 py-1.5 text-[10px] sm:text-xs font-semibold text-amber-700/50 uppercase tracking-wider border-b border-amber-100">
            <span className="col-span-1">#</span>
            <span className="col-span-5">Name</span>
            <span className="col-span-2 text-right">Score ↓</span>
            <span className="col-span-2 text-right">Correct</span>
            <span className="col-span-2 text-right">Avg</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-amber-50">
            {entries.map((entry, idx) => {
              const isMe = entry.userId === myUserId;
              const avgSpeed = entry.correctCount > 0
                ? `${(entry.totalAnswerTimeMs / entry.correctCount / 1000).toFixed(1)}s`
                : '-';

              return (
                <motion.div
                  key={entry.userId}
                  initial={compact ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: compact ? 0 : 0.05 * idx }}
                  className={cn(
                    'grid grid-cols-12 gap-2 px-4 py-2.5 text-sm transition-colors',
                    isMe
                      ? 'bg-amber-50 font-semibold'
                      : 'hover:bg-amber-50/40',
                  )}
                >
                  <span className="col-span-1 flex items-center font-bold text-amber-800 text-xs">
                    {entry.rank <= 3
                      ? <span style={{ color: MEDAL_COLORS[entry.rank as 1 | 2 | 3] }} className="text-base">
                          {['🥇', '🥈', '🥉'][entry.rank - 1]}
                        </span>
                      : entry.rank
                    }
                  </span>
                  <span className="col-span-5 flex items-center gap-1 truncate text-amber-900">
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

      {/* Show user's rank if they're not in the compact view */}
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
