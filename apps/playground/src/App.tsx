import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { PlaygroundProvider } from './context/PlaygroundContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGate } from './components/auth/AuthGate';
import { CommandPalette } from './components/playground/CommandPalette';
// PlaygroundPage is the `/` route — keep it eager so the primary view has no extra fetch.
import PlaygroundPage from './pages/PlaygroundPage';
// Non-default routes are code-split so the arena/competition/snippets code lands in
// separate chunks instead of bloating the initial bundle.
const SnippetsPage = lazy(() => import('./pages/SnippetsPage'));
const SnippetViewPage = lazy(() => import('./pages/SnippetViewPage'));
const CompetitionPage = lazy(() => import('./pages/CompetitionPage'));
const ContestArenaPage = lazy(() => import('./pages/ContestArenaPage'));
import { endExecutionSession } from './utils/snippetsApi';

// Minimal centered fallback while a lazy route chunk loads — mirrors AuthGate's loader.
function RouteFallback() {
  return (
    <div className="h-app flex items-center justify-center bg-background">
      <Loader2 className="h-9 w-9 animate-spin text-amber-500" />
    </div>
  );
}

function RouteBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

// Wrap children with AuthGate only if not on a public route
function ConditionalAuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // /s/:token routes are public (shared snippets)
  const isPublicRoute = location.pathname.startsWith('/s/');
  
  if (isPublicRoute) {
    return <>{children}</>;
  }
  return <AuthGate>{children}</AuthGate>;
}

function SessionLifecycle() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const flush = () => {
      endExecutionSession();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [isAuthenticated]);

  return null;
}

function CommandPaletteController() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openPalette = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('playground:command-palette', openPalette);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('playground:command-palette', openPalette);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionLifecycle />
        <ConditionalAuthGate>
          <PlaygroundProvider>
            <CommandPaletteController />
            {/* RouteBoundary provides the Suspense fallback the lazy routes require. */}
            <RouteBoundary>
              <Routes>
                <Route path="/" element={<PlaygroundPage />} />
                <Route path="/competition/:roundId" element={<CompetitionPage />} />
                <Route path="/contest/:roundId" element={<ContestArenaPage />} />
                <Route path="/snippets" element={<SnippetsPage />} />
                <Route path="/snippet/:id" element={<SnippetViewPage />} />
                <Route path="/s/:shareToken" element={<SnippetViewPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </RouteBoundary>
          </PlaygroundProvider>
        </ConditionalAuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
