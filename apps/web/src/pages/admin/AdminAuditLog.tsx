import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Filter,
  User,
  Settings,
  Calendar,
  Bell,
  Users,
  Trophy,
  Shield,
  Trash2,
  PenLine,
  Plus,
  Download,
  Eye,
  Key,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { AuditLogEntry } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatDateTime } from '@/lib/dateUtils';

// Friendly labels for action types
const ACTION_LABELS: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  CREATE: { label: 'Created', color: 'bg-green-100 text-green-700', icon: Plus },
  UPDATE: { label: 'Updated', color: 'bg-blue-100 text-blue-700', icon: PenLine },
  DELETE: { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: Trash2 },
  REGISTER: { label: 'Registered', color: 'bg-emerald-100 text-emerald-700', icon: Plus },
  UNREGISTER: { label: 'Unregistered', color: 'bg-orange-100 text-orange-700', icon: Trash2 },
  UPDATE_ROLE: { label: 'Role Changed', color: 'bg-purple-100 text-purple-700', icon: Key },
  EXPORT: { label: 'Exported', color: 'bg-cyan-100 text-cyan-700', icon: Download },
  HIRING_APPLICATION_SUBMITTED: { label: 'Applied', color: 'bg-green-100 text-green-700', icon: Plus },
  HIRING_STATUS_UPDATED: { label: 'Status Changed', color: 'bg-blue-100 text-blue-700', icon: PenLine },
  HIRING_APPLICATION_DELETED: { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: Trash2 },
  NETWORK_PROFILE_VERIFIED: { label: 'Verified', color: 'bg-green-100 text-green-700', icon: Eye },
  NETWORK_PROFILE_REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: Trash2 },
  NETWORK_PROFILE_UPDATED: { label: 'Updated', color: 'bg-blue-100 text-blue-700', icon: PenLine },
  NETWORK_PROFILE_DELETED: { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: Trash2 },
  NETWORK_EXPORT: { label: 'Exported', color: 'bg-cyan-100 text-cyan-700', icon: Download },
  NETWORK_PENDING_USER_REVERTED: { label: 'Reverted User', color: 'bg-orange-100 text-orange-700', icon: Users },
  NETWORK_PENDING_USER_DELETED: { label: 'Deleted User', color: 'bg-red-100 text-red-700', icon: Trash2 },
};

// Friendly labels for entity types
const ENTITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  settings: Settings,
  event: Calendar,
  announcement: Bell,
  user: User,
  team_member: Users,
  achievement: Trophy,
  qotd: ClipboardList,
  HiringApplication: Shield,
  NetworkProfile: Users,
  'email-templates': Settings,
  hiring_applications: Shield,
  network_profiles: Users,
  User: User,
};

const ENTITY_LABELS: Record<string, string> = {
  settings: 'Settings',
  event: 'Event',
  announcement: 'Announcement',
  user: 'User',
  team_member: 'Team Member',
  achievement: 'Achievement',
  qotd: 'QOTD',
  HiringApplication: 'Hiring Application',
  NetworkProfile: 'Network Profile',
  'email-templates': 'Email Templates',
  hiring_applications: 'Hiring Applications',
  network_profiles: 'Network Profiles',
  User: 'User',
};

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let relative: string;
  if (diffMins < 1) relative = 'Just now';
  else if (diffMins < 60) relative = `${diffMins}m ago`;
  else if (diffHours < 24) relative = `${diffHours}h ago`;
  else if (diffDays < 7) relative = `${diffDays}d ago`;
  else relative = formatDate(date, 'short');

  const full = formatDateTime(date);

  return { relative, full };
}

function formatMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'action') {
      parts.push(String(value));
    } else if (key === 'title' || key === 'question' || key === 'eventTitle') {
      parts.push(`"${String(value)}"`);
    } else if (key === 'newRole') {
      parts.push(`→ ${String(value)}`);
    } else if (key === 'fields' && Array.isArray(value)) {
      parts.push(`fields: ${value.join(', ')}`);
    } else if (key === 'name') {
      parts.push(String(value));
    } else if (key === 'updatedBy') {
      // skip
    } else if (typeof value === 'boolean') {
      parts.push(`${key}: ${value ? 'on' : 'off'}`);
    } else if (typeof value === 'string' || typeof value === 'number') {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.join(' · ');
}

export default function AdminAuditLog() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAuditLogs(token, {
        page,
        limit: 30,
        entity: entityFilter || undefined,
        action: actionFilter || undefined,
        search: searchQuery || undefined,
      });
      setLogs(data.logs);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setAvailableEntities(data.filters.entities);
      setAvailableActions(data.filters.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  }, [token, page, entityFilter, actionFilter, searchQuery]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [entityFilter, actionFilter, searchQuery]);

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
          <p className="text-gray-600">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Audit Log</h1>
          <p className="text-gray-600">Track who changed what and when ({total} total entries)</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-amber-50 border-amber-300' : ''}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {/* Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <Card className="border-amber-100">
            <CardContent className="pt-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label htmlFor="audit-log-entity" className="text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</label>
                  <select
                    id="audit-log-entity"
                    value={entityFilter}
                    onChange={(e) => setEntityFilter(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">All entities</option>
                    {availableEntities.map((e) => (
                      <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="audit-log-action" className="text-xs font-medium text-gray-500 uppercase tracking-wider">Action</label>
                  <select
                    id="audit-log-action"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">All actions</option>
                    {availableActions.map((a) => (
                      <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="audit-log-search" className="text-xs font-medium text-gray-500 uppercase tracking-wider">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="audit-log-search"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Search logs..."
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
              </div>
              {(entityFilter || actionFilter || searchInput) && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{total} results</span>
                  <button
                    onClick={() => {
                      setEntityFilter('');
                      setActionFilter('');
                      setSearchInput('');
                      setSearchQuery('');
                    }}
                    className="text-xs text-amber-600 hover:text-amber-700 underline"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Log entries */}
      <Card className="border-amber-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {logs.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No audit logs found</p>
              <p className="text-sm text-gray-400 mt-1">
                {entityFilter || actionFilter || searchQuery
                  ? 'Try adjusting your filters'
                  : 'Actions will appear here as admins make changes'}
              </p>
            </div>
          ) : (
            logs.map((log, index) => {
              const actionInfo = ACTION_LABELS[log.action] || {
                label: log.action,
                color: 'bg-gray-100 text-gray-700',
                icon: PenLine,
              };
              const ActionIcon = actionInfo.icon;
              const EntityIcon = ENTITY_ICONS[log.entity] || ClipboardList;
              const entityLabel = ENTITY_LABELS[log.entity] || log.entity;
              const time = formatTimestamp(log.timestamp);
              const metaStr = formatMetadata(log.metadata as Record<string, unknown> | null);

              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-amber-50/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-amber-200 shrink-0 mt-0.5">
                    {log.user.avatar ? (
                      <img src={log.user.avatar} alt={log.user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold text-xs">
                        {log.user.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium text-amber-900">{log.user.name}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${actionInfo.color}`}>
                        <ActionIcon className="h-3 w-3" />
                        {actionInfo.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-gray-600">
                        <EntityIcon className="h-3.5 w-3.5" />
                        {entityLabel}
                      </span>
                      {log.entityId && log.entityId !== 'default' && log.entityId !== 'batch' && log.entityId !== 'bulk' && log.entityId !== 'config' && (
                        <span className="text-xs text-gray-400 font-mono truncate max-w-[120px]" title={log.entityId}>
                          ({log.entityId.slice(0, 8)}…)
                        </span>
                      )}
                    </div>
                    {metaStr && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate" title={metaStr}>
                        {metaStr}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500" title={time.full}>{time.relative}</p>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
