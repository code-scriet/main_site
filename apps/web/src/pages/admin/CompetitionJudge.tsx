// Admin Competition Judge — inner submissions / scoring page.
// Design source: code-scriet-innerdashboard/project/js/screen-admin.jsx
//   - AdminJudgeScreen (lines 433-535) — header w/ back + judging pill,
//     12-col grid: submissions list (col-span-5) + code preview + score form
//     (col-span-7). The IMAGE_TARGET path adopts that two-pane layout; DSA
//     retains its tabular auto-judge view (no design equivalent — preserved
//     because real scoring runs through the Problems judge).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type CompetitionRound, type CompetitionSubmission, type CompetitionMissingTeam, type SubmissionVerdict } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { formatDateTime } from '@/lib/dateUtils';
import { PendingCapRequestsTray } from '@/components/problems/PendingCapRequestsTray';
import { Avatar, DSCard, EmptyState, Field, NumericPromptDialog, Pill } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as ConfirmDialogContent,
  AlertDialogDescription as ConfirmDialogDescription,
  AlertDialogFooter as ConfirmDialogFooter,
  AlertDialogHeader as ConfirmDialogHeader,
  AlertDialogTitle as ConfirmDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  AlertCircle,
  ChevronLeft,
  CheckCircle2,
  ClipboardCheck,
  Code,
  Copy,
  FileCode2,
  Image as ImageIcon,
  Loader2,
  Monitor,
  RefreshCw,
  Save,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SortMode = 'score' | 'time';
type ScoreFilter = 'all' | 'unscored' | 'scored';
const DSA_VERDICTS: SubmissionVerdict[] = ['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILATION_ERROR', 'JUDGE_ERROR'];

type DraftScore = {
  score: string;
  adminNotes: string;
  dirty: boolean;
  saving: boolean;
};

function scoreToInput(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

function getAutoSubmitLabel(isAutoSubmit: boolean) {
  return isAutoSubmit ? 'Auto-submitted at expiry' : 'Manual submit';
}

function parseScore(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function getDraftStorageKey(roundId: string) {
  return `judge-drafts:${roundId}`;
}

function readStoredDrafts(roundId: string): Record<string, DraftScore> {
  if (!roundId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(roundId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { score?: unknown; adminNotes?: unknown }>;
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, draft]) => typeof draft.score === 'string' && typeof draft.adminNotes === 'string')
        .map(([id, draft]) => [
          id,
          {
            score: draft.score as string,
            adminNotes: draft.adminNotes as string,
            dirty: true,
            saving: false,
          },
        ]),
    );
  } catch {
    return {};
  }
}

function writeStoredDrafts(roundId: string, drafts: Record<string, DraftScore>) {
  if (!roundId || typeof window === 'undefined') return;
  const dirtyDrafts = Object.fromEntries(
    Object.entries(drafts)
      .filter(([, draft]) => draft.dirty)
      .map(([id, draft]) => [id, { score: draft.score, adminNotes: draft.adminNotes }]),
  );

  if (Object.keys(dirtyDrafts).length === 0) {
    window.localStorage.removeItem(getDraftStorageKey(roundId));
  } else {
    window.localStorage.setItem(getDraftStorageKey(roundId), JSON.stringify(dirtyDrafts));
  }
}

function clearStoredDrafts(roundId: string) {
  if (!roundId || typeof window === 'undefined') return;
  window.localStorage.removeItem(getDraftStorageKey(roundId));
}

/** Compute auto-rank preview from draft scores: highest score = rank 1, ties broken by submission time */
function computeAutoRanks(
  submissions: CompetitionSubmission[],
  drafts: Record<string, DraftScore>,
): Map<string, number> {
  const withScores = submissions
    .map((sub) => {
      const draft = drafts[sub.id];
      const score = draft ? parseScore(draft.score) : sub.score ?? undefined;
      return { id: sub.id, score, submittedAt: new Date(sub.submittedAt).getTime() };
    })
    .filter((item): item is { id: string; score: number; submittedAt: number } => item.score !== undefined);

  // Sort by score DESC, then by submission time ASC (earlier wins ties)
  withScores.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.submittedAt - b.submittedAt;
  });

  const rankMap = new Map<string, number>();
  withScores.forEach((item, index) => {
    rankMap.set(item.id, index + 1);
  });
  return rankMap;
}

