import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { PlaygroundProvider } from './context/PlaygroundContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthGate } from './components/auth/AuthGate';
import PlaygroundPage from './pages/PlaygroundPage';
import SnippetsPage from './pages/SnippetsPage';
import SnippetViewPage from './pages/SnippetViewPage';
import { endExecutionSession } from './utils/snippetsApi';

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

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionLifecycle />
        <ConditionalAuthGate>
          <PlaygroundProvider>
            <Routes>
              <Route path="/" element={<PlaygroundPage />} />
              <Route path="/snippets" element={<SnippetsPage />} />
              <Route path="/snippet/:id" element={<SnippetViewPage />} />
              <Route path="/s/:shareToken" element={<SnippetViewPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PlaygroundProvider>
        </ConditionalAuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
