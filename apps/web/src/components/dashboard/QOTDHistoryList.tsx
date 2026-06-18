// Shared QOTD history list — used by the member "Full history" view (in the
// coding hub QOTD tab) and the admin QOTD manager (in the Problems hub). Owns its
// own pagination (server-side, via getQOTDHistory limit/offset) so both surfaces
// can scroll the FULL archive, not just the recent window. Status + row actions
// are render-props so each surface stays in control of its own affordances.

import { useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowUpRight, Calendar, Search } from 'lucide-react';
import { api, type QOTDHistoryEntry } from '@/lib/api';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { Difficulty, EmptyState, Pill } from '@/components/dash';
import { Input } from '@/components/ui/input';

interface Props {
  /** member = personal solved/missed view; admin = management view (unpublished included). */
  mode: 'member' | 'admin';
  /** Today's QOTD id, to mark the live row. */
  todayId?: string;
  /** Auth token (member solved-status + admin unpublished rows). */
  token?: string;
  /** Show a client-side search box (filters loaded rows by date/title). */
  searchable?: boolean;
  /** Rows per page. */
  pageSize?: number;
  /** Override the status cell (admin passes published/scheduled/proposed/held). */
  renderStatus?: (entry: QOTDHistoryEntry) => ReactNode;
  /** Override the trailing actions cell (admin passes publish/hold/reopen/delete). */
  renderActions?: (entry: QOTDHistoryEntry) => ReactNode;
}

function defaultStatus(entry: QOTDHistoryEntry, todayId?: string): ReactNode {
  if (entry.heldBy) return <Pill tone="warning" size="xs">Held</Pill>;
  if (entry.hasSubmitted) return <Pill tone="success" size="xs">Solved</Pill>;
  if (todayId && entry.id === todayId) return <Pill tone="info" size="xs" dot>Live</Pill>;
  return <Pill tone="neutral" size="xs">Missed</Pill>;
}

function defaultActions(entry: QOTDHistoryEntry): ReactNode {
  if (entry.heldBy) return null;
  return (
    <a
      href={getPlaygroundLaunchUrl(`/?qotd=${entry.date.slice(0, 10)}`)}
      target="_blank"
      rel="noreferrer"
      className="text-[12px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
    >
      {entry.hasSubmitted ? 'Review' : 'Solve'} <ArrowUpRight size={12} />
    </a>
  );
}

export function QOTDHistoryList({
  mode,
  todayId,
  token,
  searchable = false,
  pageSize = 50,
  renderStatus,
  renderActions,
}: Props) {
  const [search, setSearch] = useState('');
  const includeUnpublished = mode === 'admin';

  const query = useInfiniteQuery({
    queryKey: ['qotd-history-full', mode, token ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getQOTDHistory(pageSize, pageParam, { includeUnpublished, token: token ?? undefined }),
    // No total in the unwrapped payload — a short page means we've hit the end.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === pageSize ? allPages.length * pageSize : undefined,
  });

  const entries = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.question.toLowerCase().includes(q) ||
        new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toLowerCase().includes(q),
    );
  }, [entries, search]);

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by date or title…"
            className="pl-8 h-9 text-[13px]"
          />
        </div>
      )}

      {query.isLoading ? (
        <div className="p-6 animate-pulse text-[12px] text-[var(--ds-text-3)] text-center">Loading…</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={<Calendar size={18} />} title="No QOTDs yet" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-[10px] border border-[var(--border-subtle)]">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-2 w-[120px]">Date</th>
                  <th className="px-4 py-2">Problem</th>
                  <th className="px-4 py-2 w-[100px]">Difficulty</th>
                  <th className="px-4 py-2 w-[110px]">Status</th>
                  <th className="px-4 py-2 w-[120px] text-right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <tr key={q.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] transition-colors">
                    <td className="px-4 py-2.5 font-mono tabular-nums text-[var(--ds-text-3)] whitespace-nowrap">
                      {new Date(q.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 font-medium truncate max-w-[320px]">{q.question}</td>
                    <td className="px-4 py-2.5">
                      <Difficulty level={String(q.difficulty || 'EASY').toUpperCase()} />
                    </td>
                    <td className="px-4 py-2.5">{(renderStatus ?? ((e) => defaultStatus(e, todayId)))(q)}</td>
                    <td className="px-4 py-2.5 text-right">{(renderActions ?? defaultActions)(q)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[12.5px] text-[var(--ds-text-3)]">
                      No QOTDs match "{search}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {query.hasNextPage && (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="self-center h-9 px-4 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[13px] font-medium text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] disabled:opacity-60"
            >
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
