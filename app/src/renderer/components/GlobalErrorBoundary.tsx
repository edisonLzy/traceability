import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import errorAnimation from "@renderer/assets/error-warning.lottie";
import { copyTextToClipboard } from "@renderer/lib/clipboard";
import { captureException } from "@traceability/monitor/electron-renderer";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "./ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Render slot shown above the actions when the boundary catches an error. */
  renderFallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * Global render-time error boundary. Any uncaught error thrown during render of
 * the subtree below it replaces that subtree with a full-screen recoverable
 * crash surface instead of leaving the window on a white screen. "重试" remounts
 * the subtree by clearing the captured error; the boundary does not auto-retry.
 */
export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, copied: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[GlobalErrorBoundary] render error:", error, info.componentStack);
    captureException(error);
  }

  private reset = () => {
    this.setState({ error: null, copied: false });
  };

  private handleCopy = () => {
    const { error } = this.state;
    if (!error) return;
    const payload = [`${error.name}: ${error.message}`, error.stack].filter(Boolean).join("\n");
    void copyTextToClipboard(payload)
      .then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      })
      .catch(() => undefined);
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.renderFallback) return this.props.renderFallback(error, this.reset);

    return (
      <div className="app-drag-region relative flex h-screen w-screen flex-col overflow-hidden bg-canvas">
        {/* Full-screen crash animation backdrop. Centered and large; dimmed + a
            vertical fade so the foreground copy stays readable over it. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <DotLottieReact
            src={errorAnimation}
            autoplay
            loop
            aria-hidden="true"
            className="h-[95vmin] w-[95vmin] opacity-30"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-canvas/55 bg-gradient-to-b from-canvas/40 via-canvas/60 to-canvas/90" />

        <div className="app-no-drag relative flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-[560px]">
            <h1 className="m-0 text-[28px] font-[670] tracking-[-0.03em] text-ink">页面渲染出错</h1>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-tertiary">
              页面在渲染过程中崩溃。你可以重试，或复制错误信息后反馈。
            </p>

            <div className="mt-6 rounded-xl border border-hairline bg-surface-1 px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-muted">
                {error.message || "发生了未知错误。"}
              </p>
            </div>

            {error.stack ? (
              <details className="group mt-3 rounded-xl border border-hairline bg-surface-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-3 text-[13px] text-tertiary transition-colors hover:text-muted">
                  <span className="transition-transform group-open:rotate-90">›</span>
                  详细堆栈
                </summary>
                <pre className="max-h-80 overflow-auto border-t border-hairline px-4 py-3 font-mono text-[12px] leading-relaxed text-subtle">
                  {error.stack}
                </pre>
              </details>
            ) : null}

            <div className="mt-7 flex items-center gap-2.5">
              <Button variant="primary" onClick={this.reset} className="h-11 flex-1 text-[13px]">
                <RefreshCwIcon className="size-4" />
                重试
              </Button>
              <Button
                variant="default"
                onClick={this.handleCopy}
                disabled={!error.stack}
                className="h-11 px-5 text-[13px]"
              >
                {this.state.copied ? (
                  <CheckIcon className="size-4 text-success" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
                {this.state.copied ? "已复制" : "复制错误"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
