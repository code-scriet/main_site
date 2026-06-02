import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
 * - Stats come from /api/stats/ (real DB counts, never hardcoded).
 * - Content is code-managed in apps/web/src/lib/aboutContent.ts.
 * - "Months since inception" computed from the LAUNCH_DATE constant.
 */
export function useAboutPageData(): AboutPageData {
  const statsQuery = useQuery({
    queryKey: ABOUT_STATS_KEY,
    queryFn: () => api.getPublicStats(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const raw = statsQuery.data;
  const stats: AboutPageStats = {
    members: raw?.members ?? FALLBACK_STATS.members,
    events: raw?.events ?? FALLBACK_STATS.events,
    achievements: raw?.achievements ?? FALLBACK_STATS.achievements,
    teamMembers: raw?.teamMembers ?? FALLBACK_STATS.teamMembers,
    monthsSinceInception: monthsSinceLaunch(LAUNCH_DATE),
  };

  return {
    stats,
    content: DEFAULT_ABOUT_CONTENT,
    isLoading: statsQuery.isLoading,
  };
}
