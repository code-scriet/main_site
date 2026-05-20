// Dashboard v2 — app shell.
//
// Layout: [data-dashboard]
//   ├─ Sidebar (244 / 60 collapsed) — sectioned, role-aware, "Coding" parent with children
//   ├─ Topbar (56 px frosted) — collapse toggle / breadcrumb / Cmd+K / theme / bell / avatar
//   ├─ Main outlet (max-w-[1400px])
//   └─ Bottom-tab on mobile
//
// Overlays: <CommandPalette> (⌘K) and <NotifMenu> (bell) mount here.
// Design source: code-scriet-innerdashboard/project/js/shell.jsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Home, Calendar, Megaphone, Code, Zap, Trophy, User, Award, Inbox,
  ScanLine, Plus, FileText, Upload as UploadIcon, Play,
  Users, Layers, Star, Terminal, BookOpen, Activity, Briefcase, Globe, List, Mail,
  Shield, Settings as SettingsIcon,
  Search, Bell, Sun, Moon, Menu, X, ChevronRight, ChevronDown, ChevronLeft,
  LogOut, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';
import { CommandPalette } from './CommandPalette';
import { NotifMenu } from './NotifMenu';
import { useNotificationsSocket } from '@/hooks/useNotificationsSocket';
import { Avatar, KBD, Pill, roleTone } from '@/components/dash';
import { cn } from '@/lib/utils';

type IconCmp = React.ComponentType<{ size?: number; className?: string }>;

interface NavItem {
  route: string;
  href: string;
  label: string;
  icon: IconCmp;
  badge?: number;
  children?: NavItem[];
}

interface NavSection {
  section: string | null;
  items: NavItem[];
}

const STORAGE_COLLAPSED = 'sidebar-collapsed';
const PROFILE_EXEMPT = new Set(['/dashboard/profile', '/dashboard/certificates']);

const breadcrumbNames: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/events': 'My Events',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/coding': 'Coding',
  '/dashboard/profile': 'My Profile',
  '/dashboard/certificates': 'My Certificates',
  '/dashboard/invitations': 'My Invitations',
  '/dashboard/leaderboard': 'Leaderboard',
  '/dashboard/attendance': 'Take Attendance',
  '/dashboard/events/new': 'Create Event',
  '/dashboard/announcements/new': 'Create Announcement',
  '/dashboard/qotd': 'Manage QOTD',
  '/dashboard/quiz': 'Quiz Manager',
  '/dashboard/upload': 'Upload Image',
  '/dashboard/problems/new': 'Create Problem',
  '/admin/users': 'User Management',
  '/admin/team': 'Team Management',
  '/admin/achievements': 'Achievements',
  '/admin/problems': 'Problems',
  '/admin/credits': 'Credits',
  '/admin/public-view': 'Public View',
  '/admin/hiring': 'Hiring Applications',
  '/admin/network': 'Network Management',
  '/admin/event-registrations': 'Event Registrations',
  '/admin/competition': 'Competition',
  '/admin/certificates': 'Certificates',
  '/admin/mail': 'Send Mail',
  '/admin/notifications': 'Notifications',
  '/admin/audit-log': 'Audit Log',
  '/admin/settings': 'Settings',
};

const CODING_TAB_LABELS: Record<string, string> = {
  practice: 'Coding · Practice',
  qotd: 'Coding · QOTD',
  competitions: 'Coding · Competitions',
  leaderboard: 'Coding · Leaderboard',
  playground: 'Coding · Playground',
};

function prettyRoute(pathname: string, search?: string): string {
  // /dashboard/coding gets a richer breadcrumb when a sub-tab is selected via ?tab=
  if (pathname === '/dashboard/coding' && search) {
    const params = new URLSearchParams(search);
    const tab = params.get('tab');
    if (tab && CODING_TAB_LABELS[tab]) return CODING_TAB_LABELS[tab];
  }
  if (breadcrumbNames[pathname]) return breadcrumbNames[pathname];
  for (const key of Object.keys(breadcrumbNames)) {
    if (pathname.startsWith(`${key}/`)) return breadcrumbNames[key];
  }
  const last = pathname.split('/').filter(Boolean).pop();
  return last ? last.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Dashboard';
}

