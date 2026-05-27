'use client';

/**
 * components/ErrorBoundary.tsx
 *
 * Tab-scoped error boundary. When a child throws during render or in a
 * lifecycle method, the boundary swallows it, shows a reset card, and
 * reports the error via the central reporter. Each tab in the app shell is
 * wrapped in its own boundary so a single crash isolates to that tab — the
 * other tabs and the bottom nav remain interactive.
 *
 * Implemented as a class component because React error boundaries require
 * componentDidCatch + getDerivedStateFromError.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/errorReporter';

interface Props {
  /** Visible name surfaced in the fallback ("Calendar", "Calories", …). */
  label:    string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message:  string;
  /** Bumped by Reset; React re-mounts children when key changes. */
  resetKey: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, message: error.message || 'Something broke.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Forward to the central reporter so it reaches /api/log/error (and
    // whatever third-party SDK is wired in alongside). Best-effort — never
    // throws from inside the catch handler.
    try {
      reportError(error, {
        boundary:      this.props.label,
        componentStack: info.componentStack ?? undefined,
      });
    } catch { /* reporter unavailable — fail closed */ }
  }

  reset = (): void => {
    this.setState(prev => ({ hasError: false, message: '', resetKey: prev.resetKey + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <div className="rounded-lg border border-[var(--warn)]/40 bg-[var(--bg-1)] p-6">
            <p className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-[var(--warn)] mb-3">
              {this.props.label} crashed
            </p>
            <p className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)] mb-2">
              Something broke
            </p>
            <p className="font-mono text-[10px] text-[var(--ink-2)] mb-5 leading-relaxed tracking-[0.3px]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="que-btn-primary py-2.5 px-5"
            >
              Reload {this.props.label}
            </button>
            <p className="font-mono text-[9px] text-[var(--ink-3)] mt-4 tracking-[0.5px]">
              Other tabs still work — switch tabs and back if reload doesn&apos;t help.
            </p>
          </div>
        </div>
      );
    }
    // Wrap children in a re-keyable fragment so a Reset re-mounts everything
    // beneath this boundary cleanly.
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}
