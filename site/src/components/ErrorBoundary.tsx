import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; msg?: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    window.__lalaLogClientError?.({
      type: "react-error-boundary",
      error,
      info: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, background: "#fff3cd", borderRadius: 12 }}>
          <b>Something went wrong.</b>
          <div style={{ fontSize: 12, opacity: .8 }}>{this.state.msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
