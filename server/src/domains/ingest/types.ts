export type EnvelopeItemType =
  | "event"
  | "transaction"
  | "client_report"
  | "session"
  | "attachment"
  | "replay_event"
  | "replay_recording";

export interface EnvelopeHeader {
  event_id?: string;
  sent_at?: string;
  sdk?: { name: string; version: string };
  dsn?: string;
  [k: string]: unknown;
}

export interface EnvelopeItemHeader {
  type: EnvelopeItemType;
  length?: number;
  [k: string]: unknown;
}

export type EnvelopeItem = [EnvelopeItemHeader, object | Buffer];

export interface ParsedEnvelope {
  header: EnvelopeHeader;
  items: EnvelopeItem[];
}

export interface SentryEventPayload {
  event_id?: string;
  type?: "error" | "transaction" | "message" | "default" | "custom";
  message?: string;
  level?: string;
  timestamp?: number | string;
  platform?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: {
    replay?: { replay_id?: string };
    [k: string]: unknown;
  };
  measurements?: Record<string, { value: number; unit?: string }>;
  spans?: Array<Record<string, unknown>>;
  start_timestamp?: number;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      stacktrace?: {
        frames?: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }>;
      };
    }>;
  };
  transaction?: string;
  extra?: Record<string, unknown>;
}

export interface ReplayEventPayload {
  type: "replay_event";
  replay_id: string;
  timestamp: number;
  segment_id: number;
  replay_type: "session" | "buffer";
  event_id?: string;
  urls?: string[];
  error_ids?: string[];
  trace_ids?: string[];
  contexts?: Record<string, unknown>;
  platform?: string;
  release?: string;
  environment?: string;
}

export interface ReplayRecordingHeader {
  type: "replay_recording";
  length: number;
}
