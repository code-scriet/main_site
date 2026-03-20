import { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import {
  Home,
  Calendar,
  Bell,
  Trophy,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Users,
  Shield,
  Code,
  UserPlus,
  User,
  Upload,
  ClipboardList,
  Mail,
  Zap,
  Award,
  QrCode,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const breadcrumbNames: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/events': 'My Events',
  '/dashboard/announcements': 'Announcements',
  '/dashboard/profile': 'Profile',
  '/dashboard/certificates': 'Certificates',
  '/dashboard/leaderboard': 'Leaderboard',
  '/dashboard/events/new': 'Create Event',
  '/dashboard/announcements/new': 'Create Announcement',
  '/dashboard/qotd': 'Manage QOTD',
  '/dashboard/quiz': 'Quiz Manager',
  '/dashboard/upload': 'Upload Image',
  '/dashboard/attendance': 'Take Attendance',
  '/admin/competition': 'Competition',
};

const PROFILE_EXEMPT_PATHS = new Set(['/dashboard/profile', '/dashboard/certificates']);

const coreMemberNavItems = [
  { id: 'core-attendance', name: 'Take Attendance', href: '/dashboard/attendance', icon: QrCode },
  { id: 'core-create-event', name: 'Create Event', href: '/dashboard/events/new', icon: Calendar },
  { id: 'core-create-announcement', name: 'Create Announcement', href: '/dashboard/announcements/new', icon: Bell },
  { id: 'core-qotd', name: 'Manage QOTD', href: '/dashboard/qotd', icon: Code },
  { id: 'core-quiz', name: 'Quiz Manager', href: '/dashboard/quiz', icon: Zap },
  { id: 'core-upload', name: 'Upload Image', href: '/dashboard/upload', icon: Upload },
] satisfies NavItem[];

const getAdminNavItems = (hiringEnabled: boolean, showNetwork: boolean, certificatesEnabled: boolean, isSuperAdmin?: boolean, isPresident?: boolean) => {
  const items = [
    { id: 'admin-users', name: 'User Management', href: '/admin/users', icon: Users },
    { id: 'admin-team', name: 'Team Management', href: '/admin/team', icon: Shield },
    { id: 'admin-achievements', name: 'Achievements', href: '/admin/achievements', icon: Trophy },
    { id: 'admin-credits', name: 'Credits', href: '/admin/credits', icon: Award },
  ] satisfies NavItem[];

  if (hiringEnabled !== false) {
    items.push({ id: 'admin-hiring', name: 'Hiring Applications', href: '/admin/hiring', icon: UserPlus });
  }

  if (showNetwork !== false) {
    items.push({ id: 'admin-network', name: 'Network Management', href: '/admin/network', icon: Users });
  }

  if (isSuperAdmin || isPresident) {
    items.push({ id: 'admin-audit', name: 'Audit Log', href: '/admin/audit-log', icon: ClipboardList });
  }

  items.push(
    { id: 'admin-registrations', name: 'Event Registrations', href: '/admin/event-registrations', icon: Calendar },
    { id: 'admin-competition', name: 'Competition', href: '/admin/competition', icon: Trophy },
  );

  if (certificatesEnabled !== false) {
    items.push({ id: 'admin-certificates', name: 'Certificates', href: '/admin/certificates', icon: Award });
  }

  items.push(
    { id: 'admin-mail', name: 'Send Mail', href: '/admin/mail', icon: Mail },
    { id: 'admin-settings', name: 'Settings', href: '/admin/settings', icon: Settings }
  );

  return items;
};

function hrefPathname(href: string): string {
  return href.split('?')[0];
}

function isNavHrefActive(href: string, pathname: string): boolean {
  const path = hrefPathname(href);
  return pathname === path || pathname.startsWith(`${path}/`);
}

function resolveActiveNavId(items: NavItem[], pathname: string, search: string): string | null {
  const fullUrl = pathname + search;
  const exactFull = items.find((item) => item.href === fullUrl);
  if (exactFull) return exactFull.id;

  const matches = items.filter((item) => isNavHrefActive(item.href, pathname));
  if (matches.length === 0) return null;

  const exactMatches = matches.filter((item) => hrefPathname(item.href) === pathname);
  const ranked = (exactMatches.length > 0 ? exactMatches : matches).sort((a, b) => hrefPathname(b.href).length - hrefPathname(a.href).length);
  return ranked[0]?.id ?? null;
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [clickedNavId, setClickedNavId] = useState<string | null>(null);
  const { user, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  const isStaff = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const needsProfileCompletion = user && !isStaff && (!user.phone || !user.course || !user.branch || !user.year);

  useEffect(() => {
    if (needsProfileCompletion && !PROFILE_EXEMPT_PATHS.has(location.pathname)) {
      navigate('/dashboard/profile');
    }
  }, [needsProfileCompletion, location.pathname, navigate]);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN' || user?.role === 'PRESIDENT';
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'PRESIDENT';

  const userNavItems = useMemo<NavItem[]>(() => [
    { id: 'user-overview', name: 'Overview', href: '/dashboard', icon: Home },
    { id: 'user-events', name: 'My Events', href: '/dashboard/events', icon: Calendar },
    { id: 'user-announcements', name: 'Announcements', href: '/dashboard/announcements', icon: Bell },
    { id: 'user-live-quiz', name: 'Live Quiz', href: '/quiz', icon: Zap },
    ...(settings?.showLeaderboard !== false ? [{ id: 'user-leaderboard', name: 'Leaderboard', href: '/dashboard/leaderboard', icon: Trophy }] : []),
    { id: 'user-profile', name: 'My Profile', href: '/dashboard/profile', icon: User },
    ...(settings?.certificatesEnabled !== false ? [{ id: 'user-certificates', name: 'My Certificates', href: '/dashboard/certificates', icon: Award }] : []),
  ], [settings?.showLeaderboard, settings?.certificatesEnabled]);

  const adminNavItems = useMemo<NavItem[]>(() => {
    if (!isAdmin) return [];
    return getAdminNavItems(
      !settingsLoading && settings?.hiringEnabled === true,
      !settingsLoading && settings?.showNetwork !== false,
      !settingsLoading && settings?.certificatesEnabled !== false,
      user?.isSuperAdmin,
      user?.role === 'PRESIDENT',
    );
  }, [isAdmin, settingsLoading, settings?.hiringEnabled, settings?.showNetwork, settings?.certificatesEnabled, user?.isSuperAdmin, user?.role]);

  const allNavItems = useMemo(
    () => [
      ...userNavItems,
      ...(isCoreMember ? coreMemberNavItems : []),
      ...adminNavItems,
    ],
    [userNavItems, isCoreMember, adminNavItems],
  );

  const routeActiveNavId = useMemo(
    () => resolveActiveNavId(allNavItems, location.pathname, location.search),
    [allNavItems, location.pathname, location.search],
  );

  const activeNavId = useMemo(() => {
    if (!clickedNavId) return routeActiveNavId;
    const clickedNav = allNavItems.find((item) => item.id === clickedNavId);
    if (clickedNav && isNavHrefActive(clickedNav.href, location.pathname)) return clickedNav.id;
    return routeActiveNavId;
  }, [clickedNavId, allNavItems, location.pathname, routeActiveNavId]);

  const handleNavClick = (navId: string) => {
    setClickedNavId(navId);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-white border-r border-amber-100/80 shadow-sm transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarCollapsed ? 'w-[86px]' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center border-b border-amber-100 shrink-0',
          sidebarCollapsed ? 'justify-center py-4' : 'justify-between px-5 py-4'
        )}>
          <Link to="/" className={cn('flex items-center', sidebarCollapsed ? 'w-full justify-center' : 'gap-3 min-w-0')}>
            <div className={cn(
              'rounded-xl overflow-hidden shrink-0 ring-1 ring-amber-200 bg-white',
              sidebarCollapsed ? 'h-12 w-12' : 'h-10 w-10'
            )}>
              <img src="/logo.jpeg" alt="code.scriet" className="h-full w-full object-contain p-0.5" />
            </div>
            {!sidebarCollapsed && (
              <span className="text-base font-bold text-amber-900 tracking-tight">code.scriet</span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 hover:bg-amber-50 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-amber-400" />
          </button>
        </div>

        {/* User info */}
        {!sidebarCollapsed ? (
          <div className="px-4 py-3 border-b border-amber-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full overflow-hidden bg-amber-50 ring-1 ring-amber-200 shrink-0">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-amber-700 font-semibold text-sm">
                    {user?.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 text-sm truncate leading-tight">{user?.name}</p>
                <p
                  className="text-xs text-amber-600 font-medium mt-0.5 truncate"
                  title={user?.role?.replace(/_/g, ' ')}
                >
                  {user?.role?.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 border-b border-amber-100 flex justify-center shrink-0">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-amber-50 ring-1 ring-amber-200">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-amber-700 font-semibold text-sm">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {/* User section */}
          {!sidebarCollapsed && (
            <p className="text-xs font-bold text-amber-500 uppercase tracking-wide px-3 pb-2 pt-1">
              Dashboard
            </p>
          )}
          {userNavItems.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              isActive={activeNavId === item.id}
              onNavigate={() => handleNavClick(item.id)}
              collapsed={sidebarCollapsed}
            />
          ))}

          {/* Core Member section */}
          {isCoreMember && (
            <>
              <div className={cn('pt-4 pb-1', sidebarCollapsed && 'pt-3 pb-0.5')}>
                <div className="border-t border-amber-100" />
                {!sidebarCollapsed && (
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wide px-3 pt-3 pb-1">
                    Core Member
                  </p>
                )}
              </div>
              {coreMemberNavItems.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  isActive={activeNavId === item.id}
                  onNavigate={() => handleNavClick(item.id)}
                  collapsed={sidebarCollapsed}
                />
              ))}
            </>
          )}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className={cn('pt-4 pb-1', sidebarCollapsed && 'pt-3 pb-0.5')}>
                <div className="border-t border-amber-100" />
                {!sidebarCollapsed && (
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wide px-3 pt-3 pb-1">
                    Admin
                  </p>
                )}
              </div>
              {adminNavItems.map((item) => (
                <NavLink
                  key={item.id}
                  item={item}
                  isActive={activeNavId === item.id}
                  onNavigate={() => handleNavClick(item.id)}
                  collapsed={sidebarCollapsed}
                />
              ))}
            </>
          )}
        </nav>

        {/* Bottom actions */}
        <div className="p-3 border-t border-amber-100 space-y-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'hidden lg:flex w-full text-gray-400 hover:text-gray-700 hover:bg-amber-50 transition-colors',
              sidebarCollapsed ? 'justify-center px-2' : 'justify-start'
            )}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5 mr-2" />
                <span className="text-sm font-medium">Collapse</span>
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            className={cn(
              'w-full text-gray-400 hover:text-red-600 hover:bg-red-50 font-medium transition-colors',
              sidebarCollapsed ? 'justify-center px-2' : 'justify-start'
            )}
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
            {!sidebarCollapsed && <span className="ml-2 text-sm">Logout</span>}
          </Button>
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className={cn('transition-all duration-300', sidebarCollapsed ? 'lg:pl-[86px]' : 'lg:pl-64')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 border-b border-gray-200/60 h-14 flex items-center px-3 sm:px-5 lg:px-7 gap-3 sm:gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>

          <div className="flex min-w-0 items-center text-sm text-gray-500">
            <Link to="/dashboard" className="hover:text-gray-800 transition-colors font-medium">
              Dashboard
            </Link>
            {location.pathname !== '/dashboard' && (
              <>
                <ChevronRight className="h-3.5 w-3.5 mx-1.5 text-gray-300 shrink-0" />
                <span className="truncate text-gray-900 font-semibold">
                  {breadcrumbNames[location.pathname] ||
                    location.pathname.split('/').pop()?.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8 w-full min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  isActive,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      title={collapsed ? item.name : undefined}
      className={cn(
        'flex items-center rounded-xl transition-all duration-150',
        collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-amber-500 text-white font-semibold shadow-sm shadow-amber-200'
          : 'text-gray-700 hover:bg-amber-50 hover:text-amber-900'
      )}
    >
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          isActive ? 'text-white' : 'text-amber-500'
        )}
      />
      {!collapsed && <span className="text-sm leading-none">{item.name}</span>}
    </Link>
  );
}
