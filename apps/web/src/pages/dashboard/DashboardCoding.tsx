import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Code,
  CalendarDays,
  ExternalLink,
  Loader2,
  Search,
  CheckCircle2,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { api, type Problem, type QOTDDetail } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { Link } from 'react-router-dom';

const DIFFICULTY_TONE: Record<string, string> = {
  EASY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HARD: 'bg-rose-50 text-rose-700 border-rose-200',
};

const DIFFICULTIES: Array<{ label: string; value?: string }> = [
  { label: 'All', value: undefined },
  { label: 'Easy', value: 'EASY' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Hard', value: 'HARD' },
];

function describeProblem(problem: Problem | undefined | null): string {
  if (!problem) return '';
  const trimmed = (problem.body ?? '')
    .replace(/^#.*$/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 220).trim()}…` : trimmed;
}

export default function DashboardCoding() {
  const { settings } = useSettings();
  const problemsEnabled = settings?.problemsEnabled === true;
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  const todayQuery = useQuery({
    queryKey: ['dashboard-coding-qotd'],
    queryFn: () => api.getTodayQOTD(),
    enabled: problemsEnabled,
  });

  const problemsQuery = useQuery({
    queryKey: ['dashboard-coding-problems', difficulty, search],
    queryFn: () =>
      api.getProblems({
        difficulty,
        search: search.trim() || undefined,
        limit: 50,
      }),
    enabled: problemsEnabled,
  });

  const qotd = todayQuery.data as QOTDDetail | null | undefined;
  const problems = problemsQuery.data?.problems ?? [];

  const todayQOTDDate = useMemo(() => (qotd?.date ? qotd.date.slice(0, 10) : null), [qotd?.date]);

  if (!problemsEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Coding</h1>
          <p className="text-gray-600">Today's QOTD and the full practice catalog.</p>
        </div>
        <Card className="rounded-2xl border-dashed border-amber-200">
          <CardContent className="p-8 text-center">
            <Code className="mx-auto h-10 w-10 text-amber-400" />
            <h2 className="mt-3 text-lg font-bold text-amber-900">Coding is not enabled yet</h2>
            <p className="mt-2 text-sm text-gray-600">
              An admin needs to flip <span className="font-mono text-xs bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">problemsEnabled</span> in Settings before this tab has anything to show.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Coding</h1>
        <p className="text-gray-600">Today's QOTD and the full practice catalog — open any problem straight in the playground.</p>
      </div>

      {/* Today's QOTD — pinned */}
      {todayQuery.isLoading ? (
        <Card className="rounded-2xl border-amber-100">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading today's QOTD…
          </CardContent>
        </Card>
      ) : qotd && qotd.problemId ? (
        <Card className="rounded-2xl overflow-hidden border-amber-200 shadow-sm bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex-1 min-w-0">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-200/60 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  Today's QOTD
                </div>
                <h2 className="text-xl font-bold text-amber-950">{qotd.problem?.title ?? qotd.question}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold ${
                      DIFFICULTY_TONE[(qotd.problem?.difficulty ?? qotd.difficulty).toUpperCase()] ??
                      'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {(qotd.problem?.difficulty ?? qotd.difficulty).toString()}
                  </span>
                  {todayQOTDDate && (
                    <span className="inline-flex items-center gap-1 text-amber-800/80">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {todayQOTDDate}
                    </span>
                  )}
                  {qotd.hasSubmitted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Solved
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-amber-900/85">
                  {describeProblem(qotd.problem ?? null) || 'Open in the playground to see the full statement.'}
                </p>
              </div>
              <a href={getPlaygroundLaunchUrl('/?qotd=today')} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                <Button size="lg" className="gap-2 bg-amber-600 text-white hover:bg-amber-700 font-semibold">
                  <Code className="h-4 w-4" />
                  Solve in playground
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
              <Link to="/dashboard/leaderboard" className="inline-flex items-center gap-1 font-semibold text-amber-800 hover:text-amber-900">
                <Trophy className="h-3.5 w-3.5" />
                Leaderboard
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : qotd ? (
        <Card className="rounded-2xl border-amber-200 bg-amber-50">
          <CardContent className="p-6 text-sm text-amber-800">
            Today's QOTD is a legacy text-only entry.{' '}
            <a href={qotd.problemLink} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              Open external link
            </a>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border-dashed border-amber-200">
          <CardContent className="p-6 text-sm text-gray-500">No QOTD has been published for today yet — check back later.</CardContent>
        </Card>
      )}

      {/* Practice catalog */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-amber-900">Practice problems</h2>
          {!problemsQuery.isLoading && (
            <span className="text-xs font-semibold text-gray-500">{problems.length} available</span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search problems by title or slug"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDifficulty(option.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                  difficulty === option.value
                    ? 'border-amber-500 bg-amber-50 text-amber-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {problemsQuery.isLoading ? (
          <Card className="rounded-2xl border-gray-100">
            <CardContent className="flex items-center gap-3 p-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading problems…
            </CardContent>
          </Card>
        ) : problems.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-gray-200">
            <CardContent className="p-6 text-center text-sm text-gray-500">
              No practice problems match those filters. Admins can publish past QOTDs / finished contest problems to populate this list.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {problems.map((problem) => {
              const isTodayProblem = qotd?.problemId === problem.id;
              const href = isTodayProblem
                ? getPlaygroundLaunchUrl('/?qotd=today')
                : getPlaygroundLaunchUrl(`/?problem=${encodeURIComponent(problem.id)}`);
              return (
                <Card
                  key={problem.id}
                  className="group rounded-2xl border-gray-100 shadow-sm overflow-hidden transition hover:border-amber-300 hover:shadow-md"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              DIFFICULTY_TONE[problem.difficulty?.toUpperCase() ?? ''] ??
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }`}
                          >
                            {problem.difficulty}
                          </span>
                          {isTodayProblem && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 border border-amber-300">
                              <Sparkles className="h-3 w-3" />
                              Today's QOTD
                            </span>
                          )}
                        </div>
                        <h3 className="truncate text-base font-bold text-gray-900">{problem.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{describeProblem(problem) || 'No description provided.'}</p>
                        {(problem.tags?.length ?? 0) > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(problem.tags ?? []).slice(0, 4).map((tag) => (
                              <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">{problem.submissionCount ?? 0} submission{(problem.submissionCount ?? 0) === 1 ? '' : 's'}</span>
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5 group-hover:border-amber-400">
                          <Code className="h-4 w-4" />
                          Solve
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
