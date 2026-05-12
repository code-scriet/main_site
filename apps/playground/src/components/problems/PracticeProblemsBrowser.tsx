import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpenCheck, Loader2, Search } from 'lucide-react';
import { mainApi, type ProblemSummary } from '@/lib/mainApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Practice problems</h2>
          {!query.isLoading && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {problems.length}
            </span>
          )}
        </div>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to playground
          </Button>
        )}
      </div>

      <div className="border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by title or slug"
              className="pl-9"
            />
          </div>
          <Input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="Filter by tag (e.g. arrays)"
            className="sm:w-44"
          />
          <div className="flex flex-wrap gap-1">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setDifficulty(option.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
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

      <div className="min-h-0 flex-1 overflow-auto p-5">
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
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
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
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
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
        )}
      </div>
    </div>
  );
}

export default PracticeProblemsBrowser;
