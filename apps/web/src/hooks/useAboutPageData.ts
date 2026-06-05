import { useMemo } from 'react';
import { useSettings } from '@/context/SettingsContext';
import { usePublicStats } from '@/hooks/usePublicStats';
import {
  DEFAULT_ABOUT_CONTENT,
  LAUNCH_DATE,
  TEAM_NAMES,
  monthsSinceLaunch,
  type AboutPageContent,
} from '@/lib/aboutContent';

export interface AboutPageStats {
  members: number;
  events: number;
  achievements: number;
  teamMembers: number;
  monthsSinceInception: number;
}

export interface AboutPageData {
  stats: AboutPageStats;
  content: AboutPageContent;
  isLoading: boolean;
}

const FALLBACK_STATS: Omit<AboutPageStats, 'monthsSinceInception'> = {
  members: 0,
  events: 0,
  achievements: 0,
  teamMembers: 0,
};

/**
 * Data source for the public /about page.
 * - Stats come from /api/stats/public (live DB counts, never hardcoded).
 * - Editorial copy is code-managed in apps/web/src/lib/aboutContent.ts.
 * - Launch date for "months since inception" comes from Settings.siteLaunchDate
 *   (admin-editable). LAUNCH_DATE constant is a build-time fallback.
 * - Per-team head counts come from `/api/stats/public` `teamCounts` map
 *   (keyed by TeamMember.team) and are merged into content.teams.items[i].count.
 */
export function useAboutPageData(): AboutPageData {
  const { settings } = useSettings();

  // Shared public-stats query — reused (not refetched) if any other surface
  // already loaded it this session. See usePublicStats for the dedup rationale.
  const statsQuery = usePublicStats();

  const raw = statsQuery.data;
  const teamCounts = raw?.teamCounts ?? {};

  // Resolve launch date: settings (admin) → constant (build-time fallback).
  const launchDate = settings?.siteLaunchDate ? new Date(settings.siteLaunchDate) : LAUNCH_DATE;

  const stats: AboutPageStats = {
    members: raw?.members ?? FALLBACK_STATS.members,
    events: raw?.events ?? FALLBACK_STATS.events,
    achievements: raw?.achievements ?? FALLBACK_STATS.achievements,
    teamMembers: raw?.teamMembers ?? FALLBACK_STATS.teamMembers,
    monthsSinceInception: monthsSinceLaunch(launchDate),
  };

  // Merge live per-team counts into the canonical team list. Team names are
  // hardcoded in TEAM_NAMES (apps/web/src/lib/aboutContent.ts) — the lookup
  // does a case-insensitive trim match so a stray "core" vs "Core" in the DB
  // still resolves. A team with no matching DB rows shows 0 (truthful — we
  // queried, found none) rather than "—" (unknown).
  const content = useMemo<AboutPageContent>(() => {
    const lookup: Record<string, number> = {};
    for (const [name, n] of Object.entries(teamCounts)) {
      lookup[name.trim().toLowerCase()] = n;
    }
    const haveCounts = Object.keys(lookup).length > 0;
    return {
      ...DEFAULT_ABOUT_CONTENT,
      teams: {
        ...DEFAULT_ABOUT_CONTENT.teams,
        items: DEFAULT_ABOUT_CONTENT.teams.items.map((t) => {
          // Defensive: t.name is restricted to TEAM_NAMES at compile time, but
          // guard at runtime too in case content.ts ever drifts.
          const isCanonical = (TEAM_NAMES as readonly string[]).includes(t.name);
          const live = lookup[t.name.trim().toLowerCase()];
          if (typeof live === 'number') return { ...t, count: live };
          if (haveCounts && isCanonical) return { ...t, count: 0 };
          return t;
        }),
      },
    };
  }, [teamCounts]);

  return {
    stats,
    content,
    isLoading: statsQuery.isLoading,
  };
}
