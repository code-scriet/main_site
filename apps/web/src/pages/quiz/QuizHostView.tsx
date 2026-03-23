/**
 * QuizHostView — Full-screen host dashboard for quiz admins/creators.
 * 
 * The host DOES NOT play the quiz — they only control and monitor it.
 * Features:
 * - Live participant count
 * - Current question display (preview, not answering)
 * - Real-time leaderboard
 * - All control buttons: Start, Next, Pause, Resume, Skip, End
 * - Kick player functionality
 * - Timer controls
 * - QR code for participants to join
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useQuizStore } from '@/lib/quizStore';
import { useQuizTimer } from '@/hooks/useQuizTimer';
import { QuizLeaderboard } from './QuizLeaderboard';
import { QuizAnswerDistribution } from './QuizAnswerDistribution';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn, getWebAppOrigin } from '@/lib/utils';
import {
  Play,
  Pause,
  SkipForward,
  StopCircle,
  Users,
  Timer,
  ChevronRight,
  Plus,
  UserX,
  Copy,
  Check,
  ArrowLeft,
  Settings,
  BarChart3,
  Trophy,
  Zap,
  Eye,
  QrCode,
  LayoutDashboard,
  Home,
  AlertCircle,
} from 'lucide-react';

/* SVG circular progress ring */
function ProgressRing({ value, max, size = 64 }: { value: number; max: number; size?: number }) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const pct = max > 0 ? value / max : 0;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-amber-100" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        className="text-amber-500 transition-all duration-500"
      />
    </svg>
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

interface QuizHostViewProps {
  onStartQuiz: () => void;
  onNextQuestion: () => void;
  onEndQuiz: () => void;
  onKickPlayer: (userId: string) => void;
  onPauseQuiz: () => void;
  onResumeQuiz: () => void;
  onExtendTime: (seconds: number) => void;
  onSkipQuestion: () => void;
}

