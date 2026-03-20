import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { FileCode2, ExternalLink, BarChart3, ArrowRight, History, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const PLAYGROUND_URL = import.meta.env.VITE_PLAYGROUND_URL || 
  (import.meta.env.DEV ? 'http://localhost:5174' : 'https://code.codescriet.dev');

const LANG_COLORS: Record<string, string> = {
  python: 'bg-blue-500',
  javascript: 'bg-yellow-400',
  typescript: 'bg-blue-600',
  java: 'bg-red-500',
  cpp: 'bg-purple-500',
  c: 'bg-gray-500',
  web: 'bg-green-500',
};

const LANG_ICONS: Record<string, string> = {
  python: '🐍',
  javascript: '⚡',
  typescript: '📘',
  java: '☕',
  cpp: '🔷',
  c: '⚙',
  web: '🌐',
};

interface SnippetData {
  id: string;
  title: string;
  language: string;
  createdAt: string;
}

interface LanguageStat {
  language: string;
  count: number;
}

interface ExecutionHistoryItem {
  id: string;
  language: string;
  code: string;
  output: string;
  durationMs: number;
  status: string;
  executedAt: string;
}

export function PlaygroundSnippetsCard() {
  const { token } = useAuth();
  const [snippets, setSnippets] = useState<SnippetData[]>([]);
  const [stats, setStats] = useState<LanguageStat[]>([]);
  const [history, setHistory] = useState<ExecutionHistoryItem[]>([]);
  const [totalExecutions, setTotalExecutions] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');

  useEffect(() => {
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    
    Promise.all([
      fetch(`${API_URL}/playground/snippets`, { headers, credentials: 'include' })
        .then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API_URL}/playground/stats`, { headers, credentials: 'include' })
        .then(r => r.json()).catch(() => ({ data: { languageStats: [], totalExecutions: 0, todayCount: 0, dailyLimit: 100 } })),
      fetch(`${API_URL}/playground/history`, { headers, credentials: 'include' })
        .then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([snippetsRes, statsRes, historyRes]) => {
      setSnippets((snippetsRes.data || []).slice(0, 5));
      setStats(statsRes.data?.languageStats || []);
      setTotalExecutions(statsRes.data?.totalExecutions || 0);
      setTodayCount(statsRes.data?.todayCount || 0);
      setDailyLimit(statsRes.data?.dailyLimit || 100);
      setHistory((historyRes.data || []).slice(0, 10));
    }).finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
        </CardContent>
      </Card>
    );
  }

  // Don't show if no data at all
  if (!snippets.length && !stats.length && !history.length) return null;

  const maxStat = Math.max(...stats.map(s => s.count), 1);

  function getPlaygroundUrl(snippetId?: string): string {
    const base = PLAYGROUND_URL;
    const t = localStorage.getItem('token');
    const tokenHash = t ? `#token=${encodeURIComponent(t)}` : '';
    if (snippetId) return `${base}/?snippet=${snippetId}${tokenHash}`;
    return `${base}/${tokenHash}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.55 }}
    >
      <Card className="border-gray-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50">
              <FileCode2 className="h-4 w-4 text-emerald-600" />
            </div>
            Playground Activity
          </CardTitle>
          <a href={getPlaygroundUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="text-sm">
              Open Playground <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </a>
        </CardHeader>
        <CardContent>
          {/* Daily Usage Banner */}
          <div className="mb-4 p-4 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Today's Usage</span>
              <span className="font-semibold text-gray-900">{todayCount} / {dailyLimit}</span>
            </div>
            <div className="mt-2.5 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                style={{ width: `${Math.min((todayCount / dailyLimit) * 100, 100)}%` }}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="history" className="flex items-center gap-1.5 text-sm">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
              <TabsTrigger value="snippets" className="flex items-center gap-1.5 text-sm">
                <FileCode2 className="h-4 w-4" />
                <span className="hidden sm:inline">Snippets</span>
              </TabsTrigger>
              <TabsTrigger value="stats" className="flex items-center gap-1.5 text-sm">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Stats</span>
              </TabsTrigger>
            </TabsList>

            {/* History Tab */}
            <TabsContent value="history" className="mt-4">
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No execution history yet. Run some code in the playground!
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl">{LANG_ICONS[item.language] || '📄'}</span>
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-gray-700 truncate max-w-[200px]">
                            {item.code?.split('\n')[0] || 'Code snippet'}
                          </p>
                          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(item.executedAt)}
                            {item.durationMs && (
                              <span className="text-gray-600">{formatDuration(item.durationMs)}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'SUCCESS' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <Badge variant="outline" className="text-xs">{item.language}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Snippets Tab */}
            <TabsContent value="snippets" className="mt-4">
              {snippets.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  No saved snippets yet. Save code in the playground!
                </p>
              ) : (
                <div className="space-y-2">
                  {snippets.map((snippet) => (
                    <a
                      key={snippet.id}
                      href={getPlaygroundUrl(snippet.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl">{LANG_ICONS[snippet.language] || '📄'}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{snippet.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(snippet.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">{snippet.language}</Badge>
                        <ExternalLink className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="mt-4">
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  <span className="text-2xl font-bold text-gray-900">{totalExecutions}</span>{' '}
                  total executions
                </p>
                {stats.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">
                    No language stats yet. Run some code!
                  </p>
                ) : (
                  stats.map((stat) => (
                    <div key={stat.language} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{LANG_ICONS[stat.language] || '📄'}</span>
                          <span className="font-medium capitalize">{stat.language}</span>
                        </span>
                        <span className="text-gray-500">{stat.count}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${LANG_COLORS[stat.language] || 'bg-amber-400'}`}
                          style={{ width: `${(stat.count / maxStat) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
