import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { FileCode2, ExternalLink, BarChart3, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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

export function PlaygroundSnippetsCard() {
  const { token } = useAuth();
  const [snippets, setSnippets] = useState<SnippetData[]>([]);
  const [stats, setStats] = useState<LanguageStat[]>([]);
  const [totalExecutions, setTotalExecutions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    
    Promise.all([
      fetch(`${API_URL}/playground/snippets`, { headers, credentials: 'include' })
        .then(r => r.json()).catch(() => ({ data: [] })),
      fetch(`${API_URL}/playground/stats`, { headers, credentials: 'include' })
        .then(r => r.json()).catch(() => ({ data: { languageStats: [], totalExecutions: 0 } })),
    ]).then(([snippetsRes, statsRes]) => {
      setSnippets((snippetsRes.data || []).slice(0, 5));
      setStats(statsRes.data?.languageStats || []);
      setTotalExecutions(statsRes.data?.totalExecutions || 0);
    }).finally(() => setLoading(false));
  }, [token]);

  if (loading) return null;
  if (!snippets.length && !stats.length) return null;

  const maxStat = Math.max(...stats.map(s => s.count), 1);

  function getPlaygroundUrl(snippetId?: string): string {
    const base = PLAYGROUND_URL;
    const t = localStorage.getItem('token');
    const tokenHash = t ? `#token=${encodeURIComponent(t)}` : '';
    if (snippetId) return `${base}/?snippet=${snippetId}${tokenHash}`;
    return `${base}/${tokenHash}`;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* My Snippets */}
      {snippets.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.55 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-5 w-5 text-amber-600" />
                My Snippets
              </CardTitle>
              <a href={getPlaygroundUrl()} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm">
                  Open Playground <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </a>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {snippets.map((snippet) => (
                  <a
                    key={snippet.id}
                    href={getPlaygroundUrl(snippet.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">{LANG_ICONS[snippet.language] || '📄'}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-amber-900 truncate">{snippet.title}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(snippet.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{snippet.language}</Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-amber-600 transition-colors" />
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Language Stats */}
      {stats.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-600" />
                Coding Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  <span className="text-2xl font-bold text-amber-900">{totalExecutions}</span>{' '}
                  total executions
                </p>
                {stats.map((stat) => (
                  <div key={stat.language} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span>{LANG_ICONS[stat.language] || '📄'}</span>
                        <span className="font-medium capitalize">{stat.language}</span>
                      </span>
                      <span className="text-gray-500">{stat.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${LANG_COLORS[stat.language] || 'bg-amber-400'}`}
                        style={{ width: `${(stat.count / maxStat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
