import { BarChart3, CheckCircle2, MessageSquare, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime } from '@/lib/dateUtils';
import type { AdminPollDetail } from '@/lib/api';
import { InfoRow, StatTile } from './atoms';

export function PollOverviewTab({ poll }: { poll: AdminPollDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatTile label="Votes" value={poll.totalVotes} icon={Users} />
        <StatTile label="Feedback" value={poll.totalFeedback} icon={MessageSquare} />
        <StatTile label="Options" value={poll.options.length} icon={BarChart3} />
        <StatTile label="Type" valueText={poll.options.length === 0 ? 'Question' : 'Normal'} icon={CheckCircle2} />
      </div>

      {poll.options.length === 0 ? (
        <Card className="border-gray-200 shadow-none">
          <CardContent className="py-8 text-sm text-gray-600">
            This is a question-type poll. Participants submit free-text questions in the feedback area, and no option voting is collected.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {poll.options.map((option) => (
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
        <InfoRow label="Created" value={formatDateTime(poll.createdAt)} />
        <InfoRow label="Last updated" value={formatDateTime(poll.updatedAt)} />
        <InfoRow label="Deadline" value={poll.deadline ? formatDateTime(poll.deadline) : 'No deadline'} />
        <InfoRow label="Created by" value={`${poll.creator.name} · ${poll.creator.email}`} />
      </div>
    </div>
  );
}
