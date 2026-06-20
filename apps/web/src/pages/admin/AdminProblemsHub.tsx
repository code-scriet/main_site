// Consolidated coding-admin hub. One page, four tabs (URL ?tab=):
//   catalog   — the full problem catalog (AdminProblems)
//   qotd      — QOTD scheduling + the full archive (CreateQOTD, embedded)
//   review    — the manual-grading queue (AdminSubmissionReview, embedded)
//   proposals — CORE_MEMBER-submitted draft QOTDs + unpublished problems awaiting
//               an admin's publish/schedule/reject.
// Replaces the separate /admin/problems + /admin/submission-review pages and the
// admin half of /dashboard/qotd, so admins never leave to manage coding content.

import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loader2, Play, Pencil, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type QOTDHistoryEntry } from '@/lib/api';
import { istDateKey } from '@/lib/dateUtils';
import { DSCard, Difficulty, EmptyState, Pill, Section, UnderlineTabs } from '@/components/dash';
import AdminProblems from './AdminProblems';
import AdminSubmissionReview from './AdminSubmissionReview';
import AdminSheets from './AdminSheets';
import CreateQOTD from '../dashboard/CreateQOTD';

type HubTab = 'catalog' | 'qotd' | 'review' | 'proposals' | 'sheets';
const TABS: HubTab[] = ['catalog', 'qotd', 'review', 'proposals', 'sheets'];

