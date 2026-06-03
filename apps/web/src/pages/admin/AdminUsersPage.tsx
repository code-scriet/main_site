// Admin user management surface — admin-deep-control consolidated rewrite.
// Replaces AdminUsers.tsx + AdminUsersRealtime.tsx. SocketProvider wraps this
// route (set in App.tsx); we listen to user:* broadcasts and invalidate the
// React Query cache. List shape mirrors the GET /api/users advanced response.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Eye, ListPlus, Loader2, RefreshCcw, Search, Users2, X, ShieldOff } from 'lucide-react';
import { SocketProvider, useSocketEvent } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { api, type User, type UserBlockFeature, type UserListAdvancedQuery } from '@/lib/api';
import { extractApiErrorMessage } from '@/lib/error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { getRoleBadge, relativeTime } from '@/lib/userBadges';
import { processImageUrl } from '@/lib/imageUtils';
import { UserDetailSheet } from '@/components/admin/users/UserDetailSheet';

const ROLE_OPTIONS = ['USER', 'MEMBER', 'CORE_MEMBER', 'ADMIN', 'PRESIDENT'] as const;
const BLOCK_FEATURE_OPTIONS: UserBlockFeature[] = ['EVENT', 'PLAYGROUND', 'QOTD', 'QUIZ', 'NETWORK'];
const SORT_OPTIONS = [
  { value: 'created', label: 'Newest first' },
  { value: 'last_seen', label: 'Last seen' },
  { value: 'name', label: 'Name (A–Z)' },
] as const;

// Per-request page size. The backend caps `take` at 100; 50 keeps each
// "Load more" snappy while "Load all" pages through the rest.
const PAGE_SIZE = 50;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

interface FilterState {
  q: string;
  roles: string[];
  blockedFrom: UserBlockFeature[];
  hasNetwork: boolean;
  includeDeleted: boolean;
  sort: 'created' | 'last_seen' | 'name';
}

