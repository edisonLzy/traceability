export interface VideoTranscriptIPC {
  fetchVideoTranscript: (url: string, lang?: string) => Promise<string>;
}
