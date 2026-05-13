import { Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/dateUtils';
import type { AdminPollListItem } from '@/lib/api';
import {
  ANONYMITY_TABS,
  STATUS_TABS,
  type ListAnonymityFilter,
  type ListStatusFilter,
} from '@/lib/pollAdmin';

interface PollListSidebarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: ListStatusFilter;
  onStatusFilterChange: (value: ListStatusFilter) => void;
  anonymityFilter: ListAnonymityFilter;
  onAnonymityFilterChange: (value: ListAnonymityFilter) => void;
  polls: AdminPollListItem[];
  selectedPollId: string | null;
  onSelectPoll: (pollId: string) => void;
  loading: boolean;
}

export function PollListSidebar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  anonymityFilter,
  onAnonymityFilterChange,
  polls,
  selectedPollId,
  onSelectPoll,
  loading,
}: PollListSidebarProps) {
  return (
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
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search polls"
              className="pl-9"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.map((tab) => (
                <Button
                  key={tab}
                  variant={statusFilter === tab ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onStatusFilterChange(tab)}
                >
                  {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Anonymity</Label>
            <div className="flex flex-wrap gap-2">
              {ANONYMITY_TABS.map((tab) => (
                <Button
                  key={tab}
                  variant={anonymityFilter === tab ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onAnonymityFilterChange(tab)}
                >
                  {tab === 'ALL' ? 'All' : tab === 'ANONYMOUS' ? 'Anonymous' : 'Named'}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {loading ? (
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
              onClick={() => onSelectPoll(poll.id)}
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
  );
}
