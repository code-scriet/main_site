// Dashboard v2 — Admin · Submission Review.
// The grading queue for submissions that need a human: captures made while
// judging was down (verdict JUDGE_ERROR, auto-flagged) and student appeals.
// Each row shows the code + lets an admin set verdict + score, which resolves
// it out of the queue (POST override → needsReview:false).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, ExternalLink, RefreshCw, Gavel, Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type ProblemSubmission, type SubmissionVerdict } from '@/lib/api';
import { DSCard, EmptyState, MonoChip, Pill } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const VERDICTS: SubmissionVerdict[] = [
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'RUNTIME_ERROR',
  'COMPILATION_ERROR',
  'JUDGE_ERROR',
  'PENDING',
];

function verdictTone(v: SubmissionVerdict): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (v === 'ACCEPTED') return 'success';
  if (v === 'WRONG_ANSWER' || v === 'RUNTIME_ERROR' || v === 'COMPILATION_ERROR') return 'danger';
  if (v === 'TIME_LIMIT_EXCEEDED') return 'warning';
  if (v === 'JUDGE_ERROR') return 'info';
  return 'neutral';
}

function ReviewRow({ s, token, onGraded }: { s: ProblemSubmission; token: string; onGraded: () => void }) {
  const [verdict, setVerdict] = useState<SubmissionVerdict>(s.verdict === 'JUDGE_ERROR' ? 'ACCEPTED' : s.verdict);
  const [score, setScore] = useState<number>(s.score ?? 0);
  const [notes, setNotes] = useState<string>('');
  const [showCode, setShowCode] = useState(false);

  const grade = useMutation({
    mutationFn: () =>
      api.adminOverrideSubmission(
        s.problemId,
        s.id,
        { verdict, score: Math.max(0, Math.min(100, Math.round(score))), notes: notes.trim() || 'Manual review' },
        token,
      ),
    onSuccess: () => {
      toast.success('Graded — removed from queue');
      onGraded();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to grade'),
  });

  // Reopened-past-QOTD solve: a binary accept/reject. Accept flips PENDING →
  // ACCEPTED and recomputes the solver's streak + leaderboard; reject discards it.
  const acceptReopen = useMutation({
    mutationFn: () => api.adminAcceptReopenSubmission(s.id, token),
    onSuccess: () => { toast.success('Accepted — streak & leaderboard updated'); onGraded(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to accept'),
  });
  const rejectReopen = useMutation({
    mutationFn: () => api.adminRejectReopenSubmission(s.id, token, notes.trim() || undefined),
    onSuccess: () => { toast.success('Rejected — does not count'); onGraded(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to reject'),
  });
  const reopenBusy = acceptReopen.isPending || rejectReopen.isPending;

  const who = s.user?.name ?? s.user?.email ?? s.userId.slice(0, 8);

  return (
    <DSCard className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={verdictTone(s.verdict)} size="xs">{s.verdict}</Pill>
          {s.reopenPending && <Pill tone="info" size="xs">REOPENED · {s.passedCount}/{s.totalCount} PASSED</Pill>}
          {s.appealedAt && <Pill tone="warning" size="xs">APPEALED</Pill>}
          <span className="text-sm font-medium" style={{ color: 'var(--ds-text-1)' }}>{who}</span>
          {s.problem && (
            <Link to={`/admin/problems?problemId=${s.problem.id}`} className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              {s.problem.title} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <MonoChip>{s.language}</MonoChip>
          <span className="text-xs" style={{ color: 'var(--ds-text-3)' }}>
            {s.contextType}{s.contextKey ? ` · ${s.contextKey.slice(0, 12)}` : ''}
          </span>
        </div>
        <span className="text-xs tabular-nums" style={{ color: 'var(--ds-text-3)' }}>
          {new Date(s.appealedAt || s.updatedAt).toLocaleString()}
        </span>
      </div>

      {s.appealNote && (
        <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'var(--bg-sunken)', color: 'var(--ds-text-2)' }}>
          <span className="font-medium">Appeal: </span>{s.appealNote}
        </p>
      )}

      <button type="button" onClick={() => setShowCode((v) => !v)} className="self-start text-xs underline" style={{ color: 'var(--ds-text-2)' }}>
        {showCode ? 'Hide code' : 'View code'} ({s.code.length} chars)
      </button>
      {showCode && (
        <pre className="max-h-80 overflow-auto rounded-md p-3 text-xs" style={{ background: 'var(--bg-sunken)', color: 'var(--ds-text-1)' }}>
          <code>{s.code}</code>
        </pre>
      )}
      {s.compilerOutput && (
        <pre className="max-h-40 overflow-auto rounded-md p-3 text-xs" style={{ background: 'var(--bg-sunken)', color: 'var(--ds-text-2)' }}>
          <code>{s.compilerOutput}</code>
        </pre>
      )}

      {s.reopenPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2.5" style={{ borderColor: 'var(--accent)', background: 'var(--accent-subtle)' }}>
          <span className="text-xs" style={{ color: 'var(--ds-text-2)' }}>
            Late solve via a reopen link — judged {s.passedCount}/{s.totalCount}. Accept to count it toward the solver's streak, marks &amp; leaderboard.
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => acceptReopen.mutate()} disabled={reopenBusy} className="h-9">
              {acceptReopen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span className="ml-1">Accept</span>
            </Button>
            <Button size="sm" variant="outline" onClick={() => rejectReopen.mutate()} disabled={reopenBusy} className="h-9">
              {rejectReopen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              <span className="ml-1">Reject</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--ds-text-2)' }}>
          Verdict
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as SubmissionVerdict)}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--ds-text-1)' }}
          >
            {VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs" style={{ color: 'var(--ds-text-2)' }}>
          Score
          <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="h-9" />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs" style={{ color: 'var(--ds-text-2)' }}>
          Notes (optional)
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for this grade" className="h-9" />
        </label>
        <Button onClick={() => grade.mutate()} disabled={grade.isPending} className="h-9">
          {grade.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
          <span className="ml-1">Grade</span>
        </Button>
      </div>
    </DSCard>
  );
}

export default function AdminSubmissionReview() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['admin-review-queue'], []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => api.adminGetReviewQueue(token!, 100),
    enabled: Boolean(token),
  });

  const submissions = data?.submissions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--ds-text-1)' }}>Submission Review</h1>
          <p className="text-sm" style={{ color: 'var(--ds-text-3)' }}>
            Captures made while judging was unavailable, student appeals, and late solves of reopened QOTDs awaiting your acceptance.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-9">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--ds-text-3)' }} /></div>
      ) : submissions.length === 0 ? (
        <EmptyState title="Nothing to review" body="No judge-failed captures or appeals are waiting. You're all caught up." />
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((s) => (
            <ReviewRow key={s.id} s={s} token={token!} onGraded={() => qc.invalidateQueries({ queryKey })} />
          ))}
        </div>
      )}
    </div>
  );
}
