// Dashboard v2 — Cmd+K command palette. Hits /api/search/global and falls back to a static page list.
// Polished per overlays.jsx §CmdK: grouped results, compact 32px rows, real kind icons, footer with results count.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Sun, Moon, ArrowRight,
  Home, Calendar, Code, Zap, Trophy, User, Award, Inbox, Settings,
  Terminal, BarChart3, Plus, ScanLine, Mail, Users, MessageSquare, FileText,
  Bell, ListTodo,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api, type GlobalSearchPayload } from '@/lib/api';
import { KBD } from '@/components/dash';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PaletteHit {
  kind: string;
  label: string;
  sub?: string;
  icon: string;
  route: string;
}

const ACTIONS: PaletteHit[] = [
  { kind: 'action', label: 'Toggle theme', icon: 'theme', route: '__toggle-theme__' },
  { kind: 'action', label: 'Open my profile', icon: 'user', route: '/dashboard/profile' },
  { kind: 'action', label: 'Take attendance', icon: 'scan', route: '/dashboard/attendance' },
  { kind: 'action', label: 'Create event', icon: 'plus', route: '/dashboard/events/new' },
  { kind: 'action', label: 'Create announcement', icon: 'plus', route: '/dashboard/announcements/new' },
  { kind: 'action', label: 'Send mail', icon: 'mail', route: '/admin/mail' },
];

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  home: Home,
  calendar: Calendar,
  code: Code,
  zap: Zap,
  trophy: Trophy,
  user: User,
  users: Users,
  award: Award,
  inbox: Inbox,
  settings: Settings,
  terminal: Terminal,
  chart: BarChart3,
  plus: Plus,
  scan: ScanLine,
  mail: Mail,
  message: MessageSquare,
  file: FileText,
  bell: Bell,
  list: ListTodo,
  search: Search,
};

const KIND_LABEL: Record<string, string> = {
  page: 'Pages',
  event: 'Events',
  problem: 'Problems',
  poll: 'Polls',
  announcement: 'Announcements',
  person: 'People',
  action: 'Actions',
};

