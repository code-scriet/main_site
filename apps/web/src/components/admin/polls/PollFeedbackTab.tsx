import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/dateUtils';
import type { AdminPollDetail } from '@/lib/api';
import type { FeedbackLengthFilter, FeedbackSort } from '@/lib/pollAdmin';
import type { ExportMode } from './PollResponsesTab';

type PollFeedback = AdminPollDetail['feedback'][number];

interface PollFeedbackTabProps {
  poll: AdminPollDetail;
  feedbackSearch: string;
  onFeedbackSearchChange: (value: string) => void;
  feedbackRoleFilter: string;
  onFeedbackRoleFilterChange: (value: string) => void;
  feedbackLengthFilter: FeedbackLengthFilter;
  onFeedbackLengthFilterChange: (value: FeedbackLengthFilter) => void;
  feedbackSort: FeedbackSort;
  onFeedbackSortChange: (value: FeedbackSort) => void;
  feedbackRoleOptions: string[];
  filteredFeedback: PollFeedback[];
  selectedFeedbackIds: string[];
  onToggleFeedbackSelection: (feedbackId: string) => void;
  onSelectFilteredFeedback: () => void;
  onClearSelectedFeedback: () => void;
  onClearFeedbackFilters: () => void;
  onExport: (mode: ExportMode) => void;
}

export function PollFeedbackTab({
  poll,
  feedbackSearch,
  onFeedbackSearchChange,
  feedbackRoleFilter,
  onFeedbackRoleFilterChange,
  feedbackLengthFilter,
  onFeedbackLengthFilterChange,
  feedbackSort,
  onFeedbackSortChange,
  feedbackRoleOptions,
  filteredFeedback,
  selectedFeedbackIds,
  onToggleFeedbackSelection,
  onSelectFilteredFeedback,
  onClearSelectedFeedback,
  onClearFeedbackFilters,
  onExport,
}: PollFeedbackTabProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-3)]" />
            <Input
              value={feedbackSearch}
              onChange={(event) => onFeedbackSearchChange(event.target.value)}
              placeholder="Search feedback by user, role, email, or text"
              className="pl-9"
            />
          </div>

          <select
            value={feedbackRoleFilter}
            onChange={(event) => onFeedbackRoleFilterChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All roles</option>
            {feedbackRoleOptions.map((role) => (
              <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            value={feedbackLengthFilter}
            onChange={(event) => onFeedbackLengthFilterChange(event.target.value as FeedbackLengthFilter)}
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
            <Label htmlFor="feedback-sort" className="text-xs text-[var(--ds-text-2)]">Sort</Label>
            <select
              id="feedback-sort"
              value={feedbackSort}
              onChange={(event) => onFeedbackSortChange(event.target.value as FeedbackSort)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
              <option value="LONGEST">Longest message</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--ds-text-2)]">
              Showing {filteredFeedback.length} of {poll.feedback.length} entries
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClearFeedbackFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <span className="text-xs text-[var(--ds-text-2)]">{selectedFeedbackIds.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onSelectFilteredFeedback}>
              Select filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearSelectedFeedback}
              disabled={selectedFeedbackIds.length === 0}
            >
              Clear selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('selected')}
              disabled={selectedFeedbackIds.length === 0}
            >
              Extract selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('filtered')}
              disabled={filteredFeedback.length === 0}
            >
              Extract filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('all')}
              disabled={poll.feedback.length === 0}
            >
              Extract all
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredFeedback.length === 0 ? (
          <Card className="border-[var(--border-subtle)] shadow-none">
            <CardContent className="py-10 text-center text-sm text-[var(--ds-text-3)]">
              No feedback matched that search.
            </CardContent>
          </Card>
        ) : (
          filteredFeedback.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-[var(--border-subtle)] bg-white px-4 py-4">
              <div className="rounded-lg border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-[15px] leading-7 text-[var(--ds-text-1)]">
                {entry.message}
              </div>
              <div className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[var(--border-default)] text-amber-600 focus:ring-amber-500"
                  checked={selectedFeedbackIds.includes(entry.id)}
                  onChange={() => onToggleFeedbackSelection(entry.id)}
                  aria-label={`Select feedback from ${entry.user.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="font-medium text-gray-950">{entry.user.name}</div>
                      <div className="text-sm text-[var(--ds-text-3)]">{entry.user.email}</div>
                      <div className="mt-1 text-xs text-[var(--ds-text-3)]">{entry.user.role.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="text-xs text-[var(--ds-text-3)]">
                      Updated {formatDateTime(entry.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
