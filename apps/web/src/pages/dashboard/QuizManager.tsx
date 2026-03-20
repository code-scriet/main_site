/**
 * QuizManager — Dashboard page for CORE_MEMBER+ to manage quizzes.
 * 
 * Features:
 * - List all quizzes (own for CORE_MEMBER, all for ADMIN)
 * - Create new quiz
 * - Host/monitor live quizzes
 * - View quiz results
 * 
 * Single DB call per page load (optimized).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/dateUtils';
import {
  Zap,
  Plus,
  Play,
  Eye,
  Users,
  Loader2,
  Clock,
  CheckCircle,
  Trash2,
  Edit,
  BarChart3,
} from 'lucide-react';

interface QuizItem {
  id: string;
  title: string;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED' | 'DRAFT';
  questionCount: number;
  participantCount: number;
  createdBy: { id: string; name: string };
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

export default function QuizManager() {
  const { user, token } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Single optimized API call
    fetch(`${API_URL}/quiz/admin/list`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setQuizzes(json.data);
        } else {
          setError(json.error?.message || 'Failed to load quizzes');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleDelete = async (quizId: string) => {
    if (!confirm('Are you sure you want to delete this quiz? This cannot be undone.')) return;
    
    setDeleting(quizId);
    try {
      const res = await fetch(`${API_URL}/quiz/${quizId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      } else {
        alert(json.error?.message || 'Failed to delete quiz');
      }
    } catch (err) {
      alert('Failed to delete quiz');
    } finally {
      setDeleting(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      WAITING: { color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3 w-3" />, label: 'Lobby' },
      ACTIVE: { color: 'bg-green-100 text-green-700', icon: <Play className="h-3 w-3" />, label: 'Live' },
      FINISHED: { color: 'bg-gray-100 text-gray-700', icon: <CheckCircle className="h-3 w-3" />, label: 'Finished' },
      DRAFT: { color: 'bg-blue-100 text-blue-700', icon: <Edit className="h-3 w-3" />, label: 'Draft' },
    };
    const config = configs[status] || configs.DRAFT;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const liveQuizzes = quizzes.filter((q) => q.status === 'WAITING' || q.status === 'ACTIVE');
  const finishedQuizzes = quizzes.filter((q) => q.status === 'FINISHED');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Quiz Manager</h1>
          <p className="text-gray-600">
            {isAdmin ? 'Manage all quizzes' : 'Manage your quizzes'}
          </p>
        </div>
        <Link to="/quiz/create">
          <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
            <Plus className="h-4 w-4 mr-2" />
            Create Quiz
          </Button>
        </Link>
      </motion.div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Live/Active Quizzes */}
      {liveQuizzes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-800">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                Live Quizzes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {liveQuizzes.map((quiz) => (
                <div
                  key={quiz.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-white rounded-lg border border-green-200"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center">
                      <Zap className="h-6 w-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 break-words">{quiz.title}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                        <span>{quiz.questionCount} questions</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {quiz.participantCount} players
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(quiz.status)}
                    <Link to={`/quiz/${quiz.id}?host=true`}>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        <Eye className="h-4 w-4 mr-1" />
                        Host Dashboard
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* All Quizzes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-amber-600" />
              {isAdmin ? 'All Quizzes' : 'My Quizzes'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quizzes.length === 0 ? (
              <div className="text-center py-10">
                <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No quizzes created yet</p>
                <Link to="/quiz/create">
                  <Button variant="outline">Create Your First Quiz</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b text-left text-sm text-gray-500">
                      <th className="pb-3 font-medium">Quiz</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Questions</th>
                      <th className="pb-3 font-medium">Players</th>
                      {isAdmin && <th className="pb-3 font-medium">Created By</th>}
                      <th className="pb-3 font-medium">Created</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {quizzes.map((quiz) => (
                      <tr key={quiz.id} className="hover:bg-amber-50/50">
                        <td className="py-3">
                          <div className="font-medium text-gray-900 break-words">{quiz.title}</div>
                        </td>
                        <td className="py-3">{getStatusBadge(quiz.status)}</td>
                        <td className="py-3 text-gray-600">{quiz.questionCount}</td>
                        <td className="py-3 text-gray-600">{quiz.participantCount}</td>
                        {isAdmin && (
                          <td className="py-3 text-gray-600">{quiz.createdBy.name}</td>
                        )}
                        <td className="py-3 text-gray-600 text-sm">
                          {formatDate(quiz.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-2">
                            {(quiz.status === 'WAITING' || quiz.status === 'ACTIVE') && (
                              <Link to={`/quiz/${quiz.id}?host=true`}>
                                <Button size="sm" variant="outline" className="text-green-600 border-green-200">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {quiz.status === 'FINISHED' && (
                              <Link to={`/quiz/${quiz.id}/results`}>
                                <Button size="sm" variant="outline">
                                  <BarChart3 className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {quiz.status !== 'ACTIVE' && (
                              <Link to={`/quiz/create?edit=${quiz.id}`}>
                                <Button size="sm" variant="outline">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {quiz.status === 'FINISHED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => handleDelete(quiz.id)}
                                disabled={deleting === quiz.id}
                              >
                                {deleting === quiz.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4"
      >
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-600">{quizzes.length}</p>
            <p className="text-sm text-gray-500">Total Quizzes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{liveQuizzes.length}</p>
            <p className="text-sm text-gray-500">Live Now</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-gray-600">{finishedQuizzes.length}</p>
            <p className="text-sm text-gray-500">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">
              {quizzes.reduce((sum, q) => sum + q.participantCount, 0)}
            </p>
            <p className="text-sm text-gray-500">Total Players</p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
