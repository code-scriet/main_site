import { useEffect, useState } from 'react';
import { BookOpenCheck, CalendarDays, CheckCircle2 } from 'lucide-react';
import { requestMainApiJson } from '@/lib/utils';

type Qotd = {
  id: string;
  date: string;
  question: string;
  difficulty: string;
  problemId?: string | null;
  problem?: { id: string; title: string; difficulty: string } | null;
  hasSubmitted?: boolean;
};

function istDateKey() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

interface ProblemRailsProps {
  onOpenPractice?: () => void;
}

export function ProblemRails({ onOpenPractice }: ProblemRailsProps = {}) {
  const [enabled, setEnabled] = useState(false);
  const [qotd, setQotd] = useState<Qotd | null>(null);
  const [pastQotds, setPastQotds] = useState<Qotd[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const settings = await requestMainApiJson<{ problemsEnabled?: boolean }>('/api/settings/public', { credentials: 'include' });
        if (cancelled || settings.data.problemsEnabled !== true) return;
        setEnabled(true);

        const [today, history] = await Promise.all([
          requestMainApiJson<Qotd | null>('/api/qotd/today', { credentials: 'include' }),
          requestMainApiJson<Qotd[]>('/api/qotd/history?limit=14', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        setQotd(today.data);
        setPastQotds((history.data ?? []).filter((item) => item.date?.slice(0, 10) !== istDateKey()).slice(0, 14));
      } catch {
        if (!cancelled) setEnabled(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="border-b border-border bg-background/95 px-3 py-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(250px,320px)_1fr]">
        {qotd ? (
          <a
            href="/?qotd=today"
            className="rounded-lg border border-border bg-card/90 p-3 text-foreground transition hover:bg-accent/40"
          >
            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-4 w-4 text-amber-500" />
              Today's QOTD
            </div>
            <div className="truncate text-sm font-semibold">{qotd.problem?.title ?? qotd.question}</div>
            <div className="mt-2 inline-flex rounded-full border border-border bg-muted/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {qotd.problem?.difficulty ?? qotd.difficulty}
            </div>
          </a>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-card/80 p-3 text-sm text-muted-foreground">
            No QOTD today.
          </div>
        )}

        <button
          type="button"
          onClick={() => onOpenPractice?.()}
          className="group w-full rounded-lg border border-border bg-card/90 p-3 text-left transition hover:bg-accent/40"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BookOpenCheck className="h-4 w-4 text-amber-500" />
              Practice problems
            </span>
            <span className="text-xs text-amber-600/90 group-hover:text-amber-600">Browse</span>
          </div>
          <div className="mb-2 text-sm font-medium text-foreground">Past QOTDs and archived problem solving</div>
          <div className="grid grid-cols-7 gap-1.5">
            {pastQotds.slice(0, 14).map((item) => (
              <a
                key={item.id}
                href={`/?qotd=${item.date.slice(0, 10)}`}
                onClick={(event) => event.stopPropagation()}
                className="grid aspect-square place-items-center rounded-md border border-border bg-background text-xs font-medium text-muted-foreground transition hover:border-amber-300 hover:text-foreground"
                title={item.problem?.title ?? item.question}
              >
                {item.hasSubmitted ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : new Date(item.date).getDate()}
              </a>
            ))}
          </div>
          {pastQotds.length === 0 && (
            <div className="mt-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No recent QOTDs yet.
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground">
            Contests are now accessed from each event page.
          </div>
        </button>
      </div>
    </div>
  );
}
