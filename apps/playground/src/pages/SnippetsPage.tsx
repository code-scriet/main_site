import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileCode2, Globe, Lock, Plus, Search, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '@/components/playground/Navbar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { deleteSnippet, getShareUrl, listSnippets, type Snippet } from '@/utils/snippetsApi';

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
  const [sort, setSort] = useState<'updated' | 'created' | 'title'>('updated');

  const fetchSnippets = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      setSnippets(await listSnippets());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load snippets');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void fetchSnippets();
  }, [fetchSnippets]);

  const languageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    snippets.forEach((snippet) => counts.set(snippet.language, (counts.get(snippet.language) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [snippets]);

  const filteredSnippets = useMemo(() => {
    return snippets
      .filter((snippet) => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query || snippet.title.toLowerCase().includes(query) || snippet.language.toLowerCase().includes(query) || snippet.code.toLowerCase().includes(query);
        const matchesLanguage = filterLang === 'all' || snippet.language === filterLang;
        return matchesSearch && matchesLanguage;
      })
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        const key = sort === 'created' ? 'createdAt' : 'updatedAt';
        return new Date(b[key]).getTime() - new Date(a[key]).getTime();
      });
  }, [filterLang, search, snippets, sort]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await deleteSnippet(id);
      setSnippets((prev) => prev.filter((snippet) => snippet.id !== id));
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
    await navigator.clipboard.writeText(getShareUrl(snippet.shareToken));
    toast.success('Share link copied');
  };

  const handleLoadInEditor = (snippet: Snippet) => {
    sessionStorage.setItem('load-snippet', JSON.stringify({ language: snippet.language, code: snippet.code, title: snippet.title }));
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-warmwhite text-zinc-950 dark:bg-inknight dark:text-zinc-50">
      <Navbar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Snippets</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {snippets.length} saved snippet{snippets.length === 1 ? '' : 's'} across your playground sessions.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate('/')} className="h-9 bg-amber-400 text-amber-950 hover:bg-amber-300">
              <Plus className="mr-2 h-4 w-4" />
              New snippet
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded border border-zinc-200 bg-white/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search snippets..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full rounded border border-zinc-200 bg-warmwhite pl-9 pr-20 text-sm outline-none focus:ring-2 focus:ring-amber-400/40 dark:border-zinc-800 dark:bg-inknight"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800">⌘K</kbd>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFilterLang('all')}
                className={`h-8 rounded px-3 text-xs font-medium ${filterLang === 'all' ? 'bg-amber-400 text-amber-950' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'}`}
              >
                All {snippets.length}
              </button>
              {languageCounts.map(([language, count]) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setFilterLang(language)}
                  className={`h-8 rounded px-3 text-xs font-medium ${filterLang === language ? 'bg-amber-400 text-amber-950' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'}`}
                >
                  {LANG_ICONS[language] || '📄'} {language} {count}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="h-9 rounded border border-zinc-200 bg-warmwhite px-3 text-sm outline-none dark:border-zinc-800 dark:bg-inknight"
            >
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="title">Title</option>
            </select>
          </div>

          {loading ? (
            <div className="py-20 text-center text-sm text-zinc-500">Loading snippets...</div>
          ) : filteredSnippets.length === 0 ? (
            <div className="mt-8 rounded border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded bg-amber-400/10 text-amber-500">
                <FileCode2 className="h-7 w-7" />
              </div>
              <p className="mt-4 font-display text-lg font-semibold">{snippets.length === 0 ? 'No snippets saved yet' : 'No snippets match your filters'}</p>
              <p className="mt-1 text-sm text-zinc-500">Save code from the editor or adjust your filters.</p>
              <Button onClick={() => navigate('/')} className="mt-5 bg-amber-400 text-amber-950 hover:bg-amber-300">
                Open playground
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSnippets.map((snippet) => (
                <article key={snippet.id} className="group rounded border border-zinc-200 bg-white/65 p-4 transition hover:border-amber-400/60 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-semibold">{snippet.title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono dark:bg-zinc-900">{LANG_ICONS[snippet.language] || '📄'} {snippet.language}</span>
                        {snippet.isPublic ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Globe className="h-3 w-3" /> Public</span>
                        ) : (
                          <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Private</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Open" onClick={() => handleLoadInEditor(snippet)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      {snippet.isPublic && snippet.shareToken && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy share link" onClick={() => handleCopyShareLink(snippet)}>
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" title="Delete" onClick={() => handleDelete(snippet.id, snippet.title)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <pre className="mt-4 line-clamp-3 min-h-[72px] overflow-hidden rounded bg-zinc-950 p-3 font-mono text-[12px] leading-6 text-zinc-200">
                    {snippet.code}
                  </pre>
                  <p className="mt-3 text-[11px] text-zinc-500">Updated {new Date(snippet.updatedAt).toLocaleDateString()}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
