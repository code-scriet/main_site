// Shared QOTD leaderboard surface — rendered both on /dashboard/leaderboard
// and inside /dashboard/coding → Leaderboard tab. Both surfaces look and
// behave identically (3 tabs: Today / 7 days / All-time, podium with medal
// badges, table list with hover + search).
//
// Design source: code-scriet-innerdashboard/project/js/screen-coding.jsx
// LeaderboardTab (lines 287-371).
//
// The host page can:
//   - Render a title block above this (DashboardLeaderboard does).
//   - Pass `defaultTab` to start on a specific tab.
//   - Pass `showAroundMeCta={false}` to hide the "X points to overtake…" callout
//     when the host wants a tighter footprint (the coding hub does this).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Search, Trophy } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Avatar, DSCard, EmptyState, Pill, SegmentedTabs } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { formatDurationMs, formatIstTime } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

export type LeaderboardTab = 'today' | 'weekly' | 'total';

interface WeeklyEntry {
  userId: string;
  name: string;
  avatar?: string | null;
  rank: number;
  /** Total points across the last 7 published QOTDs (each day's stored score, partials included). */
  score: number;
  /** In-window days with a non-pending submission (attempted-or-better, matching the daily board), 1..7. */
  daysSolved: number;
  you: boolean;
  // Inlined for TS — these are never set on weekly entries; declaring them as
  // optional/undefined keeps the union with ProblemLeaderboardEntry compatible
  // so we can do per-tab narrowing without a wall of casts.
  activeMs?: number | null;
  submittedAt?: string;
  solveDays?: number;
  firstSolveAt?: string;
}

// Medal colours pulled verbatim from screen-coding.jsx:315-317.
const MEDAL_STYLE: Record<1 | 2 | 3, string> = {
  1: 'bg-[#FFB800] text-[#3a2700]',
  2: 'bg-[#C0C0C0] text-[#1f1f1f]',
  3: 'bg-[#CD7F32] text-white',
};

interface Props {
  /** Tab to start on. Defaults to 'today'. */
  defaultTab?: LeaderboardTab;
  /** Whether to render the all-time "X points to overtake…" callout. */
  showAroundMeCta?: boolean;
  /** Optional consumer-controlled sub-header — usually the host page renders
      its own title block above this surface, but a description string here
      gives the leaderboard a contextual one-liner above the tab row. */
  description?: (tab: LeaderboardTab, publishedAt: string | null, weeklyDayCount: number) => string;
}

