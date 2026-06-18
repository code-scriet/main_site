// Dashboard v2 — Coding hub with five tabs: Practice / QOTD / Competitions / Leaderboard / Playground.
// All "solve" CTAs redirect to the playground (no in-app Monaco).
// Design source: code-scriet-innerdashboard/project/js/screen-coding.jsx.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Search, ExternalLink, Trophy, ArrowUpRight, Calendar, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { api, type Problem } from '@/lib/api';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { CountdownPill, DSCard, Difficulty, EmptyState, MonoChip, Pill, SegmentedTabs, UnderlineTabs } from '@/components/dash';
import { Input } from '@/components/ui/input';
import QOTDLeaderboardSurface from '@/components/dashboard/QOTDLeaderboardSurface';
import { ProblemSheets } from '@/components/dashboard/ProblemSheets';
import { cn } from '@/lib/utils';

type TabId = 'practice' | 'qotd' | 'competitions' | 'leaderboard' | 'playground';

export default function DashboardCoding() {
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const initialTab = (params.get('tab') as TabId) || 'practice';
  const [tab, setTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const t = params.get('tab') as TabId | null;
    if (t && t !== tab) {
      setTab(t);
    } else if (!t) {
      // First load with no ?tab=: write the default into the URL so the sidebar
      // sub-item highlights correctly and Cmd+K deep-links round-trip.
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const changeTab = (v: TabId) => {
    setTab(v);
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  const items = useMemo(() => {
    const out: Array<{ value: TabId; label: string }> = [
      { value: 'practice', label: 'Practice' },
      { value: 'qotd', label: 'QOTD' },
      { value: 'competitions', label: 'Competitions' },
    ];
    if (settings?.showLeaderboard !== false) out.push({ value: 'leaderboard', label: 'Leaderboard' });
    out.push({ value: 'playground', label: 'Playground' });
    return out;
  }, [settings?.showLeaderboard]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Coding</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Practice, compete, climb.</h1>
        </div>
        <a
          href={getPlaygroundLaunchUrl('/')}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-[var(--bg-raised)] border border-[var(--border-default)] text-[var(--ds-text-1)] hover:border-[var(--border-strong)] text-[12.5px] font-medium transition-colors"
        >
          Open playground
          <ExternalLink size={12} />
        </a>
      </div>

      <UnderlineTabs items={items} value={tab} onChange={changeTab} />

      {tab === 'practice' && <PracticeTab />}
      {tab === 'qotd' && <QOTDTab />}
      {tab === 'competitions' && <CompetitionsTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'playground' && <PlaygroundTab />}
    </div>
  );
}

// ─── Practice tab
function PracticeTab() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const canAuthorSheets = ['CORE_MEMBER', 'ADMIN', 'PRESIDENT'].includes(user?.role ?? '');
  const [diff, setDiff] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [search, setSearch] = useState('');
  const enabled = settings?.problemsEnabled !== false;
  const problemsQ = useQuery({
    queryKey: ['problems', 'practice'],
    queryFn: () => api.getProblems({ published: true, limit: 100 }),
    enabled,
  });

  if (!enabled) {
    return (
      <DSCard padded>
        <EmptyState
          icon={<Trophy size={18} />}
          title="Problems are off right now"
          body="Practice and QOTD are turned off by admins. Check back later."
        />
      </DSCard>
    );
  }

  const raw = problemsQ.data;
  const all: Problem[] = Array.isArray(raw)
    ? raw
    : ((raw as { problems?: Problem[] } | undefined)?.problems ?? []);
  const filtered = all
    .filter((p) => diff === 'ALL' || p.difficulty === diff)
    .filter((p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()) || (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="flex flex-col gap-4">
      {/* S-09: curated topic-ladder sheets (members see published; CORE_MEMBER+ author) */}
      <ProblemSheets problems={all} canAuthor={canAuthorSheets} />

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search problems or tags…"
          className="max-w-[280px] h-8 text-[13px]"
        />
        <SegmentedTabs
          items={[
            { value: 'ALL', label: 'All' },
            { value: 'EASY', label: 'Easy' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'HARD', label: 'Hard' },
          ]}
          value={diff}
          onChange={(v) => setDiff(v as 'ALL' | 'EASY' | 'MEDIUM' | 'HARD')}
        />
        <div className="flex-1" />
        <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
          {filtered.length} / {all.length}
        </span>
      </div>

      {problemsQ.isLoading ? (
        <DSCard padded={false}>
          <div className="p-6 animate-pulse space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-[var(--surface-soft)] rounded" />
            ))}
          </div>
        </DSCard>
      ) : filtered.length === 0 ? (
        <DSCard padded>
          <EmptyState icon={<Search size={18} />} title="No matches" body="Try a different filter or search term." />
        </DSCard>
      ) : (
        <DSCard padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold">
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5 w-[100px]">Difficulty</th>
                  <th className="px-4 py-2.5">Tags</th>
                  <th className="px-4 py-2.5 w-[80px]" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]">
                    <td className="px-4 py-3 font-medium">{p.title}</td>
                    <td className="px-4 py-3"><Difficulty level={p.difficulty} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(p.tags ?? []).slice(0, 3).map((t) => (
                          <MonoChip key={t}>{t}</MonoChip>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={getPlaygroundLaunchUrl(`/?problem=${encodeURIComponent(p.slug || p.id)}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
                      >
                        Solve <ArrowUpRight size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DSCard>
      )}
    </div>
  );
}

// ─── QOTD tab
// QOTD tab — design source: screen-coding.jsx QotdTab (lines 125-241).
// Layout: lg:grid-cols-12, left col-span-8 (Today + history table), right col-span-4
// (Streak + 30-day calendar grid). The calendar uses statsQ.last30Days.
function QOTDTab() {
  const { token } = useAuth();
  const todayQ = useQuery({
    queryKey: ['qotd-today'],
    queryFn: () => api.getTodayQOTD(),
  });
  const historyQ = useQuery({
    queryKey: ['qotd-history', token],
    queryFn: () => api.getQOTDHistory(30, 0, { token: token ?? undefined }),
  });
  const statsQ = useQuery({
    queryKey: ['qotd-stats'],
    queryFn: () => api.getQOTDStats(token!),
    enabled: Boolean(token),
  });

  const today = todayQ.data;
  const todayDateLabel = today?.date
    ? new Date(today.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null;
  const todayTags = today?.problem?.tags ?? [];

  const history = historyQ.data ?? [];
  const solvedCount = history.filter((q) => q.hasSubmitted).length;
  const calendar = statsQ.data?.last30Days ?? [];

  return (
    <div className="grid lg:grid-cols-12 gap-4">
      {/* LEFT — Today + history (col-span-8) */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Today card — design line 138-157 */}
        <DSCard>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="size-[6px] rounded-full bg-[var(--accent)] live-dot" />
            <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--accent)] whitespace-nowrap">
              Today{todayDateLabel ? ` · ${todayDateLabel}` : ''}
            </span>
            <Pill tone="warning" size="xs" className="ml-auto">
              <Clock className="h-3 w-3" /> 11:59 PM IST
            </Pill>
          </div>

          {today ? (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Difficulty level={String(today.difficulty || 'EASY').toUpperCase()} />
                {todayTags.slice(0, 4).map((t) => (
                  <MonoChip key={t}>{t}</MonoChip>
                ))}
              </div>
              <h3 className="text-[22px] font-semibold tracking-tight mt-2 leading-tight">{today.question}</h3>
              <p className="text-[13px] text-[var(--ds-text-3)] mt-2 max-w-prose leading-[1.6]">
                Submit your solution in the playground. Your verdict and leaderboard rank update
                here within a minute of an Accepted run.
              </p>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <a
                  href={getPlaygroundLaunchUrl(`/?qotd=today`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[var(--accent)] text-[var(--accent-fg)] text-[13px] font-medium hover:bg-[var(--accent-hover)]"
                >
                  Solve
                  <ArrowUpRight size={13} />
                </a>
                {today.problemLink && (
                  <a
                    href={today.problemLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-raised)] text-[13px] font-medium text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)]"
                  >
                    View constraints
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Calendar size={18} />}
              title="No QOTD published today yet"
              body="Catch up on missed days from the history below — the calendar on the right shows your last 30 days."
            />
          )}
        </DSCard>

        {/* History — design line 159-197 */}
        <DSCard padded={false}>
          <div className="flex items-center justify-between px-4 py-3 gap-2">
            <div className="text-[13.5px] font-semibold">Your history</div>
            {history.length > 0 && (
              <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums whitespace-nowrap">
                {solvedCount}/{history.length} solved
              </span>
            )}
          </div>
          {historyQ.isLoading ? (
            <div className="p-6 animate-pulse text-[12px] text-[var(--ds-text-3)] text-center border-t border-[var(--border-subtle)]">Loading…</div>
          ) : history.length === 0 ? (
            <div className="border-t border-[var(--border-subtle)]">
              <EmptyState icon={<Calendar size={18} />} title="No QOTDs yet" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--ds-text-3)] font-semibold border-t border-[var(--border-subtle)]">
                    <th className="px-4 py-2 w-[100px]">Date</th>
                    <th className="px-4 py-2">Problem</th>
                    <th className="px-4 py-2 w-[100px]">Difficulty</th>
                    <th className="px-4 py-2 w-[100px]">Status</th>
                    <th className="px-4 py-2 w-[80px] text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 12).map((q) => {
                    const isHeld = Boolean(q.heldBy);
                    const isToday = today?.id === q.id;
                    return (
                      <tr
                        key={q.id}
                        className="border-t border-[var(--border-subtle)] hover:bg-[var(--surface-soft)] transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono tabular-nums text-[var(--ds-text-3)]">
                          {new Date(q.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-4 py-2.5 font-medium truncate max-w-[320px]">{q.question}</td>
                        <td className="px-4 py-2.5">
                          <Difficulty level={String(q.difficulty || 'EASY').toUpperCase()} />
                        </td>
                        <td className="px-4 py-2.5">
                          {isHeld ? (
                            <Pill tone="warning" size="xs">Held</Pill>
                          ) : q.hasSubmitted ? (
                            <Pill tone="success" size="xs">Solved</Pill>
                          ) : isToday ? (
                            <Pill tone="info" size="xs" dot>Live</Pill>
                          ) : (
                            <Pill tone="neutral" size="xs">Missed</Pill>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!isHeld && (
                            <a
                              href={getPlaygroundLaunchUrl(`/?qotd=${q.date.slice(0, 10)}`)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                            >
                              Solve <ArrowUpRight size={12} />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DSCard>
      </div>

      {/* RIGHT — Streak + 30-day calendar (col-span-4) */}
      <div className="lg:col-span-4 flex flex-col gap-4">
        {/* Streak card — design line 202-211 */}
        <DSCard>
          <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)] mb-3">Streak</div>
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-semibold tabular-nums leading-none text-[var(--ds-text-1)]">
              {statsQ.data?.currentStreak ?? 0}
            </span>
            <span className="text-[12px] text-[var(--ds-text-3)]">
              days · longest <span className="font-mono tabular-nums text-[var(--ds-text-2)]">{statsQ.data?.longestStreak ?? 0}</span>
            </span>
          </div>
          <p className="mt-3 text-[12px] text-[var(--ds-text-3)] leading-snug">
            {statsQ.data?.todaySolved
              ? "Today's QOTD is in the bag. See you tomorrow."
              : today
                ? "Solve today's QOTD before midnight to keep your streak alive."
                : 'Solve the next published QOTD to start a new streak.'}
          </p>
          {statsQ.data?.totalSolved != null && (
            <p className="mt-1.5 text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
              Lifetime · {statsQ.data.totalSolved} solved
            </p>
          )}
        </DSCard>

        {/* Last 30 days calendar — design line 213-237 */}
        <DSCard>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Last 30 days</div>
            <div className="flex items-center gap-2 text-[10.5px] text-[var(--ds-text-3)]">
              <span className="inline-flex items-center gap-1">
                <span className="size-[8px] rounded-[2px] bg-[var(--accent)]" /> solved
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-[8px] rounded-[2px] bg-[var(--warning-bg)] border border-[var(--warning-border)]" /> live
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-[8px] rounded-[2px] bg-[var(--surface-soft)] border border-[var(--border-subtle)]" /> missed
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendar.length === 0 ? (
              Array.from({ length: 30 }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[5px] bg-[var(--surface-soft)] border border-[var(--border-subtle)] animate-pulse"
                />
              ))
            ) : (
              calendar.map((d) => {
                const isToday = d.date === (today?.date?.slice(0, 10) ?? '');
                const state: 'live' | 'solved' | 'missed' = isToday && !d.solved
                  ? 'live'
                  : d.solved
                    ? 'solved'
                    : 'missed';
                return (
                  <div
                    key={d.date}
                    title={`${new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${state}`}
                    className={cn(
                      'aspect-square rounded-[5px] border',
                      state === 'solved' && 'bg-[var(--accent)] border-transparent opacity-90',
                      state === 'live' && 'bg-[var(--warning-bg)] border-[var(--warning-border)] live-dot',
                      state === 'missed' && 'bg-[var(--surface-soft)] border-[var(--border-subtle)]',
                    )}
                  />
                );
              })
            )}
          </div>
        </DSCard>
      </div>
    </div>
  );
}

// ─── Competitions tab
function CompetitionsTab() {
  const { token } = useAuth();
  const regsQ = useQuery({
    queryKey: ['my-registrations'],
    queryFn: () => api.getMyRegistrations(token!),
    enabled: Boolean(token),
  });

  const eligibleEvents = (regsQ.data ?? []).filter((r) => r.event && r.event.status !== 'PAST');

  if (regsQ.isLoading) {
    return (
      <DSCard padded={false}>
        <div className="p-6 animate-pulse text-[12px] text-[var(--ds-text-3)] text-center">Loading…</div>
      </DSCard>
    );
  }
  if (eligibleEvents.length === 0) {
    return (
      <DSCard padded>
        <EmptyState
          icon={<Trophy size={18} />}
          title="No competitions in your queue"
          body="Register for an event that runs a competition round and it'll show up here."
        />
      </DSCard>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {eligibleEvents.map((r) => (
        <CompetitionEventCard key={r.id} eventId={r.event!.id!} eventTitle={r.event!.title!} eventStatus={r.event!.status ?? 'UPCOMING'} />
      ))}
    </div>
  );
}

function CompetitionEventCard({ eventId, eventTitle, eventStatus }: { eventId: string; eventTitle: string; eventStatus: string }) {
  const { token } = useAuth();
  const roundsQ = useQuery({
    queryKey: ['competition-rounds', eventId],
    queryFn: () => api.getCompetitionRounds(eventId, token!),
    enabled: Boolean(token),
  });
  const rounds = (roundsQ.data as { rounds?: Array<{ id: string; title: string; status: string; duration?: number }> } | undefined)?.rounds ?? [];

  return (
    <DSCard padded className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Pill
          tone={eventStatus === 'ONGOING' ? 'success' : eventStatus === 'UPCOMING' ? 'info' : 'neutral'}
          size="xs"
          dot={eventStatus === 'ONGOING'}
        >
          {eventStatus}
        </Pill>
        <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums">
          {rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}
        </span>
      </div>
      <div className="text-[14px] font-semibold leading-tight">{eventTitle}</div>
      {rounds.length === 0 ? (
        <div className="text-[12px] text-[var(--ds-text-3)]">No rounds yet.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {rounds.slice(0, 3).map((r) => (
            <a
              key={r.id}
              href={r.status === 'ACTIVE' ? getPlaygroundLaunchUrl(`/?contest=${r.id}`) : `/competition/${r.id}/results`}
              target={r.status === 'ACTIVE' ? '_blank' : undefined}
              rel="noreferrer"
              className="flex items-center gap-2 py-1.5 -mx-1 px-1 rounded-[6px] hover:bg-[var(--surface-soft)] transition-colors"
            >
              <span className="text-[12.5px] font-medium flex-1 truncate">{r.title}</span>
              <Pill
                tone={r.status === 'ACTIVE' ? 'success' : r.status === 'FINISHED' ? 'neutral' : 'warning'}
                size="xs"
                dot={r.status === 'ACTIVE'}
              >
                {r.status}
              </Pill>
              {r.status === 'ACTIVE' && r.duration && (
                <CountdownPill seconds={r.duration} tone="accent" />
              )}
            </a>
          ))}
        </div>
      )}
    </DSCard>
  );
}

// ─── Leaderboard tab
// Renders the shared QOTDLeaderboardSurface so this view stays identical to
// /dashboard/leaderboard. The host already shows a top-level UnderlineTab nav,
// so we skip the page-level title block and the around-me callout for a tighter
// footprint inside the coding hub.
function LeaderboardTab() {
  return <QOTDLeaderboardSurface defaultTab="today" showAroundMeCta={false} />;
}

// ─── Playground tab
function PlaygroundTab() {
  const url = getPlaygroundLaunchUrl('/');
  return (
    <div className="flex flex-col gap-4">
      <DSCard padded>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold">In-browser code playground</h3>
            <p className="text-[12.5px] text-[var(--ds-text-3)] mt-1 max-w-prose">
              Python / JavaScript / C++ / Java with snippet saving and a daily quota. Solve QOTDs and competition problems inside.
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[8px] bg-[var(--accent)] text-[var(--accent-fg)] text-[13.5px] font-medium hover:bg-[var(--accent-hover)]"
          >
            Open in new tab
            <ExternalLink size={13} />
          </a>
        </div>
      </DSCard>
      <DSCard padded={false} className="overflow-hidden">
        <iframe
          src={url}
          title="Code playground"
          className="w-full h-[70vh] block"
          style={{ border: 0 }}
        />
      </DSCard>
    </div>
  );
}
