import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { SEO } from '@/components/SEO';

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
const TeamMemberProfilePage = lazy(() => import('@/pages/TeamMemberProfilePage'));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage'));
const AchievementDetailPage = lazy(() => import('@/pages/AchievementDetailPage'));
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage'));
const AnnouncementDetailPage = lazy(() => import('@/pages/AnnouncementDetailPage'));
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
          <Router>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<HomePage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/events" element={<EventsPage />} />
                  <Route path="/events/:id" element={<EventDetailPage />} />
                  <Route path="/announcements" element={<AnnouncementsPage />} />
                  <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/team/:slug" element={<TeamMemberProfilePage />} />
                  <Route path="/achievements" element={<AchievementsPage />} />
                  <Route path="/achievements/:id" element={<AchievementDetailPage />} />
                  <Route path="/signin" element={<SignInPage />} />
                  <Route path="/signup" element={<SignInPage />} />
                  <Route path="/join-us" element={<JoinUsPage />} />
                  <Route path="/auth/callback" element={<AuthCallbackPage />} />
                  <Route path="/network" element={<NetworkPage />} />
                  <Route path="/network/onboarding" element={<NetworkOnboarding />} />
                  <Route path="/verify" element={<VerifyCertificatePage />} />
                  <Route path="/verify/:certId" element={<VerifyCertificatePage />} />
                  <Route path="/network/status" element={<NetworkStatusPage />} />
                  <Route path="/network/:slug" element={<NetworkProfilePage />} />
                  <Route path="/join-our-network" element={<JoinOurNetworkPage />} />
                  <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
                  <Route path="/credits" element={<CreditsPage />} />
                  <Route path="/competition/:roundId/results" element={<CompetitionResults />} />
                  <Route path="/contact" element={<ContactPage />} />

                  {/* Quiz Routes (public listing, auth for participation) */}
                  <Route path="/quiz" element={<ActiveQuizList />} />
                  <Route path="/quiz/join" element={<QuizJoinPage />} />

                  {/* Protected User Routes */}
                  <Route element={<ProtectedRoute minRole="USER" />}>
                    <Route path="/quiz/:quizId" element={<QuizPage />} />
                    <Route path="/quiz/:quizId/results" element={<QuizResultsPage />} />
                    <Route path="/dashboard" element={<DashboardLayout />}>
                      <Route index element={<DashboardOverview />} />
                      <Route path="events" element={<DashboardEvents />} />
                      <Route path="announcements" element={<DashboardAnnouncements />} />
                      <Route path="leaderboard" element={<DashboardLeaderboard />} />
                      <Route path="events/new" element={<CreateEvent />} />
                      <Route path="announcements/new" element={<CreateAnnouncement />} />
                      <Route path="qotd" element={<CreateQOTD />} />
                      <Route path="quiz" element={<QuizManager />} />
                      <Route path="upload" element={<ImageUploadTool />} />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="team/:id/edit" element={<EditTeamProfile />} />
                      <Route path="network/edit/:id?" element={<EditNetworkProfile />} />
                      <Route path="certificates" element={<DashboardCertificates />} />
                      <Route element={<ProtectedRoute minRole="CORE_MEMBER" />}>
                        <Route path="attendance" element={<AttendancePage />} />
                        <Route path="events/:eventId/attendance" element={<EventAdminHub />} />
                      </Route>
                    </Route>
                    <Route path="/quiz/create" element={<AdminQuizCreator />} />
                  </Route>

                  {/* Protected Admin Routes */}
                  <Route element={<ProtectedRoute minRole="ADMIN" />}>
                    <Route path="/admin" element={<DashboardLayout />}>
                      <Route path="users" element={<AdminUsersRealtime />} />
                      <Route path="team" element={<AdminTeam />} />
                      <Route path="achievements" element={<AdminAchievements />} />
                      <Route path="event-registrations" element={<AdminEventRegistrations />} />
                      <Route path="events/:id/edit" element={<EditEvent />} />
                      <Route path="hiring" element={<AdminHiring />} />
                      <Route path="network" element={<AdminNetwork />} />
                      <Route path="credits" element={<AdminCredits />} />
                      <Route path="competition" element={<AdminCompetition />} />
                      <Route path="competition/:roundId/judge" element={<CompetitionJudge />} />
                      <Route path="settings" element={<AdminSettings />} />
                      <Route path="audit-log" element={<AdminAuditLog />} />
                      <Route path="mail" element={<AdminMail />} />
                      <Route path="certificates" element={<AdminCertificates />} />
                      <Route path="events/:eventId/attendance" element={<EventAdminHub />} />
                    </Route>
                  </Route>

                  {/* 404 */}
                  <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Router>
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
