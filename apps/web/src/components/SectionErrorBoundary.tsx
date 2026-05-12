import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface SectionErrorBoundaryProps {
  children: ReactNode;
  /** A short label for the section so the error message names what failed. */
  label?: string;
  /** Optional override message. Defaults to "This section couldn't load." */
  fallbackMessage?: string;
  /** Change this value to force the boundary to reset (e.g., on tab change). */
  resetKey?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

/**
 * Inline error boundary for use around a sub-section of a page.
 * Unlike the top-level ErrorBoundary, this renders a small inline card rather
 * than taking over the whole viewport — so one broken section doesn't 404 the
 * whole page.
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected error' };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Hook for client-side error reporting; intentionally left silent today.
  }

  componentDidUpdate(prevProps: SectionErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: null });
    }
  }

  private retry = () => this.setState({ hasError: false, message: null });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {this.props.label ? `${this.props.label} failed to render` : "This section couldn't load"}
            </p>
            <p className="mt-1 text-xs text-amber-800/80">
              {this.props.fallbackMessage ?? "The rest of the page is still working. Try again or refresh."}
            </p>
            {this.state.message && (
              <p className="mt-2 max-h-24 overflow-auto rounded border border-amber-200 bg-white px-2 py-1 font-mono text-[11px] text-amber-900">
                {this.state.message}
              </p>
            )}
            <button
              type="button"
              onClick={this.retry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default SectionErrorBoundary;
