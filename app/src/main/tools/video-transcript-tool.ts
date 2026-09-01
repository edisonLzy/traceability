import { Type } from "@earendil-works/pi-ai";
import type { Static } from "@earendil-works/pi-ai";

import { VideoTranscriptService } from "../services/video-transcript-service.js";
import type { AppTool } from "./types.js";

const VideoTranscriptParams = Type.Object({
  url: Type.String({
    description: "YouTube or Bilibili video URL, short link (e.g. b23.tv), or video ID.",
  }),
  lang: Type.Optional(
    Type.String({
      description: "Optional language code (e.g. 'en', 'zh-Hans').",
    }),
  ),
});

export const VIDEO_TRANSCRIPT_TOOL_NAME = "video_fetch_transcript";

export const videoTranscriptTool: AppTool<typeof VideoTranscriptParams> = {
  name: VIDEO_TRANSCRIPT_TOOL_NAME,
  label: "Fetch Video Transcript",
  description:
    "Fetch subtitles/transcripts with [mm:ss] timestamps from YouTube or Bilibili videos. " +
    "Use this when analyzing video evidence or preparing transcript excerpts for Explorer Graph video nodes.",
  riskLevel: "safe",
  executionMode: "sequential",
  parameters: VideoTranscriptParams,
  async execute(_toolCallId, params) {
    const { url, lang } = params as Static<typeof VideoTranscriptParams>;
    try {
      const transcript = await VideoTranscriptService.fetchTranscript(url, { lang });
      return {
        content: [
          {
            type: "text",
            text: transcript,
          },
        ],
        details: {
          url,
          lineCount: transcript.split("\n").length,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching video transcript: ${message}`,
          },
        ],
        details: {
          url,
          error: message,
        },
      };
    }
  },
};
