import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, Loader2, Search } from 'lucide-react';
import { mainApi, type ProblemSummary } from '@/lib/mainApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDifficultyBadgeClasses } from '@/lib/difficultyBadge';

const DIFFICULTIES: Array<{ label: string; value?: string }> = [
  { label: 'All', value: undefined },
  { label: 'Easy', value: 'EASY' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Hard', value: 'HARD' },
];

interface PracticeProblemsBrowserProps {
  onSelectProblem: (problem: ProblemSummary) => void;
  onClose?: () => void;
}

export function PracticeProblemsBrowser({ onSelectProblem, onClose }: PracticeProblemsBrowserProps) {
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');

  const query = useQuery({
    queryKey: ['practice-problems', difficulty, search, tag],
    queryFn: () => mainApi.getProblems({ difficulty, search: search.trim() || undefined, tag: tag.trim() || undefined, limit: 50 }),
  });

  const problems = query.data?.problems ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-3 sm:px-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-amber-600" />
          <h2 className="text-base font-bold text-gray-900 sm:text-lg dark:text-gray-100">Practice problems</h2>
          {!query.isLoading && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {problems.length}
            </span>
          )}
        </div>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose} className="h-10">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Back to playground</span>
          </Button>
        )}
      </div>

      <div className="border-b border-gray-200 bg-white px-3 py-3 sm:px-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or slug"
              className="h-11 pl-9 sm:h-10"
            />
          </div>
          <Input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="Filter by tag (e.g. arrays)"
            className="h-11 sm:h-10 sm:w-44"
          />
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDifficulty(option.value)}
                className={`h-10 shrink-0 rounded-md border px-3 text-xs font-semibold ${
                  difficulty === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
        {query.isLoading ? (
          <div className="grid h-full place-items-center text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : query.isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            Failed to load problems. {query.error instanceof Error ? query.error.message : ''}
          </div>
        ) : problems.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900">
            No practice problems match those filters.
          </div>
        ) : (
          <>
            {/* Phone: the 5-column table can't be read at 360px, so each problem
                becomes a full-width tappable card. */}
            <ul className="space-y-2 md:hidden">
              {problems.map((problem) => (
                <li key={problem.id}>
                  <button
                    type="button"
                    onClick={() => onSelectProblem(problem)}
                    className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left active:bg-amber-50 dark:border-gray-700 dark:bg-gray-900 dark:active:bg-gray-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900 dark:text-gray-100">{problem.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{problem.slug}</span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getDifficultyBadgeClasses(problem.difficulty)}`}>
                        {problem.difficulty}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {(problem.tags ?? []).slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {t}
                        </span>
                      ))}
                      <span className="ml-auto text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                        {problem.submissionCount ?? 0} submissions
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block dark:border-gray-700 dark:bg-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left">Title</th>
                  <th className="px-4 py-2 text-left">Difficulty</th>
                  <th className="px-4 py-2 text-left">Tags</th>
                  <th className="px-4 py-2 text-right">Submissions</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem) => (
                  <tr
                    key={problem.id}
                    className="border-t border-gray-100 hover:bg-amber-50 dark:border-gray-800 dark:hover:bg-gray-800"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{problem.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{problem.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getDifficultyBadgeClasses(problem.difficulty)}`}>
                        {problem.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(problem.tags ?? []).slice(0, 4).map((t) => (
                          <span key={t} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {problem.submissionCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => onSelectProblem(problem)}>
                        Solve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PracticeProblemsBrowser;
