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
import { installStaleChunkRecovery } from './lib/chunkReload';

// Recover from a redeploy invalidating this tab's lazy-chunk filenames (the
// arena / snippets routes are code-split). Rate-limited, storage-safe, and
// suppressed while a proctored round is running — see lib/chunkReload.ts.
installStaleChunkRecovery();

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
