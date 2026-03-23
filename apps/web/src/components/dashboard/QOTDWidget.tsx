import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code, ExternalLink, Check, Loader2, Flame, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface QOTD {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface QOTDStats {
  currentStreak?: number;
  recentSubmissions?: Array<{ date: string }>;
}

interface QOTDWidgetProps {
  token: string;
}

const difficultyColors = {
  Easy: 'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Hard: 'bg-red-100 text-red-700 border-red-200',
};

export function QOTDWidget({ token }: QOTDWidgetProps) {
  const [qotd, setQotd] = useState<QOTD | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadQOTD = useCallback(async () => {
    try {
      const result = await api.getTodayQOTD();
      setQotd((result as QOTD | null) || null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load QOTD';
      if (message.includes('404')) {
        setQotd(null);
        return;
      }
      throw err;
    }
  }, []);

  const loadStreak = useCallback(async () => {
    const data = await api.getQOTDStats(token) as QOTDStats;
    setStreak(data.currentStreak || 0);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const hasSubmittedToday = data.recentSubmissions?.some((submission) => {
      const subDate = new Date(submission.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      return subDate === today;
    });

    setSubmitted(hasSubmittedToday || false);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await Promise.all([loadQOTD(), loadStreak()]);
    } catch {
      setError('Failed to load QOTD');
    } finally {
      setLoading(false);
    }
  }, [loadQOTD, loadStreak, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSubmit = async () => {
    if (!qotd) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.submitQOTD(qotd.id, token);
      setSubmitted(true);
      await loadStreak();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit';
      if (message.toLowerCase().includes('already submitted')) {
        setSubmitted(true);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-gray-100 shadow-sm">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  if (error && !qotd) {
    return (
      <Card className="border-gray-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-50">
              <Code className="h-4 w-4 text-amber-600" />
            </div>
            Question of the Day
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <AlertCircle className="mx-auto h-5 w-5 text-red-500" />
            <p className="mt-2 text-sm text-red-700">{error}</p>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => void refresh()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!qotd) {
    return (
      <Card className="border-gray-100 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-50">
              <Code className="h-4 w-4 text-amber-600" />
            </div>
            Question of the Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-gray-500">
            <p className="text-sm">No question for today.</p>
            <p className="text-sm mt-1">Check back tomorrow!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-gray-100 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <div className="p-2 rounded-lg bg-amber-50">
              <Code className="h-4 w-4 text-amber-600" />
            </div>
            Question of the Day
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-amber-600" title="Current streak">
              <Flame className="h-5 w-5" />
              <span className="text-base font-bold">{streak}</span>
            </div>
            <Badge className={`${difficultyColors[qotd.difficulty]} whitespace-nowrap`}>
              {qotd.difficulty}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        <p className="text-gray-700 mb-4 line-clamp-2 text-base">{qotd.question}</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <a
            href={qotd.problemLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              Solve on LeetCode
            </Button>
          </a>

          {submitted ? (
            <Button disabled className="flex-1 bg-green-500 hover:bg-green-500">
              <Check className="h-4 w-4 mr-2" />
              Completed Today!
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
              title="Click after you've solved the problem on LeetCode"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              I Solved It!
            </Button>
          )}
        </div>

        {!submitted && (
          <p className="text-sm text-gray-500 mt-4 text-center">
            Solve the problem on LeetCode, then click "I Solved It!" to track your progress
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
