import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryFallbackProps {
  error: Error;
  /** Clears the error and renders the children again. */
  reset: () => void;
}

export interface ErrorBoundaryProps {
  /** Names the boundary in the log line so a crash can be traced to its subtree. */
  name: string;
  /** When this value changes, a caught error is cleared (e.g. on navigation). */
  resetKey?: unknown;
  fallback: (props: ErrorBoundaryFallbackProps) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains a render crash to the subtree it wraps: the rest of the app stays
 * mounted (and the server connection open) while `fallback` offers a way out.
 * The error is logged through console.error, the same channel the transport
 * uses for its failures, so it lands in the browser console and any attached
 * log capture.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name}] render failed:`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return this.props.fallback({ error, reset: this.reset });
    }
    return this.props.children;
  }
}
