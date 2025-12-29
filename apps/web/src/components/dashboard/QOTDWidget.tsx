import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code, ExternalLink, Check, Loader2, Flame } from 'lucide-react';

interface QOTD {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

  useEffect(() => {
    loadQOTD();
    loadStreak();
  }, []);

  const loadQOTD = async () => {
    try {
      const response = await fetch(`${API_URL}/qotd/today`);
      if (response.ok) {
        const result = await response.json();
        // API returns { success: true, data: {...} } or { success: true, data: null }
        setQotd(result.data || null);
      } else if (response.status === 404) {
        setQotd(null);
      }
    } catch (err) {
      setError('Failed to load QOTD');
    } finally {
      setLoading(false);
    }
  };

  const loadStreak = async () => {
    try {
      const response = await fetch(`${API_URL}/users/me/qotd-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        // API returns { success: true, data: { currentStreak, totalSubmissions, recentSubmissions } }
        const data = result.data || result;
        setStreak(data.currentStreak || 0);
        // Check if there's a submission for today
        const today = new Date().toISOString().split('T')[0];
        const hasSubmittedToday = data.recentSubmissions?.some((s: any) => {
          const subDate = new Date(s.date).toISOString().split('T')[0];
          return subDate === today;
        });
        setSubmitted(hasSubmittedToday || false);
      }
    } catch (err) {
      console.error('Failed to load streak');
    }
  };

  const handleSubmit = async () => {
    if (!qotd) return;
    
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/qotd/${qotd.id}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        setSubmitted(true);
        setStreak(prev => prev + 1);
      } else {
        const result = await response.json();
        // Check both error formats
        const errorMsg = result.error?.message || result.error;
        if (errorMsg === 'Already submitted' || errorMsg === 'Already submitted today') {
          setSubmitted(true);
        }
      }
    } catch (err) {
      setError('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </CardContent>
      </Card>
    );
  }

  if (!qotd) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code className="h-5 w-5 text-amber-600" />
            Question of the Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">
            <p>No question for today.</p>
            <p className="text-sm">Check back tomorrow!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-100 to-orange-100 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code className="h-5 w-5 text-amber-600" />
            Question of the Day
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-amber-600" title="Current streak">
              <Flame className="h-4 w-4" />
              <span className="text-sm font-bold">{streak}</span>
            </div>
            <Badge className={difficultyColors[qotd.difficulty]}>
              {qotd.difficulty}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <p className="text-gray-700 mb-4 line-clamp-2">{qotd.question}</p>
        
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
          <p className="text-xs text-gray-500 mt-3 text-center">
            Solve the problem on LeetCode, then click "I Solved It!" to track your progress
          </p>
        )}

        {error && (
          <p className="text-red-500 text-sm mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
