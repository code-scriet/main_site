import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Code, Loader2, Plus, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';
import { api } from '@/lib/api';
import { toast } from 'sonner';

interface QOTD {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const difficultyColors = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'destructive',
} as const;

export default function CreateQOTD() {
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [recentQOTDs, setRecentQOTDs] = useState<QOTD[]>([]);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    question: '',
    problemLink: '',
    difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard',
  });

  const loadRecentQOTDs = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await api.getQOTDHistory(10);
      setRecentQOTDs(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load recent QOTDs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRecentQOTDs();
  }, [loadRecentQOTDs]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.question.trim() || !form.problemLink.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!token) {
      toast.error('You need to sign in to create a QOTD');
      return;
    }

    try {
      setSaving(true);
      await api.createQOTD({
        date: new Date(form.date).toISOString(),
        question: form.question.trim(),
        problemLink: form.problemLink.trim(),
        difficulty: form.difficulty,
      }, token);

      toast.success('QOTD created successfully');
      setForm({
        date: new Date().toISOString().split('T')[0],
        question: '',
        problemLink: '',
        difficulty: 'Medium',
      });
      setShowForm(false);
      await loadRecentQOTDs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create QOTD');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Question of the Day</h1>
          <p className="text-gray-600">Manage daily coding challenges for members</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Create QOTD
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-amber-600" />
                Create New QOTD
              </CardTitle>
              <CardDescription>Add a new problem for members to solve</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="qotd-date">Date *</Label>
                    <Input
                      id="qotd-date"
                      name="date"
                      type="date"
                      value={form.date}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="qotd-difficulty">Difficulty *</Label>
                    <select
                      id="qotd-difficulty"
                      name="difficulty"
                      value={form.difficulty}
                      onChange={handleChange}
                      className="w-full h-10 px-3 py-2 border border-input rounded-md bg-background text-sm"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qotd-problem-link">Problem Link *</Label>
                  <Input
                    id="qotd-problem-link"
                    name="problemLink"
                    type="url"
                    value={form.problemLink}
                    onChange={handleChange}
                    placeholder="https://leetcode.com/problems/..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="qotd-question">Question / Description *</Label>
                  <textarea
                    id="qotd-question"
                    name="question"
                    value={form.question}
                    onChange={handleChange}
                    placeholder="Describe the problem or add a brief summary..."
                    className="w-full min-h-[100px] px-3 py-2 border border-input rounded-md bg-background text-sm"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create QOTD'
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Recent QOTDs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent QOTDs</CardTitle>
          <CardDescription>Previously created questions of the day</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
            </div>
          ) : recentQOTDs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Code className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No QOTDs created yet.</p>
              <p className="text-sm">Create the first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentQOTDs.map((qotd, index) => (
                <motion.div
                  key={qotd.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.3) }}
                  className="flex items-center justify-between p-4 rounded-lg border border-amber-200 bg-amber-50/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm text-gray-500">
                        {formatDate(qotd.date)}
                      </span>
                      <Badge variant={difficultyColors[qotd.difficulty]}>
                        {qotd.difficulty}
                      </Badge>
                    </div>
                    <p className="text-amber-900 line-clamp-1">{qotd.question}</p>
                  </div>
                  <a
                    href={qotd.problemLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4"
                  >
                    <Button variant="ghost" size="sm" aria-label={`Open problem link for QOTD on ${formatDate(qotd.date)}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
