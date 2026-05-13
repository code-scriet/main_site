import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { usePlayground } from '@/context/PlaygroundContext';
import { getSessionPreflight, type SessionPreflight } from '@/utils/snippetsApi';
import { mainApi } from '@/lib/mainApi';

const defaultQuota: SessionPreflight = {
  allowed: true,
  metered: true,
  todayCount: 0,
  dailyLimit: 100,
  remaining: 100,
};

export function useDailyQuota() {
  const { isAuthenticated } = useAuth();
  const { language, isRunning } = usePlayground();
  const queryClient = useQueryClient();

  const quotaQuery = useQuery({
    queryKey: ['playground-session-preflight', language.id],
    queryFn: () => getSessionPreflight(language.id),
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: isAuthenticated ? 30_000 : false,
  });

  const resetRequestQuery = useQuery({
    queryKey: ['playground-my-reset-request'],
    queryFn: () => mainApi.getMyPlaygroundResetRequest(),
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: isAuthenticated ? 30_000 : false,
  });

  useEffect(() => {
    if (!isRunning && isAuthenticated) {
      queryClient.invalidateQueries({ queryKey: ['playground-session-preflight'] });
    }
  }, [isRunning, isAuthenticated, queryClient]);

  const quota = quotaQuery.data ?? defaultQuota;
  const pendingResetRequest = resetRequestQuery.data?.request?.status === 'PENDING'
    ? resetRequestQuery.data.request
    : null;
  const quotaExhausted = isAuthenticated && quota.metered !== false && quota.remaining <= 0;

  return {
    quota,
    pendingResetRequest,
    quotaExhausted,
    isLoading: quotaQuery.isLoading || resetRequestQuery.isLoading,
    refetch: async () => {
      await Promise.all([quotaQuery.refetch(), resetRequestQuery.refetch()]);
    },
  };
}
