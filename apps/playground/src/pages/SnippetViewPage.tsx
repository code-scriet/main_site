import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/playground/Navbar';
import { getSharedSnippet, type Snippet } from '@/utils/snippetsApi';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, ExternalLink, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = shareToken || id || searchParams.get('share');
    if (!token) {
      setError('No snippet identifier provided');
      setLoading(false);
      return;
    }
    getSharedSnippet(token)
      .then(setSnippet)
      .catch((err) => setError(err instanceof Error ? err.message : 'Snippet not found'))
      .finally(() => setLoading(false));
  }, [shareToken, id, searchParams]);

  const handleCopyCode = async () => {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet.code);
    toast.success('Code copied to clipboard!');
  };

  const handleOpenInEditor = () => {
    if (!snippet) return;
    sessionStorage.setItem(
      'load-snippet',
      JSON.stringify({ language: snippet.language, code: snippet.code, title: snippet.title }),
    );
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <Navbar />

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Playground
          </Button>

          {loading ? (
            <div className="text-center py-20 text-muted-foreground">Loading snippet...</div>
          ) : error ? (
            <div className="text-center py-20">
              <FileCode2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">{error}</p>
            </div>
          ) : snippet ? (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{LANG_ICONS[snippet.language] || '📄'}</span>
                    <h1 className="text-2xl font-bold font-display">{snippet.title}</h1>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {snippet.language} · Shared on{' '}
                    {new Date(snippet.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopyCode}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                    onClick={handleOpenInEditor}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Open in Editor
                  </Button>
                </div>
              </div>

              {/* Code Block */}
              <div className="border border-border rounded-lg overflow-hidden bg-[hsl(224,71%,4%)]">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
                  <span className="text-xs font-medium text-muted-foreground">
                    {snippet.language}
                  </span>
                </div>
                <pre className="p-4 overflow-auto text-sm font-mono leading-relaxed text-foreground whitespace-pre">
                  {snippet.code}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
