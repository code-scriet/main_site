/**
 * QuizDashboardWidget — Shows user's quiz activity on the dashboard.
 * 
 * Features:
 * - Live quizzes the user is participating in
 * - Recent quiz history with scores
 * - Single API call fetches all data (optimized)
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { Zap, Trophy, ArrowRight, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

interface QuizDashboardWidgetProps {
  token: string;
}

interface LiveQuiz {
  id: string;
  title: string;
  status: string;
  questionCount: number;
  participantCount: number;
}

interface QuizHistoryItem {
  quizId: string;
  title: string;
  endedAt: string | null;
  questionCount: number;
  finalScore: number;
  finalRank: number | null;
  correctCount: number;
  totalParticipants: number;
}

export function QuizDashboardWidget({ token }: QuizDashboardWidgetProps) {
  const [liveQuizzes, setLiveQuizzes] = useState<LiveQuiz[]>([]);
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getMyQuizDashboard(token);
      setLiveQuizzes(data.liveQuizzes);
      setHistory(data.history.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quiz activity');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Card className="border-[var(--border-subtle)] shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[var(--ds-text-1)] flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50">
              <Zap className="h-4 w-4 text-blue-600" />
            </div>
            My Quizzes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  const hasContent = liveQuizzes.length > 0 || history.length > 0;

  if (error) {
    return (
      <Card className="border-[var(--border-subtle)] shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[var(--ds-text-1)] flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50">
              <Zap className="h-4 w-4 text-blue-600" />
            </div>
            My Quizzes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 py-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadData()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--border-subtle)] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold text-[var(--ds-text-1)] flex items-center gap-2">
          <div className="p-2 rounded-lg bg-blue-50">
            <Zap className="h-4 w-4 text-blue-600" />
          </div>
          My Quizzes
        </CardTitle>
        <Link to="/quiz">
          <Button variant="ghost" size="sm" className="text-sm">
            All Quizzes
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Live Quizzes */}
        {liveQuizzes.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--ds-text-2)] mb-3 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              Live Now
            </h4>
            <div className="space-y-2">
              {liveQuizzes.map((quiz) => (
                <Link
                  key={quiz.id}
                  to={`/quiz/${quiz.id}`}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-green-900 text-sm break-words">{quiz.title}</p>
                      <p className="text-sm text-green-700 break-words">
                        {quiz.questionCount} questions • {quiz.participantCount} players
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-green-600">
                    {quiz.status === 'ACTIVE' ? 'In Progress' : 'Waiting'}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quiz History */}
        {history.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[var(--ds-text-2)] mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Recent Results
            </h4>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.quizId}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-[var(--surface-soft)] hover:bg-[var(--surface-soft)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[var(--warning-bg)] flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--ds-text-1)] text-sm break-words">{item.title}</p>
                      <p className="text-sm text-[var(--ds-text-3)] break-words">
                        {item.correctCount}/{item.questionCount} correct
                        {item.endedAt && ` • ${formatDate(item.endedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[var(--ds-text-1)] text-base">{item.finalScore} pts</p>
                    {item.finalRank != null && item.finalRank > 0 && (
                      <p className="text-sm text-[var(--ds-text-3)]">
                        #{item.finalRank} of {item.totalParticipants}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasContent && (
          <div className="text-center py-6">
            <Zap className="h-12 w-12 text-[var(--ds-text-3)] mx-auto mb-3" />
            <p className="text-[var(--ds-text-3)] mb-3 text-sm">No quiz activity yet</p>
            <Link to="/quiz">
              <Button variant="outline" size="sm">
                Join a Quiz
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
