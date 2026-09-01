import { session } from "electron";
import { YoutubeTranscript } from "youtube-transcript";

export interface SubtitleSegment {
  seconds: number;
  timestamp: string; // e.g. "[01:23]"
  text: string;
}

export class VideoTranscriptService {
  /**
   * Extract YouTube video ID from various URL formats or bare IDs.
   */
  static extractYoutubeId(urlOrId: string): string | null {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const regExp = /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = trimmed.match(regExp);
    const id = match ? match[1] : undefined;
    return id && id.length === 11 ? id : null;
  }

  /**
   * Extract Bilibili BV ID from URL, text, or b23.tv short link.
   */
  static extractBilibiliBvid(urlOrText: string): string | null {
    if (!urlOrText) return null;
    const match = urlOrText.match(/BV[a-zA-Z0-9]{10}/i);
    return match ? match[0] : null;
  }

  /**
   * Formats seconds into [mm:ss] or [hh:mm:ss] timestamp token.
   */
  static formatTimestamp(seconds: number): string {
    const totalSecs = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
      return `[${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
    }
    return `[${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}]`;
  }

  /**
   * Fetch YouTube transcript and return formatted text with [mm:ss] timestamps.
   */
  static async fetchYoutubeTranscript(urlOrId: string, lang?: string): Promise<string> {
    const videoId = this.extractYoutubeId(urlOrId);
    if (!videoId) {
      throw new Error(`Invalid YouTube URL or video ID: "${urlOrId}"`);
    }

    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId, {
        ...(lang ? { lang } : {}),
      });

      if (!items || items.length === 0) {
        throw new Error(`No transcript segments returned for YouTube video ${videoId}.`);
      }

      return items
        .map((item) => {
          const seconds = item.offset / 1000;
          const ts = this.formatTimestamp(seconds);
          const cleanText = item.text.replace(/\n+/g, " ").trim();
          return `${ts} ${cleanText}`;
        })
        .filter((line) => line.trim().length > 0)
        .join("\n");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch YouTube transcript (${videoId}): ${message}`);
    }
  }

  /**
   * Resolve a potential b23.tv short link to full URL with BV id.
   */
  static async resolveBilibiliUrl(url: string): Promise<string> {
    if (this.extractBilibiliBvid(url)) {
      return url;
    }

    if (url.includes("b23.tv")) {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      return res.url;
    }

    return url;
  }

  /**
   * Try to retrieve Bilibili SESSDATA cookie from Electron defaultSession if available.
   */
  static async getStoredBilibiliCookie(): Promise<string | undefined> {
    try {
      if (session?.defaultSession?.cookies) {
        const cookies = await session.defaultSession.cookies.get({
          domain: ".bilibili.com",
          name: "SESSDATA",
        });
        if (cookies && cookies.length > 0 && cookies[0]?.value) {
          return `SESSDATA=${cookies[0].value}`;
        }
      }
    } catch {
      // Ignored if session is unavailable (e.g. in test runner)
    }
    return undefined;
  }

  /**
   * Fetch Bilibili transcript and return formatted text with [mm:ss] timestamps.
   */
  static async fetchBilibiliTranscript(urlOrBvid: string, cookie?: string): Promise<string> {
    const resolvedUrl = await this.resolveBilibiliUrl(urlOrBvid);
    const bvid = this.extractBilibiliBvid(resolvedUrl);

    if (!bvid) {
      throw new Error(`Invalid Bilibili video URL or BV ID: "${urlOrBvid}"`);
    }

    const effectiveCookie = cookie ?? (await this.getStoredBilibiliCookie());

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com",
      ...(effectiveCookie ? { Cookie: effectiveCookie } : {}),
    };

    // 1. Fetch view metadata
    const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers,
    });
    const viewData = (await viewRes.json()) as {
      code: number;
      message?: string;
      data?: { aid: number; cid: number; title: string };
    };

    if (viewData.code !== 0 || !viewData.data) {
      throw new Error(
        `Failed to get Bilibili video info for ${bvid}: [code ${viewData.code}] ${viewData.message ?? ""}`,
      );
    }

    const { aid, cid } = viewData.data;

    // 2. Fetch player subtitle metadata
    const playerRes = await fetch(
      `https://api.bilibili.com/x/player/v2?cid=${cid}&aid=${aid}&bvid=${bvid}`,
      { headers },
    );
    const playerData = (await playerRes.json()) as {
      code: number;
      message?: string;
      data?: {
        need_login_subtitle?: boolean;
        subtitle?: {
          subtitles?: Array<{
            lan: string;
            lan_doc: string;
            subtitle_url: string;
          }>;
        };
      };
    };

    if (playerData.code !== 0) {
      throw new Error(
        `Failed to get Bilibili player data: [code ${playerData.code}] ${playerData.message ?? ""}`,
      );
    }

    const subtitles = playerData.data?.subtitle?.subtitles ?? [];
    if (playerData.data?.need_login_subtitle && subtitles.length === 0) {
      throw new Error(
        `Bilibili requires login to access subtitles for video ${bvid}. Please log in to Bilibili in the app or provide a SESSDATA cookie.`,
      );
    }

    if (subtitles.length === 0) {
      throw new Error(`No subtitles or AI transcripts are available for Bilibili video ${bvid}.`);
    }

    // Prioritize Chinese (zh-CN or ai-zh)
    const targetSub = subtitles.find((s) => s.lan === "zh-CN" || s.lan === "ai-zh") ?? subtitles[0];
    if (!targetSub) {
      throw new Error(`No suitable subtitle track found for Bilibili video ${bvid}.`);
    }

    let subUrl = targetSub.subtitle_url;
    if (subUrl.startsWith("//")) {
      subUrl = `https:${subUrl}`;
    }

    // 3. Download subtitle JSON
    const subRes = await fetch(subUrl);
    const subJson = (await subRes.json()) as {
      body?: Array<{ from: number; to: number; content: string }>;
    };

    const body = subJson.body ?? [];
    if (body.length === 0) {
      throw new Error(`Subtitle track for ${bvid} is empty.`);
    }

    return body
      .map((item) => {
        const ts = this.formatTimestamp(item.from);
        const cleanText = item.content.replace(/\n+/g, " ").trim();
        return `${ts} ${cleanText}`;
      })
      .filter((line) => line.trim().length > 0)
      .join("\n");
  }

  /**
   * Unified dispatcher for any video URL (YouTube, Bilibili, etc.)
   */
  static async fetchTranscript(
    url: string,
    options?: { lang?: string; bilibiliCookie?: string },
  ): Promise<string> {
    if (!url || typeof url !== "string") {
      throw new Error("Video URL must be a non-empty string");
    }

    const trimmed = url.trim();

    if (
      trimmed.includes("youtube.com") ||
      trimmed.includes("youtu.be") ||
      /^[a-zA-Z0-9_-]{11}$/.test(trimmed)
    ) {
      return this.fetchYoutubeTranscript(trimmed, options?.lang);
    }

    if (
      trimmed.includes("bilibili.com") ||
      trimmed.includes("b23.tv") ||
      /BV[a-zA-Z0-9]{10}/i.test(trimmed)
    ) {
      return this.fetchBilibiliTranscript(trimmed, options?.bilibiliCookie);
    }

    throw new Error(
      `Unsupported video platform for URL: "${url}". Supported platforms: YouTube, Bilibili.`,
    );
  }
}
