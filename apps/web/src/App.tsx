import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { SocketProvider } from '@/context/SocketContext';

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-amber-50">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-600 border-t-transparent" />
  </div>
);

// Lazy load all pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'));
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage'));
const SignInPage = lazy(() => import('@/pages/SignInPage'));
const JoinUsPage = lazy(() => import('@/pages/JoinUsPage'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));

// Dashboard - lazy loaded
const DashboardLayout = lazy(() => import('@/components/dashboard/DashboardLayout'));
const DashboardOverview = lazy(() => import('@/pages/dashboard/DashboardOverview'));
const DashboardEvents = lazy(() => import('@/pages/dashboard/DashboardEvents'));
const DashboardAnnouncements = lazy(() => import('@/pages/dashboard/DashboardAnnouncements'));
const DashboardLeaderboard = lazy(() => import('@/pages/dashboard/DashboardLeaderboard'));
const CreateEvent = lazy(() => import('@/pages/dashboard/CreateEvent'));
const CreateAnnouncement = lazy(() => import('@/pages/dashboard/CreateAnnouncement'));
const CreateQOTD = lazy(() => import('@/pages/dashboard/CreateQOTD'));
const ProfilePage = lazy(() => import('@/pages/dashboard/ProfilePage'));
const ImageUploadTool = lazy(() => import('@/pages/dashboard/ImageUploadTool'));

// Admin Pages - lazy loaded
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminTeam = lazy(() => import('@/pages/admin/AdminTeam'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminEventRegistrations = lazy(() => import('@/pages/admin/AdminEventRegistrations'));
const EditEvent = lazy(() => import('@/pages/admin/EditEvent'));
const AdminHiring = lazy(() => import('@/pages/admin/AdminHiring'));

// Auth Components - keep synchronous for faster auth checks
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false, // Reduce unnecessary refetches
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
              <Suspense fallback={<PageLoader />}>
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
              </Suspense>
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