// qotdQ is lifted to the hub so the badge count and the panel list share a single
// React Query subscription. Passing it as a prop avoids a second useQuery call
// that could silently diverge if one side's queryFn args are updated independently.
function ProposalsPanel({ qotdQ }: { qotdQ: UseQueryResult<QOTDHistoryEntry[]> }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const problemsQ = useQuery({
    queryKey: ['admin-problems'],
    queryFn: () => api.adminGetProblems(token!),
    enabled: Boolean(token),
  });

  // The server already returns exactly proposals; keep the defensive filter so a
  // just-published/scheduled row never lingers between fetch and invalidation.
  const proposedQotds = useMemo(
    () => (qotdQ.data ?? []).filter((q: QOTDHistoryEntry) => !q.isPublished && !q.heldBy && !q.publishAt),
    [qotdQ.data],
  );
  const draftProblems = useMemo(
    () => (problemsQ.data?.problems ?? []).filter((p) => !p.isPublished),
    [problemsQ.data],
  );

  const invalidate = () => {
    // Refresh every surface a publish/reject touches: the proposals list+badge, the
    // admin calendar/history, the member archive + summary header, and the catalog.
    qc.invalidateQueries({ queryKey: ['qotd-proposals'] });
    qc.invalidateQueries({ queryKey: ['qotd-history-admin'] });
    qc.invalidateQueries({ queryKey: ['qotd-history-full'] });
    qc.invalidateQueries({ queryKey: ['qotd-history-summary'] });
    qc.invalidateQueries({ queryKey: ['admin-problems'] });
    // The embedded CreateQOTD "pick existing" list reads this key — refresh it too
    // so a draft problem published/deleted here doesn't linger in the picker.
    qc.invalidateQueries({ queryKey: ['problems-for-qotd'] });
  };

  const publishQotd = useMutation({
    mutationFn: (id: string) => api.publishQOTD(id, token!),
    onSuccess: () => { toast.success('QOTD published'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to publish'),
  });
  const rejectQotd = useMutation({
    mutationFn: (id: string) => api.deleteQOTD(id, token!),
    onSuccess: () => { toast.success('Proposal rejected'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to reject'),
  });
  const publishProblem = useMutation({
    mutationFn: (id: string) => api.setProblemPublished(id, true, token!),
    onSuccess: () => { toast.success('Problem published'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to publish'),
  });
  const deleteProblemMut = useMutation({
    mutationFn: (id: string) => api.deleteProblem(id, token!),
    onSuccess: () => { toast.success('Draft deleted'); invalidate(); },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete'),
  });

  const busy = publishQotd.isPending || rejectQotd.isPending || publishProblem.isPending || deleteProblemMut.isPending;

  // "Publish now" sets isPublished + pings everyone immediately. For a FUTURE-dated
  // proposal that's wrong: it goes live today (not on its date) and the proposer's
  // "now live" link points at today's QOTD, not this one. Warn + offer the QOTD tab
  // (where it can be scheduled for its date) before publishing such a proposal.
  const todayKey = istDateKey();
  const handlePublishQotd = (q: QOTDHistoryEntry) => {
    if (q.date.slice(0, 10) > todayKey) {
      const fmt = new Date(q.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const ok = window.confirm(
        `This proposal is dated ${fmt}. "Publish now" makes it live TODAY and announces it to everyone — it won't appear as that day's QOTD.\n\nTo schedule it for ${fmt} instead, cancel and open the QOTD tab.`,
      );
      if (!ok) return;
    }
    publishQotd.mutate(q.id);
  };

  return (
    <div className="flex flex-col gap-6">
      <Section eyebrow="Proposals" title={`QOTD drafts (${proposedQotds.length})`}>
        {qotdQ.isLoading ? (
          <div className="h-20 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : proposedQotds.length === 0 ? (
          <DSCard padded><EmptyState title="No QOTD proposals" body="Core members' proposed QOTDs land here for you to publish or reject." /></DSCard>
        ) : (
          <DSCard padded={false}>
            <div className="divide-y divide-[var(--border-subtle)]">
              {proposedQotds.map((q) => (
                <div key={q.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="font-mono tabular-nums text-[12px] text-[var(--ds-text-3)] w-[88px]">
                    {new Date(q.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="flex-1 truncate text-[13px] font-medium">{q.question}</span>
                  <Difficulty level={q.difficulty || 'EASY'} />
                  <Pill tone="info" size="xs">Proposed</Pill>
                  <button onClick={() => handlePublishQotd(q)} disabled={busy} title="Publish now" aria-label="Publish now" className="size-7 rounded-[6px] hover:bg-[var(--accent-subtle)] text-[var(--ds-text-3)] hover:text-[var(--accent)] flex items-center justify-center disabled:opacity-40">
                    <Check size={12} />
                  </button>
                  <button onClick={() => rejectQotd.mutate(q.id)} disabled={busy} title="Reject (delete)" aria-label="Reject" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center disabled:opacity-40">
                    <Trash2 size={12} />
                  </button>
                  {busy && <Loader2 size={11} className="animate-spin text-[var(--ds-text-3)]" />}
                </div>
              ))}
            </div>
          </DSCard>
        )}
        <p className="text-[11.5px] text-[var(--ds-text-3)] mt-2">
          To schedule a proposal for a future date instead of publishing now, open the <strong>QOTD</strong> tab.
        </p>
      </Section>

      <Section eyebrow="Proposals" title={`Draft problems (${draftProblems.length})`}>
        {problemsQ.isLoading ? (
          <div className="h-20 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : draftProblems.length === 0 ? (
          <DSCard padded><EmptyState title="No draft problems" body="Unpublished problems (incl. core submissions) appear here." /></DSCard>
        ) : (
          <DSCard padded={false}>
            <div className="divide-y divide-[var(--border-subtle)]">
              {draftProblems.map((p) => (
                <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="flex-1 truncate text-[13px] font-medium">{p.title}</span>
                  <Difficulty level={p.difficulty} />
                  <Pill tone="warning" size="xs">Draft</Pill>
                  <button onClick={() => publishProblem.mutate(p.id)} disabled={busy} title="Publish" aria-label="Publish" className="size-7 rounded-[6px] hover:bg-[var(--accent-subtle)] text-[var(--ds-text-3)] hover:text-[var(--accent)] flex items-center justify-center disabled:opacity-40">
                    <Play size={12} />
                  </button>
                  <button onClick={() => navigate(`/dashboard/problems/${p.id}/edit`)} disabled={busy} title="Edit" aria-label="Edit" className="size-7 rounded-[6px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center disabled:opacity-40">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deleteProblemMut.mutate(p.id)} disabled={busy} title="Delete draft" aria-label="Delete draft" className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center disabled:opacity-40">
                    <Trash2 size={12} />
                  </button>
                  {busy && <Loader2 size={11} className="animate-spin text-[var(--ds-text-3)]" />}
                </div>
              ))}
            </div>
          </DSCard>
        )}
      </Section>
    </div>
  );
}

export default function AdminProblemsHub() {
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: HubTab = (TABS as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as HubTab) : 'catalog';
  const setTab = (t: HubTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };

  // Single proposals query — drives both the badge count and the ProposalsPanel list.
  // Passed as a prop to ProposalsPanel so both consumers stay on the same subscription.
  const proposalsQ = useQuery({
    queryKey: ['qotd-proposals'],
    queryFn: () => api.getQOTDHistory(100, 0, { includeUnpublished: true, proposals: true, token: token! }),
    enabled: Boolean(token),
  });
  const proposalsCount = useMemo(
    () => (proposalsQ.data ?? []).filter((q) => !q.isPublished && !q.heldBy && !q.publishAt).length,
    [proposalsQ.data],
  );

  // Shares AdminSheets' cache key, so the badge and the tab don't double-fetch.
  const sheetsQ = useQuery({
    queryKey: ['admin-sheets'],
    queryFn: () => api.getProblemSheets(token!),
    enabled: Boolean(token),
  });
  const draftSheetsCount = useMemo(
    () => (sheetsQ.data?.sheets ?? []).filter((s) => !s.isPublished).length,
    [sheetsQ.data],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
        <h1 className="text-[24px] font-semibold tracking-tight mt-1">Coding</h1>
        <p className="text-[13px] text-[var(--ds-text-3)] mt-1">
          Problem catalog, QOTD scheduling, the review queue, and member proposals — all in one place.
        </p>
      </div>

      <UnderlineTabs<HubTab>
        items={[
          { value: 'catalog', label: 'Catalog' },
          { value: 'qotd', label: 'QOTD' },
          { value: 'review', label: 'Review' },
          { value: 'proposals', label: 'Proposals', count: proposalsCount || undefined },
          { value: 'sheets', label: 'Sheets', count: draftSheetsCount || undefined },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* key={tab} replays a subtle fade on every tab switch (reduced-motion safe). */}
      <div key={tab} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {tab === 'catalog' && <AdminProblems embedded />}
        {tab === 'qotd' && <CreateQOTD embedded />}
        {tab === 'review' && <AdminSubmissionReview embedded />}
        {tab === 'proposals' && <ProposalsPanel qotdQ={proposalsQ} />}
        {tab === 'sheets' && <AdminSheets />}
      </div>
    </div>
  );
}
