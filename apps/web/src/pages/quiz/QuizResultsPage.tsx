/**
 * QuizResultsPage — rich analytics + leaderboard for finished quizzes.
 * Fetched via REST from /api/quiz/:quizId/results.
 */

import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { QuizLeaderboard } from './QuizLeaderboard';
import { QuizAnswerDistribution } from './QuizAnswerDistribution';
import { PollResultsView } from './PollResultsView';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/dateUtils';
import {
  Loader2, Trophy, ArrowLeft, BookOpen, Clock, Users, LayoutDashboard,
  Download, ChevronDown, ChevronUp, Target, Zap, TrendingUp, BarChart3,
  Star, AlertTriangle, CheckCircle2, Timer, Brain, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaderboardEntry } from '@/lib/quizStore';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  ScatterChart, Scatter, ZAxis, CartesianGrid, Cell,
} from 'recharts';

/* ── Types ── */

interface QuestionAnalytic {
  id: string;
  position: number;
  questionText: string;
  questionType: string;
  options: string[] | null;
  correctAnswer: string | null;
  timeLimitSeconds: number;
  points: number;
  totalAnswers: number;
  correctCount: number;
  accuracy: number;
  avgAnswerTimeMs: number;
  answerDistribution: Record<string, number>;
  avgRating: number | null;
  mostCommonWrongAnswer: string | null;
  unansweredCount: number;
  sampleResponses: string[];
}

interface Insights {
  totalParticipants: number;
  avgScore: number;
  maxPossibleScore: number;
  avgAccuracy: number;
  hardestQuestion: { position: number; questionText: string; accuracy: number } | null;
  easiestQuestion: { position: number; questionText: string; accuracy: number } | null;
  fastestQuestion: { position: number; avgTimeMs: number } | null;
  slowestQuestion: { position: number; avgTimeMs: number } | null;
  durationMs: number | null;
}

interface QuizResult {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    questionCount: number;
    status: string;
    createdAt: string;
    finishedAt: string | null;
    startedAt: string | null;
    endedAt: string | null;
    durationMs: number | null;
  };
  leaderboard: (LeaderboardEntry & { questionsAnswered?: number; joinedMidQuiz?: boolean })[];
  myResult: {
    rank: number | null;
    score: number;
    correctCount: number;
    totalAnswerTimeMs: number;
    questionsAnswered?: number;
  } | null;
  questionAnalytics: QuestionAnalytic[];
  insights: Insights;
  isCreator: boolean;
  participantAnswers: Array<{
    userId: string;
    questionId: string;
    isCorrect: boolean | null;
    answerTimeMs: number;
  }>;
}

type QuizResultPlayer = QuizResult['leaderboard'][number];

interface QuizResultsApiResponse {
  success: boolean;
  data: QuizResult;
  error?: { message?: string };
}

interface DifficultyCurvePoint {
  name: string;
  accuracy: number;
  label: string;
  avgTime: string;
  answers: number;
}

interface DifficultyCurveDotPayload {
  name?: string;
}

interface SpeedScatterPoint {
  name: string;
  accuracy: number;
  avgTimeMs: number;
  score: number;
}

