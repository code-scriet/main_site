import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { api, type CompetitionRound, type CompetitionSubmission, type CompetitionMissingTeam } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { formatDateTime } from '@/lib/dateUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  ArrowLeft,
  ClipboardCheck,
  Copy,
  Eye,
  FileCode2,
  ImageIcon,
  LayoutGrid,
  LayoutList,
  Loader2,
  RefreshCw,
  Save,
  Trophy,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';
type SortMode = 'score' | 'time';

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [round, setRound] = useState<CompetitionRound | null>(null);
  const [submissions, setSubmissions] = useState<CompetitionSubmission[]>([]);
  const [missingTeams, setMissingTeams] = useState<CompetitionMissingTeam[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftScore>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [showReference, setShowReference] = useState(true);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [activeCodeSubmission, setActiveCodeSubmission] = useState<CompetitionSubmission | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token || !roundId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.getCompetitionSubmissions(roundId, token);
      setRound(response.round);
      setSubmissions(response.submissions);
      setMissingTeams(response.missingTeams || []);
      setDrafts((prev) => {
        const next: Record<string, DraftScore> = {};
        for (const submission of response.submissions) {
          const existing = prev[submission.id];
          next[submission.id] = existing
            ? existing
            : {
                score: scoreToInput(submission.score),
                adminNotes: submission.adminNotes || '',
                dirty: false,
                saving: false,
              };
        }
        return next;
      });
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to load judging data'));
    } finally {
      setLoading(false);
    }
  }, [token, roundId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-computed rank preview based on current draft scores
  const autoRanks = useMemo(
    () => computeAutoRanks(submissions, drafts),
    [submissions, drafts],
  );

  const sortedSubmissions = useMemo(() => {
    const items = [...submissions];
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
  }, [submissions, sortMode, autoRanks]);

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
    const value = window.prompt('Enter reference image URL', round.targetImageUrl || '');
    if (value === null) return;
    try {
      await api.updateCompetitionRound(round.id, { targetImageUrl: value.trim() || null }, token);
      await load();
      setSuccess('Reference updated');
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to update reference image'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!round) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-red-600">
          Round not found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/competition')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Rounds
          </Button>
          <h1 className="text-2xl font-bold text-gray-900">{round.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-300 bg-blue-100 text-blue-800">
            {submissions.length} submissions
          </Badge>
          <Badge variant="outline" className="border-green-300 bg-green-100 text-green-800">
            {scoredCount}/{submissions.length} scored
          </Badge>
          <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800">
            {missingTeams.length} pending
          </Badge>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}
      {success && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 text-sm text-green-700">{success}</CardContent>
        </Card>
      )}

      {/* Rank preview: shows what the auto-computed ranking will look like on publish */}
      {submissions.length > 0 && autoRanks.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rank Preview</CardTitle>
            <CardDescription>
              Ranks are auto-computed from scores. Highest score = #1. Ties broken by submission time.
              {!allScored && ` Score all ${submissions.length - scoredCount} remaining submission(s) to publish.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-1.5 pr-3 w-16">Rank</th>
                    <th className="py-1.5 pr-3">Team</th>
                    <th className="py-1.5 pr-3 w-20">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSubmissions
                    .filter((sub) => autoRanks.has(sub.id))
                    .sort((a, b) => (autoRanks.get(a.id) ?? 0) - (autoRanks.get(b.id) ?? 0))
                    .map((sub) => {
                      const rank = autoRanks.get(sub.id)!;
                      const draft = drafts[sub.id];
                      const score = draft ? parseScore(draft.score) : sub.score;
                      return (
                        <tr key={sub.id} className="border-b border-gray-100">
                          <td className="py-1.5 pr-3 font-semibold">
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                          </td>
                          <td className="py-1.5 pr-3">{sub.teamName || sub.userName}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{score ?? '--'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reference Image</CardTitle>
          <CardDescription>Admin-only design reference for judging comparison.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {showReference ? (
            round.targetImageUrl ? (
              <img
                src={round.targetImageUrl}
                alt="Round reference"
                className="w-full max-h-[420px] object-contain rounded-lg border border-gray-200 bg-white"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                No reference image set.
              </div>
            )
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Reference image hidden.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={updateReferenceUrl} className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Set/Update Reference
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowReference((prev) => !prev)}>
              {showReference ? 'Hide Reference' : 'Show Reference'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {missingTeams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Eligible teams with no submission</CardTitle>
            <CardDescription>These eligible teams did not submit any code before lock.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {missingTeams.map((team) => (
              <div key={team.id} className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <p className="font-semibold text-amber-900">{team.teamName}</p>
                <p className="text-amber-700">{team.members.join(', ') || 'No members listed'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">View:</span>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Grid
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="gap-2"
              >
                <LayoutList className="h-4 w-4" />
                List
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort:</span>
              <Button variant={sortMode === 'score' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('score')}>
                Score
              </Button>
              <Button variant={sortMode === 'time' ? 'default' : 'outline'} size="sm" onClick={() => setSortMode('time')}>
                Time
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={viewMode === 'grid' ? 'grid grid-cols-1 xl:grid-cols-2 gap-4' : 'space-y-4'}>
        {sortedSubmissions.map((submission) => {
          const draft = drafts[submission.id] || {
            score: scoreToInput(submission.score),
            adminNotes: submission.adminNotes || '',
            dirty: false,
            saving: false,
          };
          const autoRank = autoRanks.get(submission.id);

          return (
            <Card key={submission.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {autoRank !== undefined && (
                      <span className="text-lg font-bold text-amber-600">
                        {autoRank === 1 ? '🥇' : autoRank === 2 ? '🥈' : autoRank === 3 ? '🥉' : `#${autoRank}`}
                      </span>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">{submission.teamName || submission.userName || 'Participant'}</p>
                      <p className="text-xs text-gray-500">{submission.userName}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getAutoSubmitLabel(submission.isAutoSubmit)}
                  </Badge>
                </div>

                <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                  {/* sandbox="" renders HTML/CSS safely without JS execution */}
                  <iframe
                    title={`Submission ${submission.id}`}
                    sandbox=""
                    srcDoc={submission.code}
                    style={{ width: '400px', height: '300px', maxWidth: '100%', border: '0' }}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Score (0-100)</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={draft.score}
                    onChange={(e) => onDraftChange(submission.id, 'score', e.target.value)}
                    placeholder="Enter score"
                    className="max-w-[160px]"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                  <Textarea
                    value={draft.adminNotes}
                    onChange={(e) => onDraftChange(submission.id, 'adminNotes', e.target.value)}
                    rows={2}
                    maxLength={2000}
                    placeholder="Feedback for this team..."
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{formatDateTime(submission.submittedAt)}</span>
                  <span>{submission.code.length} chars</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => openCodeModal(submission)}>
                    <Eye className="h-4 w-4" />
                    View Code
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={draft.saving || !draft.dirty}
                    onClick={() => void saveSubmission(submission.id)}
                  >
                    {draft.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Score
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            {unsavedIds.length > 0 && (
              <span>Unsaved: <span className="font-semibold">{unsavedIds.length}</span> · </span>
            )}
            Scored: <span className="font-semibold">{scoredCount}/{submissions.length}</span>
            {!allScored && (
              <span className="ml-2 text-amber-600">
                — score all submissions to publish
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={unsavedIds.length === 0 || savingAll} onClick={() => void saveAll()}>
              {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              Save All Scores
            </Button>
            <Button
              className="gap-2"
              disabled={!allScored || round.status !== 'JUDGING'}
              onClick={() => setPublishDialogOpen(true)}
            >
              <Trophy className="h-4 w-4" />
              Publish Results
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5" />
              {activeCodeSubmission?.teamName || activeCodeSubmission?.userName || 'Submission'}
            </DialogTitle>
            <DialogDescription>
              Characters: {activeCodeSubmission?.code.length || 0}
            </DialogDescription>
          </DialogHeader>

          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-800">
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

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <ConfirmDialogContent>
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
    </div>
  );
}
