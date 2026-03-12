import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Preload execution engines early so first run is fast
import { preloadPyodide } from './engines/pyodideEngine';
import { preloadTypeScript } from './engines/tsEngine';
import { preloadJavaScript } from './engines/jsEngine';

try { preloadJavaScript(); } catch { /* non-fatal */ }
try { preloadPyodide(); } catch { /* non-fatal */ }
try { preloadTypeScript(); } catch { /* non-fatal */ }

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