/* ── Accuracy bar helper ── */
function AccuracyBar({ accuracy, className }: { accuracy: number; className?: string }) {
  const color =
    accuracy >= 80 ? 'bg-green-500' :
    accuracy >= 50 ? 'bg-amber-500' :
    'bg-red-500';
  return (
    <div className={cn('w-full h-2 bg-amber-100 rounded-full overflow-hidden', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${accuracy}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn('h-full rounded-full', color)}
      />
    </div>
  );
}

function isUnscoredQuestionType(questionType: string): boolean {
  return questionType === 'POLL' || questionType === 'RATING' || questionType === 'OPEN_ENDED';
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

/* ── Section tabs ── */
type Tab = 'overview' | 'questions' | 'leaderboard';

export default function QuizResultsPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { user } = useAuth();
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchResults = useCallback(async () => {
    if (!quizId) {
      setError('Quiz not found');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${apiUrl}/quiz/${quizId}/results`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json() as QuizResultsApiResponse;
      if (!data.success) throw new Error(data.error?.message || 'Failed to load results');
      setResult(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  const handleExport = useCallback(async () => {
    if (!quizId) return;
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const res = await fetch(`${apiUrl}/quiz/${quizId}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz_results.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  }, [quizId]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !result) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
          <Card className="border-amber-200/60 shadow-md max-w-md w-full mx-4">
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-red-600 font-medium">{error || 'Results not found'}</p>
              <div className="flex items-center justify-center gap-3">
                <Button asChild variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Link to="/dashboard">
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
                <Button asChild variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Link to="/quiz">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Quizzes
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const { quiz, leaderboard, myResult, questionAnalytics, insights, isCreator } = result;
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'questions', label: 'Questions', icon: <Brain className="h-4 w-4" /> },
    { key: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="h-4 w-4" /> },
  ];

  const scoredQuestions = questionAnalytics.filter(
    (q) => !isUnscoredQuestionType(q.questionType),
  );

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        {/* Hero header */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-amber-200/60">
          <div className="max-w-5xl mx-auto px-4 py-6">
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <Button asChild variant="ghost" size="sm" className="text-amber-700 hover:bg-amber-50">
                <Link to="/dashboard">
                  <LayoutDashboard className="h-4 w-4 mr-1" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-amber-700 hover:bg-amber-50">
                <Link to="/quiz">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Quizzes
                </Link>
              </Button>
              {isCreator && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-1" />
                  )}
                  Export Excel
                </Button>
              )}
            </div>
            <h1 className="text-2xl font-bold text-amber-900 font-display">{quiz.title}</h1>
            {quiz.description && <p className="text-amber-700/60 mt-1">{quiz.description}</p>}
            <div className="flex items-center gap-4 mt-3 text-xs font-medium text-amber-700/50 flex-wrap">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {quiz.questionCount} questions
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {insights.totalParticipants} participants
              </span>
              {insights.durationMs && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.floor(insights.durationMs / 60000)}m {Math.floor((insights.durationMs % 60000) / 1000)}s
                </span>
              )}
              {quiz.finishedAt && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(quiz.finishedAt, 'short')}
                </span>
              )}
              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 text-[10px]">
                {quiz.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Winner hero card */}
          {leaderboard[0] && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <Card className="border-amber-300/60 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 p-6 sm:p-8 text-center">
                  <Trophy className="h-10 w-10 mx-auto text-amber-500 mb-2" />
                  <h2 className="text-2xl font-bold text-amber-900 font-display">
                    {leaderboard[0].displayName}
                  </h2>
                  <p className="text-amber-700/70 font-medium">Winner with {leaderboard[0].score} points</p>
                </div>
              </Card>
            </motion.div>
          )}

          {/* My result */}
          {myResult && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-amber-200/60 shadow-md">
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold text-amber-700/50 uppercase tracking-wide mb-1">Your Result</p>
                  <p className="text-3xl font-black text-amber-900 tabular-nums font-display">
                    #{myResult.rank ?? '—'}
                  </p>
                  <div className="flex items-center justify-center gap-5 mt-3 text-sm text-amber-700/60 font-medium flex-wrap">
                    <span className="tabular-nums">{myResult.score} pts</span>
                    <span className="w-px h-4 bg-amber-200" />
                    <span className="tabular-nums">{myResult.correctCount}/{quiz.questionCount} correct</span>
                    <span className="w-px h-4 bg-amber-200" />
                    <span className="tabular-nums">{(myResult.totalAnswerTimeMs / 1000).toFixed(1)}s</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Section tabs */}
          <div
            className="flex items-center gap-1 bg-white/60 backdrop-blur-sm rounded-xl border border-amber-200/60 p-1"
            role="tablist"
            aria-label="Quiz result sections"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                aria-controls={`quiz-results-panel-${t.key}`}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-all',
                  activeTab === t.key
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                    : 'text-amber-700/60 hover:text-amber-800 hover:bg-amber-50',
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                id="quiz-results-panel-overview"
                role="tabpanel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* Stat cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <Users className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-2xl font-black text-amber-900 tabular-nums font-display">
                        {insights.totalParticipants}
                      </p>
                      <p className="text-[11px] font-medium text-amber-700/50 uppercase tracking-wide">Participants</p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <TrendingUp className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-2xl font-black text-amber-900 tabular-nums font-display">
                        {insights.avgScore}<span className="text-sm font-medium text-amber-700/40">/{insights.maxPossibleScore}</span>
                      </p>
                      <p className="text-[11px] font-medium text-amber-700/50 uppercase tracking-wide">Avg Score</p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <Target className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-2xl font-black text-amber-900 tabular-nums font-display">
                        {insights.avgAccuracy}%
                      </p>
                      <p className="text-[11px] font-medium text-amber-700/50 uppercase tracking-wide">Avg Accuracy</p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-4 text-center">
                      <Timer className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-2xl font-black text-amber-900 tabular-nums font-display">
                        {insights.durationMs
                          ? `${Math.floor(insights.durationMs / 60000)}:${String(Math.floor((insights.durationMs % 60000) / 1000)).padStart(2, '0')}`
                          : '—'}
                      </p>
                      <p className="text-[11px] font-medium text-amber-700/50 uppercase tracking-wide">Duration</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Insight cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {insights.hardestQuestion && (
                    <Card className="border-red-200/60 bg-red-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                            <AlertTriangle className="h-4.5 w-4.5 text-red-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-red-600/70 uppercase tracking-wide mb-0.5">
                              Hardest Question
                            </p>
                            <p className="text-sm font-bold text-red-900 leading-tight truncate">
                              Q{insights.hardestQuestion.position}: {insights.hardestQuestion.questionText}
                            </p>
                            <p className="text-xs text-red-600/60 font-medium mt-0.5">
                              Only {insights.hardestQuestion.accuracy}% got it right
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {insights.easiestQuestion && (
                    <Card className="border-green-200/60 bg-green-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                            <CheckCircle2 className="h-4.5 w-4.5 text-green-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-green-600/70 uppercase tracking-wide mb-0.5">
                              Easiest Question
                            </p>
                            <p className="text-sm font-bold text-green-900 leading-tight truncate">
                              Q{insights.easiestQuestion.position}: {insights.easiestQuestion.questionText}
                            </p>
                            <p className="text-xs text-green-600/60 font-medium mt-0.5">
                              {insights.easiestQuestion.accuracy}% accuracy
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {insights.fastestQuestion && (
                    <Card className="border-blue-200/60 bg-blue-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Zap className="h-4.5 w-4.5 text-blue-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-blue-600/70 uppercase tracking-wide mb-0.5">
                              Fastest Answered
                            </p>
                            <p className="text-sm font-bold text-blue-900">
                              Question {insights.fastestQuestion.position}
                            </p>
                            <p className="text-xs text-blue-600/60 font-medium mt-0.5">
                              Avg {(insights.fastestQuestion.avgTimeMs / 1000).toFixed(1)}s per answer
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {insights.slowestQuestion && (
                    <Card className="border-purple-200/60 bg-purple-50/30 shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
                            <Timer className="h-4.5 w-4.5 text-purple-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-purple-600/70 uppercase tracking-wide mb-0.5">
                              Slowest Answered
                            </p>
                            <p className="text-sm font-bold text-purple-900">
                              Question {insights.slowestQuestion.position}
                            </p>
                            <p className="text-xs text-purple-600/60 font-medium mt-0.5">
                              Avg {(insights.slowestQuestion.avgTimeMs / 1000).toFixed(1)}s per answer
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Quick accuracy overview per question */}
                {scoredQuestions.length > 0 && (
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-5 space-y-3">
                      <h3 className="text-sm font-bold text-amber-900 font-display">
                        Accuracy by Question
                      </h3>
                      <div className="space-y-2.5">
                        {scoredQuestions.map((q) => (
                          <div key={q.id} className="flex items-center gap-3">
                            <span className="text-xs font-bold text-amber-700 w-7 text-right tabular-nums">
                              Q{q.position + 1}
                            </span>
                            <div className="flex-1">
                              <AccuracyBar accuracy={q.accuracy} />
                            </div>
                            <span className={cn(
                              'text-xs font-bold tabular-nums w-10 text-right',
                              q.accuracy >= 80 ? 'text-green-600' :
                              q.accuracy >= 50 ? 'text-amber-600' :
                              'text-red-600',
                            )}>
                              {q.accuracy}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Difficulty Curve Chart */}
                {scoredQuestions.length > 2 && (
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-bold text-amber-900 font-display mb-4">Difficulty Curve</h3>
                      <div style={{ width: '100%', height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={scoredQuestions.map<DifficultyCurvePoint>((q) => ({
                              name: `Q${q.position + 1}`,
                              accuracy: q.accuracy,
                              label: q.questionText.slice(0, 40),
                              avgTime: (q.avgAnswerTimeMs / 1000).toFixed(1),
                              answers: q.totalAnswers,
                            }))}
                            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                          >
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#92400e' }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#92400e' }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12 }}
                              formatter={(value: number | string | undefined) => [`${value ?? 0}%`, 'Accuracy']}
                              labelFormatter={(label: ReactNode) => {
                                const labelValue =
                                  typeof label === 'string' || typeof label === 'number' ? label : '';
                                const q = scoredQuestions.find(sq => `Q${sq.position + 1}` === String(labelValue));
                                return q ? q.questionText.slice(0, 60) : String(labelValue);
                              }}
                            />
                            <ReferenceLine
                              y={insights.avgAccuracy}
                              stroke="#d97706"
                              strokeDasharray="4 4"
                              label={{ value: `Avg: ${insights.avgAccuracy}%`, position: 'right', fontSize: 10, fill: '#d97706' }}
                            />
                            <Line
                              type="monotone"
                              dataKey="accuracy"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload?: DifficultyCurveDotPayload }) => {
                                if (cx == null || cy == null) return null;
                                const pointName = payload?.name;
                                const isHardest = insights.hardestQuestion?.position === scoredQuestions.find(q => `Q${q.position + 1}` === pointName)?.position;
                                const isEasiest = insights.easiestQuestion?.position === scoredQuestions.find(q => `Q${q.position + 1}` === pointName)?.position;
                                return (
                                  <circle
                                    cx={cx} cy={cy} r={isHardest || isEasiest ? 6 : 4}
                                    fill={isHardest ? '#ef4444' : isEasiest ? '#10b981' : '#6ee7b7'}
                                    stroke="white" strokeWidth={2}
                                  />
                                );
                              }}
                              animationDuration={800}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[10px] text-amber-700/40 text-center mt-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Hardest
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 ml-3 mr-1" />Easiest
                        <span className="inline-block w-6 border-t border-dashed border-amber-500 ml-3 mr-1 align-middle" />Average
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Drop-off Analysis */}
                {questionAnalytics.length > 1 && (
                  <Card className="border-amber-200/60 shadow-sm">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-bold text-amber-900 font-display mb-3">Participation Drop-off</h3>
                      <div className="space-y-2">
                        {questionAnalytics.map((q) => {
                          const participation = insights.totalParticipants > 0
                            ? Math.round((q.totalAnswers / insights.totalParticipants) * 100)
                            : 0;
                          const barColor = participation >= 90 ? 'bg-green-500' : participation >= 70 ? 'bg-amber-500' : 'bg-red-500';
                          return (
                            <div key={q.id} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-amber-700 w-7 text-right tabular-nums">Q{q.position + 1}</span>
                              <div className="flex-1 h-3 bg-amber-100 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${participation}%` }}
                                  transition={{ duration: 0.5, delay: q.position * 0.05 }}
                                  className={cn('h-full rounded-full', barColor)}
                                />
                              </div>
                              <span className={cn(
                                'text-xs font-bold tabular-nums w-10 text-right',
                                participation >= 90 ? 'text-green-600' : participation >= 70 ? 'text-amber-600' : 'text-red-600',
                              )}>{participation}%</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-amber-700/40 mt-2">
                        Shows how many participants answered each question. Drop-offs may indicate disengagement.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}

            {/* ── QUESTIONS TAB ── */}
            {activeTab === 'questions' && (
              <motion.div
                key="questions"
                id="quiz-results-panel-questions"
                role="tabpanel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {questionAnalytics.map((q) => {
                  const isExpanded = expandedQ === q.id;
                  const isUnscoredQuestion = isUnscoredQuestionType(q.questionType);
                  const isPollRating = q.questionType === 'POLL' || q.questionType === 'RATING';
                  const isOpenEnded = q.questionType === 'OPEN_ENDED';
                  return (
                    <Card key={q.id} className="border-amber-200/60 shadow-sm overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedQ(isExpanded ? null : q.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`question-details-${q.id}`}
                        className="w-full text-left p-4 flex items-start gap-3 hover:bg-amber-50/50 transition-colors"
                      >
                        {/* Question number */}
                        <div className={cn(
                          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white',
                          isOpenEnded
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                            : isPollRating
                            ? 'bg-gradient-to-br from-violet-500 to-purple-600'
                            : q.accuracy >= 80
                              ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                              : q.accuracy >= 50
                                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                                : 'bg-gradient-to-br from-red-500 to-rose-600',
                        )}>
                          {q.position + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-amber-900 leading-snug line-clamp-2">
                            {q.questionText}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="border-amber-200 text-amber-600 text-[10px] py-0 px-1.5">
                              {q.questionType.replace(/_/g, ' ')}
                            </Badge>
                            {!isUnscoredQuestion && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] py-0 px-1.5',
                                  q.accuracy > 75 ? 'border-green-300 text-green-600 bg-green-50' :
                                  q.accuracy >= 40 ? 'border-amber-300 text-amber-600 bg-amber-50' :
                                  'border-red-300 text-red-600 bg-red-50',
                                )}
                              >
                                {q.accuracy > 75 ? 'Easy' : q.accuracy >= 40 ? 'Medium' : 'Hard'}
                              </Badge>
                            )}
                            {!isUnscoredQuestion && (
                              <span className={cn(
                                'text-xs font-bold tabular-nums',
                                q.accuracy >= 80 ? 'text-green-600' :
                                q.accuracy >= 50 ? 'text-amber-600' :
                                'text-red-600',
                              )}>
                                {q.accuracy}% correct
                              </span>
                            )}
                            {isOpenEnded && (
                              <span className="text-xs font-bold text-emerald-600">
                                Feedback
                              </span>
                            )}
                            {q.questionType === 'RATING' && q.avgRating !== null && (
                              <span className="text-xs font-bold text-amber-600 flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {q.avgRating}
                              </span>
                            )}
                            <span className="text-[11px] text-amber-700/40 font-medium tabular-nums">
                              {q.totalAnswers} answers
                            </span>
                            {q.avgAnswerTimeMs > 0 && (
                              <span className="text-[11px] text-amber-700/40 font-medium tabular-nums">
                                {(q.avgAnswerTimeMs / 1000).toFixed(1)}s avg
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-amber-500 mt-1">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            id={`question-details-${q.id}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-amber-100">
                              {/* Stats row */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-black text-amber-900 tabular-nums">
                                    {q.totalAnswers}
                                  </p>
                                  <p className="text-[10px] font-semibold text-amber-700/50 uppercase">Answers</p>
                                </div>
                                {!isUnscoredQuestion && (
                                  <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                                    <p className="text-lg font-black text-amber-900 tabular-nums">
                                      {q.correctCount}
                                    </p>
                                    <p className="text-[10px] font-semibold text-amber-700/50 uppercase">Correct</p>
                                  </div>
                                )}
                                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-black text-amber-900 tabular-nums">
                                    {q.avgAnswerTimeMs > 0 ? `${(q.avgAnswerTimeMs / 1000).toFixed(1)}s` : '—'}
                                  </p>
                                  <p className="text-[10px] font-semibold text-amber-700/50 uppercase">Avg Time</p>
                                </div>
                                <div className="bg-amber-50 rounded-lg p-2.5 text-center">
                                  <p className="text-lg font-black text-amber-900 tabular-nums">
                                    {q.unansweredCount}
                                  </p>
                                  <p className="text-[10px] font-semibold text-amber-700/50 uppercase">Skipped</p>
                                </div>
                              </div>

                              {/* Correct answer + common wrong */}
                              {!isUnscoredQuestion && q.correctAnswer && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <div className="flex-1 flex items-center gap-2 bg-green-50 border border-green-200/60 rounded-lg px-3 py-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                    <div>
                                      <p className="text-[10px] font-semibold text-green-600/70 uppercase">Correct Answer</p>
                                      <p className="text-sm font-bold text-green-900">{formatAnswerDisplay(q.correctAnswer)}</p>
                                    </div>
                                  </div>
                                  {q.mostCommonWrongAnswer && (
                                    <div className="flex-1 flex items-center gap-2 bg-red-50 border border-red-200/60 rounded-lg px-3 py-2">
                                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                      <div>
                                        <p className="text-[10px] font-semibold text-red-600/70 uppercase">Most Common Mistake</p>
                                        <p className="text-sm font-bold text-red-900">{q.mostCommonWrongAnswer}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {isOpenEnded && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200/60 rounded-lg px-3 py-2">
                                    <MessageSquare className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                    <div>
                                      <p className="text-[10px] font-semibold text-emerald-600/70 uppercase">Response Summary</p>
                                      <p className="text-sm font-bold text-emerald-900">{q.totalAnswers} responses collected</p>
                                    </div>
                                  </div>

                                  {isCreator && q.sampleResponses.length > 0 ? (
                                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3">
                                      <p className="text-[10px] font-semibold text-emerald-600/70 uppercase mb-2">Sample Responses</p>
                                      <div className="space-y-2">
                                        {q.sampleResponses.map((response, index) => (
                                          <div key={`${q.id}-sample-${index}`} className="rounded-md bg-white/90 px-3 py-2 text-sm text-emerald-900 border border-emerald-100">
                                            {response}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/40 px-3 py-2 text-sm text-emerald-700/80">
                                      {isCreator ? 'No text responses were recorded for this question.' : 'Open-ended responses are visible to the quiz creator only.'}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Rating average */}
                              {q.questionType === 'RATING' && q.avgRating !== null && (
                                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2">
                                  <Star className="h-4 w-4 text-amber-500 fill-amber-400 flex-shrink-0" />
                                  <div>
                                    <p className="text-[10px] font-semibold text-amber-600/70 uppercase">Average Rating</p>
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold text-amber-900">{q.avgRating}</p>
                                      <div className="flex gap-px">
                                        {[1, 2, 3, 4, 5].map((s) => (
                                          <Star
                                            key={s}
                                            className={cn(
                                              'h-3.5 w-3.5',
                                              s <= Math.round(q.avgRating!)
                                                ? 'text-amber-400 fill-amber-400'
                                                : 'text-amber-200',
                                            )}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Distribution chart / Poll analytics */}
                              {!isOpenEnded && Object.keys(q.answerDistribution).length > 0 && (
                                isPollRating && isCreator ? (
                                  <div className="space-y-3">
                                    {/* Poll engagement insights — admin only */}
                                    {(() => {
                                      const participationPct = insights.totalParticipants > 0
                                        ? Math.round((q.totalAnswers / insights.totalParticipants) * 100)
                                        : 0;
                                      const values = Object.values(q.answerDistribution);
                                      const total = values.reduce((s, v) => s + v, 0);
                                      const maxVotes = Math.max(...values);
                                      const topOption = Object.entries(q.answerDistribution)
                                        .sort(([, a], [, b]) => b - a)[0];
                                      // Shannon entropy normalized to [0,1] — lower = more consensus
                                      const entropy = total > 0 ? -(values.reduce((s, v) => {
                                        if (v === 0) return s;
                                        const p = v / total;
                                        return s + p * Math.log2(p);
                                      }, 0)) / Math.log2(Math.max(values.length, 2)) : 0;
                                      const consensusLabel = entropy < 0.5 ? 'Strong consensus'
                                        : entropy < 0.75 ? 'Moderate spread' : 'Highly divided';
                                      const consensusColor = entropy < 0.5 ? 'text-emerald-600'
                                        : entropy < 0.75 ? 'text-amber-600' : 'text-red-600';
                                      return (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{/* responsive: stack on mobile */}
                                          <div className="bg-purple-50 border border-purple-200/40 rounded-lg px-3 py-2 text-center">
                                            <p className="text-lg font-black text-purple-800 tabular-nums">{participationPct}%</p>
                                            <p className="text-[10px] text-purple-600/70 font-semibold uppercase">Participation</p>
                                          </div>
                                          <div className="bg-purple-50 border border-purple-200/40 rounded-lg px-3 py-2 text-center">
                                            <p className={cn('text-xs font-bold', consensusColor)}>{consensusLabel}</p>
                                            <p className="text-[10px] text-purple-600/70 font-semibold uppercase">Consensus</p>
                                          </div>
                                          <div className="bg-purple-50 border border-purple-200/40 rounded-lg px-3 py-2 text-center">
                                            <p className="text-xs font-bold text-purple-800 truncate" title={topOption?.[0]}>
                                              {topOption?.[0]?.length > 15 ? topOption[0].slice(0, 15) + '…' : topOption?.[0]}
                                            </p>
                                            <p className="text-[10px] text-purple-600/70 font-semibold uppercase">
                                              Top ({total > 0 ? Math.round((maxVotes / total) * 100) : 0}%)
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                    {/* Full PollResultsView with bar/pie toggle + export */}
                                    <PollResultsView
                                      distribution={q.answerDistribution}
                                      options={q.options}
                                      questionText={q.questionText}
                                      totalVotes={q.totalAnswers}
                                    />
                                  </div>
                                ) : (
                                  <QuizAnswerDistribution
                                    distribution={q.answerDistribution}
                                    correctAnswer={q.correctAnswer}
                                    options={q.options}
                                    questionType={q.questionType}
                                  />
                                )
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}
              </motion.div>
            )}

            {/* ── LEADERBOARD TAB ── */}
            {activeTab === 'leaderboard' && (
              <motion.div
                key="leaderboard"
                id="quiz-results-panel-leaderboard"
                role="tabpanel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
              >
                <QuizLeaderboard
                  leaderboard={leaderboard}
                  myUserId={user?.id ?? null}
                  totalQuestions={quiz.questionCount}
                />

                {/* CP9: Performance scatter chart — accuracy vs speed */}
                {leaderboard.length > 1 && (
                  <Card className="border-amber-200/60 shadow-sm mt-6">
                    <CardContent className="p-5">
                      <h3 className="text-sm font-bold text-amber-900 font-display mb-3">Accuracy vs Speed</h3>
                      {(() => {
                        const data: SpeedScatterPoint[] = leaderboard
                          .filter((player) => (player.questionsAnswered ?? quiz.questionCount) > 0)
                          .map((player) => {
                            const qAnswered = player.questionsAnswered ?? quiz.questionCount;
                            const acc = Math.round((player.correctCount / qAnswered) * 100);
                            const avgMs =
                              player.correctCount > 0
                                ? player.totalAnswerTimeMs / player.correctCount
                                : player.totalAnswerTimeMs / Math.max(qAnswered, 1);
                            return {
                              name: player.displayName,
                              accuracy: acc,
                              avgTimeMs: Math.round(avgMs),
                              score: player.score,
                            };
                          });
                        const meanAcc = data.length > 0 ? Math.round(data.reduce((sum, point) => sum + point.accuracy, 0) / data.length) : 50;
                        const meanTime = data.length > 0 ? Math.round(data.reduce((sum, point) => sum + point.avgTimeMs, 0) / data.length) : 5000;
                        const maxTime = Math.max(...data.map((point) => point.avgTimeMs), 1);

                        return (
                          <div style={{ width: '100%', height: 280 }} className="relative">
                            {/* Quadrant labels */}
                            <div className="absolute top-1 left-8 text-[9px] text-green-600/40 font-semibold">Fast & Accurate</div>
                            <div className="absolute top-1 right-2 text-[9px] text-amber-600/40 font-semibold">Quick Guessers</div>
                            <div className="absolute bottom-6 left-8 text-[9px] text-blue-600/40 font-semibold">Slow but Sure</div>
                            <div className="absolute bottom-6 right-2 text-[9px] text-red-600/40 font-semibold">Struggling</div>
                            <ResponsiveContainer width="100%" height="100%">
                              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#fef3c7" />
                                <XAxis
                                  type="number" dataKey="accuracy" name="Accuracy" unit="%"
                                  domain={[0, 100]} tick={{ fontSize: 10, fill: '#92400e' }}
                                  label={{ value: 'Accuracy %', position: 'bottom', fontSize: 10, fill: '#92400e', offset: 0 }}
                                />
                                <YAxis
                                  type="number" dataKey="avgTimeMs" name="Avg Time" unit="ms"
                                  domain={[0, maxTime + 500]} tick={{ fontSize: 10, fill: '#92400e' }} reversed
                                  label={{ value: 'Speed (ms, lower=faster)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#92400e' }}
                                />
                                <ZAxis type="number" dataKey="score" range={[40, 200]} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 11 }}
                                  formatter={(value: number | string | undefined, name: string | number | undefined) => {
                                    if (name === 'Accuracy') return [`${value}%`, name];
                                    if (name === 'Avg Time') return [`${(Number(value) / 1000).toFixed(1)}s`, name];
                                    return [value ?? 0, name ?? 'Value'];
                                  }}
                                  labelFormatter={() => ''}
                                />
                                <ReferenceLine x={meanAcc} stroke="#d97706" strokeDasharray="4 4" />
                                <ReferenceLine y={meanTime} stroke="#d97706" strokeDasharray="4 4" />
                                <Scatter name="Players" data={data}>
                                  {data.map((_, i) => (
                                    <Cell key={i} fill={i < 3 ? '#10b981' : '#f59e0b'} opacity={0.7} />
                                  ))}
                                </Scatter>
                              </ScatterChart>
                            </ResponsiveContainer>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}

                {/* CP10: Performance Heatmap — player × question grid */}
                {isCreator && (result?.participantAnswers?.length ?? 0) > 0 && (
                  <HeatmapGrid
                    participantAnswers={result!.participantAnswers}
                    leaderboard={leaderboard}
                    questionAnalytics={questionAnalytics}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-center gap-3 pt-2">
            {isCreator && (
              <Button
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Excel
              </Button>
            )}
            <Button asChild variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50">
              <Link to="/dashboard">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
            </Button>
            <Button asChild className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md">
              <Link to="/quiz">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Quizzes
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ── HeatmapGrid ── */

interface HeatmapGridProps {
  participantAnswers: Array<{
    userId: string;
    questionId: string;
    isCorrect: boolean | null;
    answerTimeMs: number;
  }>;
  leaderboard: QuizResultPlayer[];
  questionAnalytics: Array<QuestionAnalytic>;
}

function HeatmapGrid({ participantAnswers, leaderboard, questionAnalytics }: HeatmapGridProps) {
  const topPlayers = leaderboard.slice(0, 20);
  const sortedQuestions = [...questionAnalytics].sort((a, b) => a.position - b.position);

  const answerMap = new Map<string, { isCorrect: boolean | null; answerTimeMs: number }>();
  participantAnswers.forEach(a => {
    answerMap.set(`${a.userId}::${a.questionId}`, { isCorrect: a.isCorrect, answerTimeMs: a.answerTimeMs });
  });

  function getCellColor(userId: string, questionId: string, timeLimitSeconds: number): string {
    const record = answerMap.get(`${userId}::${questionId}`);
    if (!record) return '#e5e7eb';
    if (record.isCorrect === null) return '#fde68a';
    if (!record.isCorrect) return '#fca5a5';
    const timeRatio = record.answerTimeMs / (timeLimitSeconds * 1000);
    if (timeRatio <= 0.4) return '#059669';
    if (timeRatio <= 0.7) return '#34d399';
    return '#a7f3d0';
  }

  function getCellTitle(userId: string, questionId: string): string {
    const record = answerMap.get(`${userId}::${questionId}`);
    if (!record) return 'No answer submitted';
    if (record.isCorrect === null) return `Responded in ${(record.answerTimeMs / 1000).toFixed(1)}s`;
    return `${record.isCorrect ? '✓ Correct' : '✗ Wrong'} — ${(record.answerTimeMs / 1000).toFixed(1)}s`;
  }

  if (topPlayers.length === 0 || sortedQuestions.length === 0) return null;

  return (
    <Card className="border-amber-200/60 shadow-sm mt-6">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-amber-900 font-display">Performance Heatmap</h3>
          <div className="flex items-center gap-3 text-[10px] text-amber-700/70 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#059669' }} /> Fast correct
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#a7f3d0' }} /> Slow correct
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#fca5a5' }} /> Wrong
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#e5e7eb' }} /> No answer
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: sortedQuestions.length * 32 + 140 }}>
            <thead>
              <tr>
                <th className="text-left text-amber-800/60 font-medium pr-3 pb-1" style={{ width: 140, minWidth: 140 }}>Player</th>
                {sortedQuestions.map((q, i) => (
                  <th key={q.id} className="text-center text-amber-800/60 font-medium pb-1" style={{ width: 28, minWidth: 28 }} title={`Question ${i + 1}`}>
                    Q{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPlayers.map((player, rowIdx) => (
                <tr key={player.userId}>
                  <td className="pr-3 py-0.5 text-amber-900 font-medium truncate" style={{ maxWidth: 140 }} title={player.displayName}>
                    <span className="text-amber-500/60 mr-1">#{rowIdx + 1}</span>
                    {player.displayName}
                  </td>
                  {sortedQuestions.map(q => (
                    <td key={q.id} className="py-0.5 px-0.5" title={getCellTitle(player.userId, q.id)}>
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: 3,
                          backgroundColor: getCellColor(player.userId, q.id, q.timeLimitSeconds),
                          margin: '0 auto',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-amber-700/40 mt-2">
          Showing top {Math.min(topPlayers.length, 20)} players by score. Hover cells for details.
        </p>
      </CardContent>
    </Card>
  );
}
