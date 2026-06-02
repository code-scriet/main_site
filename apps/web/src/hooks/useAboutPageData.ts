import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import {
  DEFAULT_ABOUT_CONTENT,
  LAUNCH_DATE,
  monthsSinceLaunch,
  type AboutPageContent,
} from '@/lib/aboutContent';

const ABOUT_STATS_KEY = ['about-page-stats'] as const;

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

  const statsQuery = useQuery({
    queryKey: ABOUT_STATS_KEY,
    queryFn: () => api.getPublicStats(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

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

  // Merge live per-team counts into the static team list. Team-name lookup is
  // case-insensitive and trims whitespace so admin-side typos don't silently
  // drop a count. Items without a matching DB row stay at null (renders "—").
  const content = useMemo<AboutPageContent>(() => {
    const lookup: Record<string, number> = {};
    for (const [name, n] of Object.entries(teamCounts)) {
      lookup[name.trim().toLowerCase()] = n;
    }
    return {
      ...DEFAULT_ABOUT_CONTENT,
      teams: {
        ...DEFAULT_ABOUT_CONTENT.teams,
        items: DEFAULT_ABOUT_CONTENT.teams.items.map((t) => {
          const live = lookup[t.name.trim().toLowerCase()];
          return { ...t, count: typeof live === 'number' ? live : t.count };
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
