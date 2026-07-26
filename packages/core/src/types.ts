import type { Event } from "@sentry/browser";

export interface InitOptions {
  /** Full URL of the server ingest endpoint, e.g. http://localhost:3000/api/ingest/envelope */
  dsn: string;
  appId: string;
  /** API token; sent as Authorization: Bearer */
  token: string;
  release?: string;
  environment?: string;
  user?: { id: string; [k: string]: unknown };
  whiteScreen?: {
    rootSelector?: string;
    stableWindowMs?: number;
    minContentNodes?: number;
    enableScreenshot?: boolean;
  };
  replay?: {
    enabled?: boolean;
    maxDurationMs?: number;
    maxEvents?: number;
    uploadOnError?: boolean;
    maskAllInputs?: boolean;
    blockClass?: string;
    blockSelector?: string;
  };
  mf?: { host: boolean };
  /** Collect browser navigation and Web Vitals-style metrics. Enabled by default. */
  performance?: { enabled?: boolean };
  beforeSend?: (event: Event) => Event | null;
}

export interface ReportData {
  type: string;
  payload?: Record<string, unknown>;
  tags?: Record<string, string>;
}

export type PerformanceMetricName =
  | "FCP"
  | "LCP"
  | "CLS"
  | "INP"
  | "TTFB"
  | "DOMContentLoaded"
  | string;

export interface PerformanceMetric {
  name: PerformanceMetricName;
  value: number;
  unit?: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

export interface RrwebReplayIngestBody {
  replayId?: string;
  sentryEventId?: string;
  capturedAt?: string;
  startAt?: number;
  endAt?: number;
  events: unknown[];
  metadata?: Record<string, unknown>;
}
