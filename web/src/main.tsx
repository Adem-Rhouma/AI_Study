import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/source-serif-4/latin-400.css';
import '@fontsource/source-serif-4/latin-400-italic.css';
import '@fontsource/source-serif-4/latin-600.css';
import 'katex/dist/katex.min.css';

import './styles/base.css';
import './styles/prose.css';

import { App } from './App';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './components/ui/Toast';
import { TipProvider } from './components/ui/Menu';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A 4xx is a real answer from the server; retrying only hides it.
        const status = (error as { status?: number }).status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 1;
      }
    },
    mutations: { retry: false }
  }
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ToastProvider>
            <TipProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </TipProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