const GROUP_ORDER = ['page', 'event', 'problem', 'poll', 'announcement', 'person', 'action'];

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toggleTheme, theme } = useTheme();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<GlobalSearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus input on open, reset state on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQ('');
      setActive(0);
      setResults(null);
      setSearchError(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !q.trim() || !token) {
      setResults(null);
      setSearchError(null);
      return;
    }
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setSearchError(null);
      try {
        const data = await api.globalSearch(q.trim(), token, 5);
        if (!ctrl.signal.aborted) setResults(data);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          setResults(null);
          setSearchError(err instanceof Error ? err.message : 'Search is unavailable right now.');
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [q, token, open]);

  const flat = useMemo<PaletteHit[]>(() => {
    if (!results) {
      if (!q.trim()) return ACTIONS;
      // No backend results: degrade gracefully to local action matches so the
      // palette stays useful even when /api/search/global is down.
      return ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
    }
    return [
      ...results.pages,
      ...results.events,
      ...results.problems,
      ...results.polls,
      ...results.announcements,
      ...results.people,
      ...(q.trim() ? ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase())) : []),
    ];
  }, [results, q]);

  // Group results by kind for the eyebrow headers + maintain a flat index for keyboard nav.
  const grouped = useMemo(() => {
    const map: Record<string, PaletteHit[]> = {};
    for (const hit of flat) {
      (map[hit.kind] ||= []).push(hit);
    }
    return GROUP_ORDER
      .map((kind) => ({ kind, items: map[kind] ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [flat]);

  const commit = (hit: PaletteHit) => {
    if (hit.route === '__toggle-theme__') {
      toggleTheme();
      onClose();
      return;
    }
    if (hit.route.startsWith('/')) {
      navigate(hit.route);
    } else {
      navigate(routeIdToUrl(hit.route));
    }
    onClose();
  };

  // Keyboard handlers
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        const hit = flat[active];
        if (hit) commit(hit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flat, active]);

  if (!open) return null;

  let flatIdx = 0;
  const themeIcon = theme === 'dark' ? Sun : Moon;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] p-4 sm:p-6" data-dashboard="true">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-md"
        onClick={onClose}
        aria-label="Close command palette"
      />
      <div className="relative w-full max-w-[640px] rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] shadow-[var(--shadow-xl)] overflow-hidden">
        {/* Search input row */}
        <div className="flex items-center gap-2.5 px-4 h-[52px] border-b border-[var(--border-subtle)]">
          <Search size={16} className="text-[var(--ds-text-3)] shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search pages, events, problems, people…"
            className="flex-1 bg-transparent outline-none text-[14px] text-[var(--ds-text-1)] placeholder:text-[var(--ds-text-3)]"
          />
          {loading && (
            <span className="text-[10.5px] text-[var(--ds-text-3)] mr-1">searching…</span>
          )}
          <KBD>esc</KBD>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {searchError && q.trim() && (
            <div role="alert" className="mx-2 mb-2 rounded-[8px] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2 text-[12px] text-[var(--warning)]">
              Search is unavailable. Showing local matches only.
            </div>
          )}
          {flat.length === 0 && q.trim() && !loading && (
            <div className="px-3 py-8 text-center">
              <Search size={18} className="mx-auto text-[var(--ds-text-3)] mb-2" />
              <div className="text-[13px] font-medium text-[var(--ds-text-1)]">No results for &ldquo;{q}&rdquo;</div>
              <div className="text-[11.5px] text-[var(--ds-text-3)] mt-1">Try a page, event, problem, or person.</div>
            </div>
          )}
          {flat.length === 0 && !q.trim() && (
            <div className="px-3 pt-3 pb-2 text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
              Quick actions
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.kind} className="mb-1">
              <div className="px-3 pt-2 pb-1.5 text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">
                {KIND_LABEL[group.kind] ?? group.kind}
              </div>
              {group.items.map((hit) => {
                const i = flatIdx++;
                const isActive = i === active;
                const iconKey = hit.icon === 'theme' ? null : hit.icon;
                const Icon = iconKey ? (ICONS[iconKey] ?? Search) : themeIcon;
                return (
                  <button
                    key={`${hit.kind}-${hit.route}-${i}`}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(hit)}
                    className={cn(
                      'w-full h-8 px-2.5 rounded-[7px] flex items-center gap-2.5 text-[13px] transition-colors text-left',
                      isActive ? 'bg-[var(--surface-soft)] text-[var(--ds-text-1)]' : 'text-[var(--ds-text-2)]',
                    )}
                  >
                    <Icon size={14} className="text-[var(--ds-text-3)] shrink-0" />
                    <span className="flex-1 truncate">
                      {hit.label === 'Toggle theme'
                        ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`
                        : hit.label}
                    </span>
                    {hit.sub && (
                      <span className="text-[11px] text-[var(--ds-text-3)] font-mono tabular-nums shrink-0 truncate max-w-[180px]">
                        {hit.sub}
                      </span>
                    )}
                    {isActive && (
                      <ArrowRight size={12} className="text-[var(--ds-text-3)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 h-10 border-t border-[var(--border-subtle)] text-[11.5px] text-[var(--ds-text-3)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><KBD>↑</KBD><KBD>↓</KBD> navigate</span>
            <span className="inline-flex items-center gap-1"><KBD>↵</KBD> open</span>
            <span className="hidden sm:inline-flex items-center gap-1"><KBD>⌘</KBD><KBD>K</KBD> toggle</span>
          </div>
          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            code<span className="text-[var(--accent)]">.</span>scriet · {flat.length} {flat.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
}

function routeIdToUrl(routeId: string): string {
  const map: Record<string, string> = {
    overview: '/dashboard',
    events: '/dashboard/events',
    announcements: '/dashboard/announcements',
    coding: '/dashboard/coding',
    'coding-practice': '/dashboard/coding?tab=practice',
    'coding-qotd': '/dashboard/coding?tab=qotd',
    'coding-competitions': '/dashboard/coding?tab=competitions',
    'coding-leaderboard': '/dashboard/coding?tab=leaderboard',
    'coding-playground': '/dashboard/coding?tab=playground',
    quiz: '/quiz',
    leaderboard: '/dashboard/leaderboard',
    profile: '/dashboard/profile',
    certificates: '/dashboard/certificates',
    invitations: '/dashboard/invitations',
    attendance: '/dashboard/attendance',
    'create-event': '/dashboard/events/new',
    'create-announcement': '/dashboard/announcements/new',
    'create-problem': '/dashboard/problems/new',
    'manage-qotd': '/dashboard/qotd',
    'quiz-manager': '/dashboard/quiz',
    'upload-image': '/dashboard/upload',
    'admin-users': '/admin/users',
    'admin-team': '/admin/team',
    'admin-achievements': '/admin/achievements',
    'admin-problems': '/admin/problems',
    'admin-credits': '/admin/credits',
    'admin-public-view': '/admin/public-view',
    'admin-hiring': '/admin/hiring',
    'admin-network': '/admin/network',
    'admin-event-registrations': '/admin/event-registrations',
    'admin-competition': '/admin/competition',
    'admin-certificates': '/admin/certificates',
    'admin-mail': '/admin/mail',
    'admin-audit': '/admin/audit-log',
    'admin-settings': '/admin/settings',
  };
  return map[routeId] ?? '/dashboard';
}
