/**
 * QuizResultReveal — shown between questions.
 * Displays: answer reveal banner, personal score pop with breakdown,
 * Recharts answer distribution, mini leaderboard (top 5 + player rank).
 * For POLL/RATING questions: shows PollResultsView — NO correct/wrong feedback.
 *
 * Animation timeline:
 *  0ms — answer reveal banner
 *  300ms — score pop + breakdown pills
 *  600ms — answer distribution chart
 *  900ms — mini leaderboard
 */

import { memo, useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuizStore } from '@/lib/quizStore';
import { formatRatingDisplay } from '@/lib/ratingDisplay';
import { PollResultsView } from './PollResultsView';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Trophy, Star, Flame } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer,
  LabelList,
} from 'recharts';

/* ─── Animated counter hook ─── */
function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      const resetTimer = window.setTimeout(() => setValue(0), 0);
      return () => window.clearTimeout(resetTimer);
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

/* ─── Scoring breakdown pills ─── */
function BreakdownPills({ points, timeMs, timeLimitSeconds, streak }: {
  points: number;
  timeMs: number;
  timeLimitSeconds: number;
  streak: number;
}) {
  const timeLimitMs = timeLimitSeconds * 1000;
  const timeRatio = Math.max(0, (timeLimitMs - timeMs) / timeLimitMs);
  const timeBonus = Math.floor(timeRatio * 50);
  const streakBonus = Math.min(Math.max(streak - 1, 0) * 10, 50);
  const base = points - timeBonus - streakBonus;

  const pills = [
    { label: 'Base', value: base, color: 'bg-emerald-100 text-emerald-700' },
    { label: 'Speed', value: timeBonus, color: 'bg-blue-100 text-blue-700' },
  ];
  if (streakBonus > 0) {
    pills.push({ label: 'Streak', value: streakBonus, color: 'bg-amber-100 text-amber-700' });
  }

  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {pills.map((pill, i) => (
        <motion.span
          key={pill.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 + i * 0.12, duration: 0.3 }}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums',
            pill.color,
          )}
        >
          {pill.label} +{pill.value}
        </motion.span>
      ))}
    </div>
  );
}

function parseAnswerList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function formatAnswerDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const parsed = parseAnswerList(raw);
  return parsed.length > 0 ? parsed.join(', ') : raw;
}

/* ─── Recharts distribution chart ─── */
function DistributionChart({ distribution, correctAnswer, options, questionType }: {
  distribution: Record<string, number>;
  correctAnswer: string | null;
  options: string[] | null;
  questionType: string;
}) {
  const isPoll = questionType === 'POLL' || questionType === 'RATING' || questionType === 'OPEN_ENDED';
  const data = useMemo(() => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const correctAnswers = questionType === 'MULTI_SELECT' ? parseAnswerList(correctAnswer) : [];
    const entries = options
      ? options.map((opt, i) => ({
          name: options.length <= 4 ? `${letters[i]}) ${opt}` : opt,
          count: distribution[opt] || 0,
          isCorrect: questionType === 'MULTI_SELECT'
            ? correctAnswers.includes(opt)
            : !isPoll && opt === correctAnswer,
        }))
      : Object.entries(distribution).map(([label, count]) => ({
          name: label,
          count,
          isCorrect: questionType === 'MULTI_SELECT'
            ? correctAnswers.includes(label)
            : !isPoll && label === correctAnswer,
        }));
    return entries;
  }, [correctAnswer, distribution, isPoll, options, questionType]);

  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;

  return (
    <div className="w-full">
      <span className="sr-only" aria-live="polite">
        Final score reveal updated.
      </span>
      <h4 className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest mb-3">
        Answer Distribution
      </h4>
      <div style={{ width: '100%', height: Math.max(data.length * 44, 120) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 50, bottom: 0, left: 0 }} barSize={24}>
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={100}
              tick={{ fontSize: 12, fill: '#92400e' }}
              axisLine={false}
              tickLine={false}
            />
            <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={800} animationEasing="ease-out">
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.isCorrect ? '#10b981' : isPoll ? '#f59e0b' : '#d1d5db'}
                />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                formatter={(v: unknown) => {
                  const num = Number(v) || 0;
                  return `${num} (${Math.round((num / total) * 100)}%)`;
                }}
                style={{ fontSize: 11, fill: '#78716c', fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-amber-700/40 text-center mt-1 font-medium">{total} answered</p>
    </div>
  );
}

