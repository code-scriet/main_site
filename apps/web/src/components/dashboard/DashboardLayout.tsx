import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const coreMemberNavItems = [
  { name: 'Create Event', href: '/dashboard/events/new', icon: Calendar },
  { name: 'Create Announcement', href: '/dashboard/announcements/new', icon: Bell },
  { name: 'Manage QOTD', href: '/dashboard/qotd', icon: Code },
  { name: 'Upload Image', href: '/dashboard/upload', icon: Upload },
];

// Admin nav items - Hiring will be conditionally added based on settings
const getAdminNavItems = (hiringEnabled: boolean) => {
  const items = [
    { name: 'User Management', href: '/admin/users', icon: Users },
    { name: 'Team Management', href: '/admin/team', icon: Shield },
    { name: 'Achievements', href: '/admin/achievements', icon: Trophy },
  ];
  
  if (hiringEnabled !== false) {
    items.push({ name: 'Hiring Applications', href: '/admin/hiring', icon: UserPlus });
  }
  
  items.push(
    { name: 'Event Registrations', href: '/admin/event-registrations', icon: Calendar },
    { name: 'Settings', href: '/admin/settings', icon: Settings }
  );
  
  return items;
};

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const location = useLocation();
  const navigate = useNavigate();

  // Check if academic details are missing
  const needsProfileCompletion = user && (!user.phone || !user.course || !user.branch || !user.year);
  const isOnProfilePage = location.pathname === '/dashboard/profile';

  // Redirect to profile page if academic details are missing (except when already on profile)
  useEffect(() => {
    if (needsProfileCompletion && !isOnProfilePage) {
      navigate('/dashboard/profile');
    }
  }, [needsProfileCompletion, isOnProfilePage, navigate]);

  const isCoreMember = user?.role === 'CORE_MEMBER' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  // Build user nav items based on settings
  const userNavItems = [
    { name: 'Overview', href: '/dashboard', icon: Home },
    { name: 'My Events', href: '/dashboard/events', icon: Calendar },
    { name: 'Announcements', href: '/dashboard/announcements', icon: Bell },
    // Only show leaderboard if enabled in settings
    ...(settings?.showLeaderboard !== false ? [{ name: 'Leaderboard', href: '/dashboard/leaderboard', icon: Trophy }] : []),
    { name: 'My Profile', href: '/dashboard/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-amber-200 transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-amber-200">
            <Link to="/" className="flex items-center space-x-2">
              <div className="h-10 w-10 rounded-lg overflow-hidden">
                <img src="/logo.jpeg" alt="code.scriet" className="h-full w-full object-cover" />
              </div>
              <span className="text-lg font-bold text-amber-900">code.scriet</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 hover:bg-amber-100 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="p-4 border-b border-amber-200">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-full overflow-hidden bg-amber-200">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold">
                    {user?.name?.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium text-amber-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Dashboard
            </p>
            {userNavItems.map((item) => (
              <NavLink key={item.href} item={item} isActive={location.pathname === item.href} />
            ))}

            {isCoreMember && (
              <>
                <div className="pt-4 pb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Core Member
                  </p>
                </div>
                {coreMemberNavItems.map((item) => (
                  <NavLink key={item.href} item={item} isActive={location.pathname === item.href} />
                ))}
              </>
            )}

            {isAdmin && (
              <>
                <div className="pt-4 pb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Admin
                  </p>
                </div>
                {getAdminNavItems(!settingsLoading && settings?.hiringEnabled === true).map((item) => (
                  <NavLink key={item.href} item={item} isActive={location.pathname === item.href} />
                ))}
              </>
            )}
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-amber-200">
            <Button
              variant="ghost"
              className="w-full justify-start text-gray-600 hover:text-red-600 hover:bg-red-50"
              onClick={logout}
            >
              <LogOut className="h-5 w-5 mr-3" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-amber-200 h-16 flex items-center px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-amber-100 rounded-lg mr-4"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center text-sm text-gray-500">
            <Link to="/dashboard" className="hover:text-amber-600">
              Dashboard
            </Link>
            {location.pathname !== '/dashboard' && (
              <>
                <ChevronRight className="h-4 w-4 mx-1" />
                <span className="text-amber-900 font-medium">
                  {location.pathname.split('/').pop()?.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200',
        isActive
          ? 'bg-gradient-to-r from-amber-100 to-orange-50 text-amber-900 font-medium'
          : 'text-gray-600 hover:bg-amber-50 hover:text-amber-900'
      )}
    >
      <Icon className="h-5 w-5" />
      <span>{item.name}</span>
    </Link>
  );
}
