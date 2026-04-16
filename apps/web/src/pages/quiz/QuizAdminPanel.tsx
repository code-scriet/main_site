/**
 * QuizAdminPanel — floating admin controls shown only to quiz creator.
 * Changes based on quiz phase: lobby / question / revealing / finished.
 * Features: SVG progress ring, pulsing next button, connected dots.
 */

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useQuizStore } from '@/lib/quizStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Play,
  SkipForward,
  StopCircle,
  Users,
  CheckCheck,
  Pause,
  Timer,
  FastForward,
  Minus,
  UserX,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';

/* --- SVG circular progress ring --- */
function ProgressRing({ answered, total, size = 52 }: { answered: number; total: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? answered / total : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-amber-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            'transition-all duration-500 ease-out',
            pct >= 1 ? 'text-green-500' : 'text-amber-500',
          )}
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums text-amber-900">
        {answered}/{total}
      </span>
    </div>
  );
}

interface QuizAdminPanelProps {
  onStartQuiz: () => void;
  onNextQuestion: () => void;
  onEndQuiz: () => void;
  onKickPlayer?: (userId: string) => void;
  onPauseQuiz?: () => void;
  onResumeQuiz?: () => void;
  onExtendTime?: (seconds: number) => void;
  onSkipQuestion?: () => void;
}

