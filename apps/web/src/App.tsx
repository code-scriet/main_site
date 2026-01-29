import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { SocketProvider } from '@/context/SocketContext';

// Pages
import HomePage from '@/pages/HomePage';
import AboutPage from '@/pages/AboutPage';
import EventsPage from '@/pages/EventsPage';
import EventDetailPage from '@/pages/EventDetailPage';
import TeamPage from '@/pages/TeamPage';
import AchievementsPage from '@/pages/AchievementsPage';
import AnnouncementsPage from '@/pages/AnnouncementsPage';
import SignInPage from '@/pages/SignInPage';
import JoinUsPage from '@/pages/JoinUsPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

// Dashboard
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import DashboardOverview from '@/pages/dashboard/DashboardOverview';
import DashboardEvents from '@/pages/dashboard/DashboardEvents';
import DashboardAnnouncements from '@/pages/dashboard/DashboardAnnouncements';
import DashboardLeaderboard from '@/pages/dashboard/DashboardLeaderboard';
import CreateEvent from '@/pages/dashboard/CreateEvent';
import CreateAnnouncement from '@/pages/dashboard/CreateAnnouncement';
import CreateQOTD from '@/pages/dashboard/CreateQOTD';
import ProfilePage from '@/pages/dashboard/ProfilePage';
import ImageUploadTool from '@/pages/dashboard/ImageUploadTool';

// Admin Pages
import AdminUsers from '@/pages/admin/AdminUsers';
import AdminTeam from '@/pages/admin/AdminTeam';
import AdminSettings from '@/pages/admin/AdminSettings';
import AdminEventRegistrations from '@/pages/admin/AdminEventRegistrations';
import EditEvent from '@/pages/admin/EditEvent';
import AdminHiring from '@/pages/admin/AdminHiring';

// Auth Components
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <AuthProvider>
          <SettingsProvider>
            <Router>
            <Routes>
            {/* Public Routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignInPage />} />
            <Route path="/join-us" element={<JoinUsPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Protected User Routes */}
            <Route element={<ProtectedRoute minRole="USER" />}>
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="events" element={<DashboardEvents />} />
                <Route path="announcements" element={<DashboardAnnouncements />} />
                <Route path="leaderboard" element={<DashboardLeaderboard />} />
                {/* Core Member can create events/announcements */}
                <Route path="events/new" element={<CreateEvent />} />
                <Route path="announcements/new" element={<CreateAnnouncement />} />
                <Route path="qotd" element={<CreateQOTD />} />
                <Route path="upload" element={<ImageUploadTool />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
            </Route>

            {/* Protected Admin Routes */}
            <Route element={<ProtectedRoute minRole="ADMIN" />}>
              <Route path="/admin" element={<DashboardLayout />}>
                <Route path="users" element={<AdminUsers />} />
                <Route path="team" element={<AdminTeam />} />
                <Route path="event-registrations" element={<AdminEventRegistrations />} />
                <Route path="events/:id/edit" element={<EditEvent />} />
                <Route path="hiring" element={<AdminHiring />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
        </SettingsProvider>
      </AuthProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-amber-600 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Page not found</p>
        <a href="/" className="text-amber-600 hover:underline">Go back home</a>
      </div>
    </div>
  );
}

export default App;