export default function QOTDLeaderboardSurface({
  defaultTab = 'today',
  showAroundMeCta = true,
  description,
}: Props) {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<LeaderboardTab>(defaultTab);
  const [query, setQuery] = useState('');

  const todayQOTDQ = useQuery({
    queryKey: ['qotd', 'today'],
    queryFn: () => api.getTodayQOTD(),
    staleTime: 60_000,
  });
  const dailyQ = useQuery({
    queryKey: ['qotd', 'leaderboard', 'daily', todayQOTDQ.data?.id],
    queryFn: () => api.getQOTDDailyLeaderboard(todayQOTDQ.data!.id),
    enabled: Boolean(todayQOTDQ.data?.id),
    staleTime: 60_000,
  });
  const totalQ = useQuery({
    queryKey: ['qotd-leaderboard-total'],
    queryFn: () => api.getQOTDTotalLeaderboard(),
    staleTime: 60_000,
  });
  const aroundMeQ = useQuery({
    queryKey: ['leaderboard-around-me', 5],
    queryFn: () => api.getQOTDLeaderboardAroundMe(token!, 5),
    enabled: Boolean(token) && tab === 'total' && showAroundMeCta,
  });

  // ── Weekly board — one server-side query. Replaces the old client-side roll-up of
  // 7 daily boards, which summed only each day's top-10 (dropping anyone outside it).
  const weeklyQ = useQuery({
    queryKey: ['qotd-leaderboard-weekly'],
    queryFn: () => api.getQOTDWeeklyLeaderboard(),
    enabled: tab === 'weekly',
    staleTime: 60_000,
  });
  const weeklyDailyLoading = tab === 'weekly' && weeklyQ.isLoading;

  const weeklyEntries = useMemo<WeeklyEntry[]>(() => {
    if (tab !== 'weekly') return [];
    return (weeklyQ.data?.entries ?? []).map((e) => ({
      userId: e.userId,
      name: e.name,
      avatar: e.avatar ?? null,
      score: e.score,
      daysSolved: e.daysSolved,
      rank: e.rank,
      you: e.userId === user?.id,
    }));
  }, [tab, weeklyQ.data, user?.id]);

  const entries = useMemo(() => {
    if (tab === 'weekly') return weeklyEntries;
    const raw = tab === 'today' ? dailyQ.data?.entries ?? [] : totalQ.data?.entries ?? [];
    return raw.map((e, i) => ({ ...e, rank: e.rank ?? i + 1, you: e.userId === user?.id }));
  }, [tab, dailyQ.data, totalQ.data, weeklyEntries, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, query]);

  // Podium pulls from the unfiltered list so it doesn't disappear when searching.
  const top3 = entries.slice(0, 3);
  const rest = filtered.length > 0 && filtered === entries
    ? entries.slice(3)
    : filtered.filter((e) => !top3.some((t) => t.userId === e.userId));

  const loading = tab === 'today'
    ? todayQOTDQ.isLoading || dailyQ.isLoading
    : tab === 'weekly'
      ? weeklyDailyLoading
      : totalQ.isLoading;
  // UX#8: a failed fetch must show an explicit error + retry, not be
  // mistaken for an empty leaderboard.
  const isError = tab === 'today'
    ? todayQOTDQ.isError || dailyQ.isError
    : tab === 'weekly'
      ? weeklyQ.isError
      : totalQ.isError;
  const refetchAll = () => {
    if (tab === 'today') { void todayQOTDQ.refetch(); void dailyQ.refetch(); }
    else if (tab === 'weekly') { void weeklyQ.refetch(); }
    else { void totalQ.refetch(); }
  };
  const dailyPublishedAt = todayQOTDQ.data?.publishedAt ?? dailyQ.data?.publishedAt ?? null;
  const weeklyDayCount = weeklyQ.data?.dayCount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {description && (
        <p className="text-[13px] text-[var(--ds-text-3)]">
          {description(tab, dailyPublishedAt, weeklyDayCount)}
        </p>
      )}

      {/* Header row — three tabs match the design's All-time / 7 days / Today triple. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SegmentedTabs
          items={[
            { value: 'today', label: 'Today' },
            { value: 'weekly', label: '7 days' },
            { value: 'total', label: 'All-time' },
          ]}
          value={tab}
          onChange={(v) => setTab(v as LeaderboardTab)}
        />
        <div className="relative w-full sm:w-[260px]">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a person…"
            className="pl-8 h-8 text-[13px]"
          />
        </div>
      </div>

      {loading ? (
        <DSCard padded>
          <div className="animate-pulse h-32" />
        </DSCard>
      ) : isError ? (
        <DSCard padded>
          <EmptyState
            icon={<Trophy size={18} />}
            title="Couldn't load the leaderboard"
            body="Something went wrong fetching the rankings. Check your connection and try again."
            action={
              <button
                type="button"
                onClick={refetchAll}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[6px] bg-[var(--accent)] text-white hover:opacity-90"
              >
                Retry
              </button>
            }
          />
        </DSCard>
      ) : tab === 'today' && !todayQOTDQ.data ? (
        <DSCard padded>
          <EmptyState
            icon={<Trophy size={18} />}
            title="No QOTD published today yet"
            body="The leaderboard fills once today's QOTD is published. Check back later."
          />
        </DSCard>
      ) : tab === 'weekly' && weeklyDayCount === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Trophy size={18} />}
            title="No QOTDs in the last 7 days"
            body="Once an admin publishes a QOTD, this view will start showing this-week points."
          />
        </DSCard>
      ) : entries.length === 0 ? (
        <DSCard padded>
          <EmptyState
            icon={<Trophy size={18} />}
            title={
              tab === 'today'
                ? 'No solvers yet'
                : tab === 'weekly'
                  ? 'No 7-day points yet'
                  : 'No ranks yet'
            }
            body={tab === 'today'
              ? "Be the first to solve today's QOTD!"
              : tab === 'weekly'
                ? 'Solve any QOTD from the last 7 days to climb this board.'
                : 'The leaderboard fills once members start solving QOTDs.'}
          />
        </DSCard>
      ) : (
        <>
          {/* Podium — design line 303-329. Visual order: [silver, gold, bronze]
              so #1 sits in the middle. Each card is flat; the medal lives as a
              circular badge overlay at the bottom of the avatar. */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((idx) => {
                const u = top3[idx];
                const place = (idx + 1) as 1 | 2 | 3;
                const isFirst = place === 1;
                const avatarSize = isFirst ? 64 : 52;
                const score = u.score ?? 0;
                return (
                  <DSCard
                    key={u.userId}
                    className={cn(
                      'flex flex-col items-center text-center',
                      isFirst ? 'pt-3 pb-4' : 'pt-3 pb-3',
                      u.you && 'ring-1 ring-[var(--accent)]',
                    )}
                  >
                    <div className="relative mb-2">
                      <Avatar name={u.name} src={u.avatar} size={avatarSize} />
                      <span
                        className={cn(
                          'absolute -bottom-1 left-1/2 -translate-x-1/2 size-6 rounded-full flex items-center justify-center text-[12px] font-bold border-2 border-[var(--bg-raised)] font-mono tabular-nums',
                          MEDAL_STYLE[place],
                        )}
                      >
                        {place}
                      </span>
                    </div>
                    <div className={cn('font-semibold mt-2 truncate max-w-full px-2', isFirst ? 'text-[15px]' : 'text-[13px]')}>
                      {u.name}
                    </div>
                    <div className="text-[10.5px] text-[var(--ds-text-3)] mt-0.5 font-mono tabular-nums">
                      {tab === 'today' && typeof u.activeMs === 'number'
                        ? formatDurationMs(u.activeMs)
                        : tab === 'today' && u.submittedAt
                          ? `@ ${formatIstTime(u.submittedAt)}`
                          : tab === 'weekly' && 'daysSolved' in u
                            ? `${(u as WeeklyEntry).daysSolved}/${weeklyDayCount} day${(u as WeeklyEntry).daysSolved === 1 ? '' : 's'}`
                            : tab === 'total' && typeof u.solveDays === 'number'
                              ? `${u.solveDays} day${u.solveDays === 1 ? '' : 's'} solved`
                              : 'CCSU'}
                    </div>
                    <div className={cn('font-mono tabular-nums font-semibold mt-1', isFirst ? 'text-[24px]' : 'text-[18px]')}>
                      {score.toLocaleString()}
                    </div>
                    {u.you && (
                      <Pill tone="accent" size="xs" className="mt-1">You</Pill>
                    )}
                  </DSCard>
                );
              })}
            </div>
          )}

          {/* List — design line 331-368 table layout */}
          <DSCard padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-2.5 w-[60px]">Rank</th>
                    <th className="px-4 py-2.5">Member</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 w-[120px]">
                      {tab === 'today' ? 'Solve time' : 'Days solved'}
                    </th>
                    <th className="hidden md:table-cell px-4 py-2.5 w-[110px]">
                      {tab === 'today' ? 'Submitted' : tab === 'weekly' ? 'This week' : 'First solve'}
                    </th>
                    <th className="px-4 py-2.5 w-[100px] text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(top3.length >= 3 ? rest : filtered).slice(0, 50).map((e) => (
                    <tr
                      key={e.userId}
                      className={cn(
                        'border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] transition-colors',
                        e.you && 'bg-[var(--accent-subtle)]/40',
                      )}
                    >
                      <td className="px-4 py-2.5 font-mono tabular-nums text-[var(--ds-text-3)]">
                        #{e.rank}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={e.name} src={e.avatar} size={24} />
                          <span className={cn('font-medium truncate', e.you && 'text-[var(--accent)] font-semibold')}>
                            {e.name}
                          </span>
                          {e.you && <Pill tone="accent" size="xs">You</Pill>}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-[var(--ds-text-3)] font-mono tabular-nums">
                        {tab === 'today' && typeof e.activeMs === 'number'
                          ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} /> {formatDurationMs(e.activeMs)}
                            </span>
                          )
                          : tab === 'weekly' && 'daysSolved' in e
                            ? <>{(e as WeeklyEntry).daysSolved} day{(e as WeeklyEntry).daysSolved === 1 ? '' : 's'}</>
                            : tab === 'total' && typeof e.solveDays === 'number'
                              ? <>{e.solveDays} day{e.solveDays === 1 ? '' : 's'}</>
                              : '—'}
                      </td>
                      <td className="hidden md:table-cell px-4 py-2.5 text-[var(--ds-text-3)] font-mono tabular-nums">
                        {tab === 'today' && e.submittedAt
                          ? `@ ${formatIstTime(e.submittedAt)}`
                          : tab === 'weekly' && 'daysSolved' in e
                            ? `${(e as WeeklyEntry).daysSolved}/${weeklyDayCount}`
                            : tab === 'total' && e.firstSolveAt
                              ? new Date(e.firstSolveAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                              : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums text-right font-semibold">
                        {(e.score ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {(top3.length >= 3 ? rest : filtered).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-[12.5px] text-[var(--ds-text-3)]">
                        No members match "{query}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DSCard>

          {showAroundMeCta && tab === 'total' && token && aroundMeQ.data?.nextUp && aroundMeQ.data.nextUpDelta != null && aroundMeQ.data.nextUpDelta > 0 && (
            <DSCard padded>
              <div className="text-[13px] text-[var(--ds-text-2)]">
                <span className="font-mono tabular-nums text-[var(--ds-text-1)] font-semibold">{aroundMeQ.data.nextUpDelta}</span>{' '}
                points to overtake <span className="font-semibold">{aroundMeQ.data.nextUp.name}</span> at #{aroundMeQ.data.nextUp.rank}.
              </div>
            </DSCard>
          )}
        </>
      )}
    </div>
  );
}
