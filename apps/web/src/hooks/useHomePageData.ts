import { useQuery } from '@tanstack/react-query';
import { api, type HomePageData } from '@/lib/api';

const HOME_PAGE_QUERY_KEY = ['home-page-data'] as const;

async function fetchHomePageData(): Promise<HomePageData> {
  try {
    return await api.getHomePageData();
  } catch {
    // Backwards-compatible fallback if aggregated endpoint is unavailable.
    const [settings, stats, events, announcements, achievements, team, network] = await Promise.all([
      api.getSettings(),
      api.getPublicStats(),
      api.getEvents('UPCOMING'),
      api.getAnnouncements(),
      api.getAchievements({ limit: 4 }),
      api.getTeam(undefined, { compact: true }),
      api.getNetworkProfiles(),
    ]);

    const upcomingEvents = [...events]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 3);

    return {
      stats: {
        members: stats.members,
        events: stats.events,
        achievements: stats.achievements,
      },
      settings: {
        clubDescription: settings.clubDescription,
        hiringEnabled: settings.hiringEnabled,
        showNetwork: settings.showNetwork,
      },
      upcomingEvents,
      latestAnnouncements: announcements.slice(0, 3),
      featuredAchievements: achievements.slice(0, 4),
      teamHighlights: team.slice(0, 6),
      networkHighlights: network.profiles.slice(0, 6),
    };
  }
}

export function useHomePageData() {
  return useQuery<HomePageData>({
    queryKey: HOME_PAGE_QUERY_KEY,
    queryFn: fetchHomePageData,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
