import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, ExternalLink, FileCode2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Navbar } from '@/components/playground/Navbar';
import { Button } from '@/components/ui/button';
import { getSharedSnippet, type Snippet } from '@/utils/snippetsApi';

const LANG_ICONS: Record<string, string> = {
  python: '🐍',
  javascript: '⚡',
  typescript: '📘',
  java: '☕',
  cpp: '🔷',
  c: '⚙',
};

export default function SnippetViewPage() {
  const { shareToken, id } = useParams();
  const navigate = useNavigate();
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = shareToken || id;
    if (!token) {
      setError('No snippet identifier provided');
      setLoading(false);
      return;
    }
    getSharedSnippet(token)
      .then(setSnippet)
      .catch((err) => setError(err instanceof Error ? err.message : 'Snippet not found'))
      .finally(() => setLoading(false));
  }, [shareToken, id]);

  const handleCopyCode = async () => {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet.code);
    toast.success('Code copied');
  };

  const handleOpenInEditor = () => {
    if (!snippet) return;
    sessionStorage.setItem('load-snippet', JSON.stringify({ language: snippet.language, code: snippet.code, title: snippet.title }));
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-warmwhite text-zinc-950 dark:bg-inknight dark:text-zinc-50">
      <Navbar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-6 h-8">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Playground
          </Button>

          {loading ? (
            <div className="py-20 text-center text-sm text-zinc-500">Loading snippet...</div>
          ) : error ? (
            <div className="rounded border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
              <FileCode2 className="mx-auto mb-4 h-12 w-12 text-zinc-400" />
              <p className="text-sm text-zinc-500">{error}</p>
            </div>
          ) : snippet ? (
            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <section className="min-w-0">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono dark:bg-zinc-900">{LANG_ICONS[snippet.language] || '📄'} {snippet.language}</span>
                      {snippet.isPublic && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Globe className="h-3 w-3" /> Public snippet</span>}
                      <span>{new Date(snippet.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">{snippet.title}</h1>
                    <p className="mt-2 text-sm text-zinc-500">Shared by {snippet.userName || 'codescriet user'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyCode}>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button size="sm" className="bg-amber-400 text-amber-950 hover:bg-amber-300" onClick={handleOpenInEditor}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open in playground
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded border border-zinc-800 bg-zinc-950">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
                    <span className="font-mono text-xs text-zinc-400">{snippet.language}</span>
                    <span className="text-[11px] text-zinc-500">read-only</span>
                  </div>
                  <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-[13px] leading-6 text-zinc-100 whitespace-pre">
                    {snippet.code}
                  </pre>
                </div>
              </section>

              <aside className="rounded border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                <h2 className="font-display text-base font-semibold">How to share</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Public snippets can be opened by anyone with the link. Use the playground button to fork this code into your own editor session.
                </p>
              </aside>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
