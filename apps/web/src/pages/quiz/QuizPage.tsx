/**
 * QuizPage — the state machine parent.
 * Switches between Lobby → Question+Timer → ResultReveal → FinalLeaderboard
 * based on quizStatus from the Zustand store. All socket work delegated to useQuizSocket.
 * 
 * ACCESS RULES:
 * - HOSTS (quiz creators, admins, core members) bypass PIN and see HOST MODE (control only)
 * - PARTICIPANTS must enter PIN and see PLAYER MODE (question answering)
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuizSocket } from '@/hooks/useQuizSocket';
import { useQuizStore } from '@/lib/quizStore';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { clearQuizAccessToken, readQuizAccessToken, restorePendingQuizJoin } from '@/lib/quizAccess';
import { api } from '@/lib/api';

import { QuizLobby } from './QuizLobby';
import { QuizQuestion } from './QuizQuestion';
import { QuizResultReveal } from './QuizResultReveal';
import { QuizLeaderboard } from './QuizLeaderboard';
import { QuizAdminPanel } from './QuizAdminPanel';
import { QuizHostView } from './QuizHostView';
import { QuizFinaleIntro } from './QuizFinaleIntro';
import { Loader2, WifiOff, ArrowLeft, AlertCircle, Lock, Check, Share2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function QuizPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Access verification states
  const [accessChecking, setAccessChecking] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [isHost, setIsHost] = useState(false); // Host sees control panel only, doesn't play
  const [quizAccessToken, setQuizAccessToken] = useState<string | null>(null);

  const { joinQuiz, joinAsHost, submitAnswer, nextQuestion, startQuiz, endQuiz, kickPlayer, pauseQuiz, resumeQuiz, extendTime, skipQuestion } = useQuizSocket();

  const quizStatus = useQuizStore((s) => s.quizStatus);
  const socketStatus = useQuizStore((s) => s.socketStatus);
  const isAdmin = useQuizStore((s) => s.isAdmin);
  const title = useQuizStore((s) => s.title);
  const leaderboard = useQuizStore((s) => s.leaderboard);
  const totalQuestions = useQuizStore((s) => s.totalQuestions);
  const storeQuizId = useQuizStore((s) => s.quizId);
  const quizError = useQuizStore((s) => s.quizError);
  const kicked = useQuizStore((s) => s.kicked);
  const reset = useQuizStore((s) => s.reset);
  const setMyUserId = useQuizStore((s) => s.setMyUserId);

  // Finale intro state: show 2s splash before leaderboard
  const [finaleState, setFinaleState] = useState<'hidden' | 'showing' | 'shown'>('hidden');
  const [finalRedirectState, setFinalRedirectState] = useState<'idle' | 'navigating' | 'error'>('idle');

  useEffect(() => {
    if (quizStatus === 'finished' && finaleState === 'hidden') {
      const showTimer = window.setTimeout(() => setFinaleState('showing'), 0);
      const doneTimer = window.setTimeout(() => setFinaleState('shown'), 2000);
      return () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(doneTimer);
      };
    }
    if (quizStatus !== 'finished' && finaleState !== 'hidden') {
      const resetTimer = window.setTimeout(() => setFinaleState('hidden'), 0);
      return () => window.clearTimeout(resetTimer);
    }
  }, [quizStatus, finaleState]);

  // Set user ID in store
  useEffect(() => {
    if (user?.id) setMyUserId(user.id);
  }, [user?.id, setMyUserId]);

  useEffect(() => {
    if (!quizId) return;

    const checkAccess = async () => {
      setAccessChecking(true);
      let resolvedToken: string | null = null;
      let resolvedHost = false;
      const restoredPendingToken = restorePendingQuizJoin(quizId);
      const participantToken = restoredPendingToken ?? readQuizAccessToken(quizId);

      // Privileged users can request host token (server-verified).
      if (user && ['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(user.role || '')) {
        try {
          const token = localStorage.getItem('token');
          if (token) {
            const data = await api.checkQuizHost(quizId, token);
            if (data.isHost && data.quizAccessToken) {
              resolvedToken = data.quizAccessToken;
              resolvedHost = true;
            }
          }
        } catch {
          // Fallback to participant token below.
        }
      }

      // Participant token is minted by POST /quiz/join and persisted in session storage.
      if (!resolvedToken && participantToken) {
        resolvedToken = participantToken;
        resolvedHost = false;
      }

      setQuizAccessToken(resolvedToken);
      setIsHost(resolvedHost);
      setAccessGranted(Boolean(resolvedToken));
      setAccessChecking(false);
    };

    void checkAccess();
  }, [quizId, user]);

  // Join quiz once socket connects and access is granted
  useEffect(() => {
    if (quizId && socketStatus === 'connected' && accessGranted && quizAccessToken) {
      if (isHost && joinAsHost) {
        joinAsHost(quizId, quizAccessToken); // Host mode - observe only
      } else {
        joinQuiz(quizId, quizAccessToken); // Participant mode
      }
    }
  }, [quizId, socketStatus, accessGranted, isHost, quizAccessToken, joinQuiz, joinAsHost]);

  // Participant auto-redirect to detailed results once quiz is finished.
  useEffect(() => {
    if (isHost || !quizId || quizStatus !== 'finished') return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      if (cancelled) return;
      setFinalRedirectState('navigating');
      try {
        const token = localStorage.getItem('token');
        await api.getQuizResults(quizId, token || undefined);
        if (!cancelled) {
          navigate(`/quiz/${quizId}/results`, { replace: true });
          return;
        }
      } catch {
        // Fallback below.
      }
      if (!cancelled) {
        setFinalRedirectState('error');
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      setFinalRedirectState('idle');
    };
  }, [isHost, quizId, quizStatus, navigate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Handlers
  const handleSubmitAnswer = (answer: string, questionId: string) => {
    if (storeQuizId) submitAnswer(storeQuizId, answer, questionId);
  };

  const handleStartQuiz = () => {
    if (storeQuizId) startQuiz(storeQuizId);
  };

  const handleNextQuestion = () => {
    if (storeQuizId) nextQuestion(storeQuizId);
  };

  const handleEndQuiz = () => {
    if (storeQuizId) endQuiz(storeQuizId);
  };

  const handleKickPlayer = (userId: string) => {
    if (storeQuizId) kickPlayer(storeQuizId, userId);
  };

  const handlePauseQuiz = () => {
    if (storeQuizId) pauseQuiz(storeQuizId);
  };

  const handleResumeQuiz = () => {
    if (storeQuizId) resumeQuiz(storeQuizId);
  };

  const handleExtendTime = (seconds: number) => {
    if (storeQuizId) extendTime(storeQuizId, seconds);
  };

  const handleSkipQuestion = () => {
    if (storeQuizId) skipQuestion(storeQuizId);
  };

  const handleDiscardQuiz = useCallback(() => {
    if (quizId) {
      clearQuizAccessToken(quizId);
    }
    setQuizAccessToken(null);
    setAccessGranted(false);
    setIsHost(false);
    setFinaleState('hidden');
    reset();
    navigate('/quiz');
  }, [quizId, navigate, reset]);

  // =====================================================
  // ACCESS STATES (must be after all hooks)
  // =====================================================
  
  // Still checking access
  if (accessChecking) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4">
            <Loader2 className="h-10 w-10 mx-auto text-amber-600 animate-spin" />
            <p className="text-gray-600">Verifying access...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Access denied - show PIN required
  if (!accessGranted) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6 p-8 max-w-md bg-white rounded-2xl shadow-xl border border-amber-200"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <Lock className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Access Token Required</h2>
            <p className="text-gray-600">
              Join from the quiz hub using the PIN so we can issue a secure access token.
            </p>
            <Button
              onClick={() => navigate('/quiz')}
              className="bg-amber-600 hover:bg-amber-700 w-full"
              size="lg"
            >
              Go to Quiz Hub
            </Button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // Kicked state
  if (kicked) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4 p-8 max-w-sm">
            <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
            <h2 className="text-xl font-bold text-gray-700">You've been removed</h2>
            <p className="text-sm text-gray-500">The host removed you from this quiz.</p>
            <Button onClick={() => navigate('/quiz')} className="bg-amber-600 hover:bg-amber-700">
              Back to Quizzes
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Connection states
  if (socketStatus === 'disconnected') {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4 p-8">
            <WifiOff className="h-12 w-12 mx-auto text-gray-400" />
            <h2 className="text-xl font-bold text-gray-700">Disconnected</h2>
            <p className="text-sm text-gray-500">Attempting to reconnect...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (quizError) {
    const canViewResults =
      Boolean(quizId) &&
      (quizError.code === 'QUIZ_ENDED' || quizError.message.toLowerCase().includes('ended'));
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4 p-8 max-w-sm">
            <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
            <h2 className="text-xl font-bold text-gray-700">Cannot Join Quiz</h2>
            <p className="text-sm text-gray-500">{quizError.message}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {canViewResults && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/quiz/${quizId}/results`)}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  View Results
                </Button>
              )}
              <Button onClick={() => navigate('/quiz')} className="bg-amber-600 hover:bg-amber-700">
                Back to Quizzes
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (socketStatus === 'connecting' || quizStatus === 'idle' || quizStatus === 'joining') {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4 p-8">
            <Loader2 className="h-10 w-10 mx-auto text-amber-600 animate-spin" />
            <h2 className="text-lg font-medium text-gray-700">
              {isHost ? 'Opening host controls...' : 'Joining quiz...'}
            </h2>
            {!isHost && (
              <Button
                variant="outline"
                onClick={handleDiscardQuiz}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                aria-label="Discard this quiz and return to the quiz hub"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Discard Quiz
              </Button>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // =====================================================
  // HOST MODE - Admin/Creator sees control panel only
  // =====================================================
  if (isHost) {
    return (
      <Layout>
        <QuizHostView
          onStartQuiz={handleStartQuiz}
          onNextQuestion={handleNextQuestion}
          onEndQuiz={handleEndQuiz}
          onKickPlayer={handleKickPlayer}
          onPauseQuiz={handlePauseQuiz}
          onResumeQuiz={handleResumeQuiz}
          onExtendTime={handleExtendTime}
          onSkipQuestion={handleSkipQuestion}
        />
      </Layout>
    );
  }

  // =====================================================
  // PARTICIPANT MODE - Players see question and answer
  // =====================================================
  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      {/* Top bar */}
      <div className="sticky top-under-header z-40 bg-white/80 backdrop-blur-md border-b border-amber-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/quiz')}
            className="text-gray-600"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-bold text-amber-900 truncate max-w-[50%]">{title}</h1>
          <div className="w-16" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Main content area */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {quizStatus === 'lobby' && (
            <motion.div key="lobby" exit={{ opacity: 0, y: -20 }}>
              <QuizLobby onDiscardQuiz={!isHost ? handleDiscardQuiz : undefined} />
            </motion.div>
          )}

          {quizStatus === 'question' && (
            <motion.div key="question" exit={{ opacity: 0, y: -20 }}>
              <QuizQuestion onSubmitAnswer={handleSubmitAnswer} />
            </motion.div>
          )}

          {quizStatus === 'revealing' && user && (
            <motion.div key="reveal" exit={{ opacity: 0, y: -20 }}>
              <QuizResultReveal userId={user.id} />
            </motion.div>
          )}

          {quizStatus === 'paused' && (
            <motion.div
              key="paused"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-lg mx-auto text-center space-y-4 py-16"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Loader2 className="h-16 w-16 mx-auto text-amber-500" />
              </motion.div>
              <h2 className="text-2xl font-bold text-amber-900">Quiz Paused</h2>
              <p className="text-gray-600">The host has paused the quiz. Hang tight!</p>
            </motion.div>
          )}

          {quizStatus === 'finished' && (
            <motion.div key="finished" exit={{ opacity: 0, y: -20 }}>
              {finaleState === 'showing' && (
                <QuizFinaleIntro
                  title={title || 'Quiz'}
                  totalQuestions={totalQuestions}
                  onDismiss={() => setFinaleState('shown')}
                />
              )}
              {finaleState !== 'showing' && (
                <FinalResults
                  userId={user?.id ?? ''}
                  quizId={quizId || ''}
                  isHost={isHost}
                  leaderboard={leaderboard}
                  totalQuestions={totalQuestions}
                  title={title || 'Quiz'}
                  redirectState={finalRedirectState}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Admin floating panel */}
      {isAdmin && (quizStatus === 'lobby' || quizStatus === 'question' || quizStatus === 'revealing' || quizStatus === 'paused') && (
        <QuizAdminPanel
          onStartQuiz={handleStartQuiz}
          onNextQuestion={handleNextQuestion}
          onEndQuiz={handleEndQuiz}
          onKickPlayer={handleKickPlayer}
          onPauseQuiz={handlePauseQuiz}
          onResumeQuiz={handleResumeQuiz}
          onExtendTime={handleExtendTime}
          onSkipQuestion={handleSkipQuestion}
        />
      )}
      </div>
    </Layout>
  );
}

/* ---------- Final results view ---------- */

import type { LeaderboardEntry } from '@/lib/quizStore';
import { Home, LayoutDashboard, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getContextualMessage(rank: number, total: number): { emoji: string; text: string } {
  if (rank <= 3) return { emoji: '🏆', text: 'Podium finish! Outstanding performance.' };
  if (rank <= Math.ceil(total * 0.25)) return { emoji: '🎯', text: 'Great result! You were in the top quarter.' };
  if (rank <= Math.ceil(total * 0.5)) return { emoji: '💪', text: 'Above average — solid showing.' };
  return { emoji: '📚', text: 'Better luck next time!' };
}

function FinalResults({
  userId,
  quizId,
  isHost,
  leaderboard,
  totalQuestions,
  title,
  redirectState,
}: {
  userId: string;
  quizId: string;
  isHost: boolean;
  leaderboard: LeaderboardEntry[];
  totalQuestions: number;
  title: string;
  redirectState?: 'idle' | 'navigating' | 'error';
}) {
  const navigate = useNavigate();
  const myEntry = leaderboard.find((e) => e.userId === userId);
  const [copied, setCopied] = useState(false);

  const handleCopyResult = useCallback(async () => {
    if (!myEntry) return;
    const text = `I scored ${myEntry.score} pts and ranked ${ordinal(myEntry.rank)}/${leaderboard.length} in "${title}" 🧠`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [myEntry, leaderboard.length, title]);

  const contextMsg = myEntry ? getContextualMessage(myEntry.rank, leaderboard.length) : null;
  const accuracy = myEntry && totalQuestions > 0 ? Math.round((myEntry.correctCount / totalQuestions) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6"
    >
      {/* Personal result card */}
      {myEntry && contextMsg && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-2 border-amber-300 shadow-xl overflow-hidden">
            <CardContent className="p-6 sm:p-8 bg-gradient-to-br from-amber-50 to-orange-50">
              {/* Rank + contextual message */}
              <div className="text-center mb-4">
                <p className="text-4xl mb-1">{contextMsg.emoji}</p>
                <p className="text-3xl sm:text-4xl font-black text-amber-900 tabular-nums font-display">
                  {ordinal(myEntry.rank)}
                </p>
                <p className="text-sm text-amber-700/60 font-medium">out of {leaderboard.length} players</p>
                <p className="text-sm text-amber-800 mt-1 font-medium">{contextMsg.text}</p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">{/* responsive: stack on mobile */}
                <div className="text-center p-3 bg-white/60 rounded-xl">
                  <p className="text-2xl font-black text-amber-800 tabular-nums">{myEntry.score}</p>
                  <p className="text-xs text-amber-700/50 font-semibold uppercase tracking-wide">Points</p>
                </div>
                <div className="text-center p-3 bg-white/60 rounded-xl">
                  <p className="text-2xl font-black text-amber-800 tabular-nums">{accuracy}%</p>
                  <p className="text-xs text-amber-700/50 font-semibold uppercase tracking-wide">Accuracy</p>
                </div>
                <div className="text-center p-3 bg-white/60 rounded-xl">
                  <p className="text-2xl font-black text-amber-800 tabular-nums">
                    {myEntry.correctCount}/{totalQuestions}
                  </p>
                  <p className="text-xs text-amber-700/50 font-semibold uppercase tracking-wide">Correct</p>
                </div>
              </div>

              {/* Share button */}
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyResult}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  {copied ? (
                    <><Check className="h-4 w-4 mr-1.5" /> Copied!</>
                  ) : (
                    <><Share2 className="h-4 w-4 mr-1.5" /> Copy Result</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <QuizLeaderboard
        leaderboard={leaderboard}
        myUserId={userId}
        totalQuestions={totalQuestions}
      />

      {/* Redirect / navigation */}
      <div className="pt-4 flex flex-col items-center gap-3">
        <Button
          onClick={() => navigate(`/quiz/${quizId}/results`)}
          className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg px-8"
          size="lg"
        >
          View Full Results
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
        {!isHost && redirectState === 'navigating' && (
          <p className="text-xs text-amber-600/60 font-medium tabular-nums">
            Opening full results…
          </p>
        )}
        {!isHost && redirectState === 'error' && (
          <p className="text-xs text-red-600/70 font-medium">
            Auto-open failed, use “View Full Results”.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate('/dashboard')}
            variant="ghost"
            size="sm"
            className="text-amber-700/60 hover:text-amber-700"
          >
            <LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />
            Dashboard
          </Button>
          <Button
            onClick={() => navigate('/quiz')}
            variant="ghost"
            size="sm"
            className="text-amber-700/60 hover:text-amber-700"
          >
            <Home className="h-3.5 w-3.5 mr-1.5" />
            Quizzes
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