export function QuizHostView({
  onStartQuiz,
  onNextQuestion,
  onEndQuiz,
  onKickPlayer,
  onPauseQuiz,
  onResumeQuiz,
  onExtendTime,
  onSkipQuestion,
}: QuizHostViewProps) {
  const navigate = useNavigate();
  const [pinCopied, setPinCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const [velocitySeries, setVelocitySeries] = useState<{
    questionIndex: number;
    points: { t: number; count: number }[];
  }>({ questionIndex: -1, points: [] });
  const [averageAccuracy, setAverageAccuracy] = useState(50);
  const prefersReducedMotion = useReducedMotion();

  const quizStatus = useQuizStore((s) => s.quizStatus);
  const socketStatus = useQuizStore((s) => s.socketStatus);
  const title = useQuizStore((s) => s.title);
  const pin = useQuizStore((s) => s.pin);
  const participants = useQuizStore((s) => s.players); // Store uses 'players'
  const leaderboard = useQuizStore((s) => s.leaderboard);
  const currentQuestion = useQuizStore((s) => s.currentQuestion);
  const questionReveal = useQuizStore((s) => s.questionReveal);
  const questionStartTime = useQuizStore((s) => s.questionStartTime);
  const totalQuestions = useQuizStore((s) => s.totalQuestions);
  const answeredCount = useQuizStore((s) => s.answeredCount);

  // ─── CP7: Velocity sparkline buffer ───
  const velocityBuffer = useRef<{ t: number; count: number }[]>([]);
  const questionStartRef = useRef<number>(0);
  const prevQuestionIdx = useRef<number>(-1);

  // Reset on new question
  useEffect(() => {
    const idx = currentQuestion?.questionIndex ?? -1;
    if (idx !== prevQuestionIdx.current) {
      velocityBuffer.current = [];
      questionStartRef.current = Date.now();
      prevQuestionIdx.current = idx;
    }
  }, [currentQuestion?.questionIndex]);

  // Push on answeredCount change
  useEffect(() => {
    if (answeredCount > 0 && quizStatus === 'question') {
      velocityBuffer.current.push({
        t: Date.now() - questionStartRef.current,
        count: answeredCount,
      });
      setVelocitySeries({
        questionIndex: currentQuestion?.questionIndex ?? -1,
        points: [...velocityBuffer.current],
      });
    }
  }, [answeredCount, currentQuestion?.questionIndex, quizStatus]);

  // ─── CP8: Running mean accuracy for contextual label ───
  const accuracyHistory = useRef<number[]>([]);
  const questionRevealData = questionReveal;
  const revealedCorrectAnswers = useMemo(
    () => currentQuestion?.questionType === 'MULTI_SELECT' ? parseAnswerList(questionRevealData?.correctAnswer) : [],
    [currentQuestion?.questionType, questionRevealData?.correctAnswer],
  );

  useEffect(() => {
    if (quizStatus === 'revealing' && questionRevealData?.correctAnswer != null) {
      const dist = questionRevealData.answerDistribution ?? {};
      const total = Object.values(dist).reduce((s: number, n: number) => s + n, 0);
      const correct = currentQuestion?.questionType === 'MULTI_SELECT'
        ? revealedCorrectAnswers.reduce((sum, answer) => sum + (dist[answer] ?? 0), 0)
        : (questionRevealData.correctAnswer ? (dist[questionRevealData.correctAnswer] ?? 0) : 0);
      if (total > 0) {
        const acc = Math.round((correct / total) * 100);
        // Only push if it's a new question (avoid duplicates)
        const idx = currentQuestion?.questionIndex ?? -1;
        if (accuracyHistory.current.length < idx + 1) {
          accuracyHistory.current.push(acc);
          setAverageAccuracy(
            Math.round(
              accuracyHistory.current.reduce((sum, value) => sum + value, 0) / accuracyHistory.current.length,
            ),
          );
        }
      }
    }
  }, [quizStatus, questionRevealData, currentQuestion?.questionIndex, currentQuestion?.questionType, revealedCorrectAnswers]);

  // Calculate time remaining using the proper timer hook
  const { secondsLeft: timeRemaining } = useQuizTimer(
    questionStartTime,
    currentQuestion?.timeLimitSeconds ?? null,
  );

  const joinBaseOrigin = getWebAppOrigin();
  const joinUrl = pin
    ? `${joinBaseOrigin}/quiz/join?pin=${pin}`
    : `${joinBaseOrigin}/quiz/join`;

  const copyPin = async () => {
    if (pin) {
      await navigator.clipboard.writeText(pin);
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  const allAnswered = useMemo(
    () => participants.length > 0 && answeredCount >= participants.length,
    [answeredCount, participants.length],
  );
  const velocityPoints =
    velocitySeries.questionIndex === (currentQuestion?.questionIndex ?? -1)
      ? velocitySeries.points
      : [];

  const statusLabel = {
    lobby: 'Waiting for players',
    question: 'Question in progress',
    revealing: 'Showing results',
    paused: 'Paused',
    finished: 'Quiz finished',
    idle: 'Loading...',
    joining: 'Connecting...',
  }[quizStatus] || quizStatus;

  const statusColor = {
    lobby: 'bg-amber-100 text-amber-700 border-amber-300',
    question: 'bg-green-100 text-green-700 border-green-300',
    revealing: 'bg-blue-100 text-blue-700 border-blue-300',
    paused: 'bg-orange-100 text-orange-700 border-orange-300',
    finished: 'bg-amber-100 text-amber-700 border-amber-300',
    idle: 'bg-amber-50 text-amber-600 border-amber-200',
    joining: 'bg-amber-50 text-amber-600 border-amber-200',
  }[quizStatus] || 'bg-amber-50 text-amber-600';

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      {/* Top bar */}
      <div className="sticky top-under-header z-40 bg-white/80 backdrop-blur-xl border-b border-amber-200/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/quiz')}
              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Exit
            </Button>
            <div>
              <h1 className="text-lg font-bold text-amber-900 font-display">{title}</h1>
              <Badge className={cn('text-[10px]', statusColor)}>{statusLabel}</Badge>
            </div>
          </div>
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
            <Eye className="h-3 w-3 mr-1" />
            HOST
          </Badge>
        </div>
      </div>

      {(socketStatus === 'connecting' || socketStatus === 'disconnected') && (
        <div className="border-b border-amber-200 bg-amber-50/90">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span>
              {socketStatus === 'disconnected'
                ? 'Realtime connection lost. Controls will resume once the quiz reconnects.'
                : 'Reconnecting to the quiz server...'}
            </span>
          </div>
        </div>
      )}

      {/* Live stats bar */}
      {(quizStatus === 'question' || quizStatus === 'revealing') && (
        <div className="bg-white/60 backdrop-blur-sm border-b border-amber-100">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4 flex-wrap text-xs font-medium">
            <div className="flex items-center gap-1.5 text-amber-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="tabular-nums font-semibold">{participants.length}</span>
              <span className="text-amber-700/50">connected</span>
            </div>
            <div className="flex items-center gap-2 flex-1 max-w-[120px] sm:max-w-[200px]">{/* responsive: narrower on mobile */}
              <span className="text-amber-700 tabular-nums font-semibold">{answeredCount}/{participants.length}</span>
              <div className="flex-1 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${participants.length > 0 ? (answeredCount / participants.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-amber-700/50">answered</span>
            </div>
            <div className="text-amber-700/60">
              Q<span className="font-semibold text-amber-700 tabular-nums">{currentQuestion ? currentQuestion.questionIndex + 1 : 0}</span>/{totalQuestions}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Main control area */}
          <div className="lg:col-span-2 space-y-5">
            {/* PIN & QR Section */}
            {(quizStatus === 'lobby' || quizStatus === 'question') && pin && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="border-amber-200/60 shadow-lg overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-amber-100 text-xs font-medium uppercase tracking-wide mb-1">Game PIN</p>
                        <div className="flex items-center gap-3">
                          <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.25em] text-white">{pin}</span>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={copyPin}
                            className="bg-white/20 hover:bg-white/30 text-white border-none h-8"
                          >
                            {pinCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-amber-100/80 text-xs mt-2 font-mono">{joinUrl}</p>
                      </div>
                      <div className="hidden sm:block">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setShowQR(!showQR)}
                          className="bg-white/20 hover:bg-white/30 text-white border-none"
                        >
                          <QrCode className="h-4 w-4 mr-1.5" />
                          {showQR ? 'Hide' : 'Show'} QR
                        </Button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {showQR && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 flex justify-center"
                        >
                          <div className="bg-white p-3 rounded-xl shadow-md">
                            <QRCodeSVG value={joinUrl} size={140} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Current Question Preview (Host sees question but doesn't answer) */}
            {(quizStatus === 'question' || quizStatus === 'revealing') && currentQuestion && (
              <Card className="border-amber-200/60 shadow-md">
                <CardContent className="p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-xs">
                      Question {currentQuestion.questionIndex + 1} / {currentQuestion.totalQuestions}
                    </Badge>
                    {quizStatus === 'question' && (
                      <div className="flex items-center gap-2 text-amber-600">
                        <Timer className="h-4 w-4" />
                        <span className="text-2xl font-mono font-bold tabular-nums">{timeRemaining}s</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-amber-900 mb-4 font-display">
                    {currentQuestion.questionText}
                  </h2>
                  {currentQuestion.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{/* responsive: stack on mobile */}
                      {currentQuestion.options.map((opt, i) => {
                        const isCorrectOption = quizStatus === 'revealing' && (
                          currentQuestion.questionType === 'MULTI_SELECT'
                            ? revealedCorrectAnswers.includes(opt)
                            : questionReveal?.correctAnswer === opt
                        );

                        return (
                          <div
                            key={i}
                            className={cn(
                              'p-3 rounded-lg border text-sm font-medium',
                              isCorrectOption
                                ? 'bg-green-50 border-green-300 text-green-800'
                                : 'bg-amber-50/50 border-amber-200 text-amber-800',
                            )}
                          >
                            <span className="font-bold text-amber-600 mr-1.5">{String.fromCharCode(65 + i)})</span>
                            {opt}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Answer distribution during reveal */}
                  {quizStatus === 'revealing' && questionReveal?.answerDistribution && currentQuestion.questionType !== 'OPEN_ENDED' && (
                    <div className="mt-4 pt-4 border-t border-amber-100">
                      <QuizAnswerDistribution
                        distribution={questionReveal.answerDistribution}
                        correctAnswer={questionReveal.correctAnswer ?? null}
                        options={currentQuestion.options ?? null}
                        questionType={currentQuestion.questionType ?? 'MCQ'}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Lobby waiting state */}
            {quizStatus === 'lobby' && (
              <Card className="border-amber-200/60 shadow-md">
                <CardContent className="p-8 text-center">
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Users className="h-14 w-14 mx-auto text-amber-500 mb-4" />
                  </motion.div>
                  <h2 className="text-2xl font-bold text-amber-900 mb-2 font-display">Waiting for Players</h2>
                  <p className="text-amber-700/60 mb-6">
                    Share the PIN or QR code to let participants join
                  </p>
                  <div className="text-5xl font-black text-amber-600 tabular-nums">
                    {participants.length}
                    <span className="text-base font-medium text-amber-700/50 ml-2">players joined</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Finished state */}
            {quizStatus === 'finished' && (
              <Card className="border-amber-200/60 shadow-lg">
                <CardContent className="p-8 text-center">
                  <Trophy className="h-14 w-14 mx-auto text-amber-500 mb-4" />
                  <h2 className="text-2xl font-bold text-amber-900 mb-2 font-display">Quiz Complete!</h2>
                  {leaderboard[0] && (
                    <p className="text-lg text-amber-800">
                      Winner: <span className="text-amber-600 font-bold">{leaderboard[0].displayName}</span>
                      <span className="text-amber-700/50 ml-2">({leaderboard[0].score} pts)</span>
                    </p>
                  )}
                  <Button
                    onClick={() => navigate(`/quiz/${useQuizStore.getState().quizId}/results`)}
                    className="mt-6 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    View Full Results
                  </Button>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <Button
                      onClick={() => navigate('/dashboard')}
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Dashboard
                    </Button>
                    <Button
                      onClick={() => navigate('/quiz')}
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Home className="h-4 w-4 mr-2" />
                      Quizzes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Control Panel */}
            <Card className="border-amber-200/60 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <h3 className="text-sm font-bold text-amber-900 mb-4 flex items-center gap-2 tracking-tight">
                  <Settings className="h-4 w-4 text-amber-500" />
                  Host Controls
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {quizStatus === 'lobby' && (
                    <Button
                      onClick={onStartQuiz}
                      disabled={participants.length === 0}
                      className="bg-green-600 hover:bg-green-700 text-white col-span-2 shadow-md"
                      size="lg"
                    >
                      <Play className="h-5 w-5 mr-2" />
                      Start Quiz
                    </Button>
                  )}

                  {quizStatus === 'question' && (
                    <>
                      <Button
                        onClick={onPauseQuiz}
                        variant="outline"
                        className="border-orange-300 text-orange-600 hover:bg-orange-50"
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                      <Button
                        onClick={onSkipQuestion}
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      >
                        <SkipForward className="h-4 w-4 mr-2" />
                        Skip
                      </Button>
                    </>
                  )}

                  {quizStatus === 'paused' && (
                    <Button
                      onClick={onResumeQuiz}
                      className="bg-green-600 hover:bg-green-700 text-white col-span-2"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  )}

                  {quizStatus === 'revealing' && (
                    <Button
                      onClick={onNextQuestion}
                      className={cn(
                        'col-span-2 shadow-md bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white',
                        allAnswered && 'ring-2 ring-amber-400 ring-offset-2',
                        allAnswered && !prefersReducedMotion && 'animate-pulse',
                      )}
                      size="lg"
                    >
                      <ChevronRight className="h-5 w-5 mr-2" />
                      Next Question
                    </Button>
                  )}

                  {(quizStatus === 'question' || quizStatus === 'revealing' || quizStatus === 'paused') && (
                    <Button
                      onClick={onEndQuiz}
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    >
                      <StopCircle className="h-4 w-4 mr-2" />
                      End Quiz
                    </Button>
                  )}
                </div>

                {/* Timer controls */}
                {quizStatus === 'question' && (
                  <div className="mt-4 pt-4 border-t border-amber-100">
                    <p className="text-xs text-amber-700/50 font-semibold uppercase tracking-wide mb-2">Extend Time</p>
                    <div className="flex gap-2">
                      {[10, 30, 60].map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          onClick={() => onExtendTime(s)}
                          className="border-amber-200 text-amber-700 hover:bg-amber-50"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {s < 60 ? `${s}s` : '1m'}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column - Participants & Leaderboard */}
          <div className="space-y-5">
            {/* Answered progress ring */}
            {quizStatus === 'question' && (
              <Card className="border-amber-200/60 shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="relative">
                    <ProgressRing value={answeredCount} max={participants.length} size={56} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-amber-800 tabular-nums">
                      {answeredCount}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {answeredCount} / {participants.length} answered
                    </p>
                    {allAnswered && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs font-medium text-green-600 flex items-center gap-1"
                      >
                        <span className={cn('inline-block w-2 h-2 rounded-full bg-green-500', !prefersReducedMotion && 'animate-pulse')} />
                        All answered!
                      </motion.p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* CP7: Velocity sparkline */}
            {quizStatus === 'question' && velocityPoints.length >= 2 && (
              <Card className="border-amber-200/60 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold text-amber-700/50 uppercase tracking-wide mb-2">Answer Velocity</p>
                  <svg width="100%" height={50} viewBox="0 0 200 50" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    <polyline
                      points={(() => {
                        const maxT = Math.max(velocityPoints[velocityPoints.length - 1]?.t ?? 1, 1);
                        const maxC = Math.max(...velocityPoints.map((point) => point.count), 1);
                        return velocityPoints
                          .map((point) => `${(point.t / maxT) * 200},${50 - (point.count / maxC) * 50}`)
                          .join(' ');
                      })()}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth={1.5}
                      opacity={0.7}
                    />
                  </svg>
                </CardContent>
              </Card>
            )}

            {/* CP8: Post-question performance preview */}
            {quizStatus === 'revealing' && questionReveal && (
              <Card className="border-amber-200/60 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-amber-700/50 uppercase tracking-wide">Question Summary</p>
                  {(() => {
                    const dist = questionReveal.answerDistribution ?? {};
                    const total = Object.values(dist).reduce((s: number, n: number) => s + n, 0);
                    const correct = currentQuestion?.questionType === 'MULTI_SELECT'
                      ? revealedCorrectAnswers.reduce((sum, answer) => sum + (dist[answer] ?? 0), 0)
                      : (questionReveal.correctAnswer ? (dist[questionReveal.correctAnswer] ?? 0) : 0);
                    const accuracy = currentQuestion?.questionType === 'OPEN_ENDED'
                      ? 0
                      : total > 0 ? Math.round((correct / total) * 100) : 0;
                    const unanswered = participants.length - total;
                    const label = currentQuestion?.questionType === 'OPEN_ENDED'
                      ? 'Qualitative feedback collected'
                      : accuracy > averageAccuracy ? 'Easier than average' : 'Harder than average';
                    const labelColor = currentQuestion?.questionType === 'OPEN_ENDED'
                      ? 'text-emerald-600'
                      : accuracy > averageAccuracy ? 'text-green-600' : 'text-red-600';

                    return (
                      <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-2">{/* responsive: stack on mobile */}
                        <div className="bg-amber-50 rounded-lg p-2">
                          <p className="text-lg font-black text-amber-900 tabular-nums">
                            {currentQuestion?.questionType === 'OPEN_ENDED' ? total : `${accuracy}%`}
                          </p>
                          <p className="text-[10px] text-amber-700/50 font-semibold uppercase">
                            {currentQuestion?.questionType === 'OPEN_ENDED' ? 'Responses' : 'Accuracy'}
                          </p>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-2">
                          <p className="text-lg font-black text-amber-900 tabular-nums">{unanswered}</p>
                          <p className="text-[10px] text-amber-700/50 font-semibold uppercase">Didn't Answer</p>
                        </div>
                        <div className="col-span-2">
                          <p className={cn('text-xs font-semibold', labelColor)}>{label}</p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Participants / Leaderboard toggle */}
            <Card className="border-amber-200/60 shadow-sm overflow-hidden">
              <div className="flex border-b border-amber-100">
                <button
                  onClick={() => setShowParticipants(true)}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-semibold transition-colors tracking-wide',
                    showParticipants
                      ? 'bg-amber-50 text-amber-800 border-b-2 border-amber-500'
                      : 'text-amber-700/50 hover:text-amber-700 hover:bg-amber-50/50',
                  )}
                >
                  <Users className="h-3.5 w-3.5 inline mr-1.5" />
                  Players ({participants.length})
                </button>
                <button
                  onClick={() => setShowParticipants(false)}
                  className={cn(
                    'flex-1 py-2.5 text-xs font-semibold transition-colors tracking-wide',
                    !showParticipants
                      ? 'bg-amber-50 text-amber-800 border-b-2 border-amber-500'
                      : 'text-amber-700/50 hover:text-amber-700 hover:bg-amber-50/50',
                  )}
                >
                  <Trophy className="h-3.5 w-3.5 inline mr-1.5" />
                  Leaderboard
                </button>
              </div>

              <div className="p-4 max-h-[300px] sm:max-h-[500px] overflow-y-auto">{/* responsive: shorter on mobile */}
                {showParticipants ? (
                  <div className="space-y-1.5">
                    {participants.length === 0 ? (
                      <p className="text-center text-amber-700/40 py-8 text-sm">
                        No players have joined yet
                      </p>
                    ) : (() => {
                      // Sort by status during active questions only
                      const isActive = quizStatus === 'question' || quizStatus === 'revealing';
                      const displayPlayers = isActive
                        ? [...participants].sort((a, b) => {
                            const aDisc = a.connected === false ? 1 : 0;
                            const bDisc = b.connected === false ? 1 : 0;
                            if (aDisc !== bDisc) return aDisc - bDisc;
                            const aAns = a.answered === true ? 0 : 1;
                            const bAns = b.answered === true ? 0 : 1;
                            return aAns - bAns;
                          })
                        : participants;

                      return displayPlayers.map((p) => {
                        const isDisconnected = p.connected === false;
                        const hasAnswered = p.answered === true;
                        const indicator = isActive
                          ? isDisconnected
                            ? { icon: '🔴', label: 'Disconnected', dotClass: 'bg-red-400' }
                            : hasAnswered
                              ? { icon: '✅', label: 'Answered', dotClass: 'bg-emerald-500' }
                              : { icon: '⏳', label: 'Waiting', dotClass: 'bg-amber-400' }
                          : { icon: null, label: 'Connected', dotClass: 'bg-green-500' };

                        return (
                          <div
                            key={p.userId || p.displayName}
                            className={cn(
                              'flex items-center justify-between p-2.5 rounded-lg transition-colors',
                              isDisconnected && isActive
                                ? 'bg-red-50/40 hover:bg-red-50/60'
                                : 'bg-amber-50/50 hover:bg-amber-50',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              {isActive && indicator.icon ? (
                                <span className="text-xs" title={indicator.label}>{indicator.icon}</span>
                              ) : (
                                <span className="relative flex h-2 w-2">
                                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                                </span>
                              )}
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-xs">
                                {p.displayName?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <span className={cn(
                                'text-sm font-medium',
                                isDisconnected && isActive ? 'text-amber-700/50 line-through' : 'text-amber-900',
                              )}>
                                {p.displayName}
                              </span>
                            </div>
                            {quizStatus === 'lobby' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onKickPlayer(p.userId || '')}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7 p-0"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <QuizLeaderboard
                    leaderboard={leaderboard}
                    myUserId={null}
                    totalQuestions={totalQuestions}
                    compact
                  />
                )}
              </div>
            </Card>

            {/* Quick stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{/* responsive: stack on mobile */}
              <Card className="border-amber-200/60 shadow-sm">
                <CardContent className="p-4 text-center">
                  <Users className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                  <p className="text-2xl font-bold text-amber-900 tabular-nums">{participants.length}</p>
                  <p className="text-[10px] text-amber-700/50 font-semibold uppercase tracking-wide">Players</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200/60 shadow-sm">
                <CardContent className="p-4 text-center">
                  <Zap className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                  <p className="text-2xl font-bold text-amber-900 tabular-nums">
                    {currentQuestion ? currentQuestion.questionIndex + 1 : 0}/{totalQuestions}
                  </p>
                  <p className="text-[10px] text-amber-700/50 font-semibold uppercase tracking-wide">Questions</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
