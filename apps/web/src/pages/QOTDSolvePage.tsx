import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';

function normalizeDate(value?: string) {
  return value ? value.slice(0, 10) : value;
}

export default function QOTDSolvePage() {
  const { date } = useParams();
  const location = useLocation();
  const isToday = location.pathname.endsWith('/today');
  const dateKey = isToday ? 'today' : (normalizeDate(date) ?? 'today');
  const [redirectFailed, setRedirectFailed] = useState(false);

  const target = useMemo(() => getPlaygroundLaunchUrl(`/?qotd=${encodeURIComponent(dateKey)}`), [dateKey]);

  useEffect(() => {
    // Scrub any auth-handoff hash from the address bar before we hop domains —
    // history would otherwise retain it and it could leak via Referer / extensions.
    if (typeof window !== 'undefined' && window.location.hash) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // non-fatal
      }
    }
    if (!target) {
      setRedirectFailed(true);
      return;
    }
    try {
      window.location.replace(target);
    } catch {
      setRedirectFailed(true);
    }
  }, [target]);

  return (
    <main
      data-dashboard="true"
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-[var(--bg-canvas)] text-[var(--ds-text-1)]"
    >
      <div className="mx-auto max-w-2xl w-full space-y-6 text-center">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-10 shadow-[var(--shadow-sm)]">
          {redirectFailed ? (
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--warning)]" />
          ) : (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--accent)]" />
          )}
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            {redirectFailed ? 'Could not open the playground' : 'Opening playground…'}
          </h1>
          <p className="mt-2 text-sm text-[var(--ds-text-3)]">
            {redirectFailed
              ? 'Automatic redirect was blocked. Use the button below to continue.'
              : 'The Question of the Day is solved in the playground. We’re sending you there now.'}
          </p>
          <noscript>
            <p className="mt-3 text-xs text-[var(--warning)]">
              JavaScript is disabled in your browser. Use the button below to continue.
            </p>
          </noscript>
          <a
            href={target}
            className="mt-6 inline-flex items-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 h-9 text-[13.5px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
          >
            Solve in Playground
            <ExternalLink className="h-4 w-4" />
          </a>
          <div className="mt-5 text-xs">
            <Link to="/qotd/leaderboard" className="font-medium text-[var(--accent)] hover:underline">
              View QOTD leaderboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
