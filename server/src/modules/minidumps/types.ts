export interface MinidumpSummary {
  id: string;
  projectId: string;
  eventId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}
