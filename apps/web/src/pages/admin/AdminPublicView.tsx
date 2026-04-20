import { useDeferredValue, useEffect, useMemo, useState, type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, type AdminPollDetail, type AdminPollListItem, type PollInput } from '@/lib/api';
import { formatDateTime, formatDateTimeLocal } from '@/lib/dateUtils';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

type ListStatusFilter = 'ALL' | 'OPEN' | 'CLOSED' | 'DRAFT';
type ListAnonymityFilter = 'ALL' | 'ANONYMOUS' | 'NAMED';
type DetailTab = 'overview' | 'responses' | 'feedback' | 'editor';
type ResponseSort = 'NEWEST' | 'OLDEST';
type FeedbackSort = 'NEWEST' | 'OLDEST' | 'LONGEST';
type FeedbackLengthFilter = 'ALL' | 'SHORT' | 'MEDIUM' | 'LONG';
type PollType = 'NORMAL' | 'QUESTION';

const EMPTY_FORM: PollInput = {
  question: '',
  description: '',
  options: ['', ''],
  allowMultipleChoices: false,
  allowVoteChange: true,
  isAnonymous: false,
  deadline: '',
  isPublished: true,
};

const formatCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsvFile = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
  const csvRows = [
    headers.map(formatCsvCell).join(','),
    ...rows.map((row) => row.map(formatCsvCell).join(',')),
  ];
  const content = `\uFEFF${csvRows.join('\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
};

export default function AdminPublicView() {
  const { token } = useAuth();

  const [polls, setPolls] = useState<AdminPollListItem[]>([]);
  const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
  const [selectedPoll, setSelectedPoll] = useState<AdminPollDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ListStatusFilter>('ALL');
  const [anonymityFilter, setAnonymityFilter] = useState<ListAnonymityFilter>('ALL');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [responseSearch, setResponseSearch] = useState('');
  const [responseRoleFilter, setResponseRoleFilter] = useState('ALL');
  const [responseOptionFilter, setResponseOptionFilter] = useState('ALL');
  const [responseSort, setResponseSort] = useState<ResponseSort>('NEWEST');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [feedbackRoleFilter, setFeedbackRoleFilter] = useState('ALL');
  const [feedbackLengthFilter, setFeedbackLengthFilter] = useState<FeedbackLengthFilter>('ALL');
  const [feedbackSort, setFeedbackSort] = useState<FeedbackSort>('NEWEST');
  const [selectedResponseIds, setSelectedResponseIds] = useState<string[]>([]);
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<string[]>([]);
  const [form, setForm] = useState<PollInput>(EMPTY_FORM);
  const [pollType, setPollType] = useState<PollType>('NORMAL');

  const deferredSearch = useDeferredValue(search);
  const deferredResponseSearch = useDeferredValue(responseSearch);
  const deferredFeedbackSearch = useDeferredValue(feedbackSearch);

  const loadPolls = async (nextSelectedId?: string | null) => {
    if (!token) return;

    try {
      setLoadingList(true);
      setError(null);
      const data = await api.getAdminPolls(token, {
        search: deferredSearch || undefined,
        status: statusFilter,
        anonymity: anonymityFilter,
        limit: 100,
      });
      setPolls(data.polls);

      const preferredId = nextSelectedId ?? selectedPollId;
      if (preferredId && data.polls.some((poll) => poll.id === preferredId)) {
        setSelectedPollId(preferredId);
      } else if (data.polls.length > 0) {
        setSelectedPollId(data.polls[0].id);
      } else {
        setSelectedPollId(null);
        setSelectedPoll(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load polls');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadPolls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deferredSearch, statusFilter, anonymityFilter]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!token || !selectedPollId) {
        setSelectedPoll(null);
        return;
      }

      try {
        setLoadingDetail(true);
        const detail = await api.getAdminPollDetail(selectedPollId, token);
        setSelectedPoll(detail);
        if (editorMode === 'edit') {
          hydrateForm(detail);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load poll detail');
      } finally {
        setLoadingDetail(false);
      }
    };

    void loadDetail();
  }, [selectedPollId, token, editorMode]);

  useEffect(() => {
    if (detailTab !== 'editor' || !selectedPoll || editorMode !== 'create') {
      return;
    }

    setEditorMode('edit');
    setForm({
      question: selectedPoll.question,
      description: selectedPoll.description || '',
      options: selectedPoll.options.map((option) => option.text),
      allowMultipleChoices: selectedPoll.allowMultipleChoices,
      allowVoteChange: selectedPoll.allowVoteChange,
      isAnonymous: selectedPoll.isAnonymous,
      deadline: selectedPoll.deadline ? formatDateTimeLocal(selectedPoll.deadline) : '',
      isPublished: selectedPoll.isPublished,
    });
    setPollType(selectedPoll.options.length === 0 ? 'QUESTION' : 'NORMAL');
  }, [detailTab, editorMode, selectedPoll]);

  useEffect(() => {
    setResponseSearch('');
    setResponseRoleFilter('ALL');
    setResponseOptionFilter('ALL');
    setResponseSort('NEWEST');

    setFeedbackSearch('');
    setFeedbackRoleFilter('ALL');
    setFeedbackLengthFilter('ALL');
    setFeedbackSort('NEWEST');

    setSelectedResponseIds([]);
    setSelectedFeedbackIds([]);
  }, [selectedPollId]);

  const hydrateForm = (detail: AdminPollDetail) => {
    setForm({
      question: detail.question,
      description: detail.description || '',
      options: detail.options.map((option) => option.text),
      allowMultipleChoices: detail.allowMultipleChoices,
      allowVoteChange: detail.allowVoteChange,
      isAnonymous: detail.isAnonymous,
      deadline: detail.deadline ? formatDateTimeLocal(detail.deadline) : '',
      isPublished: detail.isPublished,
    });
    setPollType(detail.options.length === 0 ? 'QUESTION' : 'NORMAL');
  };

  const resetCreateForm = () => {
    setEditorMode('create');
    setSelectedPollId(null);
    setSelectedPoll(null);
    setForm(EMPTY_FORM);
    setPollType('NORMAL');
    setDetailTab('editor');
  };

  const openEditForm = () => {
    if (!selectedPoll) return;
    setEditorMode('edit');
    hydrateForm(selectedPoll);
    setDetailTab('editor');
  };

  const lockedStructure = Boolean(selectedPoll && editorMode === 'edit' && selectedPoll.totalVotes > 0);

  const responseRoleOptions = useMemo(() => {
    if (!selectedPoll) return [];
    return Array.from(new Set(selectedPoll.responses.map((response) => response.user.role))).sort();
  }, [selectedPoll]);

  const filteredResponses = useMemo(() => {
    if (!selectedPoll) return [];
    const query = deferredResponseSearch.trim().toLowerCase();
    const withFilters = selectedPoll.responses.filter((response) => {
      if (responseRoleFilter !== 'ALL' && response.user.role !== responseRoleFilter) {
        return false;
      }

      if (responseOptionFilter !== 'ALL' && !response.optionIds.includes(responseOptionFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${response.user.name} ${response.user.email} ${response.user.role} ${response.optionLabels.join(' ')}`
        .toLowerCase()
        .includes(query);
    });

    return [...withFilters].sort((left, right) => {
      if (responseSort === 'OLDEST') {
        return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [deferredResponseSearch, selectedPoll, responseRoleFilter, responseOptionFilter, responseSort]);

  const feedbackRoleOptions = useMemo(() => {
    if (!selectedPoll) return [];
    return Array.from(new Set(selectedPoll.feedback.map((entry) => entry.user.role))).sort();
  }, [selectedPoll]);

  const filteredFeedback = useMemo(() => {
    if (!selectedPoll) return [];
    const query = deferredFeedbackSearch.trim().toLowerCase();
    const withFilters = selectedPoll.feedback.filter((entry) => {
      if (feedbackRoleFilter !== 'ALL' && entry.user.role !== feedbackRoleFilter) {
        return false;
      }

      const messageLength = entry.message.trim().length;
      if (feedbackLengthFilter === 'SHORT' && messageLength > 120) {
        return false;
      }

      if (feedbackLengthFilter === 'MEDIUM' && (messageLength <= 120 || messageLength > 350)) {
        return false;
      }

      if (feedbackLengthFilter === 'LONG' && messageLength <= 350) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${entry.user.name} ${entry.user.email} ${entry.user.role} ${entry.message}`
        .toLowerCase()
        .includes(query);
    });

    return [...withFilters].sort((left, right) => {
      if (feedbackSort === 'OLDEST') {
        return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      }

      if (feedbackSort === 'LONGEST') {
        return right.message.trim().length - left.message.trim().length;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [deferredFeedbackSearch, selectedPoll, feedbackRoleFilter, feedbackLengthFilter, feedbackSort]);

  const clearResponseFilters = () => {
    setResponseSearch('');
    setResponseRoleFilter('ALL');
    setResponseOptionFilter('ALL');
    setResponseSort('NEWEST');
  };

  const clearFeedbackFilters = () => {
    setFeedbackSearch('');
    setFeedbackRoleFilter('ALL');
    setFeedbackLengthFilter('ALL');
    setFeedbackSort('NEWEST');
  };

  const toggleResponseSelection = (responseId: string) => {
    setSelectedResponseIds((current) =>
      current.includes(responseId)
        ? current.filter((id) => id !== responseId)
        : [...current, responseId],
    );
  };

  const toggleFeedbackSelection = (feedbackId: string) => {
    setSelectedFeedbackIds((current) =>
      current.includes(feedbackId)
        ? current.filter((id) => id !== feedbackId)
        : [...current, feedbackId],
    );
  };

  const selectFilteredResponses = () => {
    setSelectedResponseIds((current) =>
      Array.from(new Set([...current, ...filteredResponses.map((response) => response.id)])),
    );
  };

  const selectFilteredFeedback = () => {
    setSelectedFeedbackIds((current) =>
      Array.from(new Set([...current, ...filteredFeedback.map((entry) => entry.id)])),
    );
  };

  const exportResponses = (mode: 'selected' | 'filtered' | 'all') => {
    if (!selectedPoll) return;

    const selectedIdSet = new Set(selectedResponseIds);
    const source =
      mode === 'selected'
        ? selectedPoll.responses.filter((response) => selectedIdSet.has(response.id))
        : mode === 'filtered'
          ? filteredResponses
          : selectedPoll.responses;

    if (source.length === 0) {
      toast.error('No responses available for this export mode.');
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `${selectedPoll.slug}-responses-${mode}-${dateStamp}.csv`,
      ['Name', 'Email', 'Role', 'Selected Options', 'Updated At'],
      source.map((response) => [
        response.user.name,
        response.user.email,
        response.user.role.replace(/_/g, ' '),
        response.optionLabels.join(' | '),
        formatDateTime(response.updatedAt),
      ]),
    );

    toast.success(`Extracted ${source.length} responses.`);
  };

  const exportFeedback = (mode: 'selected' | 'filtered' | 'all') => {
    if (!selectedPoll) return;

    const selectedIdSet = new Set(selectedFeedbackIds);
    const source =
      mode === 'selected'
        ? selectedPoll.feedback.filter((entry) => selectedIdSet.has(entry.id))
        : mode === 'filtered'
          ? filteredFeedback
          : selectedPoll.feedback;

    if (source.length === 0) {
      toast.error('No feedback entries available for this export mode.');
      return;
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `${selectedPoll.slug}-feedback-${mode}-${dateStamp}.csv`,
      ['Message', 'Name', 'Email', 'Role', 'Length', 'Updated At'],
      source.map((entry) => [
        entry.message,
        entry.user.name,
        entry.user.email,
        entry.user.role.replace(/_/g, ' '),
        entry.message.trim().length,
        formatDateTime(entry.updatedAt),
      ]),
    );

    toast.success(`Extracted ${source.length} feedback entries.`);
  };

  const handleOptionChange = (index: number, value: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? value : option)),
    }));
  };

  const handlePollTypeChange = (nextType: PollType) => {
    setPollType(nextType);
    setForm((current) => {
      if (nextType === 'QUESTION') {
        return {
          ...current,
          options: [],
          allowMultipleChoices: false,
          allowVoteChange: false,
        };
      }

      const restoredOptions = current.options.length === 0 ? ['', ''] : current.options;
      return {
        ...current,
        options: restoredOptions,
        allowVoteChange: true,
      };
    });
  };

  const handleAddOption = () => {
    if (pollType === 'QUESTION') return;
    setForm((current) => ({
      ...current,
      options: [...current.options, ''],
    }));
  };

  const handleRemoveOption = (index: number) => {
    if (pollType === 'QUESTION') return;
    setForm((current) => ({
      ...current,
      options: current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  };

  const handleSave = async () => {
    if (!token) return;

    const normalizedOptions = form.options.map((option) => option.trim()).filter(Boolean);
    if (!form.question.trim()) {
      toast.error('Question is required.');
      return;
    }
    if (pollType === 'NORMAL' && normalizedOptions.length < 2) {
      toast.error('Add at least two options for a normal poll.');
      return;
    }

    const payloadOptions = pollType === 'QUESTION' ? [] : normalizedOptions;

    const payload: PollInput = {
      question: form.question.trim(),
      description: form.description?.trim() || '',
      options: payloadOptions,
      allowMultipleChoices: pollType === 'QUESTION' ? false : Boolean(form.allowMultipleChoices),
      allowVoteChange: pollType === 'QUESTION' ? false : Boolean(form.allowVoteChange),
      isAnonymous: Boolean(form.isAnonymous),
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      isPublished: Boolean(form.isPublished),
    };

    try {
      setSaving(true);
      let detail: AdminPollDetail;

      if (editorMode === 'edit' && selectedPoll) {
        detail = await api.updatePoll(selectedPoll.id, payload, token);
        toast.success('Poll updated.');
      } else {
        detail = await api.createPoll(payload, token);
        toast.success('Poll created.');
      }

      setSelectedPollId(detail.id);
      setSelectedPoll(detail);
      setEditorMode('edit');
      setDetailTab('overview');
      await loadPolls(detail.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save poll');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !selectedPoll) return;
    const confirmed = window.confirm(`Delete the poll "${selectedPoll.question}"? This will remove votes and feedback too.`);
    if (!confirmed) return;

    try {
      setSaving(true);
      await api.deletePoll(selectedPoll.id, token);
      toast.success('Poll deleted.');
      setSelectedPoll(null);
      setSelectedPollId(null);
      setEditorMode('create');
      setForm(EMPTY_FORM);
      await loadPolls();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete poll');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!token || !selectedPoll) return;

    try {
      setExporting(true);
      const blob = await api.downloadPollExport(selectedPoll.id, token);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedPoll.slug}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export poll data');
    } finally {
      setExporting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!selectedPoll) return;
    try {
      await navigator.clipboard.writeText(selectedPoll.shareUrl);
      toast.success('Share link copied.');
    } catch {
      toast.error('Could not copy link.');
    }
  };

  const statusTabs: ListStatusFilter[] = ['ALL', 'OPEN', 'CLOSED', 'DRAFT'];
  const anonymityTabs: ListAnonymityFilter[] = ['ALL', 'ANONYMOUS', 'NAMED'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Public View</h1>
          <p className="text-sm text-gray-600">
            Manage async polls, inspect responses, review feedback, and export the full data trail.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadPolls()}>
            <RefreshCw className={cn('h-4 w-4', loadingList && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={resetCreateForm}>
            <Plus className="h-4 w-4" />
            Create poll
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 shadow-sm">
          <CardContent className="px-5 py-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg text-gray-950">Find polls</CardTitle>
              <CardDescription>Filter by state, anonymity, or text inside the question.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search polls"
                  className="pl-9"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-2">
                  {statusTabs.map((tab) => (
                    <Button
                      key={tab}
                      variant={statusFilter === tab ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter(tab)}
                    >
                      {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Anonymity</Label>
                <div className="flex flex-wrap gap-2">
                  {anonymityTabs.map((tab) => (
                    <Button
                      key={tab}
                      variant={anonymityFilter === tab ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAnonymityFilter(tab)}
                    >
                      {tab === 'ALL' ? 'All' : tab === 'ANONYMOUS' ? 'Anonymous' : 'Named'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {loadingList ? (
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
                </CardContent>
              </Card>
            ) : polls.length === 0 ? (
              <Card className="border-gray-200 shadow-sm">
                <CardContent className="py-10 text-center text-sm text-gray-500">
                  No polls matched the current filters.
                </CardContent>
              </Card>
            ) : (
              polls.map((poll) => (
                <button
                  key={poll.id}
                  type="button"
                  onClick={() => {
                    setSelectedPollId(poll.id);
                    setEditorMode('edit');
                    setDetailTab('overview');
                  }}
                  className={cn(
                    'w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-amber-300',
                    selectedPollId === poll.id ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-200',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={poll.isClosed ? 'secondary' : 'success'}>
                      {poll.isClosed ? 'Closed' : 'Open'}
                    </Badge>
                    {!poll.isPublished && <Badge variant="outline">Draft</Badge>}
                    <Badge variant="outline">{poll.optionCount === 0 ? 'Question' : 'Normal'}</Badge>
                    <Badge variant="outline">{poll.isAnonymous ? 'Anonymous' : 'Named'}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="font-semibold text-gray-950">{poll.question}</div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                      <div>{poll.totalVotes} votes</div>
                      <div>{poll.totalFeedback} feedback</div>
                      <div>{poll.optionCount} options</div>
                    </div>
                    <div className="text-xs text-gray-500">Updated {formatDateTime(poll.updatedAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          {loadingDetail && selectedPollId ? (
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
              </CardContent>
            </Card>
          ) : editorMode === 'create' && !selectedPoll ? (
            <PollEditor
              form={form}
              setForm={setForm}
              pollType={pollType}
              onPollTypeChange={handlePollTypeChange}
              onAddOption={handleAddOption}
              onOptionChange={handleOptionChange}
              onRemoveOption={handleRemoveOption}
              onSave={handleSave}
              saving={saving}
              lockedStructure={false}
              title="Create poll"
              description="Publish a new async poll to the dashboard, announcement surfaces, and share link."
            />
          ) : selectedPoll ? (
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={selectedPoll.isClosed ? 'secondary' : 'success'}>
                        {selectedPoll.isClosed ? 'Closed' : 'Open'}
                      </Badge>
                      {!selectedPoll.isPublished && <Badge variant="outline">Draft</Badge>}
                      <Badge variant="outline">{selectedPoll.options.length === 0 ? 'Question' : 'Normal'}</Badge>
                      <Badge variant="outline">
                        {selectedPoll.allowMultipleChoices ? 'Multiple choice' : 'Single choice'}
                      </Badge>
                      <Badge variant="outline">{selectedPoll.isAnonymous ? 'Anonymous' : 'Named'}</Badge>
                    </div>
                    <div>
                      <CardTitle className="text-2xl text-gray-950">{selectedPoll.question}</CardTitle>
                      <CardDescription className="mt-1 max-w-3xl text-sm leading-6 text-gray-600">
                        {selectedPoll.description || 'No description added.'}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      <Copy className="h-4 w-4" />
                      Copy link
                    </Button>
                    <Link to={`/polls/${selectedPoll.slug}`} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">Open public page</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={openEditForm}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="responses">Responses</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-4">
                      <StatTile label="Votes" value={selectedPoll.totalVotes} icon={Users} />
                      <StatTile label="Feedback" value={selectedPoll.totalFeedback} icon={MessageSquare} />
                      <StatTile label="Options" value={selectedPoll.options.length} icon={BarChart3} />
                      <StatTile label="Type" valueText={selectedPoll.options.length === 0 ? 'Question' : 'Normal'} icon={CheckCircle2} />
                    </div>

                    {selectedPoll.options.length === 0 ? (
                      <Card className="border-gray-200 shadow-none">
                        <CardContent className="py-8 text-sm text-gray-600">
                          This is a question-type poll. Participants submit free-text questions in the feedback area, and no option voting is collected.
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {selectedPoll.options.map((option) => (
                          <div key={option.id} className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium text-gray-900">{option.text}</div>
                              <div className="text-sm text-gray-500">
                                {option.voteCount} votes · {option.percentage}%
                              </div>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${Math.max(option.percentage, option.voteCount > 0 ? 4 : 0)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <InfoRow label="Created" value={formatDateTime(selectedPoll.createdAt)} />
                      <InfoRow label="Last updated" value={formatDateTime(selectedPoll.updatedAt)} />
                      <InfoRow label="Deadline" value={selectedPoll.deadline ? formatDateTime(selectedPoll.deadline) : 'No deadline'} />
                      <InfoRow label="Created by" value={`${selectedPoll.creator.name} · ${selectedPoll.creator.email}`} />
                    </div>
                  </TabsContent>

                  <TabsContent value="responses" className="space-y-4">
                    {selectedPoll.options.length === 0 ? (
                      <Card className="border-gray-200 shadow-none">
                        <CardContent className="py-10 text-center text-sm text-gray-500">
                          Question-type polls do not collect option votes. Use the Feedback tab to review submitted questions.
                        </CardContent>
                      </Card>
                    ) : selectedPoll.isAnonymous ? (
                      <Card className="border-gray-200 shadow-none">
                        <CardContent className="py-10 text-center text-sm text-gray-500">
                          This poll is anonymous. Individual voter identities are intentionally hidden here and in exports.
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="grid gap-3 lg:grid-cols-4">
                            <div className="relative lg:col-span-2">
                              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                              <Input
                                value={responseSearch}
                                onChange={(event) => setResponseSearch(event.target.value)}
                                placeholder="Search by user, email, role, or option"
                                className="pl-9"
                              />
                            </div>

                            <select
                              value={responseRoleFilter}
                              onChange={(event) => setResponseRoleFilter(event.target.value)}
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="ALL">All roles</option>
                              {responseRoleOptions.map((role) => (
                                <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
                              ))}
                            </select>

                            <select
                              value={responseOptionFilter}
                              onChange={(event) => setResponseOptionFilter(event.target.value)}
                              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="ALL">All options</option>
                              {selectedPoll.options.map((option) => (
                                <option key={option.id} value={option.id}>{option.text}</option>
                              ))}
                            </select>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Label htmlFor="responses-sort" className="text-xs text-gray-600">Sort</Label>
                              <select
                                id="responses-sort"
                                value={responseSort}
                                onChange={(event) => setResponseSort(event.target.value as ResponseSort)}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                              >
                                <option value="NEWEST">Newest first</option>
                                <option value="OLDEST">Oldest first</option>
                              </select>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-600">
                                Showing {filteredResponses.length} of {selectedPoll.responses.length} responses
                              </span>
                              <Button type="button" variant="outline" size="sm" onClick={clearResponseFilters}>
                                Clear filters
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
                            <span className="text-xs text-gray-600">{selectedResponseIds.length} selected</span>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={selectFilteredResponses}>
                                Select filtered
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedResponseIds([])}
                                disabled={selectedResponseIds.length === 0}
                              >
                                Clear selected
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => exportResponses('selected')}
                                disabled={selectedResponseIds.length === 0}
                              >
                                Extract selected
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => exportResponses('filtered')}
                                disabled={filteredResponses.length === 0}
                              >
                                Extract filtered
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => exportResponses('all')}
                                disabled={selectedPoll.responses.length === 0}
                              >
                                Extract all
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {filteredResponses.length === 0 ? (
                            <Card className="border-gray-200 shadow-none">
                              <CardContent className="py-10 text-center text-sm text-gray-500">
                                No responses matched that search.
                              </CardContent>
                            </Card>
                          ) : (
                            filteredResponses.map((response) => (
                              <div key={response.id} className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                    checked={selectedResponseIds.includes(response.id)}
                                    onChange={() => toggleResponseSelection(response.id)}
                                    aria-label={`Select response from ${response.user.name}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div>
                                        <div className="font-medium text-gray-950">{response.user.name}</div>
                                        <div className="text-sm text-gray-500">{response.user.email}</div>
                                        <div className="mt-1 text-xs text-gray-500">{response.user.role.replace(/_/g, ' ')}</div>
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        Updated {formatDateTime(response.updatedAt)}
                                      </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {response.optionLabels.map((label) => (
                                        <Badge key={label} variant="secondary" className="bg-amber-100 text-amber-900">
                                          {label}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="feedback" className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid gap-3 lg:grid-cols-4">
                        <div className="relative lg:col-span-2">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                          <Input
                            value={feedbackSearch}
                            onChange={(event) => setFeedbackSearch(event.target.value)}
                            placeholder="Search feedback by user, role, email, or text"
                            className="pl-9"
                          />
                        </div>

                        <select
                          value={feedbackRoleFilter}
                          onChange={(event) => setFeedbackRoleFilter(event.target.value)}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="ALL">All roles</option>
                          {feedbackRoleOptions.map((role) => (
                            <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
                          ))}
                        </select>

                        <select
                          value={feedbackLengthFilter}
                          onChange={(event) => setFeedbackLengthFilter(event.target.value as FeedbackLengthFilter)}
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="ALL">All lengths</option>
                          <option value="SHORT">Short (0-120)</option>
                          <option value="MEDIUM">Medium (121-350)</option>
                          <option value="LONG">Long (351+)</option>
                        </select>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="feedback-sort" className="text-xs text-gray-600">Sort</Label>
                          <select
                            id="feedback-sort"
                            value={feedbackSort}
                            onChange={(event) => setFeedbackSort(event.target.value as FeedbackSort)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="NEWEST">Newest first</option>
                            <option value="OLDEST">Oldest first</option>
                            <option value="LONGEST">Longest message</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-600">
                            Showing {filteredFeedback.length} of {selectedPoll.feedback.length} entries
                          </span>
                          <Button type="button" variant="outline" size="sm" onClick={clearFeedbackFilters}>
                            Clear filters
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
                        <span className="text-xs text-gray-600">{selectedFeedbackIds.length} selected</span>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={selectFilteredFeedback}>
                            Select filtered
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedFeedbackIds([])}
                            disabled={selectedFeedbackIds.length === 0}
                          >
                            Clear selected
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => exportFeedback('selected')}
                            disabled={selectedFeedbackIds.length === 0}
                          >
                            Extract selected
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => exportFeedback('filtered')}
                            disabled={filteredFeedback.length === 0}
                          >
                            Extract filtered
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => exportFeedback('all')}
                            disabled={selectedPoll.feedback.length === 0}
                          >
                            Extract all
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {filteredFeedback.length === 0 ? (
                        <Card className="border-gray-200 shadow-none">
                          <CardContent className="py-10 text-center text-sm text-gray-500">
                            No feedback matched that search.
                          </CardContent>
                        </Card>
                      ) : (
                        filteredFeedback.map((entry) => (
                          <div key={entry.id} className="rounded-xl border border-gray-200 bg-white px-4 py-4">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] leading-7 text-gray-900">
                              {entry.message}
                            </div>
                            <div className="mt-3 flex items-start gap-3">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                checked={selectedFeedbackIds.includes(entry.id)}
                                onChange={() => toggleFeedbackSelection(entry.id)}
                                aria-label={`Select feedback from ${entry.user.name}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <div className="font-medium text-gray-950">{entry.user.name}</div>
                                    <div className="text-sm text-gray-500">{entry.user.email}</div>
                                    <div className="mt-1 text-xs text-gray-500">{entry.user.role.replace(/_/g, ' ')}</div>
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    Updated {formatDateTime(entry.updatedAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="editor">
                    <PollEditor
                      form={form}
                      setForm={setForm}
                      pollType={pollType}
                      onPollTypeChange={handlePollTypeChange}
                      onAddOption={handleAddOption}
                      onOptionChange={handleOptionChange}
                      onRemoveOption={handleRemoveOption}
                      onSave={handleSave}
                      saving={saving}
                      lockedStructure={lockedStructure}
                      title={editorMode === 'edit' ? 'Edit poll' : 'Create poll'}
                      description={
                        lockedStructure
                          ? 'Voting has started, so options, anonymity, and choice mode are locked to protect response integrity.'
                          : 'Adjust the poll question, options, and delivery settings.'
                      }
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-200 shadow-sm">
              <CardContent className="py-14 text-center">
                <div className="mx-auto max-w-md space-y-3">
                  <h2 className="text-xl font-semibold text-gray-950">No poll selected</h2>
                  <p className="text-sm leading-6 text-gray-600">
                    Pick a poll from the left to inspect its public performance, or create a fresh one.
                  </p>
                  <Button onClick={resetCreateForm}>
                    <Plus className="h-4 w-4" />
                    Create poll
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  valueText,
  icon: Icon,
}: {
  label: string;
  value?: number;
  valueText?: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-gray-200 shadow-none">
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="rounded-lg bg-amber-50 p-2">
          <Icon className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-950">
            {value !== undefined ? value : valueText}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm leading-6 text-gray-900">{value}</div>
    </div>
  );
}

function PollEditor({
  form,
  setForm,
  pollType,
  onPollTypeChange,
  onAddOption,
  onOptionChange,
  onRemoveOption,
  onSave,
  saving,
  lockedStructure,
  title,
  description,
}: {
  form: PollInput;
  setForm: Dispatch<SetStateAction<PollInput>>;
  pollType: PollType;
  onPollTypeChange: (type: PollType) => void;
  onAddOption: () => void;
  onOptionChange: (index: number, value: string) => void;
  onRemoveOption: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  lockedStructure: boolean;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-gray-200 shadow-none">
      <CardHeader>
        <CardTitle className="text-lg text-gray-950">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {lockedStructure && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This poll already has votes, so its structure is locked. You can still update the description,
            deadline, publish state, and vote-change rule, but options, anonymity, and choice mode stay fixed
            to protect existing results.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="poll-question">Question</Label>
          <Input
            id="poll-question"
            value={form.question}
            onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
            placeholder="Ask a focused question"
          />
        </div>

        <div className="space-y-2">
          <Label>Poll type</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={pollType === 'NORMAL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPollTypeChange('NORMAL')}
              disabled={lockedStructure}
            >
              Normal poll
            </Button>
            <Button
              type="button"
              variant={pollType === 'QUESTION' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPollTypeChange('QUESTION')}
              disabled={lockedStructure}
            >
              Question type
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Normal polls use voting options. Question type shows only a free-text answer box on the public page.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="poll-description">Description</Label>
          <Textarea
            id="poll-description"
            value={form.description ?? ''}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Add context, instructions, or why this poll matters."
            rows={4}
          />
          <p className="text-xs text-gray-500">
            Normal polls show feedback below options. Question-type polls show the answer area immediately on the public page.
          </p>
        </div>

        {pollType === 'NORMAL' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Options</Label>
                {lockedStructure && (
                  <p className="text-xs text-amber-700">Options are locked after the first vote is cast.</p>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onAddOption} disabled={lockedStructure}>
                <Plus className="h-4 w-4" />
                Add option
              </Button>
            </div>
            <div className="space-y-3">
              {form.options.map((option, index) => (
                <div key={`${index}-${form.options.length}`} className="flex gap-2">
                  <Input
                    value={option}
                    onChange={(event) => onOptionChange(index, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                    disabled={lockedStructure}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onRemoveOption(index)}
                    disabled={lockedStructure || form.options.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Question-type polls skip option voting and show only the answer textbox on the public page.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="poll-deadline">Deadline</Label>
            <Input
              id="poll-deadline"
              type="datetime-local"
              value={form.deadline ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Share URL becomes available after save and always points to the public poll page.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SwitchRow
            label="Multiple choice"
            description="Allow users to pick more than one option in a single ballot."
            checked={Boolean(form.allowMultipleChoices)}
            onChange={(checked) => setForm((current) => ({ ...current, allowMultipleChoices: checked }))}
            disabled={lockedStructure || pollType === 'QUESTION'}
          />
          <SwitchRow
            label="Allow vote changes"
            description="Let users revisit the poll and update their selection before it closes."
            checked={Boolean(form.allowVoteChange)}
            onChange={(checked) => setForm((current) => ({ ...current, allowVoteChange: checked }))}
            disabled={pollType === 'QUESTION'}
          />
          <SwitchRow
            label="Anonymous voting"
            description="Hide per-user vote details from admin response views and exports."
            checked={Boolean(form.isAnonymous)}
            onChange={(checked) => setForm((current) => ({ ...current, isAnonymous: checked }))}
            disabled={lockedStructure}
          />
          <SwitchRow
            label="Published"
            description="Control whether the poll appears publicly and on the dashboard."
            checked={Boolean(form.isPublished)}
            onChange={(checked) => setForm((current) => ({ ...current, isPublished: checked }))}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save poll
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        <p className="text-xs leading-5 text-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
