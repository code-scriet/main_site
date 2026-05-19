import { Link } from 'react-router-dom';
import { BarChart3, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import type { Poll } from '@/lib/api';
import { formatDateTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

interface PollCardProps {
  poll: Poll;
  compact?: boolean;
  className?: string;
  actionLabel?: string;
}

export function PollCard({
  poll,
  compact = false,
  className,
  actionLabel = 'Open poll',
}: PollCardProps) {
  const visibleOptions = compact ? poll.options.slice(0, 3) : poll.options.slice(0, 5);

  return (
    <Link
      to={`/polls/${poll.slug}`}
      aria-label={`${actionLabel}: ${poll.question}`}
      className={cn(
        'group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2',
        className,
      )}
    >
      <Card className="h-full border-[var(--border-subtle)] shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardHeader className="space-y-3 border-b border-[var(--border-subtle)] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={poll.isClosed ? 'secondary' : 'success'}>
              {poll.isClosed ? 'Closed' : 'Open'}
            </Badge>
            <Badge variant="outline">
              {poll.allowMultipleChoices ? 'Multiple choice' : 'Single choice'}
            </Badge>
            {poll.currentUserVote && (
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Your vote is in
              </Badge>
            )}
            {poll.isAnonymous && (
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                Anonymous votes
              </Badge>
            )}
          </div>

          <div className="space-y-1.5">
            <CardTitle className="text-xl leading-snug text-gray-950 transition-colors group-hover:text-[var(--ds-text-1)] sm:text-2xl">
              {poll.question}
            </CardTitle>
            {poll.description && (
              <CardDescription className="line-clamp-3 text-sm leading-6 text-[var(--ds-text-2)]">
                {poll.description}
              </CardDescription>
            )}
          </div>

        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-3 text-sm text-[var(--ds-text-2)] sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
              <span>Thoughts welcome</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <span>{poll.deadline ? formatDateTime(poll.deadline) : 'No deadline'}</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--ds-text-1)]">
              <BarChart3 className="h-4 w-4 text-amber-600" />
              Public results
            </div>
            <div className="space-y-2.5">
              {visibleOptions.map((option) => {
                const isSelected = poll.currentUserVote?.optionIds.includes(option.id) ?? false;
                return (
                  <div key={option.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className={cn('truncate text-[var(--ds-text-2)]', isSelected && 'font-semibold text-[var(--ds-text-1)]')}>
                        {option.text}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-[var(--ds-text-3)]">
                        {option.percentage}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-300',
                          isSelected ? 'bg-amber-500' : 'bg-amber-300',
                        )}
                        style={{ width: `${Math.max(option.percentage, option.voteCount > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {poll.options.length > visibleOptions.length && (
              <p className="text-xs text-[var(--ds-text-3)]">
                +{poll.options.length - visibleOptions.length} more option{poll.options.length - visibleOptions.length === 1 ? '' : 's'}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--ds-text-3)]">
              {poll.currentUserVote
                ? `Updated ${formatDateTime(poll.currentUserVote.updatedAt)}`
                : poll.allowVoteChange
                  ? 'Votes can be changed while the poll is open.'
                  : 'One submission per account.'}
            </div>
            <span
              className={cn(
                buttonVariants({ variant: compact ? 'outline' : 'default', size: 'sm' }),
                'pointer-events-none shrink-0',
              )}
            >
              {actionLabel}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
