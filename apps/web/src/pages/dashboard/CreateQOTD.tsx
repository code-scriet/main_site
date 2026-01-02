import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Code, Loader2, AlertCircle, Plus, Check, X, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';

interface QOTD {
  id: string;
  date: string;
  question: string;
  problemLink: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const difficultyColors = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'destructive',
} as const;

export default function CreateQOTD() {
  const { token } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [recentQOTDs, setRecentQOTDs] = useState<QOTD[]>([]);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    question: '',
    problemLink: '',
    difficulty: 'Medium' as 'Easy' | 'Medium' | 'Hard',
  });

  useEffect(() => {
    loadRecentQOTDs();
  }, []);

  const loadRecentQOTDs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/qotd/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const result = await response.json();
        // API returns { success: true, data: [...] }
        setRecentQOTDs(result.data || []);
      }
    } catch (err) {
      console.error('Failed to load recent QOTDs');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.question.trim() || !form.problemLink.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch(`${API_URL}/qotd`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: new Date(form.date).toISOString(),
          question: form.question.trim(),
          problemLink: form.problemLink.trim(),
          difficulty: form.difficulty,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        const errorMsg = result.error?.message || result.error || 'Failed to create QOTD';
        throw new Error(errorMsg);
      }

      setSuccess('QOTD created successfully!');
      setForm({
        date: new Date().toISOString().split('T')[0],
        question: '',
        problemLink: '',
        difficulty: 'Medium',
      });
      setShowForm(false);
      await loadRecentQOTDs();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create QOTD');
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

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {success && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700"
        >
          <Check className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{success}</p>
        </motion.div>
      )}

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
                    <label className="text-sm font-medium">Date *</label>
                    <Input
                      name="date"
                      type="date"
                      value={form.date}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Difficulty *</label>
                    <select
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
                  <label className="text-sm font-medium">Problem Link *</label>
                  <Input
                    name="problemLink"
                    type="url"
                    value={form.problemLink}
                    onChange={handleChange}
                    placeholder="https://leetcode.com/problems/..."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Question / Description *</label>
                  <textarea
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
                  transition={{ delay: index * 0.05 }}
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
                    <Button variant="ghost" size="sm">
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
