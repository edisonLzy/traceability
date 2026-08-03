export { MonitorErrorBoundary } from "./ErrorBoundary.js";
export { useMonitorTag } from "./hooks.js";

export type { MonitorErrorBoundaryProps } from "./ErrorBoundary.js";
export type { Span, StartSpanOptions } from "../browser/index.js";
export {
  getActiveSpan,
  metrics,
  startInactiveSpan,
  startSpan,
  startSpanManual,
} from "../browser/index.js";
