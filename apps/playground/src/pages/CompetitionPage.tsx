import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Editor, { type Monaco } from '@monaco-editor/react';
import { emmetHTML, emmetCSS } from 'emmet-monaco-es';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Loader2, Trophy, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getMainSiteOrigin, requestMainApiJson } from '@/lib/utils';
import { toast } from 'sonner';

type CompetitionStatus = 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'JUDGING' | 'FINISHED';

type RoundResponse = {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  duration: number;
  status: CompetitionStatus;
  startedAt?: string;
  lockedAt?: string;
  serverTime?: string;
  remainingSeconds?: number;
  hasSubmitted?: boolean;
  myTeam?: { id: string; teamName: string; memberCount: number } | null;
};

type SubmissionResponse = {
  submission: {
    id: string;
    code: string;
    submittedAt: string;
    isAutoSubmit: boolean;
    score?: number | null;
    rank?: number | null;
    adminNotes?: string | null;
  } | null;
  autoSave: {
    code: string;
    savedAt: string;
  } | null;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'offline';
type ApiRequestError = Error & { status?: number };

const MAIN_SITE_URL = getMainSiteOrigin();
const STORAGE_PREFIX = 'competition_autosave:';
const HTML_BOILERPLATE = `<!DOCTYPE html>
<html>
<head>
  <style>
  </style>
</head>
<body>
</body>
</html>`;

function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function saveToLocal(roundId: string, code: string) {
  const payload = JSON.stringify({ code, savedAt: Date.now() });
  localStorage.setItem(`${STORAGE_PREFIX}${roundId}`, payload);
}

function getLocalAutoSave(roundId: string): { code: string; savedAt: number } | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${roundId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { code?: string; savedAt?: number };
    if (typeof parsed.code === 'string' && typeof parsed.savedAt === 'number') {
      return { code: parsed.code, savedAt: parsed.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

function createApiRequestError(message: string, status?: number): ApiRequestError {
  const error = new Error(message) as ApiRequestError;
  error.status = status;
  return error;
}

function isForbiddenRequestError(error: unknown): error is ApiRequestError {
  return (
    error instanceof Error
    && typeof (error as ApiRequestError).status === 'number'
    && (error as ApiRequestError).status === 403
  );
}

export default function CompetitionPage() {
  const { roundId = '' } = useParams();
  const { token, isAuthenticated } = useAuth();
  const { editorTheme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [submission, setSubmission] = useState<SubmissionResponse['submission']>(null);
  const [code, setCode] = useState(HTML_BOILERPLATE);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  // Tick counter to re-render "Saved Xs ago" display every 10 seconds
  const [displayTick, setDisplayTick] = useState(0);

  const lastSavedCodeRef = useRef(HTML_BOILERPLATE);
  const latestCodeRef = useRef(HTML_BOILERPLATE);
  const startedAtRef = useRef<number | null>(null);
  const durationRef = useRef<number>(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const saveRetryDelayMsRef = useRef(4000);

  const loadRound = async (): Promise<RoundResponse> => {
    if (!token || !roundId) {
      throw new Error('Authentication is required');
    }
    const { response, payload, data } = await requestMainApiJson<RoundResponse>(`/api/competition/${roundId}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!response.ok) {
      throw createApiRequestError(
        (payload as { error?: { message?: string } } | null)?.error?.message || 'Failed to load round',
        response.status,
      );
    }
    return data;
  };

  const loadSubmission = async (): Promise<SubmissionResponse> => {
    if (!token || !roundId) {
      throw new Error('Authentication is required');
    }
    const { response, payload, data } = await requestMainApiJson<SubmissionResponse>(`/api/competition/${roundId}/my-submission`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (!response.ok) {
      throw createApiRequestError(
        (payload as { error?: { message?: string } } | null)?.error?.message || 'Failed to load submission',
        response.status,
      );
    }
    return data;
  };

  const saveServer = async (nextCode: string): Promise<boolean> => {
    if (!token || !round || !['ACTIVE', 'LOCKED', 'JUDGING'].includes(round.status)) return false;
    try {
      setSaveState('saving');
      const { response, payload } = await requestMainApiJson<{
        submitted?: boolean;
        submission?: { id?: string; submittedAt?: string };
        serverTime?: string;
      }>(`/api/competition/${roundId}/save`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code: nextCode }),
      });
      if (!response.ok) {
        const message =
          (payload as { error?: { message?: string } } | null)?.error?.message || 'Save failed';
        if (response.status === 409 && /already submitted/i.test(message)) {
          setIsDirty(false);
          setSaveState('saved');
          setRound((prev) => (prev ? { ...prev, hasSubmitted: true } : prev));
          return true;
        }
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          setSaveState('failed');
          return false;
        }
        throw new Error(message);
      }
      const payloadData = payload as {
        data?: {
          submitted?: boolean;
          submission?: { id?: string; submittedAt?: string };
          serverTime?: string;
        };
      } | null;
      if (payloadData?.data?.submitted) {
        setSubmission({
          id: payloadData.data?.submission?.id || `auto-${roundId}`,
          code: nextCode,
          submittedAt: payloadData.data?.submission?.submittedAt || new Date().toISOString(),
          isAutoSubmit: true,
          score: null,
          rank: null,
          adminNotes: null,
        });
        setRound((prev) => (prev ? { ...prev, hasSubmitted: true } : prev));
      }
      const serverTime = payloadData?.data?.serverTime ? new Date(payloadData.data.serverTime).getTime() : null;
      if (serverTime) setClockOffsetMs(serverTime - Date.now());
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setIsDirty(false);
      lastSavedCodeRef.current = nextCode;
      saveRetryDelayMsRef.current = 4000;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      return true;
    } catch {
      if (!navigator.onLine) {
        setSaveState('offline');
      } else {
        setSaveState('failed');
        if (!retryTimeoutRef.current) {
          const retryDelay = saveRetryDelayMsRef.current;
          retryTimeoutRef.current = window.setTimeout(() => {
            retryTimeoutRef.current = null;
            void saveServer(nextCode);
          }, retryDelay);
          saveRetryDelayMsRef.current = Math.min(60_000, Math.floor(retryDelay * 1.5));
        }
      }
      return false;
    }
  };

  const initialize = async () => {
    if (!token || !roundId) return;
    try {
      setLoading(true);
      setError(null);
      setAccessDenied(false);
      const [roundData, myData] = await Promise.all([loadRound(), loadSubmission()]);
      setRound(roundData);
      setSubmission(myData.submission);
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      const serverNow = roundData.serverTime ? new Date(roundData.serverTime).getTime() : Date.now();
      setClockOffsetMs(serverNow - Date.now());
      if (roundData.startedAt) {
        startedAtRef.current = new Date(roundData.startedAt).getTime();
      }
      durationRef.current = roundData.duration;
      setRemainingSeconds(roundData.remainingSeconds ?? 0);

      let resolvedCode = HTML_BOILERPLATE;
      let resolvedSavedAt = 0;

      if (myData.submission?.code) {
        resolvedCode = myData.submission.code;
        resolvedSavedAt = new Date(myData.submission.submittedAt).getTime();
      } else if (myData.autoSave?.code) {
        resolvedCode = myData.autoSave.code;
        resolvedSavedAt = new Date(myData.autoSave.savedAt).getTime();
      }

      const local = getLocalAutoSave(roundId);
      if (local && local.savedAt > resolvedSavedAt) {
        resolvedCode = local.code;
        resolvedSavedAt = local.savedAt;
      }

      setCode(resolvedCode || HTML_BOILERPLATE);
      lastSavedCodeRef.current = resolvedCode || HTML_BOILERPLATE;
      latestCodeRef.current = resolvedCode || HTML_BOILERPLATE;
      setLastSavedAt(resolvedSavedAt || null);
      setIsDirty(false);

      if (!myData.submission && local && local.savedAt > resolvedSavedAt && roundData.status === 'ACTIVE') {
        void saveServer(local.code);
      }
    } catch (err) {
      setAccessDenied(isForbiddenRequestError(err));
      setError(err instanceof Error ? err.message : 'Failed to initialize competition page');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roundId]);

  useEffect(() => {
    const status = round?.status;
    if (!status || (status !== 'ACTIVE' && status !== 'DRAFT')) return;
    const interval = window.setInterval(() => {
      setPollTick((value) => value + 1);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [round?.status]);

  useEffect(() => {
    if (!round) return;
    if (round.status !== 'ACTIVE' && round.status !== 'DRAFT') return;
    if (!token) return;
    const run = async () => {
      try {
        const data = await loadRound();
        setRound(data);
        if (data.startedAt) startedAtRef.current = new Date(data.startedAt).getTime();
        durationRef.current = data.duration;
        if (data.serverTime) {
          setClockOffsetMs(new Date(data.serverTime).getTime() - Date.now());
        }
        setRemainingSeconds(data.remainingSeconds ?? 0);
      } catch (err) {
        if (isForbiddenRequestError(err)) {
          setAccessDenied(true);
          setError(err.message || 'Not authorized');
          setRound(null);
        }
      }
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollTick, token, round?.status]);

  useEffect(() => {
    if (!round || round.status !== 'ACTIVE') return;
    const timer = window.setInterval(() => {
      const startMs = startedAtRef.current;
      if (!startMs) return;
      const now = Date.now() + clockOffsetMs;
      const elapsed = Math.floor((now - startMs) / 1000);
      const next = Math.max(0, durationRef.current - elapsed);
      setRemainingSeconds(next);
      if (next <= 0) {
        void initialize();
      }
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, clockOffsetMs]);

  useEffect(() => {
    if (!round || round.status !== 'ACTIVE') return;
    if (!isDirty) return;
    const interval = window.setInterval(() => {
      if (!navigator.onLine) return;
      void saveServer(latestCodeRef.current);
    }, 45_000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, isDirty]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!roundId) return;
      saveToLocal(roundId, latestCodeRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    saveToLocal(roundId, code);
    latestCodeRef.current = code;
  }, [code, roundId]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  const isReadOnly = useMemo(() => {
    if (!round) return true;
    return round.status !== 'ACTIVE' || Boolean(submission) || Boolean(round.hasSubmitted);
  }, [round, submission]);

  const hasServerSubmission = useMemo(
    () => Boolean(submission) || Boolean(round?.hasSubmitted),
    [submission, round?.hasSubmitted],
  );

  // Trigger server auto-save when tab becomes hidden (data loss prevention)
  useEffect(() => {
    if (!round || round.status !== 'ACTIVE' || isReadOnly) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && isDirty) {
        void saveServer(latestCodeRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, isDirty, isReadOnly]);

  useEffect(() => {
    if (!round || !token || !isDirty) return;
    if (round.status !== 'LOCKED' && round.status !== 'JUDGING') return;
    if (hasServerSubmission) return;
    if (!navigator.onLine) return;

    void saveServer(latestCodeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, isDirty, hasServerSubmission, token]);

  // Tick every 10s to refresh "Saved Xs ago" display text
  useEffect(() => {
    if (saveState !== 'saved') return;
    const id = window.setInterval(() => setDisplayTick((v) => v + 1), 10_000);
    return () => window.clearInterval(id);
  }, [saveState]);

  // Ctrl+S / Cmd+S keyboard shortcut for manual save
  useEffect(() => {
    if (!round || round.status !== 'ACTIVE' || isReadOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) void saveServer(latestCodeRef.current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.status, isDirty, isReadOnly]);

  const timerColorClass = useMemo(() => {
    if (!round || round.status !== 'ACTIVE') return 'text-gray-700';
    if (remainingSeconds <= 60) return 'text-red-500 animate-pulse';
    if (remainingSeconds <= 300) return 'text-yellow-500';
    return 'text-green-500';
  }, [round, remainingSeconds]);

  const progressPercent = useMemo(() => {
    if (!round || round.duration <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingSeconds / round.duration) * 100));
  }, [round, remainingSeconds]);

  const progressColor = remainingSeconds <= 60 ? 'bg-red-500' : remainingSeconds <= 300 ? 'bg-yellow-500' : 'bg-green-500';

  // Register Emmet for HTML & CSS expansion (e.g. div.container>h1+p Tab)
  const handleEditorBeforeMount = useCallback((monaco: Monaco) => {
    emmetHTML(monaco);
    emmetCSS(monaco);
  }, []);

  // Compute "Saved Xs ago" text reactively (displayTick forces re-render every 10s)
  const savedAgoText = useMemo(() => {
    void displayTick; // subscribe to tick updates
    if (!lastSavedAt) return '0s ago';
    return `${Math.max(0, Math.floor((Date.now() - lastSavedAt) / 1000))}s ago`;
  }, [lastSavedAt, displayTick]);

  const submitFinal = async () => {
    if (!token || !round) return;
    try {
      setIsSubmitting(true);
      const { response, payload } = await requestMainApiJson(`/api/competition/${roundId}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ code: latestCodeRef.current }),
      });
      if (!response.ok) {
        throw new Error(
          (payload as { error?: { message?: string } } | null)?.error?.message || 'Submit failed',
        );
      }
      toast.success('Submitted successfully');
      setShowSubmitConfirm(false);
      await initialize();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
          <h1 className="text-xl font-semibold">Sign in required</h1>
          <p className="text-sm text-muted-foreground">Please sign in from the main site to join this competition round.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-2xl w-full rounded-xl border border-red-300 bg-red-50 p-6 space-y-2">
          <h1 className="text-lg font-semibold text-red-700">{accessDenied ? 'Not authorized' : 'Unable to load round'}</h1>
          <p className="text-sm text-red-600">{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  if (round.status === 'DRAFT') {
    return (
      <div className="h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-3xl w-full rounded-xl border border-border bg-card p-6 space-y-4 text-center">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            code.scriet COMPETITION
          </h1>
          <div className="rounded-xl border border-border bg-background p-6 space-y-2">
            <p className="text-lg font-semibold">Waiting to start</p>
            <p className="text-sm text-muted-foreground">{round.title}</p>
            <p className="text-sm text-muted-foreground">Duration: {Math.floor(round.duration / 60)} minutes</p>
            <p className="text-sm text-muted-foreground">
              Your team: {round.myTeam?.teamName || 'No team'} ({round.myTeam?.memberCount || 0} members)
            </p>
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Checking status every 10 seconds...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = round.status === 'LOCKED'
    ? 'Your submission is locked.'
    : round.status === 'JUDGING'
      ? 'Your submission is being reviewed by judges.'
      : 'Results are published.';
  const submissionMethod = submission?.isAutoSubmit ? 'Auto-submitted at expiry' : 'Manual submit';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <div className="h-12 border-b border-border px-3 sm:px-4 flex items-center justify-between gap-3 bg-card/70">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{round.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{round.myTeam?.teamName || 'No team'}</p>
        </div>
        <div className="min-w-[96px] text-center">
          {round.status === 'ACTIVE' ? (
            <>
              <p className={cn('font-mono text-xl font-bold', timerColorClass)}>
                {remainingSeconds <= 0 ? "TIME'S UP" : formatClock(remainingSeconds)}
              </p>
              <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                <div
                  className={cn('h-full transition-all duration-1000 linear', progressColor)}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          ) : (
            <p className="font-mono text-sm font-semibold text-muted-foreground">{round.status}</p>
          )}
        </div>
        <div>
          {hasServerSubmission ? (
            <Button variant="outline" size="sm" disabled className="text-green-700 border-green-400">
              Submitted ✓
            </Button>
          ) : round.status !== 'ACTIVE' ? (
            <Button variant="outline" size="sm" disabled>
              Locked
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowSubmitConfirm(true)}>
              Submit
            </Button>
          )}
        </div>
      </div>

      {(round.status === 'LOCKED' || round.status === 'JUDGING' || round.status === 'FINISHED') && (
        <div className="border-b border-border bg-muted/30 px-3 sm:px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {statusLabel}
          {round.status === 'FINISHED' && (
            <a
              href={`${MAIN_SITE_URL}/competition/${round.id}/results`}
              className="ml-2 underline text-primary"
            >
              View full leaderboard
            </a>
          )}
        </div>
      )}

      {(round.status === 'LOCKED' || round.status === 'JUDGING' || round.status === 'FINISHED') && (
        <div className="border-b border-border bg-background px-3 sm:px-4 py-3 text-sm">
          {submission ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-muted-foreground">
              <p>
                Submitted at: <span className="text-foreground font-medium">{new Date(submission.submittedAt).toLocaleString()}</span>
              </p>
              <p>
                Method: <span className="text-foreground font-medium">{submissionMethod}</span>
              </p>
              <p>
                Characters: <span className="text-foreground font-medium">{submission.code.length}</span>
              </p>
              {round.status === 'FINISHED' && (
                <p>
                  Score: <span className="text-foreground font-medium">{submission.score ?? '--'}</span>
                  {' · '}
                  Rank: <span className="text-foreground font-medium">{submission.rank ?? '--'}</span>
                </p>
              )}
              {round.status === 'FINISHED' && submission.adminNotes && (
                <p className="lg:col-span-2">
                  Notes: <span className="text-foreground font-medium">{submission.adminNotes}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No submitted code found for your account/team.
            </p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={50} minSize={25}>
            <div className="h-full border-r border-border">
              <Editor
                height="100%"
                language="html"
                value={code}
                beforeMount={handleEditorBeforeMount}
                onChange={(value) => {
                  if (isReadOnly) return;
                  const nextCode = value ?? '';
                  latestCodeRef.current = nextCode;
                  setCode(nextCode);
                  if (nextCode !== lastSavedCodeRef.current) {
                    setIsDirty(true);
                  }
                }}
                options={{
                  readOnly: isReadOnly,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  tabCompletion: 'on',
                  quickSuggestions: true,
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: 'on',
                  suggest: {
                    snippetsPreventQuickSuggestions: false,
                    showSnippets: true,
                    showWords: true,
                  },
                }}
                theme={editorTheme}
              />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/60 transition-colors cursor-col-resize" />
          <Panel defaultSize={50} minSize={25}>
            <div className="h-full bg-white">
              {/* sandbox without allow-scripts: renders HTML/CSS safely, blocks JS execution
                 (prevents infinite loops, alert bombs, parent-frame access in user code) */}
              <iframe
                title="competition-preview"
                sandbox=""
                srcDoc={code}
                className="w-full h-full border-0"
              />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div className="lg:hidden border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Tip: rotate to landscape for side-by-side editor and preview.
      </div>

      <div className="hidden lg:flex h-8 border-t border-border px-3 sm:px-4 items-center justify-between text-xs text-muted-foreground">
        <div>
          {saveState === 'saving' && '💾 Saving...'}
          {saveState === 'saved' && `💾 Auto-saved ${savedAgoText}`}
          {saveState === 'failed' && '⚠ Save failed — retrying...'}
          {saveState === 'offline' && '⚠ Connection lost — your code is saved locally.'}
          {saveState === 'idle' && '💾 Auto-save every 30s'}
        </div>
        <div>Characters: {code.length}</div>
        <div className="truncate max-w-[120px] sm:max-w-[220px] text-right">{round.myTeam?.teamName || 'No team'}</div>
      </div>

      <div className="lg:hidden h-8 border-t border-border px-3 sm:px-4 flex items-center justify-between text-[11px] text-muted-foreground">
        <div>
          {saveState === 'saving' && '💾 Saving...'}
          {saveState === 'saved' && `💾 Auto-saved ${savedAgoText}`}
          {saveState === 'failed' && '⚠ Save failed — retrying...'}
          {saveState === 'offline' && '⚠ Connection lost — your code is saved locally.'}
          {saveState === 'idle' && '💾 Auto-save every 30s'}
        </div>
        <div>Characters: {code.length}</div>
        <div className="truncate max-w-[120px] sm:max-w-[220px] text-right">{round.myTeam?.teamName || 'No team'}</div>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-lg font-semibold">Submit your code?</h2>
            <p className="text-sm text-muted-foreground">
              This is your final submission. You will not be able to edit after submitting.
            </p>
            <p className="text-sm">Time remaining: <span className="font-mono font-semibold">{formatClock(remainingSeconds)}</span></p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSubmitConfirm(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={() => void submitFinal()} disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Final
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
