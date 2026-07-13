import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  fallback?: ReactNode;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            color: "var(--text-muted, #667085)",
          }}
        >
          <p style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>
            Something went wrong rendering the graph.
          </p>
          <p style={{ fontSize: "0.85rem" }}>
            {this.state.error?.message ?? "Unknown error"}
          </p>
          <button
            type="button"
            style={{
              marginTop: "1rem",
              padding: "0.45rem 1rem",
              borderRadius: "0.6rem",
              border: "1px solid var(--border, #d0d5dd)",
              background: "var(--surface-secondary, #edeff7)",
              cursor: "pointer",
              fontWeight: 600,
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
