// Dashboard v2 — notification bell dropdown. Aggregates invitations, certs, quiz, system events.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Award, Zap, Shield, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, type NotifItem } from '@/lib/api';
import { Pill } from '@/components/dash';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/dateUtils';

interface Props {
  open: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  inbox: Inbox,
  award: Award,
  zap: Zap,
  shield: Shield,
};

export function NotifMenu({ open, onClose, anchorRef }: Props) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const popRef = useRef<HTMLDivElement>(null);
  // Persist the tab choice so reopening the menu lands the user back where
  // they were. localStorage is safe here — the value is a 2-letter enum.
  const NOTIF_TAB_STORAGE = 'notif-menu-tab';
  const [tab, setTab] = useState<'all' | 'unread'>(() => {
    if (typeof window === 'undefined') return 'all';
    const stored = window.localStorage.getItem(NOTIF_TAB_STORAGE);
    return stored === 'unread' ? 'unread' : 'all';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NOTIF_TAB_STORAGE, tab);
    }
  }, [tab]);

  // Always fetch so the bell badge updates even when the menu is closed.
  // Faster polling when menu is open (30s) vs background (60s).
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getNotifications(token!),
    enabled: Boolean(token),
    refetchInterval: open ? 30_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  const data = q.data;
  const allItems = useMemo<NotifItem[]>(() => {
    if (!data) return [];
    return [
      ...(data.groups.broadcasts ?? []),
      ...data.groups.invitations,
      ...data.groups.quiz,
      ...data.groups.certificates,
      ...data.groups.system,
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [data]);
  const items = tab === 'unread' ? allItems.filter((i) => !i.read) : allItems;

  const handleMarkAll = async () => {
    if (!token) return;
    await api.markNotificationsRead(token);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleClick = (it: NotifItem) => {
    if (it.link) navigate(it.link);
    onClose();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current) return;
      const target = e.target as Node;
      if (popRef.current.contains(target)) return;
      if (anchorRef?.current && anchorRef.current.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={popRef}
      data-dashboard="true"
      className="fixed right-3 top-[60px] z-[70] w-[380px] max-w-[calc(100vw-1.5rem)] rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] shadow-[var(--shadow-lg)] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">Notifications</span>
          {data && data.unreadCount > 0 && <Pill tone="accent" size="xs">{data.unreadCount} new</Pill>}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-[11.5px] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] px-1.5 h-6 rounded-[5px] hover:bg-[var(--surface-soft)]"
          >
            Mark all as read
          </button>
          <button
            type="button"
            onClick={onClose}
            className="size-6 rounded-[5px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)]"
            aria-label="Close notifications"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="px-3 pt-2 flex gap-1.5">
        <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>All</TabBtn>
        <TabBtn active={tab === 'unread'} onClick={() => setTab('unread')}>
          Unread {data && data.unreadCount > 0 ? `(${data.unreadCount})` : ''}
        </TabBtn>
      </div>

      <div className="max-h-[440px] overflow-y-auto py-1">
        {q.isLoading && (
          <div className="px-3 py-6 text-[12.5px] text-[var(--ds-text-3)] text-center">Loading…</div>
        )}
        {!q.isLoading && items.length === 0 && (
          <div className="px-3 py-8 text-center">
            <div className="text-[13px] font-medium text-[var(--ds-text-1)]">You&apos;re all caught up.</div>
            <div className="text-[12px] text-[var(--ds-text-3)] mt-1">No new notifications.</div>
          </div>
        )}
        {items.map((it) => {
          const Icon = ICONS[it.icon] ?? Inbox;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => handleClick(it)}
              className={cn(
                'w-full px-3 py-2.5 flex items-start gap-2.5 text-left hover:bg-[var(--surface-soft)] transition-colors',
                !it.read && 'bg-[var(--accent-subtle)]/30',
              )}
            >
              <span className="size-7 rounded-[8px] bg-[var(--surface-soft)] text-[var(--ds-text-3)] flex items-center justify-center shrink-0">
                <Icon size={14} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] leading-tight">{it.title}</div>
                {it.body && <div className="text-[11.5px] text-[var(--ds-text-3)] mt-0.5 truncate">{it.body}</div>}
                <div className="text-[10.5px] text-[var(--ds-text-3)] mt-1 font-mono tabular-nums" title={new Date(it.timestamp).toLocaleString()}>
                  {relativeTime(it.timestamp)}
                </div>
              </div>
              {!it.read && <span className="size-[6px] rounded-full bg-[var(--accent)] mt-1 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 h-7 text-[11.5px] font-medium rounded-[6px] transition-colors',
        active
          ? 'bg-[var(--surface-soft)] text-[var(--ds-text-1)]'
          : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]',
      )}
    >
      {children}
    </button>
  );
}
