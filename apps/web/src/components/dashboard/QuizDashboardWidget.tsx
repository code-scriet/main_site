/**
 * QuizDashboardWidget — Shows user's quiz activity on the dashboard.
 * 
 * Features:
 * - Live quizzes the user is participating in
 * - Recent quiz history with scores
 * - Single API call fetches all data (optimized)
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { Zap, Trophy, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Single optimized API call for all quiz data
    api.getMyQuizDashboard(token)
      .then((data) => {
        setLiveQuizzes(data.liveQuizzes);
        setHistory(data.history.slice(0, 5)); // Show top 5 recent
      })
      .catch((err) => {
        console.error('Failed to load quiz dashboard:', err);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-600" />
            My Quizzes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  const hasContent = liveQuizzes.length > 0 || history.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-600" />
          My Quizzes
        </CardTitle>
        <Link to="/quiz">
          <Button variant="ghost" size="sm">
            All Quizzes
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Quizzes */}
        {liveQuizzes.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live Now
            </h4>
            <div className="space-y-2">
              {liveQuizzes.map((quiz) => (
                <Link
                  key={quiz.id}
                  to="/quiz"
                  className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-green-900">{quiz.title}</p>
                      <p className="text-xs text-green-700">
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
            <h4 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <Trophy className="h-4 w-4" />
              Recent Results
            </h4>
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.quizId}
                  className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-amber-900">{item.title}</p>
                      <p className="text-xs text-gray-500">
                        {item.correctCount}/{item.questionCount} correct
                        {item.endedAt && ` • ${formatDate(item.endedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-700">{item.finalScore} pts</p>
                    {item.finalRank && (
                      <p className="text-xs text-gray-500">
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
          <div className="text-center py-4">
            <Zap className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500 mb-2">No quiz activity yet</p>
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
