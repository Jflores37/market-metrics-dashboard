import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import "@/index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("App crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const err = this.state.error;
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 24,
          background: "#0a0c14",
          color: "#e8eaf0",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 12 }}>
            App failed to render
          </div>
          <div style={{ marginBottom: 16, color: "#a0a4b3" }}>
            {err.message || String(err)}
          </div>
          {err.stack && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                background: "#11141d",
                border: "1px solid #262b3c",
                borderRadius: 8,
                padding: 12,
                color: "#a0a4b3",
                fontSize: 11,
                overflow: "auto",
              }}
            >
              {err.stack}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
