import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/playground/Navbar';
import { useAuth } from '@/context/AuthContext';
import {
  listSnippets,
  deleteSnippet,
  getShareUrl,
  type Snippet,
} from '@/utils/snippetsApi';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Trash2,
  Share2,
  ExternalLink,
  FileCode2,
  Search,
  Globe,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

const LANG_ICONS: Record<string, string> = {
  python: '🐍',
  javascript: '⚡',
  typescript: '📘',
  java: '☕',
  cpp: '🔷',
  c: '⚙',
};

export default function SnippetsPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<string>('all');

  const fetchSnippets = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await listSnippets();
      setSnippets(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load snippets');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await deleteSnippet(id);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
      toast.success('Snippet deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleCopyShareLink = async (snippet: Snippet) => {
    if (!snippet.shareToken) {
      toast.error('Make snippet public first to share');
      return;
    }
    const url = getShareUrl(snippet.shareToken);
    await navigator.clipboard.writeText(url);
    toast.success('Share link copied!');
  };

  const handleLoadInEditor = (snippet: Snippet) => {
    sessionStorage.setItem(
      'load-snippet',
      JSON.stringify({ language: snippet.language, code: snippet.code, title: snippet.title }),
    );
    navigate('/');
  };

  const filteredSnippets = snippets.filter((s) => {
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.language.toLowerCase().includes(search.toLowerCase());
    const matchLang = filterLang === 'all' || s.language === filterLang;
    return matchSearch && matchLang;
  });

  const languages = [...new Set(snippets.map((s) => s.language))];

  return (
    <div className="h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/')}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold font-display">My Snippets</h1>
                <p className="text-sm text-muted-foreground">
                  {snippets.length} snippet{snippets.length !== 1 ? 's' : ''} saved
                </p>
              </div>
            </div>
          </div>

          {/* Search / Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search snippets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
            </div>
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <option value="all">All Languages</option>
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {LANG_ICONS[lang] || '📄'} {lang}
                </option>
              ))}
            </select>
          </div>

          {/* Snippet List */}
          {loading ? (
            <div className="text-center py-20 text-muted-foreground">Loading...</div>
          ) : filteredSnippets.length === 0 ? (
            <div className="text-center py-20">
              <FileCode2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">
                {snippets.length === 0
                  ? 'No snippets yet. Save code from the editor!'
                  : 'No snippets match your search.'}
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="mt-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Editor
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  className="group border border-border rounded-lg p-4 hover:border-amber-500/40 transition-colors bg-card/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">
                          {LANG_ICONS[snippet.language] || '📄'}
                        </span>
                        <h3 className="font-semibold text-sm truncate">{snippet.title}</h3>
                        {snippet.isPublic ? (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                            <Globe className="h-2.5 w-2.5" />
                            Public
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            <Lock className="h-2.5 w-2.5" />
                            Private
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {snippet.language} · {new Date(snippet.createdAt).toLocaleDateString()}
                      </p>
                      <pre className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 overflow-hidden max-h-[60px] font-mono">
                        {snippet.code.slice(0, 200)}
                        {snippet.code.length > 200 ? '…' : ''}
                      </pre>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Open in editor"
                        onClick={() => handleLoadInEditor(snippet)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      {snippet.isPublic && snippet.shareToken && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Copy share link"
                          onClick={() => handleCopyShareLink(snippet)}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete"
                        onClick={() => handleDelete(snippet.id, snippet.title)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
