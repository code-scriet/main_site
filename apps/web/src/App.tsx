import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SEO } from '@/components/SEO';

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-amber-50">
    <Loader2 className="h-12 w-12 animate-spin text-amber-600" />
  </div>
);

function RouteBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function withRouteBoundary(element: ReactNode) {
  return <RouteBoundary>{element}</RouteBoundary>;
}

function ScrollToTopOnNavigation() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.search]);

  return null;
}

// Lazy load all pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage'));
const AboutPage = lazy(() => import('@/pages/AboutPage'));
const EventsPage = lazy(() => import('@/pages/EventsPage'));
const EventDetailPage = lazy(() => import('@/pages/EventDetailPage'));
const TeamPage = lazy(() => import('@/pages/TeamPage'));
const TeamMemberProfilePage = lazy(() => import('@/pages/TeamMemberProfilePage'));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'));
const AchievementDetailPage = lazy(() => import('@/pages/AchievementDetailPage'));
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage'));
const AnnouncementDetailPage = lazy(() => import('@/pages/AnnouncementDetailPage'));
const PollDetailPage = lazy(() => import('@/pages/PollDetailPage'));
const SignInPage = lazy(() => import('@/pages/SignInPage'));
const JoinUsPage = lazy(() => import('@/pages/JoinUsPage'));
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'));
const NetworkPage = lazy(() => import('@/pages/NetworkPage'));
const NetworkOnboarding = lazy(() => import('@/pages/network/NetworkOnboarding'));
const NetworkStatusPage = lazy(() => import('@/pages/network/NetworkStatusPage'));
const NetworkProfilePage = lazy(() => import('@/pages/network/NetworkProfilePage'));
const JoinOurNetworkPage = lazy(() => import('@/pages/JoinOurNetworkPage'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage'));
const CreditsPage = lazy(() => import('@/pages/CreditsPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));

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
const EditTeamProfile = lazy(() => import('@/pages/dashboard/EditTeamProfile'));
const EditNetworkProfile = lazy(() => import('@/pages/dashboard/EditNetworkProfile'));
const DashboardCertificates = lazy(() => import('@/pages/dashboard/DashboardCertificates'));
const AttendancePage = lazy(() => import('@/pages/dashboard/AttendancePage'));
const VerifyCertificatePage = lazy(() => import('@/pages/VerifyCertificatePage'));
const QuizManager = lazy(() => import('@/pages/dashboard/QuizManager'));

// Admin Pages - lazy loaded
const AdminUsersRealtime = lazy(() => import('@/pages/admin/AdminUsersRealtime'));
const AdminTeam = lazy(() => import('@/pages/admin/AdminTeam'));
const AdminAchievements = lazy(() => import('@/pages/admin/AdminAchievements'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminEventRegistrations = lazy(() => import('@/pages/admin/AdminEventRegistrations'));
const EditEvent = lazy(() => import('@/pages/admin/EditEvent'));
const AdminHiring = lazy(() => import('@/pages/admin/AdminHiring'));
const AdminCertificates = lazy(() => import('@/pages/admin/AdminCertificates'));
const AdminNetwork = lazy(() => import('@/pages/admin/AdminNetwork'));
const AdminCredits = lazy(() => import('@/pages/admin/AdminCredits'));
const AdminCompetition = lazy(() => import('@/pages/admin/AdminCompetition'));
const CompetitionJudge = lazy(() => import('@/pages/admin/CompetitionJudge'));
const AdminAuditLog = lazy(() => import('@/pages/admin/AdminAuditLog'));
const AdminMail = lazy(() => import('@/pages/admin/AdminMail'));
const AdminPublicView = lazy(() => import('@/pages/admin/AdminPublicView'));
const EventAdminHub = lazy(() => import('@/components/attendance/EventAdminHub'));
const CompetitionResults = lazy(() => import('@/pages/CompetitionResults'));

// Quiz Pages - lazy loaded
const ActiveQuizList = lazy(() => import('@/pages/quiz/ActiveQuizList'));
const QuizPage = lazy(() => import('@/pages/quiz/QuizPage'));
const QuizResultsPage = lazy(() => import('@/pages/quiz/QuizResultsPage'));
const AdminQuizCreator = lazy(() => import('@/pages/quiz/AdminQuizCreator'));
const QuizJoinPage = lazy(() => import('@/pages/quiz/QuizJoinPage'));

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
      <AuthProvider>
        <SettingsProvider>
          <ErrorBoundary>
            <Router>
              <ScrollToTopOnNavigation />
              <Toaster position="top-right" richColors />
              <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={withRouteBoundary(<HomePage />)} />
                  <Route path="/about" element={withRouteBoundary(<AboutPage />)} />
                  <Route path="/events" element={withRouteBoundary(<EventsPage />)} />
                  <Route path="/events/:id" element={withRouteBoundary(<EventDetailPage />)} />
                  <Route path="/announcements" element={withRouteBoundary(<AnnouncementsPage />)} />
                  <Route path="/announcements/:id" element={withRouteBoundary(<AnnouncementDetailPage />)} />
                  <Route path="/polls/:slug" element={withRouteBoundary(<PollDetailPage />)} />
                  <Route path="/team" element={withRouteBoundary(<TeamPage />)} />
                  <Route path="/team/:slug" element={withRouteBoundary(<TeamMemberProfilePage />)} />
                  <Route path="/achievements" element={withRouteBoundary(<AchievementsPage />)} />
                  <Route path="/achievements/:id" element={withRouteBoundary(<AchievementDetailPage />)} />
                  <Route path="/signin" element={withRouteBoundary(<SignInPage />)} />
                  <Route path="/signup" element={withRouteBoundary(<SignInPage />)} />
                  <Route path="/join-us" element={withRouteBoundary(<JoinUsPage />)} />
                  <Route path="/auth/callback" element={withRouteBoundary(<AuthCallbackPage />)} />
                  <Route path="/network" element={withRouteBoundary(<NetworkPage />)} />
                  <Route path="/network/onboarding" element={withRouteBoundary(<NetworkOnboarding />)} />
                  <Route path="/verify" element={withRouteBoundary(<VerifyCertificatePage />)} />
                  <Route path="/verify/:certId" element={withRouteBoundary(<VerifyCertificatePage />)} />
                  <Route path="/network/status" element={withRouteBoundary(<NetworkStatusPage />)} />
                  <Route path="/network/:slug" element={withRouteBoundary(<NetworkProfilePage />)} />
                  <Route path="/join-our-network" element={withRouteBoundary(<JoinOurNetworkPage />)} />
                  <Route path="/privacy-policy" element={withRouteBoundary(<PrivacyPolicyPage />)} />
                  <Route path="/credits" element={withRouteBoundary(<CreditsPage />)} />
                  <Route path="/competition/:roundId/results" element={withRouteBoundary(<CompetitionResults />)} />
                  <Route path="/contact" element={withRouteBoundary(<ContactPage />)} />

                  {/* Quiz Routes (public listing, auth for participation) */}
                  <Route path="/quiz" element={withRouteBoundary(<ActiveQuizList />)} />
                  <Route path="/quiz/join" element={withRouteBoundary(<QuizJoinPage />)} />

                  {/* Network edit route (separate from dashboard to avoid role-guard conflicts) */}
                  <Route element={<ProtectedRoute minRole="USER" />}>
                    <Route path="/network/edit/:id?" element={withRouteBoundary(<EditNetworkProfile />)} />
                  </Route>

                  {/* Protected User Routes */}
                  <Route element={<ProtectedRoute minRole="USER" />}>
                    <Route path="/quiz/:quizId" element={withRouteBoundary(<QuizPage />)} />
                    <Route path="/quiz/:quizId/results" element={withRouteBoundary(<QuizResultsPage />)} />
                    <Route path="/dashboard" element={withRouteBoundary(<DashboardLayout />)}>
                      <Route index element={withRouteBoundary(<DashboardOverview />)} />
                      <Route path="events" element={withRouteBoundary(<DashboardEvents />)} />
                      <Route path="announcements" element={withRouteBoundary(<DashboardAnnouncements />)} />
                      <Route path="leaderboard" element={withRouteBoundary(<DashboardLeaderboard />)} />
                      <Route path="events/new" element={withRouteBoundary(<CreateEvent />)} />
                      <Route path="announcements/new" element={withRouteBoundary(<CreateAnnouncement />)} />
                      <Route path="qotd" element={withRouteBoundary(<CreateQOTD />)} />
                      <Route path="quiz" element={withRouteBoundary(<QuizManager />)} />
                      <Route path="upload" element={withRouteBoundary(<ImageUploadTool />)} />
                      <Route path="profile" element={withRouteBoundary(<ProfilePage />)} />
                      <Route path="team/:id/edit" element={withRouteBoundary(<EditTeamProfile />)} />
                      <Route path="certificates" element={withRouteBoundary(<DashboardCertificates />)} />
                      <Route element={<ProtectedRoute minRole="CORE_MEMBER" />}>
                        <Route path="attendance" element={withRouteBoundary(<AttendancePage />)} />
                        <Route path="events/:eventId/attendance" element={withRouteBoundary(<EventAdminHub />)} />
                      </Route>
                    </Route>
                    <Route path="/quiz/create" element={withRouteBoundary(<AdminQuizCreator />)} />
                  </Route>

                  {/* Protected Admin Routes */}
                  <Route element={<ProtectedRoute minRole="ADMIN" />}>
                    <Route path="/admin" element={withRouteBoundary(<DashboardLayout />)}>
                      <Route path="users" element={withRouteBoundary(<AdminUsersRealtime />)} />
                      <Route path="team" element={withRouteBoundary(<AdminTeam />)} />
                      <Route path="achievements" element={withRouteBoundary(<AdminAchievements />)} />
                      <Route path="event-registrations" element={withRouteBoundary(<AdminEventRegistrations />)} />
                      <Route path="events/:id/edit" element={withRouteBoundary(<EditEvent />)} />
                      <Route path="hiring" element={withRouteBoundary(<AdminHiring />)} />
                      <Route path="network" element={withRouteBoundary(<AdminNetwork />)} />
                      <Route path="credits" element={withRouteBoundary(<AdminCredits />)} />
                      <Route path="competition" element={withRouteBoundary(<AdminCompetition />)} />
                      <Route path="competition/:roundId/judge" element={withRouteBoundary(<CompetitionJudge />)} />
                      <Route path="settings" element={withRouteBoundary(<AdminSettings />)} />
                      <Route path="audit-log" element={withRouteBoundary(<AdminAuditLog />)} />
                      <Route path="mail" element={withRouteBoundary(<AdminMail />)} />
                      <Route path="public-view" element={withRouteBoundary(<AdminPublicView />)} />
                      <Route path="certificates" element={withRouteBoundary(<AdminCertificates />)} />
                      <Route path="events/:eventId/attendance" element={withRouteBoundary(<EventAdminHub />)} />
                    </Route>
                  </Route>

                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
          </ErrorBoundary>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50">
      <SEO title="Page Not Found" noIndex={true} />
      <div className="text-center">
        <h1 className="text-6xl font-bold text-amber-600 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Page not found</p>
        <a href="/" className="text-amber-600 hover:underline">Go back home</a>
      </div>
    </div>
  );
}

export default App;