function AdminUsersPageInner() {
  const { token, user: currentUser } = useAuth();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<FilterState>({
    q: '',
    roles: [],
    blockedFrom: [],
    hasNetwork: false,
    includeDeleted: false,
    sort: 'created',
  });
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const debouncedQ = useDebounced(filters.q, 300);

  const query: UserListAdvancedQuery = useMemo(
    () => ({
      q: debouncedQ || undefined,
      role: filters.roles.length ? filters.roles : undefined,
      blockedFrom: filters.blockedFrom.length ? filters.blockedFrom : undefined,
      hasNetwork: filters.hasNetwork || undefined,
      includeDeleted: filters.includeDeleted || undefined,
      sort: filters.sort,
      take: PAGE_SIZE,
      searchAll: true,
    }),
    [debouncedQ, filters.roles, filters.blockedFrom, filters.hasNetwork, filters.includeDeleted, filters.sort],
  );

  const listQuery = useInfiniteQuery({
    queryKey: ['admin-users-list', query],
    queryFn: ({ pageParam }) => api.getUsersAdvanced(token!, { ...query, cursor: pageParam }),
    enabled: !!token,
    staleTime: 1000 * 15,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasMore ? lastPage.meta.nextCursor ?? undefined : undefined,
  });

  // Live invalidation via existing root-namespace socket events.
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users-list'] });
  useSocketEvent('user:created', invalidate);
  useSocketEvent('user:updated', invalidate);
  useSocketEvent('user:deleted', invalidate);

  const users = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.users) ?? [],
    [listQuery.data],
  );
  const loadedPages = listQuery.data?.pages;
  const totalUsers = loadedPages?.[loadedPages.length - 1]?.meta.totalUsers;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery;

  // "Load all" — page through every remaining cursor in one go. Driven by a
  // promise loop in an event handler (not an effect) so it can never trigger
  // cascading re-renders; each fetchNextPage resolves before the next fires.
  const [loadingAll, setLoadingAll] = useState(false);
  const loadAll = async () => {
    if (loadingAll) return;
    setLoadingAll(true);
    try {
      let result = await fetchNextPage();
      while (result.hasNextPage && !result.isError) {
        result = await fetchNextPage();
      }
    } catch {
      // fetchNextPage surfaces failures on the query itself; nothing to do here.
    } finally {
      setLoadingAll(false);
    }
  };

  const toggleRole = (role: string) => {
    setFilters((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  };
  const toggleBlockFeature = (feature: UserBlockFeature) => {
    setFilters((f) => ({
      ...f,
      blockedFrom: f.blockedFrom.includes(feature)
        ? f.blockedFrom.filter((x) => x !== feature)
        : [...f.blockedFrom, feature],
    }));
  };

  const filtersActive =
    filters.q.length > 0 ||
    filters.roles.length > 0 ||
    filters.blockedFrom.length > 0 ||
    filters.hasNetwork ||
    filters.includeDeleted ||
    filters.sort !== 'created';

  const clearFilters = () =>
    setFilters({ q: '', roles: [], blockedFrom: [], hasNetwork: false, includeDeleted: false, sort: 'created' });

  const isPresidentOrSuper = currentUser?.isSuperAdmin || currentUser?.role === 'PRESIDENT';

  return (
    <div className="space-y-5 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[var(--ds-text-1)] dark:text-zinc-50">
            <Users2 className="h-5 w-5" />
            <h1 className="text-xl font-semibold">User Management</h1>
          </div>
          <p className="mt-1 text-sm text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">
            {totalUsers != null ? `${totalUsers} total` : 'Loading…'}
            {users.length ? ` · ${users.length} loaded` : ''}
            {hasNextPage ? ' · more available' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
            <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${listQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 dark:border-[var(--border-subtle)] dark:bg-zinc-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-3)]" />
            <Input
              placeholder="Search name, email, branch, course, phone, socials…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              className="pl-9"
            />
          </div>
          <select
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as FilterState['sort'] }))}
            className="h-9 rounded-md border border-[var(--border-subtle)] bg-white px-3 text-sm dark:border-[var(--border-subtle)] dark:bg-zinc-900"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-[var(--ds-text-3)]">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">Roles:</span>
          {ROLE_OPTIONS.map((r) => {
            const active = filters.roles.includes(r);
            const badge = getRoleBadge(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active ? badge.className : 'bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:bg-zinc-200 dark:bg-zinc-900 dark:text-[var(--ds-text-3)] dark:hover:bg-zinc-800'
                }`}
              >
                {badge.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">Blocked from:</span>
          {BLOCK_FEATURE_OPTIONS.map((f) => {
            const active = filters.blockedFrom.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleBlockFeature(f)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-900'
                    : 'bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:bg-zinc-200 dark:bg-zinc-900 dark:text-[var(--ds-text-3)] dark:hover:bg-zinc-800'
                }`}
              >
                {f.toLowerCase()}
              </button>
            );
          })}
          <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={filters.hasNetwork}
              onChange={(e) => setFilters((f) => ({ ...f, hasNetwork: e.target.checked }))}
              className="h-3.5 w-3.5 rounded"
            />
            Network only
          </label>
          {isPresidentOrSuper && (
            <label className="ml-2 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={filters.includeDeleted}
                onChange={(e) => setFilters((f) => ({ ...f, includeDeleted: e.target.checked }))}
                className="h-3.5 w-3.5 rounded"
              />
              Show deleted
            </label>
          )}
        </div>
      </div>

      {/* List */}
      {listQuery.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {extractApiErrorMessage(listQuery.error, 'Failed to load users')}
        </div>
      )}

      <div className="rounded-xl border border-[var(--border-subtle)] bg-white dark:border-[var(--border-subtle)] dark:bg-zinc-950">
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">
            <Users2 className="h-8 w-8 opacity-40" />
            No users match these filters.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {users.map((u) => (
              <UserRow key={u.id} user={u} onOpen={() => setOpenUserId(u.id)} />
            ))}
          </ul>
        )}
      </div>

      {/* Pagination controls — incremental "Load more" + a "Load all" option */}
      {users.length > 0 && (hasNextPage || loadingAll) && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={!hasNextPage || isFetchingNextPage || loadingAll}
          >
            {isFetchingNextPage && !loadingAll ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="mr-2 h-3.5 w-3.5" />
            )}
            Load more
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadAll()}
            disabled={!hasNextPage || loadingAll}
            className="text-[var(--ds-text-3)]"
          >
            {loadingAll ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ListPlus className="mr-2 h-3.5 w-3.5" />
            )}
            {loadingAll
              ? `Loading all… (${users.length}${totalUsers != null ? `/${totalUsers}` : ''})`
              : 'Load all users'}
          </Button>
        </div>
      )}

      <UserDetailSheet
        userId={openUserId}
        open={!!openUserId}
        onOpenChange={(open) => {
          if (!open) setOpenUserId(null);
        }}
      />
    </div>
  );
}

