import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** A render crash must never leave a blank page; this shows a recoverable error instead. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-surface p-6">
        <div className="max-w-md rounded-card border border-danger/40 bg-raised p-6 text-center shadow-2">
          <h1 className="text-h3 font-semibold text-ink">Something broke in the interface</h1>
          <p className="mt-2 text-body text-ink-secondary">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            Your data on the server is untouched — reloading usually recovers.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 cursor-pointer rounded-input border border-line-strong bg-raised px-4 py-2 text-caption font-medium text-ink transition-colors hover:bg-sunken"
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}
