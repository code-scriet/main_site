import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Preload JS/TS engines eagerly (lightweight workers, no large downloads)
import { preloadTypeScript } from './engines/tsEngine';
import { preloadJavaScript } from './engines/jsEngine';

// Stale-chunk recovery (mirrors apps/web/src/main.tsx). The routes here are
// code-split, so after a redeploy an already-open tab that navigates to the
// contest arena / snippets asks for a content-hashed chunk that no longer
// exists — mid-contest that would strand a student on the error screen. One
// reload picks up the new chunk map.
//
// The guard stores the last reload INSTANT rather than a boolean: a boolean
// cleared on boot would re-arm every reload (so a genuinely missing asset loops
// forever), while a never-cleared boolean would block recovery from a later
// deploy. With a timestamp, a repeat failure inside the cooldown surfaces in the
// ErrorBoundary, and a deploy hours later still recovers automatically.
const RELOAD_GUARD_KEY = 'chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return; // just tried — let the error surface
  event.preventDefault();
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  window.location.reload();
});

try { preloadJavaScript(); } catch { /* non-fatal */ }
try { preloadTypeScript(); } catch { /* non-fatal */ }
// Python (Pyodide) is only loaded when the user explicitly clicks "Run Locally"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
