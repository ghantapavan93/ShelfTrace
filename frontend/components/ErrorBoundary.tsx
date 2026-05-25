"use client";

/**
 * ErrorBoundary — catches render-time exceptions anywhere in the tree
 * and shows a recoverable error UI instead of a white screen.
 *
 * Without this, a single throw in any child component crashes the whole
 * page and the only fix is a hard reload. With it, the user sees an
 * apology, can copy the stack for bug reporting, and can retry without
 * navigating away.
 *
 * Reserved for the AppShell root — page-level boundaries can be added
 * later if specific surfaces want their own fallbacks.
 */

import React from "react";
import { AlertTriangle, RotateCcw, Home, Copy } from "lucide-react";

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, errorInfo: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // In production this would report to Sentry / Datadog / your sink.
    // We log to console for the demo so the stack is at least visible
    // to anyone with devtools open.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null, copied: false });
  };

  copy = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;
    const text = [
      `Error: ${error.message}`,
      "",
      "Stack:",
      error.stack ?? "(none)",
      "",
      "Component stack:",
      errorInfo?.componentStack ?? "(none)",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // Clipboard API rejected (insecure context, etc.) — silent
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#04070b] px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/[.04] p-8">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-white">
                  Something on this page crashed
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  The error has been logged to the browser console. You can
                  copy the stack for bug reporting, retry this page, or
                  navigate home.
                </p>
              </div>
            </div>

            <pre className="mono mt-4 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-rose-200">
              {error.name}: {error.message}
            </pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                <Home className="h-3.5 w-3.5" /> Go home
              </a>
              <button
                type="button"
                onClick={this.copy}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                <Copy className="h-3.5 w-3.5" />
                {this.state.copied ? "Copied" : "Copy stack"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
