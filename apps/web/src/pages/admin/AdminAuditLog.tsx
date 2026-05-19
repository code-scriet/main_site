// Dashboard v2 — Admin · Audit Log (PRESIDENT/superAdmin only).
// Filterable timeline with collapsible JSON metadata.
// Pixel-port of screen-stubs.jsx:361 (AdminAuditScreen) + brief §7.20.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type AuditLogEntry } from '@/lib/api';
import { Avatar, DSCard, EmptyState, MonoChip, Pill } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

function actionTone(action: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  const a = action.toUpperCase();
  if (a.includes('DELETE') || a.includes('REVOKE') || a.includes('REJECT')) return 'danger';
  if (a.includes('CREATE') || a.includes('VERIFY') || a.includes('GRANT')) return 'success';
  if (a.includes('UPDATE') || a.includes('OVERRIDE') || a.includes('PATCH')) return 'warning';
  if (a.includes('LOGIN') || a.includes('VIEW') || a.includes('READ')) return 'info';
  return 'neutral';
}

// Human-readable labels for entity strings (HEAD parity, E13).
const ENTITY_LABELS: Record<string, string> = {
  settings: 'Settings',
  event: 'Event',
  events: 'Events',
  announcement: 'Announcement',
  user: 'User',
  team_member: 'Team Member',
  achievement: 'Achievement',
  qotd: 'QOTD',
  problem: 'Problem',
  problems: 'Problems',
  HiringApplication: 'Hiring Application',
  hiring_applications: 'Hiring Applications',
  NetworkProfile: 'Network Profile',
  network_profiles: 'Network Profiles',
  'email-templates': 'Email Templates',
  User: 'User',
  poll: 'Poll',
  certificate: 'Certificate',
  competition: 'Competition',
  invitation: 'Invitation',
  team: 'Team',
};

// Human-readable labels for action strings.
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  REGISTER: 'Registered',
  UNREGISTER: 'Unregistered',
  UPDATE_ROLE: 'Role changed',
  EXPORT: 'Exported',
  BLOCK_USER: 'Blocked user',
  UNBLOCK_USER: 'Unblocked user',
  FORCE_LOGOUT: 'Forced logout',
  PASSWORD_RESET_INITIATED: 'Password reset',
  RESET_STREAK_CURRENT: 'Reset streak',
  RESTORE_STREAK_LONGEST: 'Restored streak',
  RESTORE_USER: 'Restored user',
  NETWORK_PROFILE_VERIFIED: 'Verified profile',
  NETWORK_PROFILE_REJECTED: 'Rejected profile',
  NETWORK_PROFILE_UPDATED: 'Updated profile',
  NETWORK_PROFILE_DELETED: 'Deleted profile',
  HIRING_STATUS_UPDATED: 'Hiring status changed',
  HIRING_APPLICATION_DELETED: 'Hiring deleted',
};

function entityLabel(e: string): string {
  return ENTITY_LABELS[e] ?? e;
}
function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a.replace(/_/g, ' ');
}

export default function AdminAuditLog() {
  const { token } = useAuth();
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  const q = useQuery({
    queryKey: ['audit-logs', { page, entityFilter, actionFilter, search }],
    queryFn: () => api.getAuditLogs(token!, {
      page,
      limit: 50,
      entity: entityFilter || undefined,
      action: actionFilter || undefined,
      search: search || undefined,
    }),
    enabled: Boolean(token),
  });

  const entities = q.data?.filters?.entities ?? [];
  const actions = q.data?.filters?.actions ?? [];
  const logs = q.data?.logs ?? [];
  const total = q.data?.pagination?.total ?? 0;
  const totalPages = q.data?.pagination?.totalPages ?? 1;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setEntityFilter('');
    setActionFilter('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Governance</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Audit log</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Every admin mutation is recorded with actor, action, entity, and metadata.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFilters((o) => !o)}
            className={showFilters ? 'bg-[var(--accent-subtle)]/40 border-[var(--accent)]' : ''}
          >
            <Filter size={13} className="mr-1.5" />
            Filters
            {(entityFilter || actionFilter || search) && (
              <Pill tone="accent" size="xs" className="ml-1.5">on</Pill>
            )}
          </Button>
          <Pill tone="neutral" size="sm">
            <span className="font-mono tabular-nums">{total.toLocaleString()}</span> entries
          </Pill>
        </div>
      </div>

      {showFilters && (
        <DSCard padded>
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2 relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by entityId, action, or user…"
                className="pl-8 h-9 text-[13px]"
              />
            </div>
            <select
              value={entityFilter}
              onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              aria-label="Filter by entity"
            >
              <option value="">All entities</option>
              {entities.map((e) => <option key={e} value={e}>{entityLabel(e)}</option>)}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 text-[13.5px] bg-[var(--bg-raised)] border border-[var(--border-default)] rounded-[8px] outline-none focus:border-[var(--accent)]"
              aria-label="Filter by action"
            >
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </select>
          </div>
          {(entityFilter || actionFilter || search) && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[12px] text-[var(--ds-text-3)]">Filters applied</span>
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear</Button>
            </div>
          )}
        </DSCard>
      )}

      <DSCard padded={false}>
        {q.isLoading ? (
          <div className="p-6 animate-pulse space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-[var(--surface-soft)] rounded" />)}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState icon={<Shield size={18} />} title="No entries match" body="Try clearing filters or widen the date range." />
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {logs.map((log) => (
              <AuditRow
                key={log.id}
                log={log}
                expanded={expanded.has(log.id)}
                onToggle={() => toggle(log.id)}
              />
            ))}
          </div>
        )}
      </DSCard>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[12.5px] text-[var(--ds-text-3)]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronRight size={12} className="rotate-180 mr-1" />
              Prev
            </Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
              <ChevronRight size={12} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log, expanded, onToggle }: { log: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  const meta = log.metadata && Object.keys(log.metadata).length > 0 ? log.metadata : null;
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <Avatar name={log.user?.name ?? 'system'} src={log.user?.avatar} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-medium">{log.user?.name ?? 'System'}</span>
            <Pill tone={actionTone(log.action)} size="xs" title={log.action}>{actionLabel(log.action)}</Pill>
            <span className="text-[11px] text-[var(--ds-text-3)]">on</span>
            <MonoChip>{entityLabel(log.entity)}</MonoChip>
            {log.entityId && <MonoChip>{log.entityId.slice(0, 8)}</MonoChip>}
            <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums ml-auto" title={new Date(log.timestamp).toLocaleString()}>
              {relativeTime(log.timestamp)}
            </span>
          </div>
          {log.user?.email && (
            <div className="text-[11.5px] text-[var(--ds-text-3)] truncate">{log.user.email}</div>
          )}
          {meta && (
            <button
              type="button"
              onClick={onToggle}
              className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]"
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              metadata
            </button>
          )}
          {meta && expanded && (
            <pre className={cn(
              'mt-2 p-3 rounded-[8px] bg-[var(--surface-soft)] text-[11.5px] font-mono leading-[1.6] overflow-x-auto whitespace-pre',
              'text-[var(--ds-text-2)]',
            )}>
              {JSON.stringify(meta, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
