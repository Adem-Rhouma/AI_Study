import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/session';
import { useTheme } from './lib/theme';
import { Shell } from './components/layout/Shell';
import { AuthLayout } from './pages/auth/AuthLayout';
import { SkeletonRows } from './components/ui/Feedback';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const TopicDetailPage = lazy(() => import('./pages/TopicDetailPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage'));
const LessonPage = lazy(() => import('./pages/LessonPage'));
const PathsPage = lazy(() => import('./pages/PathsPage'));
const PathDetailPage = lazy(() => import('./pages/PathDetailPage'));
const ArenaPage = lazy(() => import('./pages/ArenaPage'));
const ExercisePage = lazy(() => import('./pages/ExercisePage'));
const ResourcesPage = lazy(() => import('./pages/ResourcesPage'));
const ResourceDetailPage = lazy(() => import('./pages/ResourceDetailPage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const ResearchPage = lazy(() => import('./pages/ResearchPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

export function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <SkeletonRows rows={1} className="h-8 w-1/3" />
      <SkeletonRows rows={4} />
    </div>
  );
}

/** Mirrors the signed-in learner's saved preferences onto the document root. */
function PreferenceSync() {
  const { session } = useSession();
  const { setPreference, preference } = useTheme();
  const prefs = session.preferences;

  useEffect(() => {
    if (prefs?.theme && prefs.theme !== preference) setPreference(prefs.theme);
    // React to the server value only; a local toggle must not be fought by a stale cache entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = prefs?.reducedMotion ? 'on' : 'off';
    root.dataset.density = prefs?.uiDensity ?? 'comfortable';
  }, [prefs?.reducedMotion, prefs?.uiDensity]);

  return null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <PageFallback />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }
  return <>{children}</>;
}

function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();
  const [params] = useSearchParams();
  if (isLoading) return <PageFallback />;
  if (isAuthenticated) return <Navigate to={params.get('next') ?? '/'} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <SessionProvider>
      <PreferenceSync />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="explore/:slug" element={<TopicDetailPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="courses/:slug" element={<CourseDetailPage />} />
            <Route path="lessons/:slug" element={<LessonPage />} />
            <Route path="paths" element={<PathsPage />} />
            <Route path="paths/:slug" element={<PathDetailPage />} />
            <Route path="arena" element={<ArenaPage />} />
            <Route path="arena/:slug" element={<ExercisePage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="resources/collections/:slug" element={<CollectionPage />} />
            <Route path="resources/:slug" element={<ResourceDetailPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="research/events" element={<EventsPage />} />
            <Route path="research/events/:slug" element={<EventDetailPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route
              path="settings"
              element={
                <RequireAuth>
                  <SettingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="admin"
              element={
                <RequireAuth>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route element={<AuthLayout />}>
            <Route
              path="login"
              element={
                <RedirectIfSignedIn>
                  <LoginPage />
                </RedirectIfSignedIn>
              }
            />
            <Route
              path="register"
              element={
                <RedirectIfSignedIn>
                  <RegisterPage />
                </RedirectIfSignedIn>
              }
            />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
          </Route>
        </Routes>
      </Suspense>
    </SessionProvider>
  );
}
