import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime } from '@/lib/dateUtils';
import type { AdminPollDetail } from '@/lib/api';
import type { ResponseSort } from '@/lib/pollAdmin';

export type ExportMode = 'selected' | 'filtered' | 'all';

type PollResponse = AdminPollDetail['responses'][number];

interface PollResponsesTabProps {
  poll: AdminPollDetail;
  responseSearch: string;
  onResponseSearchChange: (value: string) => void;
  responseRoleFilter: string;
  onResponseRoleFilterChange: (value: string) => void;
  responseOptionFilter: string;
  onResponseOptionFilterChange: (value: string) => void;
  responseSort: ResponseSort;
  onResponseSortChange: (value: ResponseSort) => void;
  responseRoleOptions: string[];
  filteredResponses: PollResponse[];
  selectedResponseIds: string[];
  onToggleResponseSelection: (responseId: string) => void;
  onSelectFilteredResponses: () => void;
  onClearSelectedResponses: () => void;
  onClearResponseFilters: () => void;
  onExport: (mode: ExportMode) => void;
}

export function PollResponsesTab({
  poll,
  responseSearch,
  onResponseSearchChange,
  responseRoleFilter,
  onResponseRoleFilterChange,
  responseOptionFilter,
  onResponseOptionFilterChange,
  responseSort,
  onResponseSortChange,
  responseRoleOptions,
  filteredResponses,
  selectedResponseIds,
  onToggleResponseSelection,
  onSelectFilteredResponses,
  onClearSelectedResponses,
  onClearResponseFilters,
  onExport,
}: PollResponsesTabProps) {
  if (poll.options.length === 0) {
    return (
      <Card className="border-gray-200 shadow-none">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          Question-type polls do not collect option votes. Use the Feedback tab to review submitted questions.
        </CardContent>
      </Card>
    );
  }

  if (poll.isAnonymous) {
    return (
      <Card className="border-gray-200 shadow-none">
        <CardContent className="py-10 text-center text-sm text-gray-500">
          This poll is anonymous. Individual voter identities are intentionally hidden here and in exports.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={responseSearch}
              onChange={(event) => onResponseSearchChange(event.target.value)}
              placeholder="Search by user, email, role, or option"
              className="pl-9"
            />
          </div>

          <select
            value={responseRoleFilter}
            onChange={(event) => onResponseRoleFilterChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All roles</option>
            {responseRoleOptions.map((role) => (
              <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            value={responseOptionFilter}
            onChange={(event) => onResponseOptionFilterChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">All options</option>
            {poll.options.map((option) => (
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
              onChange={(event) => onResponseSortChange(event.target.value as ResponseSort)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">
              Showing {filteredResponses.length} of {poll.responses.length} responses
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClearResponseFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3">
          <span className="text-xs text-gray-600">{selectedResponseIds.length} selected</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onSelectFilteredResponses}>
              Select filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearSelectedResponses}
              disabled={selectedResponseIds.length === 0}
            >
              Clear selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('selected')}
              disabled={selectedResponseIds.length === 0}
            >
              Extract selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('filtered')}
              disabled={filteredResponses.length === 0}
            >
              Extract filtered
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onExport('all')}
              disabled={poll.responses.length === 0}
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
                  onChange={() => onToggleResponseSelection(response.id)}
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
    </div>
  );
}
