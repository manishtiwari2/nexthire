import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../shared/components/ui';

/**
 * Catches render-time crashes so a bug in one page shows a message instead of a blank screen.
 *
 * React unmounts the entire tree when a render throws and nothing catches it, which is how a
 * single bad property access turns into a white page with no explanation — the user cannot tell
 * that from the app being down. Everything below the router is wrapped, so the crash is
 * contained and "Try again" re-mounts the tree without a full page reload.
 *
 * The error message is shown in development only. In a production build it would just be a
 * minified stack fragment with no meaning to a user, and it can carry internal details.
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the real stack in the console — this is what makes the bug diagnosable at all.
    console.error('[ErrorBoundary] a render crashed:', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-low p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/12 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold text-on-surface">Something broke on this page</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            This is a bug on our side, not something you did. Your work is saved as a draft in this
            browser, so nothing you typed in the editor has been lost.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-outline-variant bg-surface-container p-3 text-left font-mono text-[11px] text-on-surface-variant">
              {error.message}
            </pre>
          )}

          <div className="mt-6 flex justify-center gap-2">
            <Button variant="primary" onClick={this.reset}>
              Try again
            </Button>
            <Button variant="secondary" onClick={() => window.location.assign('/dashboard')}>
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
