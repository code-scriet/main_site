/**
 * ActiveQuizList — The main quiz hub page.
 * Users MUST enter PIN to join - no direct quiz access.
 * Admins have a separate management section for their quizzes.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, type QuizAdminSummary } from '@/lib/api';
import {
  Plus,
  Play,
  Users,
  Loader2,
  Zap,
  BookOpen,
  Settings,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Clock,
  Trophy,
  History,
  BarChart3,
  Eye,
  Copy,
  RefreshCw,
  FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { persistQuizAccessToken, storePendingQuizJoin } from '@/lib/quizAccess';
import { toast } from 'sonner';

interface QuizHistoryItem {
  quizId: string;
  title: string;
  endedAt: string | null;
  finalRank: number | null;
  finalScore: number;
  correctCount: number;
  questionCount: number;
  totalParticipants: number;
  joinedMidQuiz: boolean;
}

// Status filter options for admin quiz list (#48 — was MISSING)
const STATUS_FILTERS = ['ALL', 'DRAFT', 'WAITING', 'ACTIVE', 'FINISHED', 'ABANDONED'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function ActiveQuizList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('join');
  const [adminQuizzes, setAdminQuizzes] = useState<QuizAdminSummary[]>([]);
  const [myHistory, setMyHistory] = useState<QuizHistoryItem[]>([]);
  const [liveQuizCount, setLiveQuizCount] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [copiedPin, setCopiedPin] = useState<string | null>(null);
  const [quizToDelete, setQuizToDelete] = useState<QuizAdminSummary | null>(null);

  // PIN entry state
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState<{ quizId: string; title: string } | null>(null);
  const [pinPasteNotice, setPinPasteNotice] = useState('');

  const isAdmin = Boolean(user?.role && ['ADMIN', 'PRESIDENT', 'CORE_MEMBER'].includes(user.role));

  // Filtered admin quizzes (#48)
  const filteredAdminQuizzes = useMemo(() => {
    if (statusFilter === 'ALL') return adminQuizzes;
    return adminQuizzes.filter((q) => q.status === statusFilter);
  }, [adminQuizzes, statusFilter]);

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    adminQuizzes.forEach((q) => {
      counts[q.status] = (counts[q.status] || 0) + 1;
    });
    return counts;
  }, [adminQuizzes]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setHistoryLoading(true);
    try {
      const data = await api.getMyQuizDashboard(token);
      setLiveQuizCount(data.liveQuizzes.length);
      setMyHistory(data.history);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load your quiz dashboard');
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  const fetchAdminQuizzes = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const data = await api.getQuizAdminList(token);
      setAdminQuizzes(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load your quizzes');
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setLiveQuizCount(0);
      setMyHistory([]);
      return;
    }

    void fetchDashboardData();
    if (isAdmin) {
      void fetchAdminQuizzes();
    }
  }, [fetchAdminQuizzes, fetchDashboardData, isAdmin, user]);

  // PIN input handlers
  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only digits
    const newPin = [...pin];
    newPin[index] = value.slice(-1); // Only last character
    setPin(newPin);
    setJoinError('');
    setJoinSuccess(null);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const prevInput = document.getElementById(`pin-${index - 1}`);
      prevInput?.focus();
    }
    if (e.key === 'Enter' && pin.every(d => d)) {
      handleJoinByPin();
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    const pasted = digits.slice(0, 6);
    if (digits.length > 6) {
      setPinPasteNotice('PIN was trimmed to the first 6 digits.');
    } else {
      setPinPasteNotice('');
    }
    if (pasted.length === 6) {
      setPin(pasted.split(''));
    }
  };

  const handleJoinByPin = async () => {
    const pinStr = pin.join('');
    if (pinStr.length !== 6) {
      setJoinError('Please enter all 6 digits');
      return;
    }

    setJoinError('');
    setJoinLoading(true);

    try {
      const token = localStorage.getItem('token');
      const data = await api.joinQuizByPin(pinStr, token ?? undefined);

      if (!data.quizAccessToken) {
        setJoinError('Failed to issue secure quiz access token. Please try again.');
        return;
      }

      // Store server-minted access token for secure socket join.
      persistQuizAccessToken(data.quizId, data.quizAccessToken);
      storePendingQuizJoin({
        quizId: data.quizId,
        quizAccessToken: data.quizAccessToken,
      });
      
      setJoinSuccess({ quizId: data.quizId, title: data.title });
      
      // Navigate after brief success display
      setTimeout(() => {
        navigate(`/quiz/${data.quizId}`);
      }, 500);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Connection failed. Check your internet and try again.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleDelete = async (quizId: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You need to sign in again to delete quizzes');
      return;
    }

    try {
      await api.deleteQuiz(quizId, token);
      setAdminQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      setQuizToDelete(null);
      toast.success('Quiz deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete quiz');
    }
  };

  const handleOpenQuiz = async (quizId: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You need to sign in again to open quizzes');
      return;
    }

    try {
      await api.openQuiz(quizId, token);
      navigate(`/quiz/${quizId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to open quiz');
    }
  };

  const copyPin = async (pinToCopy: string) => {
    try {
      await navigator.clipboard.writeText(pinToCopy);
      setCopiedPin(pinToCopy);
      setTimeout(() => setCopiedPin(null), 1500);
    } catch {
      toast.error('Failed to copy the PIN');
    }
  };

  // Export quiz history as CSV (#52 partial — user-side)
  const exportHistoryCSV = () => {
    if (myHistory.length === 0) return;
    const header = 'Title,Date,Rank,Score,Correct,Total Questions,Total Players,Joined Mid-Quiz\n';
    const rows = myHistory.map((h) =>
      `"${h.title}",${h.endedAt ? new Date(h.endedAt).toLocaleDateString() : '-'},${h.finalRank || '-'},${h.finalScore},${h.correctCount},${h.questionCount},${h.totalParticipants},${h.joinedMidQuiz}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `quiz-history-${Date.now()}.csv`;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Status badge styling — per opus4.6.md spec
  const statusConfig: Record<string, { classes: string; dot?: boolean }> = {
    DRAFT: { classes: 'bg-gray-100 text-gray-600 border-gray-300' },
    WAITING: { classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    ACTIVE: { classes: 'bg-green-50 text-green-700 border-green-200', dot: true },
    FINISHED: { classes: 'bg-purple-50 text-purple-700 border-purple-200' },
    ABANDONED: { classes: 'bg-red-50 text-red-700 border-red-200' },
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Zap className="h-9 w-9" />
            </div>
            <h1 className="text-4xl font-bold font-display tracking-tight mb-2">Live Quizzes</h1>
            <p className="text-amber-100 text-lg">
              Enter the 6-digit PIN from your host to join
            </p>
            {liveQuizCount > 0 && (
              <Badge className="mt-3 bg-white/20 text-white border-white/30 backdrop-blur-sm">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                {liveQuizCount} quiz{liveQuizCount !== 1 ? 'zes' : ''} live now
              </Badge>
            )}
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8">
        {/* PIN Entry Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="shadow-xl border-amber-200/60 mb-8 overflow-hidden">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold font-display text-amber-900 tracking-tight mb-1">Enter Game PIN</h2>
                <p className="text-amber-700/50 text-sm">Ask your host for the 6-digit code</p>
              </div>

              {/* 6-digit PIN input */}
              <div className="flex justify-center gap-2 sm:gap-3 mb-6">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    id={`pin-${i}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(i, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                    onPaste={i === 0 ? handlePinPaste : undefined}
                    className={cn(
                      'w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-bold font-mono rounded-xl border-2 transition-all duration-200',
                      'focus:outline-none focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400',
                      digit ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-amber-200 bg-white text-amber-900',
                    )}
                  />
                ))}
              </div>

              {/* Error / success messages */}
              <AnimatePresence>
                {pinPasteNotice && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 text-amber-700 text-sm mb-4"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {pinPasteNotice}
                  </motion.div>
                )}
                {joinError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 text-red-600 text-sm mb-4"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {joinError}
                  </motion.div>
                )}
                {joinSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center gap-2 text-green-600 text-sm mb-4"
                  >
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    Joining &ldquo;{joinSuccess.title}&rdquo;…
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Join button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleJoinByPin}
                  disabled={joinLoading || pin.some(d => !d)}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white px-12 py-6 text-lg font-bold rounded-xl shadow-lg shadow-amber-500/20 transition-all duration-300 active:scale-[0.98]"
                  size="lg"
                >
                  {joinLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Play className="h-5 w-5 mr-2" />
                  )}
                  Join Quiz
                </Button>
              </div>

              <p className="text-xs text-amber-700/40 text-center mt-4">
                The PIN is shown on your host's screen or in their invitation
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs for History / Admin */}
        {user && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
            <TabsList className="w-full justify-start bg-white border border-amber-200/60 p-1 rounded-xl shadow-sm">
              <TabsTrigger value="join" className="flex-1 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 rounded-lg transition-all">
                <Play className="h-4 w-4 mr-2" />
                Join
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 rounded-lg transition-all">
                <History className="h-4 w-4 mr-2" />
                My History
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="manage" className="flex-1 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-900 rounded-lg transition-all">
                  <Settings className="h-4 w-4 mr-2" />
                  My Quizzes
                </TabsTrigger>
              )}
            </TabsList>

            {/* Join Tab - info */}
            <TabsContent value="join" className="mt-6">
              <Card className="border-amber-200/60">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                    <BookOpen className="h-6 w-6 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold font-display text-amber-900 mb-3">How to Join a Quiz</h3>
                  <ol className="text-sm text-amber-800/70 text-left max-w-md mx-auto space-y-2.5">
                    {['Get the 6-digit PIN from your quiz host', 'Enter the PIN in the boxes above', 'Click "Join Quiz" and wait in the lobby', 'Answer questions as they appear!'].map((text, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-semibold">
                          {i + 1}
                        </span>
                        {text}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-6">
              <Card className="border-amber-200/60 overflow-hidden">
                <div className="p-4 border-b border-amber-100 flex items-center justify-between">
                  <h3 className="font-semibold font-display text-amber-900 flex items-center gap-2 tracking-tight">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Quiz History
                  </h3>
                  <div className="flex items-center gap-1">
                    {myHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={exportHistoryCSV}
                        className="text-amber-700/50 hover:text-amber-700 h-8"
                        title="Export history as CSV"
                        aria-label="Export quiz history as CSV"
                      >
                        <FileDown className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => void fetchDashboardData()} className="h-8" aria-label="Refresh quiz history">
                      <RefreshCw className={cn('h-4 w-4 text-amber-700/50', historyLoading && 'animate-spin')} />
                    </Button>
                  </div>
                </div>

                {historyLoading ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
                  </div>
                ) : myHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <History className="h-12 w-12 mx-auto text-amber-300 mb-3" />
                    <p className="text-amber-800/80 font-medium">No quiz history yet</p>
                    <p className="text-sm text-amber-700/40 mt-1">Join a quiz to see your results here</p>
                  </div>
                ) : (
                  <div className="divide-y divide-amber-100">
                    {myHistory.map((item, i) => (
                      <motion.div
                        key={item.quizId}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="p-4 hover:bg-amber-50/50 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-amber-900 truncate">{item.title}</h4>
                              {item.joinedMidQuiz && (
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 px-1.5 py-0 flex-shrink-0">
                                  Late join
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-amber-700/50">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {item.endedAt ? new Date(item.endedAt).toLocaleDateString() : 'Pending'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {item.totalParticipants} players
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 ml-2">
                            <div className="text-right">
                              <div className="text-lg font-bold font-display text-amber-800 tabular-nums">
                                #{item.finalRank || '—'}
                              </div>
                              <div className="text-[10px] text-amber-700/50 tabular-nums">
                                {item.finalScore} pts
                              </div>
                            </div>
                            <div className="w-px h-6 bg-amber-200 hidden sm:block" />
                            <div className="text-right hidden sm:block">
                              <div className="font-semibold text-sm text-green-600 tabular-nums">
                                {item.correctCount}/{item.questionCount}
                              </div>
                              <div className="text-[10px] text-amber-700/50">correct</div>
                            </div>
                            {/* #46 — Clearly labeled "View Results" link */}
                            <Link to={`/quiz/${item.quizId}/results`}>
                              <Button variant="outline" size="sm" className="border-amber-200 text-amber-700 hover:bg-amber-50 h-8 text-xs gap-1">
                                <Eye className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Results</span>
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Admin Manage Tab */}
            {isAdmin && (
              <TabsContent value="manage" className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold font-display text-amber-900 flex items-center gap-2 tracking-tight">
                    <Settings className="h-5 w-5 text-amber-500" />
                    Your Quizzes
                  </h3>
                  <Button asChild className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-md shadow-amber-500/20">
                    <Link to="/quiz/create">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Quiz
                    </Link>
                  </Button>
                </div>

                {/* Status filter tabs (#48 — was MISSING) */}
                {adminQuizzes.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {STATUS_FILTERS.filter(f => f === 'ALL' || statusCounts[f]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        className={cn(
                          'px-3 py-1 rounded-full text-xs font-semibold border transition-all duration-200 whitespace-nowrap',
                          statusFilter === filter
                            ? 'bg-amber-100 border-amber-300 text-amber-800'
                            : 'bg-white border-amber-200/60 text-amber-700/50 hover:border-amber-300 hover:text-amber-700',
                        )}
                      >
                        {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
                        {filter === 'ALL' ? (
                          <span className="ml-1.5 text-amber-700/40">{adminQuizzes.length}</span>
                        ) : statusCounts[filter] ? (
                          <span className="ml-1.5 text-amber-700/40">{statusCounts[filter]}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}

                {adminQuizzes.length === 0 ? (
                  <Card className="border-amber-200/60">
                    <CardContent className="p-8 text-center">
                      <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                        <BookOpen className="h-6 w-6 text-amber-500" />
                      </div>
                      <p className="text-amber-800/80 font-medium">No quizzes created yet</p>
                      <Button asChild className="mt-4 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700">
                        <Link to="/quiz/create">Create Your First Quiz</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : filteredAdminQuizzes.length === 0 ? (
                  <Card className="border-amber-200/60">
                    <CardContent className="p-6 text-center">
                      <p className="text-amber-700/50 text-sm">No quizzes with status "{statusFilter.toLowerCase()}"</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredAdminQuizzes.map((quiz, i) => (
                      <motion.div
                        key={quiz.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                      >
                        <Card className="border-amber-200/60 hover:shadow-md transition-shadow duration-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-amber-900 truncate">{quiz.title}</span>
                                  {/* Status badge — per spec: ACTIVE gets pulsing dot */}
                                  <Badge variant="outline" className={cn('text-[10px] border', statusConfig[quiz.status]?.classes || 'bg-gray-100 text-gray-600 border-gray-300')}>
                                    {statusConfig[quiz.status]?.dot && (
                                      <span className="relative flex h-1.5 w-1.5 mr-1">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                                      </span>
                                    )}
                                    {quiz.status}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-amber-700/50 flex-wrap">
                                  <span>{quiz.questionCount} questions</span>
                                  {quiz._count && (
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {quiz._count.participants}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(quiz.createdAt).toLocaleDateString()}
                                  </span>
                                  {/* PIN display — bold monospace (#41) */}
                                  {quiz.pin && (quiz.status === 'WAITING' || quiz.status === 'ACTIVE') && (
                                    <button
                                      onClick={() => copyPin(quiz.pin!)}
                                      className="flex items-center gap-1 font-mono font-bold text-amber-800 bg-amber-100 rounded-md px-2 py-0.5 hover:bg-amber-200 transition-colors"
                                      aria-label={`Copy PIN ${quiz.pin} for ${quiz.title}`}
                                    >
                                      PIN: {quiz.pin}
                                      {copiedPin === quiz.pin ? (
                                        <CheckCircle className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                {quiz.status === 'DRAFT' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenQuiz(quiz.id)}
                                    className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                                  >
                                    <Play className="h-3 w-3 mr-1" />
                                    Open
                                  </Button>
                                )}
                                {(quiz.status === 'WAITING' || quiz.status === 'ACTIVE') && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(`/quiz/${quiz.id}`)}
                                    className="border-amber-300 text-amber-700 hover:bg-amber-50 h-8 text-xs"
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Enter
                                  </Button>
                                )}
                                {quiz.status === 'FINISHED' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    asChild
                                    className="border-purple-200 text-purple-700 hover:bg-purple-50 h-8 text-xs"
                                  >
                                    <Link to={`/quiz/${quiz.id}/results`}>
                                      <BarChart3 className="h-3 w-3 mr-1" />
                                      Results
                                    </Link>
                                  </Button>
                                )}
                                {(quiz.status === 'DRAFT' || quiz.status === 'FINISHED' || quiz.status === 'ABANDONED') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setQuizToDelete(quiz)}
                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8"
                                    aria-label={`Delete ${quiz.title}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* Not logged in message */}
        {!user && (
          <Card className="border-amber-200/60 mb-8">
            <CardContent className="p-6 text-center">
              <Users className="h-10 w-10 mx-auto text-amber-400 mb-3" />
              <p className="text-amber-800/80 mb-3">Sign in to track your quiz history and scores</p>
              <Button asChild variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                <Link to="/signin">Sign In</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={Boolean(quizToDelete)} onOpenChange={(open) => !open && setQuizToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              {quizToDelete
                ? `Delete "${quizToDelete.title}" permanently? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
              onClick={() => {
                if (quizToDelete) {
                  void handleDelete(quizToDelete.id);
                }
              }}
            >
              Delete Quiz
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </Layout>
  );
}
