// Dashboard v2 — competition solve redirects to the playground.
// No in-app Monaco. The playground reads the contest context from query params
// and provides the editor + judging UI there.

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';

export default function CompetitionSolvePage() {
  const { roundId, problemId } = useParams();
  const [redirectFailed, setRedirectFailed] = useState(false);

  const target = useMemo(() => {
    // DSA contests open the multi-problem arena; a specific problem (if any) preselects
    // via ?problem=. The arena hosts the solver, timer, scoreboard and proctor engine.
    if (!roundId) return getPlaygroundLaunchUrl('/');
    const suffix = problemId ? `?problem=${encodeURIComponent(problemId)}` : '';
    return getPlaygroundLaunchUrl(`/contest/${roundId}${suffix}`);
  }, [roundId, problemId]);

  useEffect(() => {
    // Scrub any auth-handoff hash from the address bar before we hop domains —
    // browser history would otherwise retain it and it could leak via the
    // Referer header or browser extensions.
    if (typeof window !== 'undefined' && window.location.hash) {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        // history API blocked — non-fatal
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
          to={roundId ? `/competition/${roundId}/results` : '/dashboard/coding?tab=competitions'}
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
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
              : 'Competition problems are solved in the playground. We’re sending you there with the round context preloaded.'}
          </p>
          <a
            href={target}
            className="mt-6 inline-flex items-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 h-9 text-[13.5px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]"
          >
            Solve in Playground
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </main>
  );
}
