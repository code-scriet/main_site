import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PollEditor } from '@/components/admin/polls/PollEditor';
import { PollListSidebar } from '@/components/admin/polls/PollListSidebar';
import { PollDetailHeader } from '@/components/admin/polls/PollDetailHeader';
import { PollOverviewTab } from '@/components/admin/polls/PollOverviewTab';
import { PollResponsesTab } from '@/components/admin/polls/PollResponsesTab';
import { PollFeedbackTab } from '@/components/admin/polls/PollFeedbackTab';
import { api, type AdminPollDetail, type AdminPollListItem, type PollInput } from '@/lib/api';
import { formatDateTimeLocal } from '@/lib/dateUtils';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  downloadCsvFile,
  buildResponsesCsvRows,
  RESPONSES_CSV_HEADERS,
  buildFeedbackCsvRows,
  FEEDBACK_CSV_HEADERS,
} from '@/lib/pollCsv';
import {
  EMPTY_POLL_FORM,
  filterAndSortFeedback,
  filterAndSortResponses,
  type DetailTab,
  type FeedbackLengthFilter,
  type FeedbackSort,
  type ListAnonymityFilter,
  type ListStatusFilter,
  type PollType,
  type ResponseSort,
} from '@/lib/pollAdmin';

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
  const [form, setForm] = useState<PollInput>(EMPTY_POLL_FORM);
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
    setForm(EMPTY_POLL_FORM);
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
    return filterAndSortResponses({
      responses: selectedPoll.responses,
      search: deferredResponseSearch,
      roleFilter: responseRoleFilter,
      optionFilter: responseOptionFilter,
      sort: responseSort,
    });
  }, [deferredResponseSearch, selectedPoll, responseRoleFilter, responseOptionFilter, responseSort]);

  const feedbackRoleOptions = useMemo(() => {
    if (!selectedPoll) return [];
    return Array.from(new Set(selectedPoll.feedback.map((entry) => entry.user.role))).sort();
  }, [selectedPoll]);

  const filteredFeedback = useMemo(() => {
    if (!selectedPoll) return [];
    return filterAndSortFeedback({
      feedback: selectedPoll.feedback,
      search: deferredFeedbackSearch,
      roleFilter: feedbackRoleFilter,
      lengthFilter: feedbackLengthFilter,
      sort: feedbackSort,
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
      RESPONSES_CSV_HEADERS,
      buildResponsesCsvRows(source),
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
      FEEDBACK_CSV_HEADERS,
      buildFeedbackCsvRows(source),
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
      setForm(EMPTY_POLL_FORM);
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
        <PollListSidebar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          anonymityFilter={anonymityFilter}
          onAnonymityFilterChange={setAnonymityFilter}
          polls={polls}
          selectedPollId={selectedPollId}
          onSelectPoll={(pollId) => {
            setSelectedPollId(pollId);
            setEditorMode('edit');
            setDetailTab('overview');
          }}
          loading={loadingList}
        />

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
              <PollDetailHeader
                poll={selectedPoll}
                onCopyLink={handleCopyLink}
                onExport={handleExport}
                onEdit={openEditForm}
                onDelete={handleDelete}
                exporting={exporting}
                saving={saving}
              />

              <CardContent className="pt-6">
                <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="responses">Responses</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview">
                    <PollOverviewTab poll={selectedPoll} />
                  </TabsContent>

                  <TabsContent value="responses">
                    <PollResponsesTab
                      poll={selectedPoll}
                      responseSearch={responseSearch}
                      onResponseSearchChange={setResponseSearch}
                      responseRoleFilter={responseRoleFilter}
                      onResponseRoleFilterChange={setResponseRoleFilter}
                      responseOptionFilter={responseOptionFilter}
                      onResponseOptionFilterChange={setResponseOptionFilter}
                      responseSort={responseSort}
                      onResponseSortChange={setResponseSort}
                      responseRoleOptions={responseRoleOptions}
                      filteredResponses={filteredResponses}
                      selectedResponseIds={selectedResponseIds}
                      onToggleResponseSelection={toggleResponseSelection}
                      onSelectFilteredResponses={selectFilteredResponses}
                      onClearSelectedResponses={() => setSelectedResponseIds([])}
                      onClearResponseFilters={clearResponseFilters}
                      onExport={exportResponses}
                    />
                  </TabsContent>

                  <TabsContent value="feedback">
                    <PollFeedbackTab
                      poll={selectedPoll}
                      feedbackSearch={feedbackSearch}
                      onFeedbackSearchChange={setFeedbackSearch}
                      feedbackRoleFilter={feedbackRoleFilter}
                      onFeedbackRoleFilterChange={setFeedbackRoleFilter}
                      feedbackLengthFilter={feedbackLengthFilter}
                      onFeedbackLengthFilterChange={setFeedbackLengthFilter}
                      feedbackSort={feedbackSort}
                      onFeedbackSortChange={setFeedbackSort}
                      feedbackRoleOptions={feedbackRoleOptions}
                      filteredFeedback={filteredFeedback}
                      selectedFeedbackIds={selectedFeedbackIds}
                      onToggleFeedbackSelection={toggleFeedbackSelection}
                      onSelectFilteredFeedback={selectFilteredFeedback}
                      onClearSelectedFeedback={() => setSelectedFeedbackIds([])}
                      onClearFeedbackFilters={clearFeedbackFilters}
                      onExport={exportFeedback}
                    />
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
