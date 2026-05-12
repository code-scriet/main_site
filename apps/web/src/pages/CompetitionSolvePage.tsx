import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ProblemSolverShell from '@/components/problems/ProblemSolverShell';
import { api, type Problem } from '@/lib/api';

type RoundProblemLink = {
  id?: string;
  problemId?: string;
  title?: string;
  difficulty?: string;
  points?: number;
  displayOrder?: number;
  problem?: Problem;
  submission?: { score?: number; verdict?: string } | null;
};

function getProblemId(link: RoundProblemLink) {
  return link.problem?.id ?? link.problemId ?? link.id ?? '';
}

function formatRemaining(seconds?: number | null) {
  const safe = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export default function CompetitionSolvePage() {
  const { roundId, problemId } = useParams();
  const { token } = useAuth();

  const roundQuery = useQuery({
    queryKey: ['competition-round', roundId],
    queryFn: () => api.getCompetitionRound(roundId!, token!),
    enabled: Boolean(roundId && token),
    refetchInterval: 30_000,
  });

  const roundProblems = (roundQuery.data?.problems ?? []) as unknown as RoundProblemLink[];
  const currentProblemId = problemId || getProblemId(roundProblems[0] ?? {});
  const currentLink = useMemo(
    () => roundProblems.find((link) => getProblemId(link) === currentProblemId),
    [currentProblemId, roundProblems],
  );

  const problemQuery = useQuery({
    queryKey: ['problem-detail', currentProblemId, 'CONTEST', roundId],
    queryFn: () => api.getProblem(currentProblemId, { contextType: 'CONTEST', contextKey: roundId!, token: token ?? undefined }),
    enabled: Boolean(currentProblemId && roundId && token),
  });

  const loading = roundQuery.isLoading || problemQuery.isLoading;
  const problem = problemQuery.data?.problem ?? currentLink?.problem ?? null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <Link to={`/competition/${roundId}/results`} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            Results
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {roundProblems.map((link, index) => {
              const id = getProblemId(link);
              return (
                <Link
                  key={id || index}
                  to={`/competition/${roundId}/solve/${id}`}
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${id === currentProblemId ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200'}`}
                >
                  {link.title ?? link.problem?.title ?? `Problem ${index + 1}`}
                  {link.submission?.score !== undefined && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{link.submission.score}</span>}
                </Link>
              );
            })}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">
            <Clock className="h-4 w-4" />
            {roundQuery.data?.status === 'ACTIVE' ? formatRemaining(roundQuery.data.remainingSeconds) : roundQuery.data?.status ?? 'ROUND'}
          </div>
        </div>

        {loading && (
          <div className="grid min-h-[520px] place-items-center rounded-lg border border-gray-200 bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {!loading && !problem && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Problem not found</h1>
            <p className="mt-2 text-gray-600">This round does not include the selected problem.</p>
          </div>
        )}

        {!loading && problem && roundId && (
          <ProblemSolverShell
            problem={problem}
            context={{
              type: 'CONTEST',
              key: roundId,
              submitEnabled: roundQuery.data?.status === 'ACTIVE',
              deadlineLabel: roundQuery.data?.status === 'ACTIVE'
                ? `Contest round is active. Time remaining: ${formatRemaining(roundQuery.data.remainingSeconds)}`
                : 'Contest submissions are closed.',
            }}
          />
        )}
      </div>
    </main>
  );
}
