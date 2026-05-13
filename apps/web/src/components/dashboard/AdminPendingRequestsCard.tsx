import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, type PendingCapRequest, type PlaygroundLimitResetRequest } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function timeAgo(value?: string | null): string {
  if (!value) return 'just now';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Avatar({ user }: { user: { name: string; avatar?: string | null } }) {
  return user.avatar ? (
    <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
  ) : (
    <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function AdminPendingRequestsCard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const resetQuery = useQuery({
    queryKey: ['admin-playground-reset-requests'],
    queryFn: () => api.adminGetPendingPlaygroundResetRequests(token!),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  const capQuery = useQuery({
    queryKey: ['pending-cap-requests', 'dashboard'],
    queryFn: () => api.adminGetPendingCapRequests({}, token!),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  const grantResetMutation = useMutation({
    mutationFn: (request: PlaygroundLimitResetRequest) => api.adminGrantPlaygroundResetRequest(request.id, token!),
    onSuccess: async () => {
      toast.success('Playground limit reset granted');
      await queryClient.invalidateQueries({ queryKey: ['admin-playground-reset-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to grant reset'),
  });

  const denyResetMutation = useMutation({
    mutationFn: (request: PlaygroundLimitResetRequest) => api.adminDenyPlaygroundResetRequest(request.id, token!),
    onSuccess: async () => {
      toast.success('Reset request denied');
      await queryClient.invalidateQueries({ queryKey: ['admin-playground-reset-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to deny reset'),
  });

  const grantCapMutation = useMutation({
    mutationFn: (request: PendingCapRequest) =>
      api.adminResetSubmitCap(
        {
          userId: request.userId,
          problemId: request.problem.id,
          contextType: request.contextType,
          contextKey: request.contextKey,
          deltaSubmits: 5,
          clearRequest: true,
        },
        token!,
      ),
    onSuccess: async () => {
      toast.success('Added 5 submit attempts');
      await queryClient.invalidateQueries({ queryKey: ['pending-cap-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to grant attempts'),
  });

  const dismissCapMutation = useMutation({
    mutationFn: (request: PendingCapRequest) =>
      api.adminResetSubmitCap(
        {
          userId: request.userId,
          problemId: request.problem.id,
          contextType: request.contextType,
          contextKey: request.contextKey,
          clearRequest: true,
        },
        token!,
      ),
    onSuccess: async () => {
      toast.success('Submit-cap request dismissed');
      await queryClient.invalidateQueries({ queryKey: ['pending-cap-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to dismiss request'),
  });

  if (!token) return null;

  const resetRequests = resetQuery.data?.requests ?? [];
  const capRequests = capQuery.data?.requests ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-2xl border-amber-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            Playground daily-limit reset requests
          </CardTitle>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{resetRequests.length}</span>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4">
          {resetQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading requests...
            </div>
          ) : resetRequests.length === 0 ? (
            <p className="rounded-xl bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">No pending requests</p>
          ) : (
            resetRequests.map((request) => {
              const user = request.user ?? { name: 'Unknown user', email: '', avatar: null };
              const busy =
                (grantResetMutation.isPending && grantResetMutation.variables?.id === request.id) ||
                (denyResetMutation.isPending && denyResetMutation.variables?.id === request.id);
              return (
                <div key={request.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <Avatar user={user} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                        <span className="text-xs text-muted-foreground">{timeAgo(request.createdAt)}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{request.note || 'No note provided.'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" disabled={busy} onClick={() => grantResetMutation.mutate(request)} className="h-8 bg-amber-500 text-white hover:bg-amber-600">
                      {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                      Grant
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => denyResetMutation.mutate(request)} className="h-8">
                      <X className="mr-1 h-3.5 w-3.5" />
                      Deny
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-amber-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            Extra submit-attempt requests
          </CardTitle>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{capRequests.length}</span>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-4">
          {capQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading requests...
            </div>
          ) : capRequests.length === 0 ? (
            <p className="rounded-xl bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">No pending requests</p>
          ) : (
            capRequests.map((request) => {
              const busy =
                (grantCapMutation.isPending && grantCapMutation.variables?.id === request.id) ||
                (dismissCapMutation.isPending && dismissCapMutation.variables?.id === request.id);
              return (
                <div key={request.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <Avatar user={request.user} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">{request.user.name}</p>
                        <span className="text-xs text-muted-foreground">{timeAgo(request.requestedAt)}</span>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{request.problem.title} · {request.contextType}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-foreground/80">{request.note || 'No note provided.'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Used {request.used} / cap {request.currentCap}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" disabled={busy} onClick={() => grantCapMutation.mutate(request)} className="h-8 bg-amber-500 text-white hover:bg-amber-600">
                      {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                      Grant +5
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => dismissCapMutation.mutate(request)} className="h-8">
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminPendingRequestsCard;
