/**
 * QuizQuestion — renders question + answer input based on questionType.
 * Zero reloads, fully socket-driven.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuizStore } from '@/lib/quizStore';
import { useQuizTimer } from '@/hooks/useQuizTimer';
import { QuizTimer } from './QuizTimer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, Send, Check } from 'lucide-react';

interface QuizQuestionProps {
  onSubmitAnswer: (answer: string, questionId: string) => void;
}

export function QuizQuestion({ onSubmitAnswer }: QuizQuestionProps) {
  const currentQuestion = useQuizStore((s) => s.currentQuestion);
  const questionStartTime = useQuizStore((s) => s.questionStartTime);
  const hasAnswered = useQuizStore((s) => s.hasAnswered);
  const myAnswer = useQuizStore((s) => s.myAnswer);
  const answeredCount = useQuizStore((s) => s.answeredCount);
  const players = useQuizStore((s) => s.players);
  const setMyAnswer = useQuizStore((s) => s.setMyAnswer);
  const pollResults = useQuizStore((s) => s.pollResults);

  const [shortAnswer, setShortAnswer] = useState('');
  const [multiSelectAnswers, setMultiSelectAnswers] = useState<string[]>([]);
  const [openEndedAnswer, setOpenEndedAnswer] = useState('');
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);

  const { progress, isUrgent, isExpired, secondsLeft } = useQuizTimer(
    questionStartTime,
    currentQuestion?.timeLimitSeconds ?? null,
  );

  // Reset local inputs when question changes
  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setShortAnswer('');
      setMultiSelectAnswers([]);
      setOpenEndedAnswer('');
      setRatingValue(0);
      setHoverRating(0);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [currentQuestion?.questionIndex]);

  const handleSelect = useCallback(
    (answer: string) => {
      if (hasAnswered || !currentQuestion) return;
      setMyAnswer(answer);
      onSubmitAnswer(answer, currentQuestion.questionId);
    },
    [hasAnswered, currentQuestion, setMyAnswer, onSubmitAnswer],
  );

  const handleShortAnswerSubmit = useCallback(() => {
    if (hasAnswered || !currentQuestion || !shortAnswer.trim()) return;
    const trimmed = shortAnswer.trim();
    setMyAnswer(trimmed);
    onSubmitAnswer(trimmed, currentQuestion.questionId);
  }, [hasAnswered, currentQuestion, shortAnswer, setMyAnswer, onSubmitAnswer]);

  const toggleMultiSelectOption = useCallback((option: string) => {
    if (hasAnswered || !currentQuestion || isExpired) return;
    setMultiSelectAnswers((previous) =>
      previous.includes(option)
        ? previous.filter((answer) => answer !== option)
        : [...previous, option],
    );
  }, [currentQuestion, hasAnswered, isExpired]);

  const handleMultiSelectSubmit = useCallback(() => {
    if (hasAnswered || !currentQuestion || multiSelectAnswers.length === 0) return;
    const payload = JSON.stringify(multiSelectAnswers);
    setMyAnswer(payload);
    onSubmitAnswer(payload, currentQuestion.questionId);
  }, [currentQuestion, hasAnswered, multiSelectAnswers, onSubmitAnswer, setMyAnswer]);

  const handleOpenEndedSubmit = useCallback(() => {
    if (hasAnswered || !currentQuestion || !openEndedAnswer.trim()) return;
    const trimmed = openEndedAnswer.trim();
    setMyAnswer(trimmed);
    onSubmitAnswer(trimmed, currentQuestion.questionId);
  }, [currentQuestion, hasAnswered, openEndedAnswer, onSubmitAnswer, setMyAnswer]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!currentQuestion || hasAnswered || isExpired) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (currentQuestion.questionType === 'MCQ' || currentQuestion.questionType === 'POLL') {
        const opts = currentQuestion.options;
        if (!opts) return;
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < opts.length) {
          handleSelect(opts[idx]);
        }
      }

      if (currentQuestion.questionType === 'MULTI_SELECT') {
        const opts = currentQuestion.options;
        if (!opts) return;
        const idx = parseInt(e.key) - 1;
        if (idx >= 0 && idx < opts.length) {
          const option = opts[idx];
          setMultiSelectAnswers((previous) =>
            previous.includes(option)
              ? previous.filter((answer) => answer !== option)
              : [...previous, option],
          );
        }
        if (e.key === 'Enter' && multiSelectAnswers.length > 0) {
          const payload = JSON.stringify(multiSelectAnswers);
          setMyAnswer(payload);
          onSubmitAnswer(payload, currentQuestion.questionId);
        }
      }

      if (currentQuestion.questionType === 'TRUE_FALSE') {
        if (e.key.toLowerCase() === 't') handleSelect('True');
        if (e.key.toLowerCase() === 'f') handleSelect('False');
      }

      if (currentQuestion.questionType === 'SHORT_ANSWER' && e.key === 'Enter') {
        const trimmed = shortAnswer.trim();
        if (trimmed) {
          setMyAnswer(trimmed);
          onSubmitAnswer(trimmed, currentQuestion.questionId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQuestion, hasAnswered, isExpired, multiSelectAnswers, onSubmitAnswer, setMyAnswer, shortAnswer, handleSelect]);

  if (!currentQuestion) return null;

  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const isPoll = currentQuestion.questionType === 'POLL';
  const isRating = currentQuestion.questionType === 'RATING';
  const isOpenEnded = currentQuestion.questionType === 'OPEN_ENDED';
  const isUnscoredType = isPoll || isRating || isOpenEnded;
  const submittedMultiSelectAnswers = currentQuestion.questionType === 'MULTI_SELECT' && myAnswer
    ? (() => {
        try {
          const parsed = JSON.parse(myAnswer);
          return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
        } catch {
          return [];
        }
      })()
    : [];

  return (
    <motion.div
      key={currentQuestion.questionIndex}
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="max-w-3xl mx-auto space-y-4"
    >
      {/* Question card — elevated surface */}
      <Card className="border-amber-200/60 shadow-lg bg-white/95 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-5 sm:p-8">
          {/* Question header row */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-xs sm:text-sm font-medium text-amber-700/70 tracking-wide uppercase">
              Question {currentQuestion.questionIndex + 1} of {currentQuestion.totalQuestions}
            </span>
            <div className="flex items-center gap-2">
              {!isUnscoredType && (
                <Badge variant="outline" className="border-amber-300 text-amber-800 bg-amber-50 font-semibold text-xs">
                  {currentQuestion.points} pts
                </Badge>
              )}
              {isPoll && (
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 font-semibold text-xs">
                  Poll
                </Badge>
              )}
              {isRating && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 font-semibold text-xs">
                  Rating
                </Badge>
              )}
              {isOpenEnded && (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold text-xs">
                  Open Ended
                </Badge>
              )}
            </div>
          </div>

          {/* Question text — centered, heading font, generous spacing */}
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-900 leading-relaxed text-center font-display">
            {currentQuestion.questionText}
          </h2>

          {currentQuestion.mediaUrl && (
            <img
              src={currentQuestion.mediaUrl}
              alt="Question media"
              className="mt-5 max-h-52 rounded-xl object-contain mx-auto"
            />
          )}
        </CardContent>
      </Card>

      {/* Timer bar */}
      <span role="status" aria-live="assertive" className="sr-only">
        {isUrgent && !isExpired ? `${secondsLeft} seconds remaining` : ''}
      </span>
      <QuizTimer progress={progress} secondsLeft={secondsLeft} isUrgent={isUrgent} isExpired={isExpired} />

      {/* Answer options */}
      <div className="space-y-3">
        {/* MCQ / Poll */}
        {(currentQuestion.questionType === 'MCQ' || currentQuestion.questionType === 'POLL') &&
          currentQuestion.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQuestion.options.map((opt, i) => {
                const isSelected = myAnswer === opt;
                const isCorrectOption = false;
                const isWrongOption = false;

                return (
                  <motion.button
                    key={opt}
                    whileHover={!hasAnswered && !isExpired ? { scale: 1.02, y: -1 } : {}}
                    whileTap={!hasAnswered && !isExpired ? { scale: 0.98 } : {}}
                    disabled={hasAnswered || isExpired}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border-2 text-left transition-all duration-300 ease-in-out',
                      'disabled:cursor-default',
                      // Default state
                      !isSelected && !hasAnswered && !isExpired &&
                        'border-amber-200 bg-white hover:border-amber-400 hover:shadow-md',
                      // Selected — poll
                      isSelected && isPoll && 'border-purple-500 bg-purple-50 shadow-md shadow-purple-100',
                      // Selected — MCQ
                      isSelected && !isPoll && 'border-amber-500 bg-amber-50 shadow-md shadow-amber-100',
                      // Correct answer revealed
                      isCorrectOption && 'border-green-500 bg-green-50 shadow-md shadow-green-100',
                      // Wrong answer revealed
                      isWrongOption && 'border-red-500 bg-red-50 shadow-md shadow-red-100',
                      // Unselected after answering
                      !isSelected && hasAnswered && 'opacity-50 border-amber-100',
                    )}
                  >
                    {/* Circular option letter badge */}
                    <span
                      className={cn(
                        'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300',
                        isCorrectOption
                          ? 'bg-green-500 text-white'
                          : isWrongOption
                            ? 'bg-red-500 text-white'
                            : isSelected && isPoll
                              ? 'bg-purple-500 text-white'
                              : isSelected
                                ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white'
                                : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {isCorrectOption ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : isWrongOption ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        letters[i]
                      )}
                    </span>
                    <span className={cn(
                      'font-medium transition-colors duration-300',
                      isCorrectOption ? 'text-green-800' :
                      isWrongOption ? 'text-red-800' :
                      isSelected ? 'text-amber-900' : 'text-amber-800',
                    )}>
                      {opt}
                    </span>

                    {isSelected && isPoll && <Check className="ml-auto h-5 w-5 text-purple-500" />}
                  </motion.button>
                );
              })}
            </div>
          )}

        {/* Multi-select */}
        {currentQuestion.questionType === 'MULTI_SELECT' && currentQuestion.options && (
          <Card className="border-amber-200/60">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((opt, i) => {
                  const isSelected = hasAnswered
                    ? submittedMultiSelectAnswers.includes(opt)
                    : multiSelectAnswers.includes(opt);

                  return (
                    <motion.button
                      key={opt}
                      whileHover={!hasAnswered && !isExpired ? { scale: 1.02, y: -1 } : {}}
                      whileTap={!hasAnswered && !isExpired ? { scale: 0.98 } : {}}
                      disabled={hasAnswered || isExpired}
                      onClick={() => toggleMultiSelectOption(opt)}
                      className={cn(
                        'w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border-2 text-left transition-all duration-300',
                        isSelected
                          ? 'border-amber-500 bg-amber-50 shadow-md shadow-amber-100'
                          : 'border-amber-200 bg-white hover:border-amber-400 hover:shadow-md',
                        hasAnswered && !isSelected && 'opacity-50 border-amber-100',
                      )}
                    >
                      <span
                        className={cn(
                          'flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all duration-300',
                          isSelected
                            ? 'border-amber-500 bg-gradient-to-br from-orange-500 to-amber-600 text-white'
                            : 'border-amber-300 bg-white text-amber-700',
                        )}
                      >
                        {isSelected ? <Check className="h-4 w-4" /> : letters[i]}
                      </span>
                      <span className={cn('font-medium transition-colors duration-300', isSelected ? 'text-amber-900' : 'text-amber-800')}>
                        {opt}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-amber-700/70">
                  Select every correct option. Choosing any wrong option scores zero.
                </p>
                <Button
                  onClick={handleMultiSelectSubmit}
                  disabled={hasAnswered || isExpired || multiSelectAnswers.length === 0}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rating (1-5 stars) */}
        {isRating && (
          <Card className="border-amber-200/60">
            <CardContent className="flex flex-col items-center gap-4 py-6 px-4">
              <div className="flex gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    whileHover={!hasAnswered && !isExpired ? { scale: 1.15, y: -2 } : {}}
                    whileTap={!hasAnswered && !isExpired ? { scale: 0.9 } : {}}
                    disabled={hasAnswered || isExpired}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => {
                      setRatingValue(star);
                      handleSelect(String(star));
                    }}
                    className={cn(
                      'w-14 h-14 rounded-xl border-2 flex items-center justify-center text-3xl transition-all duration-200 cursor-pointer disabled:cursor-default',
                      (hoverRating || ratingValue) >= star
                        ? 'border-amber-400 bg-amber-50 shadow-sm shadow-amber-100'
                        : 'border-amber-200 bg-white',
                    )}
                  >
                    <span className={cn(
                      'transition-colors duration-200',
                      (hoverRating || ratingValue) >= star ? 'text-amber-500' : 'text-amber-200',
                    )}>
                      ★
                    </span>
                  </motion.button>
                ))}
              </div>
              {ratingValue > 0 && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-amber-700 font-medium"
                >
                  You rated: {ratingValue}/5
                </motion.p>
              )}
            </CardContent>
          </Card>
        )}

        {/* True/False — tinted cards */}
        {currentQuestion.questionType === 'TRUE_FALSE' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {['True', 'False'].map((opt) => {
              const isSelected = myAnswer === opt;
              const isCorrectOption = false;
              const isWrongOption = false;
              const isTrue = opt === 'True';

              return (
                <motion.button
                  key={opt}
                  whileHover={!hasAnswered && !isExpired ? { scale: 1.02, y: -1 } : {}}
                  whileTap={!hasAnswered && !isExpired ? { scale: 0.98 } : {}}
                  disabled={hasAnswered || isExpired}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'p-6 sm:p-8 rounded-xl border-2 flex items-center justify-center gap-3 text-xl font-bold transition-all duration-300',
                    'disabled:cursor-default',
                    // Default — slight tint based on True/False
                    !isSelected && !hasAnswered && !isExpired && isTrue &&
                      'border-green-200 bg-green-50/50 hover:border-green-400 hover:bg-green-50 hover:shadow-md text-green-800',
                    !isSelected && !hasAnswered && !isExpired && !isTrue &&
                      'border-red-200 bg-red-50/50 hover:border-red-400 hover:bg-red-50 hover:shadow-md text-red-800',
                    // Selected
                    isSelected && isTrue &&
                      'border-green-500 bg-green-100 text-green-800 shadow-md shadow-green-100',
                    isSelected && !isTrue &&
                      'border-red-500 bg-red-100 text-red-800 shadow-md shadow-red-100',
                    // Correct reveal
                    isCorrectOption && 'border-green-500 bg-green-100 text-green-700 shadow-md',
                    // Wrong reveal
                    isWrongOption && 'border-red-500 bg-red-100 text-red-700 shadow-md',
                    // Unselected after answering
                    !isSelected && hasAnswered && 'opacity-50',
                  )}
                >
                  {isTrue ? (
                    <CheckCircle className={cn('h-6 w-6', isCorrectOption ? 'text-green-600' : isWrongOption ? 'text-red-600' : 'text-green-500')} />
                  ) : (
                    <XCircle className={cn('h-6 w-6', isCorrectOption ? 'text-green-600' : isWrongOption ? 'text-red-600' : 'text-red-500')} />
                  )}
                  {opt}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Short Answer */}
        {currentQuestion.questionType === 'SHORT_ANSWER' && (
          <Card className="border-amber-200/60">
            <CardContent className="p-4 sm:p-5">
              <div className="flex gap-3">
                <Input
                  value={shortAnswer}
                  onChange={(e) => setShortAnswer(e.target.value)}
                  placeholder="Type your answer..."
                  disabled={hasAnswered || isExpired}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleShortAnswerSubmit();
                  }}
                  className="flex-1 h-12 text-base border-2 border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                />
                <Button
                  onClick={handleShortAnswerSubmit}
                  disabled={hasAnswered || isExpired || !shortAnswer.trim()}
                  className="h-12 px-5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </Button>
              </div>
              {hasAnswered && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 text-sm text-amber-700 font-medium flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  Answer submitted
                </motion.p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Open ended */}
        {currentQuestion.questionType === 'OPEN_ENDED' && (
          <Card className="border-amber-200/60">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <Textarea
                value={openEndedAnswer}
                onChange={(e) => setOpenEndedAnswer(e.target.value)}
                placeholder="Share your thoughts, feedback, or reflection..."
                disabled={hasAnswered || isExpired}
                rows={5}
                className="resize-none border-2 border-amber-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-amber-700/70">No right or wrong answer. Your response will be saved as feedback.</p>
                <Button
                  onClick={handleOpenEndedSubmit}
                  disabled={hasAnswered || isExpired || !openEndedAnswer.trim()}
                  className="h-12 px-5 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Feedback area */}
      <AnimatePresence>
        {hasAnswered && isUnscoredType && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'rounded-xl p-4 border-2 text-center shadow-sm',
              isOpenEnded ? 'bg-emerald-50 border-emerald-200' : 'bg-purple-50 border-purple-200',
            )}
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle className={cn('h-5 w-5', isOpenEnded ? 'text-emerald-600' : 'text-purple-600')} />
              <span className={cn('text-base font-bold', isOpenEnded ? 'text-emerald-800' : 'text-purple-800')}>
                {isPoll ? 'Vote Recorded!' : isRating ? 'Rating Submitted!' : 'Response Submitted!'}
              </span>
            </div>
            <p className={cn('text-sm', isOpenEnded ? 'text-emerald-600/80' : 'text-purple-600/80')}>
              Thanks for your response
            </p>
          </motion.div>
        )}

        {hasAnswered && !isUnscoredType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-4"
          >
            <div className="inline-flex items-center gap-2 text-amber-700 font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              Submitted — waiting for others…
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live poll results (shown to voters who already answered) */}
      {(isPoll || isRating) && hasAnswered && pollResults && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card className="border-purple-200/60">
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold text-purple-700 mb-3">
                Live Results ({pollResults.totalResponses} responses)
              </h4>
              <div className="space-y-2.5">
                {Object.entries(pollResults.distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([option, count]) => {
                    const pct = pollResults.totalResponses > 0 ? (count / pollResults.totalResponses) * 100 : 0;
                    return (
                      <div key={option} className="flex items-center gap-2.5">
                        <span className="text-sm font-medium text-amber-800 w-24 truncate">{option}</span>
                        <div className="flex-1 h-7 bg-purple-50 rounded-lg overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-purple-400 to-purple-500 rounded-lg"
                          />
                        </div>
                        <span className="text-xs font-semibold text-purple-700 w-12 text-right">{Math.round(pct)}%</span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Answer count */}
      <p className="text-center text-xs font-medium text-amber-700/50 tracking-wide">
        {answeredCount} / {players.length} answered
      </p>
    </motion.div>
  );
}
