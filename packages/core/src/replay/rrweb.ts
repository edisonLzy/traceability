import { record } from "@rrweb/record";
import type { eventWithTime, listenerHandler } from "@rrweb/types";
import { EventType } from "@rrweb/types";

import type { InitOptions, RrwebReplayIngestBody } from "../types.js";

interface ReplayRuntime {
  uploadUrl: string;
  token: string;
  appId: string;
  release?: string;
  environment?: string;
  maxDurationMs: number;
  maxEvents: number;
  uploadOnError: boolean;
}

const DEFAULT_MAX_DURATION_MS = 60_000;
const DEFAULT_MAX_EVENTS = 600;

let runtime: ReplayRuntime | undefined;
let stopRecording: listenerHandler | undefined;
let events: eventWithTime[] = [];

export function initRrwebReplay(opts: InitOptions): void {
  const replay = opts.replay;
  if (!replay?.enabled || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  runtime = {
    uploadUrl: `${opts.dsn.replace(/\/$/, "")}/api/ingest/rrweb/${opts.appId}`,
    token: opts.token,
    appId: opts.appId,
    release: opts.release,
    environment: opts.environment,
    maxDurationMs: replay.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
    maxEvents: replay.maxEvents ?? DEFAULT_MAX_EVENTS,
    uploadOnError: replay.uploadOnError ?? true,
  };

  if (stopRecording) return;

  stopRecording = record<eventWithTime>({
    emit(event) {
      events.push(event);
      pruneEvents();
    },
    checkoutEveryNms: Math.min(runtime.maxDurationMs, 30_000),
    maskAllInputs: replay.maskAllInputs ?? true,
    blockClass: replay.blockClass ?? "rrweb-block",
    blockSelector: replay.blockSelector,
  });
}

export function isRrwebReplayReady(): boolean {
  return Boolean(runtime?.uploadOnError && events.length > 0);
}

export function createReplayId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rrweb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function uploadRrwebReplay(replayId: string, sentryEventId?: string): void {
  if (!runtime?.uploadOnError || events.length === 0) return;
  const body = buildReplayBody(replayId, sentryEventId);
  if (!body) return;

  void fetch(runtime.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.token}`,
    },
    body: JSON.stringify(body),
  }).catch(() => {
    // Replay upload is best-effort. The Sentry envelope remains the source of truth.
  });
}

function buildReplayBody(
  replayId: string,
  sentryEventId?: string,
): RrwebReplayIngestBody | undefined {
  if (!runtime) return undefined;
  const snapshot = events.slice();
  if (!snapshot.length) return undefined;

  const timestamps = snapshot.map((event) => event.timestamp);
  return {
    replayId,
    sentryEventId,
    capturedAt: new Date().toISOString(),
    startAt: Math.min(...timestamps),
    endAt: Math.max(...timestamps),
    events: snapshot,
    metadata: {
      url: typeof location !== "undefined" ? location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      release: runtime.release,
      environment: runtime.environment,
      appId: runtime.appId,
    },
  };
}

function pruneEvents(): void {
  if (!runtime || events.length === 0) return;

  const cutoff = Date.now() - runtime.maxDurationMs;
  const firstInWindow = events.findIndex((event) => event.timestamp >= cutoff);
  if (firstInWindow > 0) {
    const fullSnapshotBeforeWindow = findLastFullSnapshotIndex(events.slice(0, firstInWindow));
    events = events.slice(fullSnapshotBeforeWindow >= 0 ? fullSnapshotBeforeWindow : firstInWindow);
  }

  if (events.length <= runtime.maxEvents) return;

  const overflow = events.length - runtime.maxEvents;
  const fullSnapshotAfterOverflow = events.findIndex(
    (event, index) => index >= overflow && event.type === EventType.FullSnapshot,
  );
  events = events.slice(fullSnapshotAfterOverflow >= 0 ? fullSnapshotAfterOverflow : overflow);
}

function findLastFullSnapshotIndex(items: eventWithTime[]): number {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i]!.type === EventType.FullSnapshot) return i;
  }
  return -1;
}
