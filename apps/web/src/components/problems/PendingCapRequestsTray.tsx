import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldAlert, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, type PendingCapRequest, type ProblemContextType } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { NumericPromptDialog } from '@/components/dash';

interface PendingCapRequestsTrayProps {
  contextType?: ProblemContextType;
  contextKey?: string;
  title?: string;
  defaultExpanded?: boolean;
  refetchIntervalMs?: number;
}

export function PendingCapRequestsTray({
  contextType,
  contextKey,
  title = 'Pending submit-cap requests',
  defaultExpanded = true,
  refetchIntervalMs = 15_000,
}: PendingCapRequestsTrayProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [dismissTarget, setDismissTarget] = useState<PendingCapRequest | null>(null);
  const [setCapTarget, setSetCapTarget] = useState<PendingCapRequest | null>(null);

  const filters = useMemo(
    () => ({ contextType, contextKey }),
    [contextType, contextKey],
  );

  const query = useQuery({
    queryKey: ['pending-cap-requests', contextType ?? 'ALL', contextKey ?? 'ALL'],
    queryFn: () => api.adminGetPendingCapRequests(filters, token!),
    enabled: Boolean(token),
    refetchInterval: refetchIntervalMs,
  });

  const grantMutation = useMutation({
    mutationFn: (input: {
      request: PendingCapRequest;
      mode: 'add' | 'set';
      value: number;
    }) =>
      api.adminResetSubmitCap(
        {
          userId: input.request.userId,
          problemId: input.request.problem.id,
          contextType: input.request.contextType,
          contextKey: input.request.contextKey,
          ...(input.mode === 'add'
            ? { deltaSubmits: input.value, clearRequest: true }
            : { newCap: input.value, clearRequest: true }),
        },
        token!,
      ),
    onSuccess: async (_data, variables) => {
      toast.success(
        variables.mode === 'add'
          ? `Added ${variables.value} more submits for ${variables.request.user.name}`
          : `Set cap to ${variables.value} for ${variables.request.user.name}`,
      );
      await queryClient.invalidateQueries({ queryKey: ['pending-cap-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to grant cap'),
  });

  const dismissMutation = useMutation({
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
      toast.success('Request dismissed');
      await queryClient.invalidateQueries({ queryKey: ['pending-cap-requests'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to dismiss'),
  });

  const requests = query.data?.requests ?? [];
  const pendingCount = requests.length;

  if (!token) return null;
  // Stay silent until we have data. Don't show a loading shim or an empty-state
  // banner — both are noise when nothing needs action.
  if (pendingCount === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50">
      <button
        type="button"
        onClick={() => setExpanded((next) => !next)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-900">
          <ShieldAlert className="h-4 w-4" />
          {title}
          <span className="inline-flex items-center justify-center rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
            {pendingCount}
          </span>
        </span>
        <span className="text-xs font-semibold text-amber-700">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="border-t border-amber-300 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Problem</th>
                <th className="px-4 py-2 text-left">Context</th>
                <th className="px-4 py-2 text-right">Cap / Used</th>
                <th className="px-4 py-2 text-left">Note</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const isBusy =
                  (grantMutation.isPending && grantMutation.variables?.request.id === request.id) ||
                  (dismissMutation.isPending && dismissMutation.variables?.id === request.id);
                return (
                  <tr key={request.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-gray-900">{request.user.name}</div>
                      {request.user.email && (
                        <div className="text-xs text-gray-500">{request.user.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-gray-800">{request.problem.title}</div>
                      <div className="text-xs text-gray-500">{request.problem.slug}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        {request.contextType}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{request.contextLabel}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      <span className="font-bold text-gray-900">{request.used}</span>
                      <span className="text-gray-400"> / </span>
                      <span className="text-gray-700">{request.currentCap}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{request.note || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            grantMutation.mutate({ request, mode: 'add', value: 5 })
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          +5
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            grantMutation.mutate({ request, mode: 'add', value: 10 })
                          }
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setSetCapTarget(request)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Set…
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setDismissTarget(request)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={Boolean(dismissTarget)} onOpenChange={(o) => !o && setDismissTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss this request?</AlertDialogTitle>
            <AlertDialogDescription>
              The user keeps their existing submit cap. They can submit a new request later if they still need more attempts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dismissMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dismissTarget) {
                  dismissMutation.mutate(dismissTarget);
                  setDismissTarget(null);
                }
              }}
              disabled={dismissMutation.isPending}
            >
              {dismissMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Dismiss
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NumericPromptDialog
        open={Boolean(setCapTarget)}
        onOpenChange={(o) => !o && setSetCapTarget(null)}
        title="Set absolute submit cap"
        description={setCapTarget ? `${setCapTarget.user.name} on "${setCapTarget.problem.title}"` : undefined}
        label="New cap"
        defaultValue={setCapTarget ? Math.max(setCapTarget.currentCap, setCapTarget.used + 1) : 1}
        min={1}
        max={100}
        confirmLabel="Grant cap"
        pending={grantMutation.isPending}
        onCommit={(value) => {
          if (!setCapTarget) return;
          grantMutation.mutate({ request: setCapTarget, mode: 'set', value: Math.floor(value) });
          setSetCapTarget(null);
        }}
      />
    </div>
  );
}

export default PendingCapRequestsTray;
