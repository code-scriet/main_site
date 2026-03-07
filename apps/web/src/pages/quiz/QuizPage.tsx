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

import { QuizLobby } from './QuizLobby';
import { QuizQuestion } from './QuizQuestion';
import { QuizResultReveal } from './QuizResultReveal';
import { QuizLeaderboard } from './QuizLeaderboard';
import { QuizAdminPanel } from './QuizAdminPanel';
import { QuizHostView } from './QuizHostView';
import { QuizFinaleIntro } from './QuizFinaleIntro';
import { Loader2, WifiOff, ArrowLeft, AlertCircle, Lock, Check, Share2 } from 'lucide-react';
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
  const [showFinaleIntro, setShowFinaleIntro] = useState(false);
  const [finaleShown, setFinaleShown] = useState(false);

  useEffect(() => {
    if (quizStatus === 'finished' && !finaleShown) {
      setShowFinaleIntro(true);
      setFinaleShown(true);
      const timer = setTimeout(() => setShowFinaleIntro(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [quizStatus, finaleShown]);

  // Set user ID in store
  useEffect(() => {
    if (user?.id) setMyUserId(user.id);
  }, [user?.id, setMyUserId]);

  useEffect(() => {
    if (!quizId) return;
    setAccessChecking(true);

    const checkAccess = async () => {
      let resolvedToken: string | null = null;
      let resolvedHost = false;
      const participantToken = sessionStorage.getItem(`quiz_access_token_${quizId}`);

      // Privileged users can request host token (server-verified).
      if (user && ['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(user.role || '')) {
        try {
          const token = localStorage.getItem('token');
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
          const res = await fetch(`${apiUrl}/quiz/${quizId}/check-host`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();

          if (data.success && data.data?.isHost && data.data?.quizAccessToken) {
            resolvedToken = data.data.quizAccessToken;
            resolvedHost = true;
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

    checkAccess();
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
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="text-center space-y-4 p-8 max-w-sm">
            <AlertCircle className="h-12 w-12 mx-auto text-red-400" />
            <h2 className="text-xl font-bold text-gray-700">Cannot Join Quiz</h2>
            <p className="text-sm text-gray-500">{quizError.message}</p>
            <Button onClick={() => navigate('/quiz')} className="bg-amber-600 hover:bg-amber-700">
              Back to Quizzes
            </Button>
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
              <QuizLobby />
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
              {showFinaleIntro && <QuizFinaleIntro title={title || 'Quiz'} totalQuestions={totalQuestions} />}
              {!showFinaleIntro && (
                <FinalResults userId={user?.id ?? ''} leaderboard={leaderboard} totalQuestions={totalQuestions} title={title || 'Quiz'} />
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
import { Home, LayoutDashboard } from 'lucide-react';
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
  leaderboard,
  totalQuestions,
  title,
}: {
  userId: string;
  leaderboard: LeaderboardEntry[];
  totalQuestions: number;
  title: string;
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
              <div className="grid grid-cols-3 gap-3 mt-4">
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

      {/* Back buttons */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Button
          onClick={() => navigate('/dashboard')}
          variant="outline"
          size="lg"
        >
          <LayoutDashboard className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <Button
          onClick={() => navigate('/quiz')}
          className="bg-amber-600 hover:bg-amber-700"
          size="lg"
        >
          <Home className="h-4 w-4 mr-2" />
          Back to Quizzes
        </Button>
      </div>
    </motion.div>
  );
}
