export interface EventFields {
  fingerprint: string;
  title: string;
  type: string;
  timestamp: Date;
  release?: string;
  environment?: string;
  level?: string;
}
