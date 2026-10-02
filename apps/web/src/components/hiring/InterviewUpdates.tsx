// "Interview updates" — cohort-targeted announcements visible to pipeline
// candidates. Rendered on the token-mode slot page, and the dashboard overview
// feed becomes cohort-aware through the same helper (see DashboardOverview).
// Never fetches without a session or slot token: with neither, it renders
// nothing (the server would only return ALL-audience posts anyway).

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { DSCard, Pill, Section } from '@/components/dash';
import { api, type Announcement } from '@/lib/api';
import type { SlotAuth } from '@/lib/api';
import { cn } from '@/lib/utils';

const PRIORITY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

interface Props {
  auth: SlotAuth;
}

export function InterviewUpdates({ auth }: Props) {
  const canFetch = Boolean(auth.sessionToken || auth.slotToken);
  const updatesQ = useQuery({
    queryKey: ['interview-updates', auth.slotToken ? `token:${auth.slotToken.slice(0, 12)}` : 'session'],
    queryFn: () => api.getCandidateAnnouncements(auth, 10),
    enabled: canFetch,
    staleTime: 60_000,
  });

  if (!canFetch) return null;
  const items = updatesQ.data ?? [];
  // Only cohort posts belong in this block — ALL-audience news already lives
  // in the regular announcements surfaces.
  const cohort = items.filter((a) => (a as Announcement & { audience?: string }).audience === 'HIRING_COHORT');
  if (updatesQ.isLoading) {
    return (
      <Section eyebrow="Interview" title="Interview updates">
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
          ))}
        </div>
      </Section>
    );
  }
  if (updatesQ.isError || cohort.length === 0) return null;

  return (
    <Section eyebrow="Interview" title="Interview updates">
      <DSCard padded={false} className="divide-y divide-[var(--border-subtle)] overflow-hidden">
        {cohort.map((a) => {
          const priority = a.priority ?? 'LOW';
          return (
            <div key={a.id} className="px-4 py-3.5 flex items-start gap-3">
              <span
                className={cn(
                  'w-[3px] self-stretch rounded-full shrink-0 mt-0.5',
                  priority === 'URGENT' && 'bg-[var(--danger)]',
                  priority === 'HIGH' && 'bg-[var(--warning)]',
                  priority === 'MEDIUM' && 'bg-[var(--info)]',
                  priority === 'LOW' && 'bg-[var(--ds-text-3)] opacity-50',
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Pill tone={PRIORITY_TONE[priority] ?? 'neutral'} size="xs">
                    {priority}
                  </Pill>
                  {a.createdAt && (
                    <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
                      {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="text-[13.5px] font-medium leading-snug flex items-center gap-1.5">
                  <Megaphone size={12} className="text-[var(--ds-text-3)] shrink-0" />
                  {a.title}
                </div>
                {a.body && <p className="text-[12px] text-[var(--ds-text-3)] mt-1 line-clamp-2">{a.body}</p>}
              </div>
            </div>
          );
        })}
      </DSCard>
    </Section>
  );
}