function getNav(opts: {
  role: string;
  flags: {
    showLeaderboard: boolean;
    certificates: boolean;
    hiring: boolean;
    network: boolean;
    problems: boolean;
    competition: boolean;
  };
  pendingInvitationCount: number;
  isSuperAdminOrPresident: boolean;
}): NavSection[] {
  const { role, flags, pendingInvitationCount, isSuperAdminOrPresident } = opts;

  const everyone: NavItem[] = [
    { route: 'overview', href: '/dashboard', label: 'Overview', icon: Home },
    { route: 'events', href: '/dashboard/events', label: 'My Events', icon: Calendar },
    { route: 'announcements', href: '/dashboard/announcements', label: 'Announcements', icon: Megaphone },
  ];

  const coding: NavItem[] = [
    {
      route: 'coding',
      href: '/dashboard/coding',
      label: 'Coding',
      icon: Code,
      children: [
        { route: 'coding-practice', href: '/dashboard/coding?tab=practice', label: 'Practice', icon: Terminal },
        { route: 'coding-qotd', href: '/dashboard/coding?tab=qotd', label: 'QOTD', icon: Zap },
        { route: 'coding-competitions', href: '/dashboard/coding?tab=competitions', label: 'Competitions', icon: Trophy },
        ...(flags.showLeaderboard ? [{ route: 'coding-leaderboard', href: '/dashboard/coding?tab=leaderboard', label: 'Leaderboard', icon: Trophy }] : []),
        { route: 'coding-playground', href: getPlaygroundLaunchUrl(), label: 'Playground', icon: Code },
      ],
    },
    { route: 'quiz', href: '/quiz', label: 'Live Quiz', icon: Zap },
    ...(flags.showLeaderboard ? [{ route: 'leaderboard', href: '/dashboard/leaderboard', label: 'Leaderboard', icon: Trophy }] : []),
  ];

  const me: NavItem[] = [
    { route: 'profile', href: '/dashboard/profile', label: 'My Profile', icon: User },
    ...(flags.certificates ? [{ route: 'certificates', href: '/dashboard/certificates', label: 'My Certificates', icon: Award }] : []),
    { route: 'invitations', href: '/dashboard/invitations', label: 'My Invitations', icon: Inbox, badge: pendingInvitationCount },
  ];

  const create: NavItem[] = [
    { route: 'attendance', href: '/dashboard/attendance', label: 'Take Attendance', icon: ScanLine },
    { route: 'create-event', href: '/dashboard/events/new', label: 'Create Event', icon: Plus },
    { route: 'create-announcement', href: '/dashboard/announcements/new', label: 'Create Announcement', icon: Megaphone },
    { route: 'create-problem', href: '/dashboard/problems/new', label: 'Create Problem', icon: FileText },
    { route: 'manage-qotd', href: '/dashboard/qotd', label: 'Manage QOTD', icon: Zap },
    { route: 'quiz-manager', href: '/dashboard/quiz', label: 'Quiz Manager', icon: Play },
    { route: 'upload-image', href: '/dashboard/upload', label: 'Upload Image', icon: UploadIcon },
  ];

  const admin: NavItem[] = [
    { route: 'admin-users', href: '/admin/users', label: 'User Management', icon: Users },
    { route: 'admin-team', href: '/admin/team', label: 'Team Management', icon: Layers },
    { route: 'admin-achievements', href: '/admin/achievements', label: 'Achievements', icon: Star },
    ...(flags.problems ? [{ route: 'admin-problems', href: '/admin/problems', label: 'Problems', icon: Terminal }] : []),
    { route: 'admin-credits', href: '/admin/credits', label: 'Credits', icon: BookOpen },
    { route: 'admin-public-view', href: '/admin/public-view', label: 'Public View', icon: Activity },
    ...(flags.hiring ? [{ route: 'admin-hiring', href: '/admin/hiring', label: 'Hiring Applications', icon: Briefcase }] : []),
    ...(flags.network ? [{ route: 'admin-network', href: '/admin/network', label: 'Network Management', icon: Globe }] : []),
    { route: 'admin-event-registrations', href: '/admin/event-registrations', label: 'Event Registrations', icon: List },
    ...(flags.competition ? [{ route: 'admin-competition', href: '/admin/competition', label: 'Competition', icon: Trophy }] : []),
    ...(flags.certificates ? [{ route: 'admin-certificates', href: '/admin/certificates', label: 'Certificates', icon: Award }] : []),
    { route: 'admin-mail', href: '/admin/mail', label: 'Send Mail', icon: Mail },
    { route: 'admin-notifications', href: '/admin/notifications', label: 'Notifications', icon: Bell },
  ];

  // Network: stripped shell.
  if (role === 'NETWORK') {
    return [
      {
        section: null,
        items: [
          { route: 'events', href: '/dashboard/events', label: 'My Events', icon: Calendar },
          ...(flags.certificates ? [{ route: 'certificates', href: '/dashboard/certificates', label: 'My Certificates', icon: Award }] : []),
          { route: 'invitations', href: '/dashboard/invitations', label: 'My Invitations', icon: Inbox, badge: pendingInvitationCount },
        ],
      },
    ];
  }

  // USER
  if (role === 'USER' || role === 'MEMBER') {
    return [
      { section: null, items: everyone },
      { section: 'CODING', items: coding },
      { section: 'YOU', items: me },
    ];
  }

  // CORE_MEMBER
  if (role === 'CORE_MEMBER') {
    return [
      { section: null, items: everyone },
      { section: 'CODING', items: coding },
      { section: 'YOU', items: me },
      { section: 'CREATE', items: create },
    ];
  }

  // ADMIN
  if (role === 'ADMIN') {
    return [
      { section: null, items: everyone },
      { section: 'CODING', items: coding },
      { section: 'YOU', items: me },
      { section: 'CREATE', items: create },
      { section: 'ADMIN', items: admin },
      ...(isSuperAdminOrPresident
        ? [{ section: 'GOVERNANCE', items: [
            { route: 'admin-audit', href: '/admin/audit-log', label: 'Audit Log', icon: Shield },
            { route: 'admin-settings', href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
          ] }]
        : []),
    ];
  }

  // PRESIDENT / super admin
  return [
    { section: null, items: everyone },
    { section: 'CODING', items: coding },
    { section: 'YOU', items: me },
    { section: 'CREATE', items: create },
    { section: 'ADMIN', items: admin },
    {
      section: 'GOVERNANCE',
      items: [
        { route: 'admin-audit', href: '/admin/audit-log', label: 'Audit Log', icon: Shield },
        { route: 'admin-settings', href: '/admin/settings', label: 'Settings', icon: SettingsIcon },
      ],
    },
  ];
}

// Hrefs that are PARENT roots — never prefix-match. Required so e.g. `/dashboard`
// doesn't light up on `/dashboard/events`, `/dashboard/coding`, etc.
const SECTION_ROOTS = new Set(['/dashboard', '/admin', '/network', '/']);

function isActive(href: string, pathname: string, search: string): boolean {
  // Hrefs with a query (e.g. /dashboard/coding?tab=practice) MUST match exactly —
  // otherwise every sub-tab would highlight whenever you're on /dashboard/coding,
  // because the pathname-prefix match below ignores query params.
  if (href.includes('?')) {
    const full = pathname + search;
    return href === full;
  }
  // External links (Playground) are never active.
  if (href.startsWith('http')) return false;
  if (href === pathname) return true;
  // Section root hrefs (Overview) must match exactly — they're a prefix of every
  // sibling, so prefix-match would always light them up.
  if (SECTION_ROOTS.has(href)) return false;
  if (pathname.startsWith(`${href}/`)) return true;
  return false;
}

export default function DashboardLayout() {
  const { user, token, logout } = useAuth();
  const { settings } = useSettings();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_COLLAPSED) === 'true';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>('coding');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_COLLAPSED, String(collapsed));
  }, [collapsed]);

  // Inject Geist + Geist Mono lazily — only when the dashboard mounts, so
  // public pages don't ship those font files. Skip if already injected
  // (cheap re-mount cycles, e.g. SignIn → Dashboard).
  useEffect(() => {
    const id = 'dashboard-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);

  const isNetwork = user?.role === 'NETWORK';
  const isStaff = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const isSuperAdminOrPresident = Boolean(user?.isSuperAdmin) || user?.role === 'PRESIDENT';
  const needsProfile = user && !isStaff && !isNetwork && (!user.phone || !user.course || !user.branch || !user.year);

  useEffect(() => {
    if (needsProfile && !PROFILE_EXEMPT.has(location.pathname)) {
      navigate('/dashboard/profile');
    }
  }, [needsProfile, location.pathname, navigate]);

  // Cmd+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setMobileOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userMenuOpen]);

  // Invitation badge
  const invitationsQuery = useQuery({
    queryKey: ['invitations', 'my', 'layout-badge'],
    queryFn: () => api.getMyInvitations(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const pendingInvitationCount = useMemo(
    () => (invitationsQuery.data ?? []).filter((inv) => inv.status === 'PENDING').length,
    [invitationsQuery.data],
  );

  // Notification unread count for the bell dot
  const notifPreview = useQuery({
    queryKey: ['notifications', 'preview'],
    queryFn: () => api.getNotifications(token!),
    enabled: Boolean(token),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unreadNotifs = notifPreview.data?.unreadCount ?? 0;

  // Live socket — refreshes both preview + menu queries on any server-pushed event.
  useNotificationsSocket();

  const sections = useMemo(
    () =>
      getNav({
        role: user?.role ?? 'USER',
        flags: {
          showLeaderboard: settings?.showLeaderboard !== false,
          certificates: settings?.certificatesEnabled !== false,
          hiring: settings?.hiringEnabled !== false,
          network: settings?.showNetwork !== false,
          problems: settings?.problemsEnabled === true,
          competition: settings?.competitionEnabled === true,
        },
        pendingInvitationCount,
        isSuperAdminOrPresident,
      }),
    [user?.role, settings?.showLeaderboard, settings?.certificatesEnabled, settings?.hiringEnabled, settings?.showNetwork, settings?.problemsEnabled, settings?.competitionEnabled, pendingInvitationCount, isSuperAdminOrPresident],
  );

  const accent = (settings?.accentColor as string) || 'rust';

  // Resolve breadcrumb pretty name (sub-tabs reflected via ?tab=)
  const breadcrumb = prettyRoute(location.pathname, location.search);

  // Find the matched search query if any (for Coding subtabs)
  const fullPath = location.pathname + location.search;

  const handleNavigate = (href: string) => {
    if (href.startsWith('http')) {
      window.open(href, '_blank');
    } else {
      navigate(href);
    }
    setMobileOpen(false);
  };

  return (
    <div
      data-dashboard="true"
      data-accent={accent}
      data-density="regular"
      data-motion="normal"
      className="h-screen w-screen flex flex-col bg-[var(--bg-canvas)] text-[var(--ds-text-1)] antialiased"
    >
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <Sidebar
          collapsed={collapsed}
          sections={sections}
          role={user?.role ?? 'USER'}
          userName={user?.name ?? 'You'}
          userAvatar={user?.avatar ?? null}
          onCmdK={() => setCmdkOpen(true)}
          onNavigate={handleNavigate}
          activePath={fullPath}
          openGroup={openGroup}
          setOpenGroup={setOpenGroup}
          onLogout={logout}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          className="hidden lg:flex"
        />

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            />
            <div className="absolute left-0 top-0 bottom-0">
              <Sidebar
                collapsed={false}
                sections={sections}
                role={user?.role ?? 'USER'}
                userName={user?.name ?? 'You'}
                userAvatar={user?.avatar ?? null}
                onCmdK={() => {
                  setCmdkOpen(true);
                  setMobileOpen(false);
                }}
                onNavigate={handleNavigate}
                activePath={fullPath}
                openGroup={openGroup}
                setOpenGroup={setOpenGroup}
                onLogout={logout}
                onClose={() => setMobileOpen(false)}
                mobile
              />
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-[56px] frost border-b border-[var(--border-subtle)] flex items-center px-3 sm:px-4 gap-2 shrink-0 sticky top-0 z-30">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden size-9 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-2)] flex items-center justify-center"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            <div className="hidden sm:flex items-center gap-1.5 text-[13px] text-[var(--ds-text-3)] whitespace-nowrap min-w-0">
              <Link to="/dashboard" className="hover:text-[var(--ds-text-1)] transition-colors font-medium">Dashboard</Link>
              {location.pathname !== '/dashboard' && (
                <>
                  <ChevronRight size={12} className="opacity-50 shrink-0" />
                  <span className="text-[var(--ds-text-1)] font-medium truncate">{breadcrumb}</span>
                </>
              )}
            </div>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setCmdkOpen(true)}
              className="hidden md:inline-flex items-center gap-2 h-8 px-2.5 rounded-[7px] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:border-[var(--border-default)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-2)] text-[12.5px] transition-colors min-w-[220px]"
            >
              <Search size={13} />
              <span className="flex-1 text-left">Search anything…</span>
              <span className="flex items-center gap-0.5">
                <KBD>⌘</KBD>
                <KBD>K</KBD>
              </span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="size-9 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)] flex items-center justify-center transition-colors"
              aria-label="Toggle theme"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="relative">
              <button
                ref={bellRef}
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="size-9 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)] flex items-center justify-center transition-colors relative"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadNotifs > 0 && (
                  <span className="absolute top-1 right-1 size-[6px] rounded-full bg-[var(--accent)] ring-2 ring-[var(--bg-canvas)]" />
                )}
              </button>
            </div>

            {/* Avatar menu */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((o) => !o)}
                className="ml-1 inline-flex items-center gap-1.5 h-9 pl-1 pr-2 rounded-[10px] hover:bg-[var(--surface-soft)] transition-colors"
                aria-label="User menu"
              >
                <Avatar name={user?.name ?? 'You'} src={user?.avatar} size={26} />
                <ChevronDown size={12} className="text-[var(--ds-text-3)]" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-[44px] w-[220px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] rounded-[10px] shadow-[var(--shadow-lg)] overflow-hidden z-[60]">
                  <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
                    <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate">{user?.name}</div>
                    <div className="text-[11px] text-[var(--ds-text-3)] truncate mt-0.5">{user?.email}</div>
                    {user?.role && (
                      <Pill tone={roleTone(user.role)} size="xs" className="mt-1.5">
                        {user.role.replace(/_/g, ' ')}
                      </Pill>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); navigate('/dashboard/profile'); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-[12.5px] hover:bg-[var(--surface-soft)] text-left"
                  >
                    <User size={13} className="text-[var(--ds-text-3)]" />
                    My profile
                  </button>
                  {settings?.certificatesEnabled !== false && (
                    <button
                      type="button"
                      onClick={() => { setUserMenuOpen(false); navigate('/dashboard/certificates'); }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-[12.5px] hover:bg-[var(--surface-soft)] text-left"
                    >
                      <Award size={13} className="text-[var(--ds-text-3)]" />
                      My certificates
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); navigate('/'); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-[12.5px] hover:bg-[var(--surface-soft)] text-left"
                  >
                    <Globe size={13} className="text-[var(--ds-text-3)]" />
                    Back to homepage
                  </button>
                  <div className="border-t border-[var(--border-subtle)]" />
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full px-3 py-2 flex items-center gap-2 text-[12.5px] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] text-left text-[var(--ds-text-2)]"
                  >
                    <LogOut size={13} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* Page content */}
          <main
            id="dashboard-main"
            className={cn(
              'flex-1 overflow-y-auto p-4 sm:p-6',
              // Padding bottom for mobile bottom-tab; admin variant gets extra
              'pb-[88px] lg:pb-6',
            )}
          >
            <div className="mx-auto max-w-[1400px] w-full min-w-0">
              <Outlet />
            </div>
          </main>

          {/* Mobile bottom tab */}
          {!isNetwork && (
            <BottomTab
              activePath={fullPath}
              onNavigate={handleNavigate}
              showLeaderboard={settings?.showLeaderboard !== false}
            />
          )}
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
      <NotifMenu open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={bellRef} />
    </div>
  );
}

// ─── Sidebar
function Sidebar(props: {
  collapsed: boolean;
  sections: NavSection[];
  role: string;
  userName: string;
  userAvatar: string | null;
  onCmdK: () => void;
  onNavigate: (href: string) => void;
  activePath: string;
  openGroup: string | null;
  setOpenGroup: (v: string | null) => void;
  onLogout: () => void;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  mobile?: boolean;
  className?: string;
}) {
  const {
    collapsed, sections, role, userName, userAvatar, onCmdK, onNavigate, activePath,
    openGroup, setOpenGroup, onLogout, onToggleCollapse, onClose, mobile = false, className,
  } = props;

  return (
    <aside
      className={cn(
        'h-full flex flex-col bg-[var(--bg-sunken)] border-r border-[var(--border-subtle)]',
        'transition-[width] duration-200',
        mobile ? 'w-[272px]' : collapsed ? 'w-[60px]' : 'w-[244px]',
        className,
      )}
    >
      {/* Brand */}
      <div className={cn('flex items-center gap-2.5 h-[56px] px-3 shrink-0', collapsed && !mobile && 'justify-center px-0')}>
        <Link to="/" className={cn('flex items-center gap-2.5 min-w-0', collapsed && !mobile && 'gap-0')}>
          <img
            src="/logo.jpeg"
            alt="SCRIET"
            className="size-7 shrink-0 rounded-full object-cover ring-1 ring-[var(--border-default)] shadow-[var(--shadow-xs)]"
          />
          {(!collapsed || mobile) && (
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold tracking-tight text-[var(--ds-text-1)] leading-tight flex items-baseline">
                <span>code</span>
                <span className="text-[var(--accent)]">.</span>
                <span>scriet</span>
              </div>
              <div className="text-[10px] text-[var(--ds-text-3)] leading-tight mt-0.5">CCSU coding club</div>
            </div>
          )}
        </Link>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-[7px] hover:bg-[var(--surface-soft)] flex items-center justify-center text-[var(--ds-text-3)]"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search shortcut */}
      {(!collapsed || mobile) ? (
        <button
          type="button"
          onClick={onCmdK}
          className="mx-3 mt-1 h-8 px-2.5 rounded-[7px] inline-flex items-center gap-2 text-[12.5px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--ds-text-3)] hover:border-[var(--border-default)] hover:text-[var(--ds-text-2)] transition-colors"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search</span>
          <span className="flex items-center gap-0.5">
            <KBD>⌘</KBD>
            <KBD>K</KBD>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onCmdK}
          className="mx-auto mt-1 size-9 rounded-[8px] hover:bg-[var(--surface-soft)] text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] flex items-center justify-center"
          title="Search (⌘K)"
          aria-label="Search"
        >
          <Search size={16} />
        </button>
      )}

      {/* Sections */}
      <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-3.5', collapsed && !mobile ? 'px-2 items-center' : 'px-3')}>
        {sections.map((sec, i) => (
          <div key={i} className={cn('flex flex-col w-full', collapsed && !mobile ? 'gap-1 items-center' : 'gap-0.5')}>
            {sec.section && (!collapsed || mobile) && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ds-text-3)] px-2 mb-1">
                {sec.section}
              </div>
            )}
            {sec.section && collapsed && !mobile && <div className="w-6 h-px bg-[var(--border-subtle)] my-1" />}
            {sec.items.map((item) => (
              <SidebarItem
                key={item.route}
                item={item}
                collapsed={collapsed && !mobile}
                activePath={activePath}
                openGroup={openGroup}
                setOpenGroup={setOpenGroup}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* User card + logout + (desktop) collapse toggle */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2 space-y-1">
        {!mobile && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={cn(
              'w-full flex items-center gap-2 h-8 rounded-[7px] text-[12.5px] text-[var(--ds-text-3)] hover:bg-[var(--surface-soft)] hover:text-[var(--ds-text-1)] transition-colors',
              collapsed ? 'justify-center px-0' : 'px-2',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!collapsed && <span className="flex-1 text-left">Collapse</span>}
          </button>
        )}

        <div className={cn('flex items-center gap-2.5 p-1.5 rounded-[8px] hover:bg-[var(--surface-soft)] cursor-default', collapsed && !mobile && 'justify-center')}>
          <Avatar name={userName} src={userAvatar} size={28} status="online" />
          {(!collapsed || mobile) && (
            <>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-medium text-[var(--ds-text-1)] truncate leading-tight">{userName}</div>
                <div className="text-[11px] text-[var(--ds-text-3)] truncate leading-tight mt-0.5">
                  <Pill tone={roleTone(role)} size="xs">{role.replace(/_/g, ' ')}</Pill>
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="size-7 rounded-[6px] hover:bg-[var(--danger-bg)] text-[var(--ds-text-3)] hover:text-[var(--danger)] flex items-center justify-center transition-colors shrink-0"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={13} />
              </button>
            </>
          )}
          {collapsed && !mobile && (
            <button
              type="button"
              onClick={onLogout}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            >
              <MoreHorizontal size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  collapsed,
  activePath,
  openGroup,
  setOpenGroup,
  onNavigate,
  depth = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  activePath: string;
  openGroup: string | null;
  setOpenGroup: (v: string | null) => void;
  onNavigate: (href: string) => void;
  depth?: number;
}) {
  const Icon = item.icon;
  const hasChildren = !!item.children?.length;
  const pathOnly = activePath.split('?')[0];
  const searchOnly = activePath.includes('?') ? '?' + activePath.split('?')[1] : '';
  // Parent with children is "active" only when one of its children matches the full URL.
  // Without this, the parent `/dashboard/coding` would highlight every child simultaneously.
  const selfActive = !hasChildren && isActive(item.href, pathOnly, searchOnly);
  const childActive = hasChildren && item.children!.some((c) => isActive(c.href, pathOnly, searchOnly));
  const active = selfActive || childActive;
  const isOpen = openGroup === item.route;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            onNavigate(item.children![0].href);
          } else {
            onNavigate(item.href);
          }
        }}
        className={cn(
          'size-9 flex items-center justify-center rounded-[8px] transition-colors duration-[120ms] relative',
          active
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
            : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)] hover:bg-[var(--surface-soft)]',
        )}
        title={item.label}
        aria-label={item.label}
      >
        <Icon size={17} />
        {item.badge != null && item.badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-[14px] rounded-full bg-[var(--accent)] text-white text-[9px] font-semibold tabular-nums flex items-center justify-center">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => {
          if (hasChildren) {
            setOpenGroup(isOpen ? null : item.route);
            if (!isOpen) onNavigate(item.children![0].href);
          } else {
            onNavigate(item.href);
          }
        }}
        className={cn(
          'w-full h-8 px-2 rounded-[7px] inline-flex items-center gap-2.5',
          'transition-colors duration-[120ms] text-[13px] leading-none',
          depth > 0 && 'ml-[26px] w-[calc(100%-26px)] h-7 text-[12.5px]',
          active && !hasChildren
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
            : active && hasChildren
            ? 'text-[var(--ds-text-1)] font-medium'
            : 'text-[var(--ds-text-2)] hover:bg-[var(--surface-soft)] hover:text-[var(--ds-text-1)]',
        )}
      >
        {depth === 0 && <Icon size={15} className="shrink-0 opacity-90" />}
        {depth > 0 && <span className="size-[3px] rounded-full bg-current opacity-50" />}
        <span className="flex-1 text-left truncate">{item.label}</span>
        {item.badge != null && item.badge > 0 && (
          <span
            className={cn(
              'h-[18px] min-w-[18px] px-1 rounded-full text-[10.5px] tabular-nums font-semibold inline-flex items-center justify-center',
              active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-soft)] text-[var(--ds-text-2)]',
            )}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
        {hasChildren && (
          <ChevronRight
            size={12}
            className={cn('opacity-50 transition-transform duration-[180ms]', isOpen && 'rotate-90')}
          />
        )}
      </button>
      {hasChildren && isOpen && (
        <div className="mt-0.5 flex flex-col gap-px">
          {item.children!.map((c) => (
            <SidebarItem
              key={c.route}
              item={c}
              collapsed={false}
              activePath={activePath}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              onNavigate={onNavigate}
              depth={1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile bottom tab
function BottomTab({
  activePath,
  onNavigate,
  showLeaderboard,
}: {
  activePath: string;
  onNavigate: (href: string) => void;
  showLeaderboard: boolean;
}) {
  void showLeaderboard;
  const path = activePath.split('?')[0];
  const tabs: Array<{ href: string; label: string; icon: IconCmp; match?: (p: string) => boolean }> = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/dashboard/events', label: 'Events', icon: Calendar },
    { href: '/dashboard/coding', label: 'Coding', icon: Code, match: (p) => p.startsWith('/dashboard/coding') || p.startsWith('/qotd') || p.startsWith('/competition') },
    { href: '/dashboard/profile', label: 'Profile', icon: User },
  ];
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 frost border-t border-[var(--border-subtle)] flex items-stretch"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      {tabs.map((t) => {
        const isActiveTab = t.match ? t.match(path) : path === t.href;
        const Icon = t.icon;
        return (
          <button
            key={t.href}
            type="button"
            onClick={() => onNavigate(t.href)}
            className={cn(
              'flex-1 h-[56px] flex flex-col items-center justify-center gap-1 transition-colors',
              isActiveTab ? 'text-[var(--accent)]' : 'text-[var(--ds-text-3)]',
            )}
          >
            <Icon size={20} />
            <span className="text-[10.5px] font-medium">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
