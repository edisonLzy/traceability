export interface NormalizedSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  op: string | null;
  status: string | null;
  isSegment: boolean;
  startTimestamp: Date;
  endTimestamp: Date;
  durationMs: number;
  release: string | null;
  environment: string | null;
  attributes: Record<string, unknown>;
  measurements: Record<string, unknown> | null;
}
