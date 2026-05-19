// Dashboard v2 — Quiz Manager (CORE_MEMBER+).
// Counts strip + table of quizzes with status pill, participants, creator, actions.
// Pixel-port of screen-admin2.jsx:1037 (QuizManagerScreen). Real api.getQuizAdminList.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Trash2, ExternalLink, Play, Loader2, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type QuizAdminSummary } from '@/lib/api';
import { DSCard, EmptyState, Pill, Section } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { relativeTime } from '@/lib/dateUtils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TONES: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  WAITING: 'warning',
  FINISHED: 'neutral',
  DRAFT: 'neutral',
  ABANDONED: 'danger',
};

export default function QuizManager() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<QuizAdminSummary | null>(null);

  const q = useQuery({
    queryKey: ['quiz-admin-list'],
    queryFn: () => api.getQuizAdminList(token!),
    enabled: Boolean(token),
  });

  const quizzes = q.data ?? [];
  const counts = useMemo(() => ({
    active: quizzes.filter((q) => q.status === 'ACTIVE').length,
    waiting: quizzes.filter((q) => q.status === 'WAITING').length,
    finished: quizzes.filter((q) => q.status === 'FINISHED').length,
    drafts: quizzes.filter((q) => q.status === 'DRAFT').length,
  }), [quizzes]);

  const deleteMut = useMutation({
    mutationFn: (quizId: string) => api.deleteQuiz(quizId, token!),
    onMutate: async (quizId: string) => {
      await qc.cancelQueries({ queryKey: ['quiz-admin-list'] });
      const prev = qc.getQueryData<QuizAdminSummary[]>(['quiz-admin-list']);
      if (prev) {
        qc.setQueryData<QuizAdminSummary[]>(['quiz-admin-list'], prev.filter((quiz) => quiz.id !== quizId));
      }
      return { prev };
    },
    onSuccess: () => {
      toast.success('Quiz deleted');
      setDeleting(null);
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['quiz-admin-list'], ctx.prev);
      toast.error('Failed to delete quiz');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['quiz-admin-list'] }),
  });

  // DRAFT quizzes must transition through `POST /api/quiz/:quizId/open` before they
  // become joinable. CLAUDE.md hard-codes that contract — the host view alone won't open it.
  const openMut = useMutation({
    mutationFn: (quizId: string) => api.openQuiz(quizId, token!),
    onSuccess: (_data, quizId) => {
      toast.success('Quiz opened successfully');
      qc.invalidateQueries({ queryKey: ['quiz-admin-list'] });
      navigate(`/quiz/${quizId}`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Failed to open quiz'),
  });

  // Branch on status: DRAFT → open then navigate; everything else just navigates.
  const handleOpen = (quiz: QuizAdminSummary) => {
    if (quiz.status === 'DRAFT') {
      openMut.mutate(quiz.id);
    } else {
      navigate(`/quiz/${quiz.id}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Manage</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Quizzes</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Run live Kahoot-style quiz sessions. Quizzes are private — joined by PIN only.
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/quiz/create')}>
          <Plus size={13} className="mr-1.5" />
          New quiz
        </Button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 border-y border-[var(--border-subtle)] py-4">
        {([
          ['Active', counts.active, 'var(--success)'],
          ['Waiting', counts.waiting, 'var(--warning)'],
          ['Finished', counts.finished, 'var(--ds-text-2)'],
          ['Drafts', counts.drafts, 'var(--ds-text-3)'],
        ] as Array<[string, number, string]>).map(([k, v, c], i) => (
          <div key={k} className={cn(i > 0 && 'md:border-l md:border-[var(--border-subtle)] md:pl-5')}>
            <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{k}</div>
            <div className="text-[24px] font-semibold tabular-nums leading-none mt-1.5" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {q.isLoading ? (
        <DSCard padded={false}>
          <div className="p-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-[var(--surface-soft)] rounded mb-2 animate-pulse" />)}
          </div>
        </DSCard>
      ) : quizzes.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Play size={18} />}
            title="No quizzes yet"
            body="Create your first live quiz from scratch or by importing a CSV/XLSX."
            action={<Button size="sm" onClick={() => navigate('/quiz/create')}>Create a quiz</Button>}
          />
        </DSCard>
      ) : (
        <DSCard padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold">
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5 w-[100px]">Status</th>
                  <th className="px-4 py-2.5 w-[100px] text-right">Players</th>
                  <th className="px-4 py-2.5 w-[120px]">Created</th>
                  <th className="px-4 py-2.5 w-[120px]">Format</th>
                  <th className="px-4 py-2.5 w-[200px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((qu) => (
                  <Row
                    key={qu.id}
                    quiz={qu}
                    onOpen={() => handleOpen(qu)}
                    onResults={() => navigate(`/quiz/${qu.id}/results`)}
                    onDelete={() => setDeleting(qu)}
                    onEdit={() => navigate(`/quiz/create?edit=${qu.id}`)}
                    opening={openMut.isPending && openMut.variables === qu.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </DSCard>
      )}

      <Section eyebrow="Tips" title="Hosting tips">
        <ul className="text-[12.5px] text-[var(--ds-text-3)] space-y-1.5 list-disc pl-5 max-w-prose">
          <li>Open the quiz a few minutes before kickoff so the lobby fills.</li>
          <li>Use the host view to extend time on slow questions.</li>
          <li>Quizzes don&apos;t recover if your tab closes — leave it open during the session.</li>
        </ul>
      </Section>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the quiz and all of its participation data. There&apos;s no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              disabled={deleteMut.isPending}
              className="bg-[var(--danger)] hover:opacity-90 text-white"
            >
              {deleteMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ quiz, onOpen, onResults, onDelete, onEdit, opening }: { quiz: QuizAdminSummary; onOpen: () => void; onResults: () => void; onDelete: () => void; onEdit: () => void; opening?: boolean }) {
  const status = quiz.status;
  const copyPin = async () => {
    if (!quiz.pin) return;
    try {
      await navigator.clipboard.writeText(quiz.pin);
      toast.success(`PIN ${quiz.pin} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <tr className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]">
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[280px]">{quiz.title}</span>
          {quiz.pin && status !== 'FINISHED' && (
            <button
              type="button"
              onClick={copyPin}
              title="Copy PIN"
              className="font-mono tabular-nums text-[11px] px-1.5 h-5 rounded-[5px] bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:bg-[var(--bg-sunken)] inline-flex items-center gap-1"
            >
              {quiz.pin}
              <Copy size={9} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3"><Pill tone={TONES[status]} size="xs" dot={status === 'ACTIVE'}>{status}</Pill></td>
      <td className="px-4 py-3 font-mono tabular-nums text-right text-[var(--ds-text-2)]">{quiz.participantCount ?? quiz._count?.participants ?? 0}</td>
      <td className="px-4 py-3 font-mono tabular-nums text-[var(--ds-text-3)]">{relativeTime(quiz.createdAt)}</td>
      <td className="px-4 py-3 text-[var(--ds-text-3)]">{quiz.questionCount} questions</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          {status === 'ACTIVE' && <Button size="sm" onClick={onOpen}><ExternalLink size={11} className="mr-1" />Open</Button>}
          {status === 'WAITING' && <Button size="sm" variant="outline" onClick={onOpen}>Start</Button>}
          {status === 'FINISHED' && <Button size="sm" variant="outline" onClick={onResults}>Results</Button>}
          {status === 'DRAFT' && (
            <Button size="sm" variant="outline" onClick={onOpen} disabled={opening}>
              {opening ? <Loader2 size={11} className="mr-1 animate-spin" /> : null}
              Continue
            </Button>
          )}
          {(status === 'DRAFT' || status === 'WAITING') && (
            <button
              type="button"
              title="Edit quiz"
              aria-label="Edit quiz"
              onClick={onEdit}
              className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center"
            >
              <Pencil size={12} />
            </button>
          )}
          <button title="Delete" aria-label="Delete quiz" onClick={onDelete} className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}
