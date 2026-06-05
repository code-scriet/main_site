import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Single source of truth for the public DB stat counts (members / events /
 * achievements / per-team counts) served by `GET /api/stats/public`.
 *
 * Every public surface that needs these numbers (About page, Achievements
 * "member impact", etc.) calls this hook. Because React Query dedupes by
 * `queryKey`, the FIRST consumer to mount triggers the one network request and
 * every later consumer — on this page or any other, within gcTime — reuses the
 * cached result instead of refetching. Hybrid by design: pages fetch what they
 * need, but the same data is only ever fetched once and shared.
 *
 * Note: the home page intentionally does NOT use this — it gets the same counts
 * bundled into its own `GET /api/stats/home` aggregate so the landing page is a
 * single round-trip. Both are cached independently and site-wide.
 */
export const PUBLIC_STATS_KEY = ['public-stats'] as const;

export type PublicStats = Awaited<ReturnType<typeof api.getPublicStats>>;

export function usePublicStats() {
  return useQuery<PublicStats>({
    queryKey: PUBLIC_STATS_KEY,
    queryFn: () => api.getPublicStats(),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
