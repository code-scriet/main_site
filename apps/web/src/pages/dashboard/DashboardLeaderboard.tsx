// Dashboard v2 — public leaderboard page.
// Renders the shared QOTDLeaderboardSurface (used here and in the coding hub)
// under a page-level h1 + tab-aware description.
//
// Design source: code-scriet-innerdashboard/project/js/screen-coding.jsx
// LeaderboardTab (lines 287-371).

import QOTDLeaderboardSurface, { type LeaderboardTab } from '@/components/dashboard/QOTDLeaderboardSurface';
import { formatIstTime } from '@/lib/dateUtils';

export default function DashboardLeaderboard() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[24px] font-semibold tracking-tight">Leaderboard</h1>
      <QOTDLeaderboardSurface
        defaultTab="today"
        description={(tab: LeaderboardTab, publishedAt: string | null, weeklyDayCount: number) => {
          if (tab === 'today') {
            const suffix = publishedAt ? ` Published at ${formatIstTime(publishedAt)} IST.` : '';
            return `Today's QOTD ranking — ordered by score, then time-to-solve.${suffix}`;
          }
          if (tab === 'weekly') {
            return `Points earned across the last ${weeklyDayCount || 7} published QOTDs. Ties broken by days solved.`;
          }
          return 'Ranked by QOTD lifetime points. Updates within a minute of every Accepted submission.';
        }}
      />
    </div>
  );
}