function UserRow({ user, onOpen }: { user: User; onOpen: () => void }) {
  const badge = getRoleBadge(user.role);
  const RoleIcon = badge.icon;
  const activeBlocks = (user.blocks ?? []).filter(
    (b) => !b.expiresAt || new Date(b.expiresAt).getTime() > Date.now(),
  );
  const deletedClass = user.isDeleted ? 'opacity-60' : '';

  return (
    <li className={`group flex items-center gap-3 px-4 py-3 ${deletedClass}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-center gap-3 text-left transition hover:bg-[var(--surface-soft)] -mx-2 px-2 rounded-md dark:hover:bg-zinc-900/50"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-soft)] text-sm font-medium text-[var(--ds-text-2)] dark:bg-zinc-800 dark:text-zinc-200">
          {user.avatar ? (
            <img
              src={processImageUrl(user.avatar, 'team-avatar')}
              alt=""
              width={36}
              height={36}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            (user.name || '?').slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-sm font-medium ${user.isDeleted ? 'line-through' : 'text-[var(--ds-text-1)] dark:text-zinc-100'}`}>
              {user.name}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
              <RoleIcon className="h-3 w-3" /> {badge.label}
            </span>
            {user.isDeleted && (
              <Badge variant="destructive" className="text-[10px]">
                Deleted
              </Badge>
            )}
            {activeBlocks.length > 0 && (
              <Tooltip content={`Blocked from: ${activeBlocks.map((b) => b.feature.toLowerCase()).join(', ')}`}>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-900">
                  <ShieldOff className="h-3 w-3" /> {activeBlocks.length}
                </span>
              </Tooltip>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">
            {user.email}
            {user.branch && ` · ${user.branch}`}
            {user.year && ` · Year ${user.year}`}
          </div>
        </div>
        <div className="hidden flex-col items-end gap-0.5 text-right md:flex">
          <span className="text-xs text-[var(--ds-text-3)] dark:text-[var(--ds-text-3)]">
            Seen {relativeTime(user.lastLoginAt)}
          </span>
        </div>
      </button>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Eye className="mr-1 h-3.5 w-3.5" /> View
        </Button>
        <Tooltip content="Open full page">
          <Link
            to={`/admin/users/${user.id}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--ds-text-3)] hover:bg-[var(--surface-soft)] hover:text-[var(--ds-text-1)] dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            aria-label="Open detail page"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Tooltip>
      </div>
    </li>
  );
}

export default function AdminUsersPage() {
  return (
    <SocketProvider>
      <AdminUsersPageInner />
    </SocketProvider>
  );
}

export function AdminUsersPageBare() {
  return <AdminUsersPageInner />;
}

// Useful for the full-page detail route to share the loader UI.
export function AdminUsersLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
    </div>
  );
}
