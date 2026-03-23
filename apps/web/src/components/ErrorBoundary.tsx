import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Intentionally left blank until client-side error reporting is wired up.
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: null });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white/95 p-8 text-center shadow-2xl backdrop-blur-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-700" />
          </div>
          <h1 className="text-3xl font-bold text-amber-950">Something went wrong</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            The page hit an unexpected problem. Reload and try again.
          </p>
          {this.state.message && (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {this.state.message}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={this.handleReload} className="bg-amber-600 hover:bg-amber-700">
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload Page
            </Button>
            <Button variant="outline" onClick={this.handleGoHome}>
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