export const QuizAdminPanel = memo(function QuizAdminPanel({
  onStartQuiz,
  onNextQuestion,
  onEndQuiz,
  onKickPlayer,
  onPauseQuiz,
  onResumeQuiz,
  onExtendTime,
  onSkipQuestion,
}: QuizAdminPanelProps) {
  const quizStatus = useQuizStore((s) => s.quizStatus);
  const players = useQuizStore((s) => s.players);
  const connectedCount = useQuizStore((s) => s.connectedCount);
  const answeredCount = useQuizStore((s) => s.answeredCount);
  const allAnswered = useQuizStore((s) => s.allAnswered);
  const questionIndex = useQuizStore((s) => s.questionIndex);
  const totalQuestions = useQuizStore((s) => s.totalQuestions);
  const isLastQuestion = questionIndex >= totalQuestions - 1;
  const [showPlayers, setShowPlayers] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4"
    >
      <Card className="border-2 border-amber-300 shadow-2xl bg-white/95 backdrop-blur-lg">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 shadow-sm">
              <Sparkles className="h-3 w-3 mr-1" />
              Admin
            </Badge>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1.5 text-amber-700/60 font-medium">
                <Users className="h-3.5 w-3.5" />
                <span className="tabular-nums">{connectedCount}</span>
              </div>
              {/* Player list toggle */}
              {onKickPlayer && players.length > 0 && (
                <button
                  onClick={() => setShowPlayers(!showPlayers)}
                  className="p-1 rounded-md hover:bg-amber-50 text-amber-600 transition-colors"
                  aria-label={showPlayers ? 'Hide player list' : 'Show player list'}
                >
                  {showPlayers ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Expandable player list for kicking — with connected dots */}
          <AnimatePresence>
            {showPlayers && onKickPlayer && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-3 max-h-32 overflow-y-auto border border-amber-200/60 rounded-lg divide-y divide-amber-100">
                  {players.map((p) => (
                    <div key={p.userId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Connected/disconnected dot */}
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          {p.connected !== false && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          )}
                          <span className={cn('relative inline-flex rounded-full h-2 w-2', p.connected !== false ? 'bg-green-500' : 'bg-gray-300')} />
                        </span>
                        <span className="truncate text-amber-800 font-medium">{p.displayName}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onKickPlayer(p.userId)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-6 px-2"
                        aria-label={`Remove ${p.displayName} from the quiz`}
                      >
                        <UserX className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Phase-specific controls */}
          {quizStatus === 'lobby' && (
            <LobbyControls playerCount={players.length} onStart={onStartQuiz} />
          )}

          {quizStatus === 'question' && (
            <QuestionControls
              answeredCount={answeredCount}
              totalPlayers={players.length}
              allAnswered={allAnswered}
              questionIndex={questionIndex}
              totalQuestions={totalQuestions}
              onNextQuestion={onNextQuestion}
              onEndQuiz={onEndQuiz}
              onPauseQuiz={onPauseQuiz}
              onExtendTime={onExtendTime}
              onSkipQuestion={onSkipQuestion}
            />
          )}

          {quizStatus === 'paused' && (
            <PausedControls onResumeQuiz={onResumeQuiz} onEndQuiz={onEndQuiz} />
          )}

          {quizStatus === 'revealing' && (
            <RevealControls
              isLastQuestion={isLastQuestion}
              questionIndex={questionIndex}
              totalQuestions={totalQuestions}
              onNextQuestion={onNextQuestion}
              onEndQuiz={onEndQuiz}
            />
          )}

          {quizStatus === 'finished' && (
            <div className="text-center py-2">
              <Badge className="bg-green-100 text-green-700 border-green-300">
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Quiz finished — results shown
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
});

/* ---------- Sub-components ---------- */

function LobbyControls({
  playerCount,
  onStart,
}: {
  playerCount: number;
  onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <span className="text-3xl font-black text-amber-900 tabular-nums font-display">{playerCount}</span>
        <p className="text-xs font-medium text-amber-700/50">player{playerCount !== 1 ? 's' : ''} in lobby</p>
      </div>
      <Button
        onClick={onStart}
        disabled={playerCount === 0}
        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
        size="lg"
      >
        <Play className="h-5 w-5 mr-2" />
        Start Quiz
      </Button>
      {playerCount === 0 && (
        <p className="text-[10px] text-center text-amber-600/40 font-medium">Waiting for players to join...</p>
      )}
    </div>
  );
}

function QuestionControls({
  answeredCount,
  totalPlayers,
  allAnswered,
  questionIndex,
  totalQuestions,
  onNextQuestion,
  onEndQuiz,
  onPauseQuiz,
  onExtendTime,
  onSkipQuestion,
}: {
  answeredCount: number;
  totalPlayers: number;
  allAnswered: boolean;
  questionIndex: number;
  totalQuestions: number;
  onNextQuestion: () => void;
  onEndQuiz: () => void;
  onPauseQuiz?: () => void;
  onExtendTime?: (seconds: number) => void;
  onSkipQuestion?: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Response tracker with progress ring */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700/50 tabular-nums">
          Q{questionIndex + 1} / {totalQuestions}
        </span>
        <div className="flex items-center gap-3">
          {allAnswered ? (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              <Badge className="bg-green-100 text-green-700 border border-green-300 animate-pulse">
                <CheckCheck className="h-3 w-3 mr-1" />
                All answered!
              </Badge>
            </motion.div>
          ) : (
            <ProgressRing answered={answeredCount} total={totalPlayers} />
          )}
        </div>
      </div>

      {/* Primary actions */}
      <div className="flex gap-2">
        <Button
          onClick={onNextQuestion}
          className={cn(
            'flex-1 transition-all duration-300 active:scale-[0.98]',
            allAnswered
              ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white ring-2 ring-amber-400 ring-offset-2 animate-pulse shadow-lg'
              : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md',
          )}
          disabled={answeredCount === 0}
        >
          <SkipForward className="h-4 w-4 mr-2" />
          Show Results
        </Button>
        <Button
          onClick={onEndQuiz}
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          <StopCircle className="h-4 w-4" />
        </Button>
      </div>

      {/* Secondary controls */}
      <div className="flex flex-wrap gap-1.5">
        {onPauseQuiz && (
          <Button
            onClick={onPauseQuiz}
            variant="outline"
            size="sm"
            className="flex-1 min-w-[72px] text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
          >
            <Pause className="h-3 w-3 mr-1" />
            Pause
          </Button>
        )}
        {onExtendTime && (
          <>
            {[10, 30].map((s) => (
              <Button
                key={s}
                onClick={() => onExtendTime(s)}
                variant="outline"
                size="sm"
                className="flex-1 min-w-[72px] text-xs border-amber-200 text-amber-600 hover:bg-amber-50 font-mono"
              >
                <Timer className="h-3 w-3 mr-1" />
                +{s}s
              </Button>
            ))}
            {[10, 30].map((s) => (
              <Button
                key={`reduce-${s}`}
                onClick={() => onExtendTime(-s)}
                variant="outline"
                size="sm"
                className="flex-1 min-w-[72px] text-xs border-orange-300 text-orange-600 hover:bg-orange-50 font-mono"
                aria-label={`Reduce quiz timer by ${s} seconds`}
              >
                <Minus className="h-3 w-3 mr-1" />
                -{s}s
              </Button>
            ))}
          </>
        )}
        {onSkipQuestion && (
          <Button
            onClick={onSkipQuestion}
            variant="outline"
            size="sm"
            className="flex-1 min-w-[72px] text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
          >
            <FastForward className="h-3 w-3 mr-1" />
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}

/* Paused state controls */
function PausedControls({
  onResumeQuiz,
  onEndQuiz,
}: {
  onResumeQuiz?: () => void;
  onEndQuiz: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <Badge className="bg-yellow-100 text-yellow-700 border border-yellow-300 text-sm">
          <Pause className="h-3.5 w-3.5 mr-1" />
          Quiz Paused
        </Badge>
      </div>
      <div className="flex gap-2">
        {onResumeQuiz && (
          <Button
            onClick={onResumeQuiz}
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
            size="lg"
          >
            <Play className="h-5 w-5 mr-2" />
            Resume
          </Button>
        )}
        <Button
          onClick={onEndQuiz}
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
        >
          <StopCircle className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function RevealControls({
  isLastQuestion,
  questionIndex,
  totalQuestions,
  onNextQuestion,
  onEndQuiz,
}: {
  isLastQuestion: boolean;
  questionIndex: number;
  totalQuestions: number;
  onNextQuestion: () => void;
  onEndQuiz: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center text-xs font-semibold text-amber-700/50">
        Question {questionIndex + 1} of {totalQuestions} — reviewing results
      </div>
      <div className="flex gap-2">
        {isLastQuestion ? (
          <Button
            onClick={onEndQuiz}
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
            size="lg"
          >
            <StopCircle className="h-5 w-5 mr-2" />
            Finish Quiz
          </Button>
        ) : (
          <>
            <Button
              onClick={onNextQuestion}
              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
              size="lg"
            >
              <SkipForward className="h-5 w-5 mr-2" />
              Next Question
            </Button>
            <Button
              onClick={onEndQuiz}
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <StopCircle className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
