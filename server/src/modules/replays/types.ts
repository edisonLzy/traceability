export interface ReplaySessionSummary {
  id: string;
  replayId: string;
  platform: string | null;
  release: string | null;
  environment: string | null;
  replayType: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  urlList: string[] | null;
  errorIds: string[] | null;
  traceIds: string[] | null;
  segmentCount: number;
  totalBytes: number;
  createdAt: Date;
}

export interface ReplaySegmentSummary {
  id: string;
  segmentId: number;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

export interface ReplayDetail {
  session: ReplaySessionSummary;
  segments: ReplaySegmentSummary[];
}