/* ─── Mini leaderboard with player rank ─── */
function MiniLeaderboard({ leaderboard, userId, myRank }: {
  leaderboard: { userId: string; displayName: string; rank: number; score: number }[];
  userId: string;
  myRank: number;
}) {
  const top3 = leaderboard.slice(0, 3);
  const imInTop3 = top3.some(e => e.userId === userId);
  const myEntry = leaderboard.find(e => e.userId === userId);
  const borderColors: Record<number, string> = {
    1: 'border-l-amber-400',
    2: 'border-l-gray-400',
    3: 'border-l-orange-400',
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5" /> Leaderboard
      </h4>
        <Card className="border-amber-200/60 overflow-hidden">
          <CardContent className="p-0 divide-y divide-amber-50">
          {top3.map((entry, i) => {
            const isMe = entry.userId === userId;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.95 + i * 0.05, duration: 0.25 }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 border-l-4',
                  borderColors[entry.rank] || 'border-l-transparent',
                  isMe && 'bg-amber-50/80',
                )}
              >
                <span className="w-6 text-center text-sm font-bold text-amber-700 tabular-nums">
                  {entry.rank}
                </span>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>
                <span className={cn(
                  'text-sm font-medium truncate flex-1',
                  isMe ? 'text-amber-900 font-bold' : 'text-amber-800',
                )} style={{ maxWidth: 150 }}>
                  {entry.displayName}{isMe ? ' (You)' : ''}
                </span>
                <span className="text-sm font-bold text-amber-700 tabular-nums ml-auto">
                  {entry.score}
                </span>
              </motion.div>
            );
          })}
          {/* Always show player's own rank card unless already in top 3 */}
          {!imInTop3 && myEntry && (
            <>
              <div className="text-center text-xs text-amber-400 py-1">• • •</div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2, duration: 0.25 }}
                className="flex items-center gap-3 px-3 py-2.5 border-l-4 border-l-amber-200 bg-amber-50/60"
              >
                <span className="w-6 text-center text-sm font-bold text-amber-600 tabular-nums">
                  {myRank || myEntry.rank}
                </span>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {myEntry.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-bold text-amber-900 truncate flex-1" style={{ maxWidth: 150 }}>
                  {myEntry.displayName} (You)
                </span>
                <span className="text-sm font-bold text-amber-700 tabular-nums ml-auto">
                  {myEntry.score}
                </span>
              </motion.div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Component ─── */
interface QuizResultRevealProps {
  userId: string;
}

export const QuizResultReveal = memo(function QuizResultReveal({ userId }: QuizResultRevealProps) {
  const lastAnswerResult = useQuizStore((s) => s.lastAnswerResult);
  const questionReveal = useQuizStore((s) => s.questionReveal);
  const leaderboard = useQuizStore((s) => s.leaderboard);
  const currentQuestion = useQuizStore((s) => s.currentQuestion);
  const myAnswer = useQuizStore((s) => s.myAnswer);
  const myRank = useQuizStore((s) => s.myRank);

  const isPollOrRating = currentQuestion?.questionType === 'POLL' || currentQuestion?.questionType === 'RATING';
  const isRating = currentQuestion?.questionType === 'RATING';
  const isOpenEnded = currentQuestion?.questionType === 'OPEN_ENDED';
  const isUnscoredType = isPollOrRating || isOpenEnded;

  // Animated count-up for points
  const animatedPoints = useCountUp(lastAnswerResult?.pointsAwarded ?? 0);

  // Compute average rating from distribution for RATING questions
  const avgRating = useMemo(() => {
    if (!isRating || !questionReveal?.answerDistribution) return null;
    const dist = questionReveal.answerDistribution;
    const totalVotes = Object.values(dist).reduce((s, v) => s + v, 0);
    if (totalVotes === 0) return null;
    const totalScore = Object.entries(dist).reduce(
      (s, [key, count]) => s + (parseFloat(key) || 0) * count, 0,
    );
    return Math.round((totalScore / totalVotes) * 10) / 10;
  }, [isRating, questionReveal?.answerDistribution]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto space-y-5"
    >
      {/* ═══════════ Answer Reveal Banner ═══════════ */}
      {isOpenEnded ? (
        <Card className="border-emerald-200/60 shadow-lg overflow-hidden">
          <CardContent className="p-6 sm:p-8 text-center bg-gradient-to-br from-emerald-50 to-teal-50">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 250, damping: 18 }}
              className="mb-3"
            >
              <CheckCircle className="h-12 w-12 mx-auto text-emerald-500" />
            </motion.div>
            <h3 className="text-2xl font-bold mb-2 text-emerald-800 font-display">Response Submitted</h3>
            <p className="text-sm text-emerald-700/80">Your feedback was recorded for the host.</p>
            {myAnswer && (
              <p className="mt-3 text-sm text-emerald-700/80">
                Your response: <span className="font-semibold text-emerald-800">{myAnswer}</span>
              </p>
            )}
          </CardContent>
        </Card>
      ) : isPollOrRating ? (
        <Card className="border-purple-200/60 shadow-lg overflow-hidden">
          <CardContent className="p-6 sm:p-8 text-center bg-gradient-to-br from-purple-50 to-indigo-50">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 250, damping: 18 }}
              className="mb-3"
            >
              <CheckCircle className="h-12 w-12 mx-auto text-purple-500" />
            </motion.div>
            <h3 className="text-2xl font-bold mb-2 text-purple-800 font-display">
              {currentQuestion?.questionType === 'POLL' ? 'Poll Results' : 'Rating Results'}
            </h3>
            {isRating && avgRating !== null && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-3"
              >
                <p className="text-4xl font-black text-purple-700 tabular-nums font-display">{avgRating}</p>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        'h-5 w-5',
                        s <= Math.round(avgRating) ? 'text-amber-400 fill-amber-400' : 'text-purple-200',
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-purple-600/60 font-medium mt-1">
                  average from {Object.values(questionReveal?.answerDistribution ?? {}).reduce((s, v) => s + v, 0)} ratings
                </p>
              </motion.div>
            )}
            {myAnswer && (
              <p className="text-sm text-purple-600/80">
                Your response:{' '}
                <span className="font-semibold text-purple-700">
                  {isRating ? formatRatingDisplay(myAnswer) : myAnswer}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      ) : lastAnswerResult ? (
        <Card className={cn(
          'shadow-lg overflow-hidden',
          lastAnswerResult.isCorrect ? 'border-emerald-300' : 'border-red-300',
        )}>
          <CardContent className={cn(
            'p-6 sm:p-8',
            lastAnswerResult.isCorrect
              ? 'bg-gradient-to-br from-emerald-50 to-green-100'
              : 'bg-gradient-to-br from-red-50 to-rose-100',
          )}>
            {/* Icon + status */}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="flex justify-center mb-3"
            >
              {lastAnswerResult.isCorrect ? (
                <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                  <CheckCircle className="h-9 w-9 text-white" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-200">
                  <XCircle className="h-9 w-9 text-white" />
                </div>
              )}
            </motion.div>

            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={cn(
                'text-xl font-bold text-center mb-1 font-display',
                lastAnswerResult.isCorrect ? 'text-emerald-800' : 'text-red-800',
              )}
            >
              {lastAnswerResult.isCorrect ? 'Correct!' : 'Not quite...'}
            </motion.h3>

            {/* Correct answer text (always shown) */}
            {questionReveal?.correctAnswer && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center mb-3"
              >
                {!lastAnswerResult.isCorrect && myAnswer && (
                  <p className="text-sm text-red-500 line-through mb-0.5">{formatAnswerDisplay(myAnswer)}</p>
                )}
                <p className={cn(
                  'text-lg font-bold',
                  lastAnswerResult.isCorrect ? 'text-emerald-700' : 'text-emerald-600',
                )}>
                  {formatAnswerDisplay(questionReveal.correctAnswer)}
                </p>
              </motion.div>
            )}

            {/* Points count-up */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
              className="text-center"
            >
              <p className={cn(
                'text-5xl sm:text-6xl font-black tabular-nums font-display',
                lastAnswerResult.isCorrect ? 'text-emerald-600' : 'text-red-400',
              )}>
                +{animatedPoints}
              </p>
              <p className={cn(
                'text-sm font-medium',
                lastAnswerResult.isCorrect ? 'text-emerald-600/60' : 'text-red-400/60',
              )}>
                points
              </p>
            </motion.div>

            {/* Breakdown pills: base + speed + streak */}
            {lastAnswerResult.isCorrect && currentQuestion && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="mt-3"
              >
                <BreakdownPills
                  points={lastAnswerResult.pointsAwarded}
                  timeMs={lastAnswerResult.timeMs}
                  timeLimitSeconds={currentQuestion.timeLimitSeconds ?? 20}
                  streak={lastAnswerResult.newStreak}
                />
              </motion.div>
            )}

            {/* Streak indicator */}
            {lastAnswerResult.newStreak >= 3 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 250 }}
                className="flex items-center justify-center gap-1.5 mt-3"
              >
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-400 to-red-500 text-white text-sm font-bold shadow-md">
                  <Flame className="h-4 w-4" />
                  {lastAnswerResult.newStreak} streak!
                </span>
              </motion.div>
            )}

            {/* Time */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-center text-xs text-amber-700/40 font-medium mt-2"
            >
              answered in {(lastAnswerResult.timeMs / 1000).toFixed(1)}s
            </motion.p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200/60 shadow-md">
          <CardContent className="p-6 text-center">
            <p className="text-amber-700/70 text-lg font-medium">Time ran out — no answer submitted</p>
            {!isUnscoredType && questionReveal?.correctAnswer && (
              <p className="mt-2 text-sm text-emerald-600 font-semibold">
                Correct answer: {formatAnswerDisplay(questionReveal.correctAnswer)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ Answer Distribution ═══════════ */}
      {!isOpenEnded && questionReveal?.answerDistribution && Object.keys(questionReveal.answerDistribution).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          {isPollOrRating ? (
            <PollResultsView
              distribution={questionReveal.answerDistribution}
              options={currentQuestion?.options ?? null}
              questionText={currentQuestion?.questionText ?? 'Poll'}
              totalVotes={Object.values(questionReveal.answerDistribution).reduce((sum, v) => sum + v, 0)}
              questionType={currentQuestion?.questionType ?? 'POLL'}
            />
          ) : !isOpenEnded ? (
            <DistributionChart
              distribution={questionReveal.answerDistribution}
              correctAnswer={questionReveal.correctAnswer ?? null}
              options={currentQuestion?.options ?? null}
              questionType={currentQuestion?.questionType ?? 'MCQ'}
            />
          ) : null}
        </motion.div>
      )}

      {/* ═══════════ Mini Leaderboard ═══════════ */}
      {leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <MiniLeaderboard
            leaderboard={leaderboard}
            userId={userId}
            myRank={myRank ?? 0}
          />
        </motion.div>
      )}
    </motion.div>
  );
});