export default function CompetitionJudge() {
  const { roundId = '' } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();

  const { settings } = useSettings();
  const accent = settings?.accentColor || 'rust';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [round, setRound] = useState<CompetitionRound | null>(null);
  const [submissions, setSubmissions] = useState<CompetitionSubmission[]>([]);
  const [missingTeams, setMissingTeams] = useState<CompetitionMissingTeam[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftScore>>({});
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [showReference, setShowReference] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [activeCodeSubmission, setActiveCodeSubmission] = useState<CompetitionSubmission | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  // NumericPromptDialog replaces the legacy window.prompt for DSA score override.
  const [dsaScoreTarget, setDsaScoreTarget] = useState<CompetitionSubmission | null>(null);
  // Right-pane state for the IMAGE_TARGET two-pane layout — which submission
  // is currently selected, and which tab is showing (preview vs source).
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');

  const load = useCallback(async () => {
    if (!token || !roundId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getCompetitionSubmissions(roundId, token);
      const storedDrafts = readStoredDrafts(roundId);
      setRound(response.round);
      setSubmissions(response.submissions);
      setMissingTeams(response.missingTeams || []);
      setDrafts((prev) => {
        const next: Record<string, DraftScore> = {};
        for (const submission of response.submissions) {
          const existing = prev[submission.id];
          const stored = storedDrafts[submission.id];
          next[submission.id] = existing
            ? existing
            : stored
              ? stored
            : {
                score: scoreToInput(submission.score),
                adminNotes: submission.adminNotes || '',
                dirty: false,
                saving: false,
              };
        }
        return next;
      });
      setDraftsHydrated(true);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to load judging data'));
    } finally {
      setLoading(false);
    }
  }, [token, roundId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draftsHydrated) return;
    writeStoredDrafts(roundId, drafts);
  }, [drafts, draftsHydrated, roundId]);

  // Auto-computed rank preview based on current draft scores
  const autoRanks = useMemo(
    () => computeAutoRanks(submissions, drafts),
    [submissions, drafts],
  );

  const sortedSubmissions = useMemo(() => {
    const items = submissions.filter((sub) => {
      const draft = drafts[sub.id];
      const score = draft ? parseScore(draft.score) : sub.score ?? undefined;
      if (scoreFilter === 'unscored') return score === undefined;
      if (scoreFilter === 'scored') return score !== undefined;
      return true;
    });

    if (sortMode === 'time') {
      items.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
      return items;
    }
    // Sort by auto-rank (scored first, unscored at end)
    items.sort((a, b) => {
      const aRank = autoRanks.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = autoRanks.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
    return items;
  }, [submissions, drafts, scoreFilter, sortMode, autoRanks]);

  const unsavedIds = useMemo(
    () => Object.entries(drafts).filter(([, draft]) => draft.dirty).map(([id]) => id),
    [drafts],
  );

  // Publish is enabled when ALL submissions have a score (ranks are auto-computed on publish)
  const allScored = useMemo(() => {
    if (submissions.length === 0) return false;
    return submissions.every((sub) => {
      const draft = drafts[sub.id];
      const score = draft ? parseScore(draft.score) : sub.score ?? undefined;
      return score !== undefined;
    });
  }, [submissions, drafts]);

  const scoredCount = useMemo(() => {
    return submissions.filter((sub) => {
      const draft = drafts[sub.id];
      const score = draft ? parseScore(draft.score) : sub.score ?? undefined;
      return score !== undefined;
    }).length;
  }, [submissions, drafts]);
  const unscoredCount = submissions.length - scoredCount;

  const onDraftChange = (submissionId: string, field: keyof Pick<DraftScore, 'score' | 'adminNotes'>, value: string) => {
    setDrafts((prev) => {
      const base = prev[submissionId] || { score: '', adminNotes: '', dirty: false, saving: false };
      return {
        ...prev,
        [submissionId]: {
          ...base,
          [field]: value,
          dirty: true,
        },
      };
    });
  };

  const saveSubmission = async (submissionId: string) => {
    if (!token) return;
    const draft = drafts[submissionId];
    if (!draft) return;
    const score = parseScore(draft.score);

    setDrafts((prev) => ({
      ...prev,
      [submissionId]: { ...prev[submissionId], saving: true },
    }));
    setError(null);

    try {
      await api.scoreCompetitionSubmission(roundId, submissionId, {
        score,
        adminNotes: draft.adminNotes.trim() || undefined,
      }, token);

      setDrafts((prev) => ({
        ...prev,
        [submissionId]: {
          ...prev[submissionId],
          dirty: false,
          saving: false,
          score: scoreToInput(score),
          adminNotes: draft.adminNotes,
        },
      }));
      setSuccess('Score saved');
      await load();
    } catch (err) {
      setDrafts((prev) => ({
        ...prev,
        [submissionId]: { ...prev[submissionId], saving: false },
      }));
      setError(extractApiErrorMessage(err, 'Failed to save score'));
    }
  };

  const saveAll = async () => {
    if (!token || unsavedIds.length === 0) return;
    setSavingAll(true);
    setError(null);
    setSuccess(null);
    try {
      for (const submissionId of unsavedIds) {
        const draft = drafts[submissionId];
        if (!draft) continue;
        const score = parseScore(draft.score);
        await api.scoreCompetitionSubmission(roundId, submissionId, {
          score,
          adminNotes: draft.adminNotes.trim() || undefined,
        }, token);
      }
      setSuccess('All scores saved');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed while saving all scores'));
    } finally {
      setSavingAll(false);
    }
  };

  const publishResults = async () => {
    if (!token) return;
    if (unsavedIds.length > 0) {
      // Save all unsaved scores first, then publish
      setSavingAll(true);
      try {
        for (const submissionId of unsavedIds) {
          const draft = drafts[submissionId];
          if (!draft) continue;
          const score = parseScore(draft.score);
          await api.scoreCompetitionSubmission(roundId, submissionId, {
            score,
            adminNotes: draft.adminNotes.trim() || undefined,
          }, token);
        }
      } catch (err) {
        setSavingAll(false);
        setError(extractApiErrorMessage(err, 'Failed to save scores before publishing'));
        return;
      }
      setSavingAll(false);
    }

    try {
      await api.finishCompetition(roundId, token);
      clearStoredDrafts(roundId);
      setSuccess('Results published — ranks computed from scores');
      setPublishDialogOpen(false);
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to publish results'));
    }
  };

  const openCodeModal = (submission: CompetitionSubmission) => {
    setActiveCodeSubmission(submission);
    setCodeModalOpen(true);
  };

  const copyCode = async () => {
    if (!activeCodeSubmission) return;
    try {
      await navigator.clipboard.writeText(activeCodeSubmission.code);
      setSuccess('Code copied');
    } catch {
      setError('Failed to copy code');
    }
  };

  const updateReferenceUrl = async () => {
    if (!token || !round) return;
    try {
      await api.updateCompetitionRound(round.id, { targetImageUrl: referenceImageUrl.trim() || null }, token);
      await load();
      setSuccess('Reference updated');
      setReferenceDialogOpen(false);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to update reference image'));
    }
  };

  const overrideDsaSubmission = async (submission: CompetitionSubmission, patch: { verdict?: SubmissionVerdict; score?: number }) => {
    if (!token || !submission.problemId) return;
    try {
      await api.adminOverrideSubmission(submission.problemId, submission.id, patch, token);
      setSuccess('Override saved');
      await load();
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to override submission'));
    }
  };

  if (loading) {
    return (
      <div data-dashboard data-accent={accent} className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (!round) {
    return (
      <div data-dashboard data-accent={accent}>
        <DSCard>
          <EmptyState
            icon={<AlertCircle size={18} />}
            title="Round not found"
            body="It may have been deleted or you don't have access."
            action={<Button size="sm" onClick={() => navigate('/admin/competition')}>Back to rounds</Button>}
          />
        </DSCard>
      </div>
    );
  }

  // Shared header — used by both DSA and IMAGE_TARGET paths. Matches design
  // line 437-448: back chevron + event/title eyebrow + Judging pill.
  const statusToneMap: Record<CompetitionRound['status'], 'neutral' | 'success' | 'warning' | 'info' | 'accent'> = {
    DRAFT: 'neutral',
    ACTIVE: 'success',
    LOCKED: 'warning',
    JUDGING: 'info',
    FINISHED: 'accent',
  };
  const judgeHeader = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => navigate('/admin/competition')}
        className="size-8 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center transition-colors"
        aria-label="Back to rounds"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">
          {round.eventTitle || 'Event'} · {round.roundType === 'DSA' ? 'DSA' : 'Image Target'}
        </div>
        <h1 className="text-[20px] font-semibold tracking-tight truncate">{round.title}</h1>
      </div>
      <Pill tone={statusToneMap[round.status]} size="md" dot={round.status === 'ACTIVE'}>
        {round.status === 'JUDGING' ? 'Judging' : round.status.charAt(0) + round.status.slice(1).toLowerCase()}
      </Pill>
      <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );

  const errorAlert = error ? (
    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[12.5px]">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span className="flex-1">{error}</span>
    </div>
  ) : null;
  const successAlert = success ? (
    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)] text-[12.5px]">
      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span className="flex-1">{success}</span>
    </div>
  ) : null;

  if (round.roundType === 'DSA') {
    return (
      <div data-dashboard data-accent={accent} className="flex flex-col gap-4">
        {judgeHeader}
        <PendingCapRequestsTray
          contextType="CONTEST"
          contextKey={round.id}
          title="Pending submit-cap requests for this round"
          defaultExpanded
        />
        {errorAlert}
        {successAlert}

        <DSCard padded={false}>
          <div className="p-3 flex items-center justify-between border-b border-[var(--border-subtle)] gap-2 flex-wrap">
            <div>
              <div className="text-[13.5px] font-semibold">Auto-judged submissions</div>
              <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5">
                Scores come from the Problems judge. Overrides only for exceptional cases.
              </div>
            </div>
            <Pill tone="info" size="xs">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</Pill>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                  <th className="py-2 px-3">User</th>
                  <th className="py-2 px-3">Problem</th>
                  <th className="py-2 px-3">Verdict</th>
                  <th className="py-2 px-3 text-right">Score</th>
                  <th className="py-2 px-3">Tests</th>
                  <th className="py-2 px-3 text-right">Runtime</th>
                  <th className="py-2 px-3 text-right">Override</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => {
                  const vTone: 'success' | 'danger' | 'warning' | 'neutral' =
                    submission.verdict === 'ACCEPTED' ? 'success'
                      : submission.verdict === 'WRONG_ANSWER' ? 'danger'
                      : submission.verdict === 'TIME_LIMIT_EXCEEDED' || submission.verdict === 'RUNTIME_ERROR' ? 'warning'
                      : 'neutral';
                  return (
                    <tr key={submission.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]/40 align-top">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={submission.userName || 'User'} size={26} />
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--ds-text-1)] truncate">{submission.userName}</p>
                            <p className="text-[11px] text-[var(--ds-text-3)] truncate font-mono">{submission.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[var(--ds-text-2)]">{submission.problemTitle}</td>
                      <td className="py-3 px-3"><Pill tone={vTone} size="xs">{submission.verdict}</Pill></td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">{submission.score ?? 0}</td>
                      <td className="py-3 px-3 font-mono tabular-nums text-[var(--ds-text-2)]">
                        {submission.passedCount ?? 0}/{submission.totalCount ?? 0}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--ds-text-2)]">
                        {submission.runtimeMs ?? '—'}{submission.runtimeMs != null && ' ms'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openCodeModal(submission)} className="gap-1.5">
                            <FileCode2 className="h-3.5 w-3.5" /> Code
                          </Button>
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (event.target.value) void overrideDsaSubmission(submission, { verdict: event.target.value as SubmissionVerdict });
                            }}
                            className="h-7 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[11.5px] focus:border-[var(--accent)] outline-none"
                          >
                            <option value="">Verdict…</option>
                            {DSA_VERDICTS.map((verdict) => <option key={verdict} value={verdict}>{verdict}</option>)}
                          </select>
                          <Button variant="outline" size="sm" onClick={() => setDsaScoreTarget(submission)}>Score</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {submissions.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-[var(--ds-text-3)]">No submissions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DSCard>

        <DSCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12.5px] text-[var(--ds-text-2)]">Auto-judged results can be published after the round is locked.</p>
            <Button
              className="gap-1.5"
              disabled={!['LOCKED', 'JUDGING'].includes(round.status)}
              onClick={() => void publishResults()}
            >
              <Trophy className="h-3.5 w-3.5" />
              Publish results
            </Button>
          </div>
        </DSCard>
      </div>
    );
  }

  // IMAGE_TARGET — two-pane judging layout (design line 450-531).
  // Default the right pane to the highest-ranked / first submission so the
  // page doesn't open with an empty preview.
  const effectivePickedId = pickedId && submissions.some((s) => s.id === pickedId)
    ? pickedId
    : sortedSubmissions[0]?.id ?? null;
  const pickedSubmission = effectivePickedId
    ? submissions.find((s) => s.id === effectivePickedId) ?? null
    : null;
  const pickedDraft: DraftScore = pickedSubmission
    ? drafts[pickedSubmission.id] || {
        score: scoreToInput(pickedSubmission.score),
        adminNotes: pickedSubmission.adminNotes || '',
        dirty: false,
        saving: false,
      }
    : { score: '', adminNotes: '', dirty: false, saving: false };
  const pickedAutoRank = pickedSubmission ? autoRanks.get(pickedSubmission.id) : undefined;
  const pickedReviewed = pickedSubmission
    ? parseScore(pickedDraft.score) !== undefined
    : false;

  return (
    <div data-dashboard data-accent={accent} className="flex flex-col gap-4">
      {judgeHeader}

      {/* Stat strip */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill tone="info" size="sm">{submissions.length} submission{submissions.length === 1 ? '' : 's'}</Pill>
        <Pill tone={scoredCount === submissions.length && submissions.length > 0 ? 'success' : 'warning'} size="sm">
          {scoredCount}/{submissions.length} scored
        </Pill>
        {missingTeams.length > 0 && (
          <Pill tone="accent" size="sm" icon={<Users size={11} />}>{missingTeams.length} team{missingTeams.length === 1 ? '' : 's'} missing</Pill>
        )}
        {unsavedIds.length > 0 && (
          <Pill tone="warning" size="sm" dot>
            <span className="font-mono tabular-nums">{unsavedIds.length}</span> unsaved
          </Pill>
        )}
      </div>

      {errorAlert}
      {successAlert}

      {/* Reference image — collapsed by default; toggles in the header bar */}
      <DSCard padded={false} className="p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon className="h-4 w-4 text-[var(--ds-text-3)] shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Reference image</div>
            <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">
              {round.targetImageUrl ? 'Admin-only design reference for judging comparison.' : 'No reference image set.'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {round.targetImageUrl && (
            <Button variant="ghost" size="sm" onClick={() => setShowReference((prev) => !prev)}>
              {showReference ? 'Hide' : 'Show'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setReferenceImageUrl(round.targetImageUrl || '');
              setReferenceDialogOpen(true);
            }}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {round.targetImageUrl ? 'Update' : 'Set reference'}
          </Button>
        </div>
      </DSCard>
      {showReference && round.targetImageUrl && (
        <DSCard padded={false} className="overflow-hidden">
          <img
            src={round.targetImageUrl}
            alt="Round reference"
            className="w-full max-h-[360px] object-contain bg-[var(--surface-soft)]"
          />
        </DSCard>
      )}

      {/* Two-pane: submissions list + preview/code + score form */}
      <div className="grid lg:grid-cols-12 gap-4">
        {/* Submissions list — design line 451-477 */}
        <DSCard padded={false} className="lg:col-span-5 flex flex-col min-h-[480px]">
          <div className="p-3 flex items-center justify-between border-b border-[var(--border-subtle)] gap-2 flex-wrap">
            <div className="text-[13px] font-semibold">Submissions</div>
            <div className="flex items-center gap-1.5">
              {unscoredCount > 0 && <Pill tone="warning" size="xs">{unscoredCount} pending</Pill>}
              {scoredCount > 0 && <Pill tone="success" size="xs">{scoredCount} done</Pill>}
            </div>
          </div>

          {/* Filter / sort row */}
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 flex-wrap text-[11.5px]">
            <span className="text-[var(--ds-text-3)] uppercase tracking-[0.06em] font-semibold mr-1">Sort</span>
            {(['score', 'time'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={cn(
                  'h-6 px-2 rounded-[5px] capitalize transition-colors',
                  sortMode === mode
                    ? 'bg-[var(--ds-text-1)] text-[var(--text-inverse)]'
                    : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:bg-[var(--bg-sunken)]',
                )}
              >
                {mode}
              </button>
            ))}
            <span className="text-[var(--ds-text-3)] uppercase tracking-[0.06em] font-semibold mx-2">Show</span>
            {(['all', 'unscored', 'scored'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setScoreFilter(mode)}
                className={cn(
                  'h-6 px-2 rounded-[5px] capitalize transition-colors',
                  scoreFilter === mode
                    ? 'bg-[var(--ds-text-1)] text-[var(--text-inverse)]'
                    : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:bg-[var(--bg-sunken)]',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex-1 max-h-[600px] overflow-y-auto">
            {sortedSubmissions.length === 0 ? (
              <div className="py-10 text-center text-[12.5px] text-[var(--ds-text-3)]">
                No submissions match the current filter.
              </div>
            ) : (
              sortedSubmissions.map((submission) => {
                const draft = drafts[submission.id] || {
                  score: scoreToInput(submission.score),
                  adminNotes: submission.adminNotes || '',
                  dirty: false,
                  saving: false,
                };
                const score = parseScore(draft.score) ?? submission.score ?? null;
                const reviewed = score !== null && score !== undefined;
                const autoRank = autoRanks.get(submission.id);
                const isPicked = effectivePickedId === submission.id;
                return (
                  <button
                    key={submission.id}
                    onClick={() => setPickedId(submission.id)}
                    className={cn(
                      'w-full px-3 py-2.5 flex items-center gap-3 border-t border-[var(--border-subtle)] text-left transition-colors first:border-t-0',
                      isPicked
                        ? 'bg-[var(--accent-subtle)]/40'
                        : 'hover:bg-[var(--surface-soft)]',
                    )}
                  >
                    <span className="font-mono tabular-nums text-[var(--ds-text-3)] w-[28px] text-[12px] shrink-0">
                      {autoRank ? `#${autoRank}` : '—'}
                    </span>
                    <Avatar name={submission.teamName || submission.userName || 'P'} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium leading-tight truncate">
                        {submission.teamName || submission.userName || 'Participant'}
                      </div>
                      <div className="text-[11px] text-[var(--ds-text-3)] mt-0.5 truncate">
                        {submission.isAutoSubmit ? 'Auto · ' : 'Manual · '}
                        <span className="font-mono tabular-nums">{submission.code.length}</span> chars
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-[14px] font-semibold w-[36px] text-right shrink-0">
                      {score !== null && score !== undefined ? score : '—'}
                    </span>
                    <Pill tone={reviewed ? 'success' : 'warning'} size="xs">
                      {draft.dirty ? 'Draft' : reviewed ? 'Done' : 'Pending'}
                    </Pill>
                  </button>
                );
              })
            )}
          </div>

          {missingTeams.length > 0 && (
            <div className="border-t border-[var(--border-subtle)] p-3 flex flex-col gap-1.5 max-h-[140px] overflow-y-auto">
              <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-0.5">
                Teams without a submission
              </div>
              {missingTeams.map((team) => (
                <div key={team.id} className="text-[11.5px] text-[var(--ds-text-2)] flex items-center gap-2">
                  <Users className="h-3 w-3 text-[var(--ds-text-3)]" />
                  <span className="font-medium">{team.teamName}</span>
                  {team.members.length > 0 && (
                    <span className="text-[var(--ds-text-3)] truncate">· {team.members.join(', ')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DSCard>

        {/* Right pane: preview + score form — design line 480-531 */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          {pickedSubmission ? (
            <>
              <DSCard padded={false} className="overflow-hidden">
                <div className="h-10 border-b border-[var(--border-subtle)] flex items-center justify-between px-3 bg-[var(--bg-sunken)] gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-[12px] min-w-0">
                    <Avatar name={pickedSubmission.teamName || pickedSubmission.userName || 'P'} size={22} />
                    <span className="font-medium text-[var(--ds-text-1)] truncate">
                      {pickedSubmission.teamName || pickedSubmission.userName || 'Participant'}
                    </span>
                    <span className="h-3 w-px bg-[var(--border-default)] mx-1" />
                    <span className="text-[var(--ds-text-3)] font-mono">
                      {pickedSubmission.code.length} chars
                    </span>
                    {pickedAutoRank && (
                      <>
                        <span className="h-3 w-px bg-[var(--border-default)] mx-1" />
                        <span className="text-[var(--ds-text-3)] font-mono tabular-nums">
                          rank #{pickedAutoRank}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Preview / Code toggle */}
                    <div className="flex items-center gap-0.5 p-0.5 rounded-[6px] bg-[var(--bg-raised)] border border-[var(--border-subtle)]">
                      <button
                        onClick={() => setPreviewMode('preview')}
                        className={cn(
                          'inline-flex items-center gap-1 h-6 px-2 rounded-[4px] text-[11px] font-medium transition-colors',
                          previewMode === 'preview'
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                            : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                        )}
                      >
                        <Monitor className="h-3 w-3" /> Preview
                      </button>
                      <button
                        onClick={() => setPreviewMode('code')}
                        className={cn(
                          'inline-flex items-center gap-1 h-6 px-2 rounded-[4px] text-[11px] font-medium transition-colors',
                          previewMode === 'code'
                            ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                            : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
                        )}
                      >
                        <Code className="h-3 w-3" /> Code
                      </button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openCodeModal(pickedSubmission)} className="gap-1.5">
                      <FileCode2 className="h-3.5 w-3.5" /> Expand
                    </Button>
                  </div>
                </div>
                {previewMode === 'preview' ? (
                  <div className="bg-white">
                    {/* sandbox="" renders HTML/CSS safely without JS execution. */}
                    <iframe
                      title={`Submission ${pickedSubmission.id}`}
                      sandbox=""
                      srcDoc={pickedSubmission.code}
                      style={{ width: '100%', height: '380px', border: '0', display: 'block' }}
                    />
                  </div>
                ) : (
                  <pre className="font-mono text-[12px] leading-[1.6] p-4 bg-[#0a0a0b] text-[#e6e6e8] max-h-[380px] overflow-auto whitespace-pre">
                    {pickedSubmission.code}
                  </pre>
                )}
              </DSCard>

              {/* Score form — design line 513-530 */}
              <DSCard>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-[13.5px] font-semibold">Score</div>
                  <div className="text-[11.5px] text-[var(--ds-text-3)] font-mono">
                    {formatDateTime(pickedSubmission.submittedAt)} · {getAutoSubmitLabel(pickedSubmission.isAutoSubmit)}
                  </div>
                </div>
                <Field label="Score (0-100)" hint="Single weighted score. Ranks auto-compute from this.">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={pickedDraft.score}
                    onChange={(e) => onDraftChange(pickedSubmission.id, 'score', e.target.value)}
                    placeholder="0"
                    className="max-w-[180px]"
                  />
                </Field>
                <div className="h-3" />
                <Field label="Admin notes" hint="Visible to admins only.">
                  <Textarea
                    value={pickedDraft.adminNotes}
                    onChange={(e) => onDraftChange(pickedSubmission.id, 'adminNotes', e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Strong detection accuracy, runtime well under limit. Edge case at low contrast worth re-running."
                  />
                </Field>
                <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const next = sortedSubmissions.findIndex((s) => s.id === pickedSubmission.id);
                      const skip = sortedSubmissions[(next + 1) % sortedSubmissions.length];
                      if (skip) setPickedId(skip.id);
                    }}
                  >
                    Skip
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => void saveSubmission(pickedSubmission.id)} disabled={pickedDraft.saving || !pickedDraft.dirty} className="gap-1.5">
                      {pickedDraft.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save draft
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void saveSubmission(pickedSubmission.id)}
                      disabled={pickedDraft.saving || !pickedDraft.dirty || !pickedReviewed}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirm score
                    </Button>
                  </div>
                </div>
              </DSCard>
            </>
          ) : (
            <DSCard>
              <EmptyState
                icon={<ClipboardCheck size={18} />}
                title="No submissions to judge yet"
                body="When teams submit their work, you'll be able to preview each entry and assign scores here."
              />
            </DSCard>
          )}
        </div>
      </div>

      {/* Action bar */}
      <DSCard padded={false} className="p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-[12.5px] text-[var(--ds-text-2)]">
          {unsavedIds.length > 0 && (
            <span>Unsaved: <span className="font-semibold font-mono tabular-nums">{unsavedIds.length}</span> · </span>
          )}
          Scored: <span className="font-semibold font-mono tabular-nums">{scoredCount}/{submissions.length}</span>
          {!allScored && submissions.length > 0 && (
            <span className="ml-2 text-[var(--accent)]">
              · {unscoredCount} still need scoring
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={unsavedIds.length === 0 || savingAll} onClick={() => void saveAll()} className="gap-1.5">
            {savingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            Save all
          </Button>
          <Button
            size="sm"
            disabled={!allScored || round.status !== 'JUDGING'}
            onClick={() => setPublishDialogOpen(true)}
            className="gap-1.5"
          >
            <Trophy className="h-3.5 w-3.5" />
            Publish results
          </Button>
        </div>
      </DSCard>

      {/* Rank preview — kept compact below the action bar */}
      {submissions.length > 0 && autoRanks.size > 0 && (
        <DSCard>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[13.5px] font-semibold">Rank preview</div>
            <Pill tone="neutral" size="xs">{autoRanks.size} ranked</Pill>
          </div>
          <p className="text-[12px] text-[var(--ds-text-3)] mb-3">
            Ranks auto-compute from scores. Highest score = #1. Ties broken by submission time.
            {!allScored && ` Score all ${submissions.length - scoredCount} remaining to publish.`}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {submissions
              .filter((sub) => autoRanks.has(sub.id))
              .sort((a, b) => (autoRanks.get(a.id) ?? 0) - (autoRanks.get(b.id) ?? 0))
              .slice(0, 12)
              .map((sub) => {
                const rank = autoRanks.get(sub.id)!;
                const draft = drafts[sub.id];
                const score = draft ? parseScore(draft.score) : sub.score;
                return (
                  <button
                    key={sub.id}
                    onClick={() => setPickedId(sub.id)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] border border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] text-left transition-colors"
                  >
                    <span className="font-mono tabular-nums text-[12px] font-semibold w-[28px] text-[var(--ds-text-3)]">#{rank}</span>
                    <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium">{sub.teamName || sub.userName}</span>
                    <span className="font-mono tabular-nums text-[12.5px] font-semibold">{score ?? '—'}</span>
                  </button>
                );
              })}
          </div>
        </DSCard>
      )}

      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent data-dashboard data-accent={accent} className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5" />
              {activeCodeSubmission?.teamName || activeCodeSubmission?.userName || 'Submission'}
            </DialogTitle>
            <DialogDescription>
              {[
                activeCodeSubmission?.problemTitle,
                activeCodeSubmission?.language,
                activeCodeSubmission?.verdict,
                `${activeCodeSubmission?.code.length || 0} chars`,
              ].filter(Boolean).join(' · ')}
            </DialogDescription>
          </DialogHeader>

          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4 text-xs leading-5 text-[var(--ds-text-1)]">
            <code>{activeCodeSubmission?.code || ''}</code>
          </pre>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeModalOpen(false)}>
              Close
            </Button>
            <Button className="gap-2" onClick={() => void copyCode()}>
              <Copy className="h-4 w-4" />
              Copy Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={referenceDialogOpen} onOpenChange={setReferenceDialogOpen}>
        <DialogContent data-dashboard data-accent={accent} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Reference Image</DialogTitle>
            <DialogDescription>
              Paste the reference image URL for this round. Leave it blank to remove the current reference image.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={referenceImageUrl}
            onChange={(event) => setReferenceImageUrl(event.target.value)}
            placeholder="https://example.com/reference-image.png"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReferenceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void updateReferenceUrl()}>
              Save Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <ConfirmDialogContent data-dashboard data-accent={accent}>
          <ConfirmDialogHeader>
            <ConfirmDialogTitle>Publish results?</ConfirmDialogTitle>
            <ConfirmDialogDescription>
              {unsavedIds.length > 0
                ? `You have ${unsavedIds.length} unsaved score(s). They will be saved before results are published, and ranks will be auto-computed from scores.`
                : 'Ranks will be auto-computed from scores and results will become visible to participants.'}
            </ConfirmDialogDescription>
          </ConfirmDialogHeader>
          <ConfirmDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void publishResults()}>
              Publish Results
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </AlertDialog>

      <NumericPromptDialog
        open={Boolean(dsaScoreTarget)}
        onOpenChange={(o) => !o && setDsaScoreTarget(null)}
        title="Override DSA submission score"
        description={dsaScoreTarget ? `Submission ${dsaScoreTarget.id.slice(0, 8)} · current ${dsaScoreTarget.score ?? 0}` : undefined}
        label="Score"
        defaultValue={dsaScoreTarget?.score ?? 0}
        min={0}
        max={100}
        confirmLabel="Save override"
        onCommit={(value) => {
          if (!dsaScoreTarget) return;
          void overrideDsaSubmission(dsaScoreTarget, { score: Math.max(0, Math.min(100, Math.round(value))) });
          setDsaScoreTarget(null);
        }}
      />
    </div>
  );
}
