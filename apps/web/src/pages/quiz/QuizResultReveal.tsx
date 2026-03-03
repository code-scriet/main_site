/**
 * QuizResultReveal — shown between questions.
 * Displays: correct answer, user result, points animation, distribution chart, top-5 leaderboard.
 * For POLL questions: shows PollResultsView with charts and export options, NO correct/wrong feedback.
 */

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuizStore } from '@/lib/quizStore';
import { QuizLeaderboard } from './QuizLeaderboard';
import { QuizAnswerDistribution } from './QuizAnswerDistribution';
import { PollResultsView } from './PollResultsView';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Zap, Trophy, Star } from 'lucide-react';

/* Pop-in keyframe for the points number: scale 0.5→1.2→1.0, opacity 0→1 */
const pointsPopVariants = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: [0.5, 1.25, 1],
    opacity: 1,
    transition: { duration: 0.4, times: [0, 0.6, 1], ease: 'easeOut' as const },
  },
};

interface QuizResultRevealProps {
  userId: string;
}

export const QuizResultReveal = memo(function QuizResultReveal({ userId }: QuizResultRevealProps) {
  const lastAnswerResult = useQuizStore((s) => s.lastAnswerResult);
  const questionReveal = useQuizStore((s) => s.questionReveal);
  const leaderboard = useQuizStore((s) => s.leaderboard);
  const currentQuestion = useQuizStore((s) => s.currentQuestion);
  const myAnswer = useQuizStore((s) => s.myAnswer);

  const isPollOrRating = currentQuestion?.questionType === 'POLL' || currentQuestion?.questionType === 'RATING';
  const isRating = currentQuestion?.questionType === 'RATING';

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

  const myLeaderboardEntry = useMemo(
    () => leaderboard.find((e) => e.userId === userId),
    [leaderboard, userId],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto space-y-5"
    >
      {/* Result header — different for polls vs scored questions */}
      {isPollOrRating ? (
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
            {/* Average rating display for RATING questions */}
            {isRating && avgRating !== null && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-3"
              >
                <p className="text-4xl font-black text-purple-700 tabular-nums font-display">
                  {avgRating}
                </p>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={cn(
                        'h-5 w-5',
                        s <= Math.round(avgRating)
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-purple-200',
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
                Your response: <span className="font-semibold text-purple-700">{myAnswer}</span>
              </p>
            )}
          </CardContent>
        </Card>
      ) : lastAnswerResult ? (
        <Card className={cn(
          'shadow-lg overflow-hidden',
          lastAnswerResult.isCorrect
            ? 'border-green-200/60'
            : 'border-red-200/60',
        )}>
          <CardContent className={cn(
            'p-6 sm:p-8 text-center',
            lastAnswerResult.isCorrect
              ? 'bg-gradient-to-br from-green-50 to-emerald-50'
              : 'bg-gradient-to-br from-red-50 to-orange-50',
          )}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 250, damping: 18 }}
              className="mb-2"
            >
              {lastAnswerResult.isCorrect ? (
                <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
              ) : (
                <XCircle className="h-12 w-12 mx-auto text-red-500" />
              )}
            </motion.div>

            <h3 className={cn(
              'text-xl font-bold mb-3 font-display',
              lastAnswerResult.isCorrect ? 'text-green-800' : 'text-red-800',
            )}>
              {lastAnswerResult.isCorrect ? 'Correct!' : 'Not quite...'}
            </h3>

            {/* Points pop animation — the hero moment */}
            <motion.div
              variants={pointsPopVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                'text-4xl sm:text-5xl font-black tabular-nums font-display',
                lastAnswerResult.isCorrect ? 'text-green-600' : 'text-red-500',
              )}
            >
              +{lastAnswerResult.pointsAwarded}
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className={cn(
                'text-sm font-medium mt-1',
                lastAnswerResult.isCorrect ? 'text-green-600/70' : 'text-red-500/70',
              )}
            >
              points
            </motion.p>

            {/* Streak + time row */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center justify-center gap-4 mt-4 text-sm"
            >
              {lastAnswerResult.newStreak > 1 && (
                <span className="flex items-center text-amber-600 font-bold">
                  <Zap className="h-4 w-4 mr-0.5" />
                  {lastAnswerResult.newStreak} streak!
                </span>
              )}
              <span className="text-amber-700/50 font-medium">
                {(lastAnswerResult.timeMs / 1000).toFixed(1)}s
              </span>
            </motion.div>

            {/* Show what the user answered if wrong */}
            {myAnswer && !lastAnswerResult.isCorrect && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-3 text-sm text-red-600/70"
              >
                You answered: <span className="font-semibold text-red-700">{myAnswer}</span>
              </motion.p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200/60 shadow-md">
          <CardContent className="p-6 text-center">
            <p className="text-amber-700/70 text-lg font-medium">Time ran out — no answer submitted</p>
          </CardContent>
        </Card>
      )}

      {/* Correct answer — only for scored questions */}
      {!isPollOrRating && questionReveal?.correctAnswer && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border-green-200/60">
            <CardContent className="p-4 text-center bg-green-50/50">
              <p className="text-xs font-semibold text-green-600/70 uppercase tracking-wide mb-1">Correct Answer</p>
              <p className="text-xl font-bold text-green-800">{questionReveal.correctAnswer}</p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Rank */}
      {myLeaderboardEntry && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
          className="flex items-center justify-center gap-2.5"
        >
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="font-semibold text-amber-800">
            Current Rank: <span className="text-amber-600">#{myLeaderboardEntry.rank}</span>
          </span>
        </motion.div>
      )}

      {/* Answer distribution — use PollResultsView for polls, QuizAnswerDistribution for scored */}
      {questionReveal?.answerDistribution && Object.keys(questionReveal.answerDistribution).length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {isPollOrRating ? (
            <PollResultsView
              distribution={questionReveal.answerDistribution}
              options={currentQuestion?.options ?? null}
              questionText={currentQuestion?.questionText ?? 'Poll'}
              totalVotes={Object.values(questionReveal.answerDistribution).reduce((sum, v) => sum + v, 0)}
            />
          ) : (
            <QuizAnswerDistribution
              distribution={questionReveal.answerDistribution}
              correctAnswer={questionReveal.correctAnswer ?? null}
              options={currentQuestion?.options ?? null}
              questionType={currentQuestion?.questionType ?? 'MCQ'}
            />
          )}
        </motion.div>
      )}

      {/* Leaderboard (compact top 5) */}
      {leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <h4 className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest mb-2">
            Leaderboard
          </h4>
          <QuizLeaderboard leaderboard={leaderboard.slice(0, 5)} myUserId={userId} compact />
        </motion.div>
      )}
    </motion.div>
  );
});
