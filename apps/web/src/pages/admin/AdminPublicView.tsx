// Dashboard v2 — Admin · Public View (polls + feedback dashboard).
// Pixel-port of screen-admin2.jsx:169 (AdminPollsScreen) with real /api/polls/admin/public-view data.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, Star, Eye, Loader2, Activity, ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type AdminPollListItem, type AdminPollDetail, type PollInput } from '@/lib/api';
import {
  Avatar, DSCard, EmptyState, Pill, SegmentedTabs, Section,
} from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PollEditor } from '@/components/admin/polls/PollEditor';
import { EMPTY_POLL_FORM, filterAndSortResponses, type PollType, type ResponseSort } from '@/lib/pollAdmin';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

type ListStatusFilter = 'ALL' | 'OPEN' | 'CLOSED' | 'DRAFT';
type ListAnonymityFilter = 'ALL' | 'ANON' | 'NAMED';
type FeedbackLengthFilter = 'ALL' | 'SHORT' | 'LONG';

const OPTION_COLORS = [
  'var(--accent)',
  'hsl(200 70% 55%)',
  'hsl(280 60% 60%)',
  'hsl(140 50% 50%)',
  'hsl(40 80% 55%)',
  'hsl(330 60% 60%)',
];

export default function AdminPublicView() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListStatusFilter>('ALL');
  const [anonymityFilter, setAnonymityFilter] = useState<ListAnonymityFilter>('ALL');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackRoleFilter, setFeedbackRoleFilter] = useState<string>('ALL');
  const [feedbackLengthFilter, setFeedbackLengthFilter] = useState<FeedbackLengthFilter>('ALL');
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  // Response-level filters (E14, restored from HEAD).
  const [responseSearch, setResponseSearch] = useState('');
  const [responseRoleFilter, setResponseRoleFilter] = useState<string>('ALL');
  const [responseOptionFilter, setResponseOptionFilter] = useState<string>('ALL');
  const [responseSort, setResponseSort] = useState<ResponseSort>('NEWEST');

  // Editor (create / edit) state — restored from HEAD
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  const [form, setForm] = useState<PollInput>(EMPTY_POLL_FORM);
  const [pollType, setPollType] = useState<PollType>('NORMAL');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminPollListItem | null>(null);

  const listQ = useQuery({
    queryKey: ['admin-polls', { search }],
    queryFn: () => api.getAdminPolls(token!, { search: search || undefined, status: 'ALL' }),
    enabled: Boolean(token),
  });

  // S-10: events to offer as the post-event feedback link. Only fetched while the
  // editor is open so the polls page itself stays lean.
  const eventsQ = useQuery({
    queryKey: ['admin-events-for-poll'],
    queryFn: () => api.getEvents(),
    enabled: Boolean(token) && editorOpen,
  });
  const eventOptions = useMemo(
    () =>
      [...(eventsQ.data ?? [])]
        // Newest events first so the most likely feedback target is at the top.
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .map((e) => ({ id: e.id, title: e.title })),
    [eventsQ.data],
  );

  const allPolls = useMemo(() => listQ.data?.polls ?? [], [listQ.data]);
  // Status + anonymity filtering (CAT 7). The "active" subset is a derived view of all polls.
  const activePolls = useMemo(() => {
    return allPolls.filter((p) => {
      // Status axis
      const isOpen = p.isPublished && !p.isClosed;
      const isClosed = p.isClosed;
      const isDraft = !p.isPublished;
      if (statusFilter === 'OPEN' && !isOpen) return false;
      if (statusFilter === 'CLOSED' && !isClosed) return false;
      if (statusFilter === 'DRAFT' && !isDraft) return false;
      // Anonymity axis
      if (anonymityFilter === 'ANON' && !p.isAnonymous) return false;
      if (anonymityFilter === 'NAMED' && p.isAnonymous) return false;
      return true;
    });
  }, [allPolls, statusFilter, anonymityFilter]);

  // Auto-pick first poll for detail panel
  useEffect(() => {
    if (!selectedPollId && allPolls.length > 0) setSelectedPollId(allPolls[0].id);
  }, [allPolls, selectedPollId]);

  const detailQ = useQuery({
    queryKey: ['admin-poll-detail', selectedPollId],
    queryFn: () => api.getAdminPollDetail(selectedPollId!, token!),
    enabled: Boolean(token && selectedPollId),
  });

  const handleExport = async (pollId: string) => {
    if (!token) return;
    setExporting(pollId);
    try {
      const blob = await api.downloadPollExport(pollId, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `poll-${pollId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(null);
    }
  };

  // Poll-editor handlers (restored from HEAD)
  const openCreate = () => {
    setEditorMode('create');
    setEditingPollId(null);
    setForm(EMPTY_POLL_FORM);
    setPollType('NORMAL');
    setEditorOpen(true);
  };
  const openEdit = (detail: AdminPollDetail) => {
    setEditorMode('edit');
    setEditingPollId(detail.id);
    setForm({
      question: detail.question,
      description: detail.description ?? '',
      options: detail.options.map((o) => o.text),
      allowMultipleChoices: detail.allowMultipleChoices,
      allowVoteChange: detail.allowVoteChange,
      isAnonymous: detail.isAnonymous,
      deadline: detail.deadline ?? '',
      isPublished: detail.isPublished,
      eventId: detail.eventId ?? '',
    });
    setPollType('NORMAL');
    setEditorOpen(true);
  };
  const handleAddOption = () => {
    setForm((f) => ({ ...f, options: [...f.options, ''] }));
  };
  const handleOptionChange = (index: number, value: string) => {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? value : o)) }));
  };
  const handleRemoveOption = (index: number) => {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== index) }));
  };
  const handleSave = async () => {
    if (!token) return;
    if (!form.question.trim()) { toast.error('Question is required'); return; }
    const cleanedOptions = form.options.map((o) => o.trim()).filter(Boolean);
    if (cleanedOptions.length < 2) { toast.error('At least two options are required'); return; }
    setSaving(true);
    try {
      // S-10: empty event link → null (avoids failing the uuid validator).
      const payload: PollInput = { ...form, options: cleanedOptions, eventId: form.eventId || null };
      if (editorMode === 'edit' && editingPollId) {
        await api.updatePoll(editingPollId, payload, token);
        toast.success('Poll updated');
      } else {
        const created = await api.createPoll(payload, token);
        setSelectedPollId(created.id);
        toast.success('Poll created');
      }
      setEditorOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-polls'] });
      qc.invalidateQueries({ queryKey: ['admin-poll-detail'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deletePoll(id, token!),
    onSuccess: () => {
      toast.success('Poll deleted');
      setDeleteTarget(null);
      if (deleteTarget?.id === selectedPollId) setSelectedPollId(null);
      qc.invalidateQueries({ queryKey: ['admin-polls'] });
    },
    onError: () => toast.error('Delete failed'),
  });

  const lockedStructure = useMemo(
    () => Boolean(detailQ.data && editorMode === 'edit' && detailQ.data.totalVotes > 0),
    [detailQ.data, editorMode],
  );

  // Distinct roles in the feedback set, sorted alphabetically — feeds the role filter dropdown.
  const feedbackRoleOptions = useMemo(() => {
    if (!detailQ.data?.feedback) return ['ALL'] as string[];
    const set = new Set<string>();
    for (const f of detailQ.data.feedback) set.add(f.user.role || 'UNKNOWN');
    return ['ALL', ...Array.from(set).sort()];
  }, [detailQ.data]);

  const filteredFeedback = useMemo(() => {
    if (!detailQ.data?.feedback) return [];
    const q = feedbackSearch.toLowerCase();
    return detailQ.data.feedback.filter((f) => {
      if (q && !f.message.toLowerCase().includes(q)) return false;
      if (feedbackRoleFilter !== 'ALL' && (f.user.role || 'UNKNOWN') !== feedbackRoleFilter) return false;
      const len = f.message.trim().length;
      if (feedbackLengthFilter === 'SHORT' && len >= 80) return false;
      if (feedbackLengthFilter === 'LONG' && len < 80) return false;
      return true;
    });
  }, [detailQ.data, feedbackSearch, feedbackRoleFilter, feedbackLengthFilter]);

  // Response-level filter set (E14). Drives the new Responses section per selected poll.
  const responseRoleOptions = useMemo(() => {
    if (!detailQ.data?.responses) return ['ALL'];
    const set = new Set<string>();
    for (const r of detailQ.data.responses) set.add(r.user.role || 'UNKNOWN');
    return ['ALL', ...Array.from(set).sort()];
  }, [detailQ.data]);

  const responseOptionOptions = useMemo(() => {
    if (!detailQ.data?.options) return [{ id: 'ALL', label: 'All options' }];
    return [{ id: 'ALL', label: 'All options' }, ...detailQ.data.options.map((o) => ({ id: o.id, label: o.text }))];
  }, [detailQ.data]);

  const filteredResponses = useMemo(() => {
    if (!detailQ.data?.responses) return [];
    return filterAndSortResponses({
      responses: detailQ.data.responses,
      search: responseSearch,
      roleFilter: responseRoleFilter,
      optionFilter: responseOptionFilter,
      sort: responseSort,
    });
  }, [detailQ.data, responseSearch, responseRoleFilter, responseOptionFilter, responseSort]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin · Polls</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Public view</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1 max-w-prose">
            Live tallies of polls on the public site, plus free-form feedback for the selected poll.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[280px] sm:flex-none">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search polls…"
              className="pl-8 h-8 text-[13px]"
            />
          </div>
          {detailQ.data && (
            <>
              <Button size="sm" variant="outline" onClick={() => openEdit(detailQ.data)}>
                <Pencil size={13} className="mr-1.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const summary = allPolls.find((p) => p.id === detailQ.data.id);
                  if (summary) setDeleteTarget(summary);
                }}
                className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
              >
                <Trash2 size={13} className="mr-1.5" />
                Delete
              </Button>
            </>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus size={13} className="mr-1.5" />
            Create poll
          </Button>
        </div>
      </div>

      <Section
        eyebrow="Active polls"
        title={listQ.isLoading ? 'Loading…' : `${activePolls.length} polls`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <SegmentedTabs
              items={[
                { value: 'ALL', label: 'All' },
                { value: 'OPEN', label: 'Open' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'DRAFT', label: 'Draft' },
              ]}
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as ListStatusFilter)}
            />
            <SegmentedTabs
              items={[
                { value: 'ALL', label: 'Anon + Named' },
                { value: 'ANON', label: 'Anon' },
                { value: 'NAMED', label: 'Named' },
              ]}
              value={anonymityFilter}
              onChange={(v) => setAnonymityFilter(v as ListAnonymityFilter)}
            />
          </div>
        }
      >
        {listQ.isLoading ? (
          <div className="grid lg:grid-cols-2 gap-4">
            {[0, 1].map((i) => <div key={i} className="h-44 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />)}
          </div>
        ) : activePolls.length === 0 ? (
          <DSCard padded>
            <EmptyState icon={<Activity size={18} />} title="No active polls" body="Create a poll from the polls API to see live tallies here." />
          </DSCard>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {activePolls.map((p) => (
              <PollSummaryCard
                key={p.id}
                poll={p}
                selected={selectedPollId === p.id}
                onSelect={() => setSelectedPollId(p.id)}
                onExport={() => handleExport(p.id)}
                exporting={exporting === p.id}
              />
            ))}
          </div>
        )}
      </Section>

      {detailQ.data && (
        <Section
          eyebrow="Responses"
          title={`${filteredResponses.length} of ${detailQ.data.responses.length} responses`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input
                  value={responseSearch}
                  onChange={(e) => setResponseSearch(e.target.value)}
                  placeholder="Search responses…"
                  className="pl-8 h-8 text-[13px]"
                />
              </div>
              <select
                value={responseRoleFilter}
                onChange={(e) => setResponseRoleFilter(e.target.value)}
                className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                aria-label="Filter responses by role"
              >
                {responseRoleOptions.map((role) => (
                  <option key={role} value={role}>{role === 'ALL' ? 'All roles' : role}</option>
                ))}
              </select>
              <select
                value={responseOptionFilter}
                onChange={(e) => setResponseOptionFilter(e.target.value)}
                className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)] max-w-[180px]"
                aria-label="Filter responses by option"
              >
                {responseOptionOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <select
                value={responseSort}
                onChange={(e) => setResponseSort(e.target.value as ResponseSort)}
                className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
                aria-label="Sort responses"
              >
                <option value="NEWEST">Newest first</option>
                <option value="OLDEST">Oldest first</option>
              </select>
            </div>
          }
        >
          {filteredResponses.length === 0 ? (
            <DSCard padded>
              <EmptyState title="No responses match" body="Adjust filters or wait for more votes." />
            </DSCard>
          ) : (
            <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
              {filteredResponses.slice(0, 200).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center gap-3 flex-wrap">
                  <span className="text-[12.5px] font-medium text-[var(--ds-text-1)] min-w-[140px] truncate">
                    {r.user.name}
                  </span>
                  <span className="text-[11px] text-[var(--ds-text-3)] truncate min-w-[160px]">{r.user.email}</span>
                  <span className="text-[10.5px] font-mono px-1.5 h-5 rounded-[5px] bg-[var(--surface-soft)] text-[var(--ds-text-2)] inline-flex items-center">{r.user.role}</span>
                  <span className="flex-1 text-[12.5px] text-[var(--ds-text-2)] truncate">
                    {r.optionLabels.join(' · ')}
                  </span>
                  <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
                    {relativeTime(r.updatedAt)}
                  </span>
                </div>
              ))}
              {filteredResponses.length > 200 && (
                <div className="py-2 text-center text-[11.5px] text-[var(--ds-text-3)]">
                  Showing first 200 of {filteredResponses.length}. Use filters to narrow down.
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      <Section
        eyebrow="Feedback"
        title={detailQ.data ? `Feedback on “${detailQ.data.question}”` : 'Recent feedback'}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-[220px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input
                value={feedbackSearch}
                onChange={(e) => setFeedbackSearch(e.target.value)}
                placeholder="Search feedback…"
                className="pl-8 h-8 text-[13px]"
              />
            </div>
            <SegmentedTabs
              items={[
                { value: 'ALL', label: 'Any length' },
                { value: 'SHORT', label: '< 80 chars' },
                { value: 'LONG', label: '≥ 80 chars' },
              ]}
              value={feedbackLengthFilter}
              onChange={(v) => setFeedbackLengthFilter(v as FeedbackLengthFilter)}
            />
            <select
              value={feedbackRoleFilter}
              onChange={(e) => setFeedbackRoleFilter(e.target.value)}
              className="h-8 px-2.5 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[6px] outline-none focus:border-[var(--accent)]"
              title="Filter feedback by author role"
            >
              {feedbackRoleOptions.map((r) => (
                <option key={r} value={r}>{r === 'ALL' ? 'All roles' : r}</option>
              ))}
            </select>
          </div>
        }
      >
        {detailQ.isLoading ? (
          <div className="h-32 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
        ) : !detailQ.data || filteredFeedback.length === 0 ? (
          <DSCard padded>
            <EmptyState title="No feedback yet" body="Public users can leave free-form feedback on every poll." />
          </DSCard>
        ) : (
          <div className="border-y border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
            {filteredFeedback.map((f) => (
              <div key={f.id} className="py-3 flex items-start gap-3">
                <Avatar name={f.user.name} src={f.user.avatar} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[13px] font-medium">{f.user.name}</span>
                    <span className="text-[11px] text-[var(--ds-text-3)]">·</span>
                    <span className="text-[11px] text-[var(--ds-text-3)] truncate">{f.user.email}</span>
                    <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums ml-auto">{relativeTime(f.createdAt)}</span>
                  </div>
                  <p className="text-[12.5px] text-[var(--ds-text-2)] leading-snug whitespace-pre-wrap">{f.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Poll editor (create / edit) — restored from HEAD */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)] max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editorMode === 'edit' ? 'Edit poll' : 'Create poll'}</DialogTitle>
          </DialogHeader>
          <PollEditor
            form={form}
            setForm={setForm}
            events={eventOptions}
            pollType={pollType}
            onPollTypeChange={setPollType}
            onAddOption={handleAddOption}
            onOptionChange={handleOptionChange}
            onRemoveOption={handleRemoveOption}
            onSave={handleSave}
            saving={saving}
            lockedStructure={lockedStructure}
            title={editorMode === 'edit' ? 'Edit poll' : 'Create poll'}
            description={editorMode === 'edit'
              ? 'Update poll metadata. Options + anonymity lock once votes are cast.'
              : 'Compose a new public poll. It appears on the public site once published.'}
          />
        </DialogContent>
      </Dialog>

      {/* Delete poll confirm */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.question}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This removes the poll and all votes + feedback permanently.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
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

function PollSummaryCard({
  poll, selected, onSelect, onExport, exporting,
}: {
  poll: AdminPollListItem;
  selected: boolean;
  onSelect: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const { token } = useAuth();
  // Fetch detail to render option distribution
  const detailQ = useQuery<AdminPollDetail>({
    queryKey: ['admin-poll-detail', poll.id],
    queryFn: () => api.getAdminPollDetail(poll.id, token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const detail = detailQ.data;
  const totalVotes = poll.totalVotes;
  const options = detail?.options ?? [];

  return (
    <DSCard
      padded
      hover
      className={cn('flex flex-col gap-4 cursor-pointer', selected && 'ring-2 ring-[var(--accent-ring)]')}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14.5px] font-semibold leading-snug flex-1">{poll.question}</h3>
        {poll.isPublished && !poll.isClosed ? (
          <Pill tone="success" size="xs" dot>Live</Pill>
        ) : poll.isClosed ? (
          <Pill tone="neutral" size="xs">Closed</Pill>
        ) : (
          <Pill tone="warning" size="xs">Draft</Pill>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {detailQ.isLoading || options.length === 0 ? (
          <div className="h-16 bg-[var(--surface-soft)] rounded animate-pulse" />
        ) : (
          options.map((o, i) => {
            const pct = totalVotes > 0 ? Math.round((o.voteCount / totalVotes) * 100) : 0;
            return (
              <div key={o.id}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="font-medium">{o.text}</span>
                  <span className="text-[var(--ds-text-3)]">
                    <span className="font-mono tabular-nums text-[var(--ds-text-1)] font-semibold">{pct}%</span>
                    {' · '}
                    <span className="font-mono tabular-nums">{o.voteCount}</span>
                  </span>
                </div>
                <div className="h-[6px] rounded-full bg-[var(--surface-soft)] overflow-hidden">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: OPTION_COLORS[i % OPTION_COLORS.length] }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-[11.5px] text-[var(--ds-text-3)] pt-3 border-t border-[var(--border-subtle)]">
        <span>
          <span className="font-mono tabular-nums text-[var(--ds-text-2)] font-medium">{totalVotes}</span> responses
          {' · '}
          <span className="font-mono tabular-nums text-[var(--ds-text-2)] font-medium">{poll.totalFeedback}</span> feedback
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="h-7 px-2 text-[11.5px]"
          >
            <Eye size={11} className="mr-1" />
            Details
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); onExport(); }}
            disabled={exporting}
            className="h-7 px-2 text-[11.5px]"
            title="Download Excel"
          >
            {exporting ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          </Button>
          <Button size="sm" variant="ghost" asChild className="h-7 px-2 text-[11.5px]">
            <a href={`/polls/${poll.slug}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Public page">
              <ExternalLink size={11} />
            </a>
          </Button>
        </div>
      </div>
    </DSCard>
  );
}

// Silence unused-import (star rating placeholder for future sentiment)
void Star;
