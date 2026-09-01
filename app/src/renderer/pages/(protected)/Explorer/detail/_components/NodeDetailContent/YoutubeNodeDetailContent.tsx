import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/utils";
import {
  Clock,
  ExternalLink,
  FastForward,
  Pause,
  Play,
  Plus,
  Rewind,
  Sparkles,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { YoutubeBookmark, YoutubeNodeData } from "../../../types";

export interface YoutubeNodeDetailContentProps {
  data: YoutubeNodeData;
  nodeId?: string;
  graphId?: string;
}

export function YoutubeNodeDetailContent({ data }: YoutubeNodeDetailContentProps) {
  const videoId = useMemo(() => {
    return data.videoId || extractYoutubeId(data.url) || "dQw4w9WgXcQ";
  }, [data.videoId, data.url]);

  const [currentSeconds, setCurrentSeconds] = useState(data.startTime || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [showAddBookmarkDialog, setShowAddBookmarkDialog] = useState(false);
  const [newBookmarkLabel, setNewBookmarkLabel] = useState("");
  const [newBookmarkDesc, setNewBookmarkDesc] = useState("");
  const [localBookmarks, setLocalBookmarks] = useState<YoutubeBookmark[]>(data.bookmarks || []);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const totalDuration = data.duration || 270; // fallback duration if not provided

  // PostMessage helper to send commands to YouTube Iframe Player
  const sendPlayerCommand = useCallback((func: string, args: unknown[] = []) => {
    if (!iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        event: "command",
        func,
        args,
      }),
      "*",
    );
  }, []);

  // Programmatic seeking using YouTube IFrame API
  const seekTo = useCallback(
    (seconds: number, bookmarkId?: string, label?: string) => {
      const targetSec = Math.max(0, Math.min(seconds, totalDuration));
      setCurrentSeconds(targetSec);
      if (bookmarkId) setActiveBookmarkId(bookmarkId);

      sendPlayerCommand("seekTo", [targetSec, true]);
      sendPlayerCommand("playVideo");
      setIsPlaying(true);

      if (label) {
        toast.info(`Jumped to [${formatDuration(targetSec)}] - ${label}`);
      }
    },
    [sendPlayerCommand, totalDuration],
  );

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      sendPlayerCommand("pauseVideo");
      setIsPlaying(false);
    } else {
      sendPlayerCommand("playVideo");
      setIsPlaying(true);
    }
  }, [isPlaying, sendPlayerCommand]);

  // Local simulated progress ticker when playing
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentSeconds((prev) => {
          if (prev >= totalDuration) {
            setIsPlaying(false);
            return totalDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, totalDuration]);

  // Sync active bookmark based on currentSeconds
  useEffect(() => {
    const matched = localBookmarks.find((bm) => Math.abs(bm.time - currentSeconds) <= 3);
    if (matched) {
      setActiveBookmarkId(matched.id);
    }
  }, [currentSeconds, localBookmarks]);

  const handleAddBookmark = useCallback(() => {
    if (!newBookmarkLabel.trim()) {
      toast.error("Please enter a bookmark label");
      return;
    }
    const newBm: YoutubeBookmark = {
      id: `bm-${Date.now()}`,
      time: currentSeconds,
      label: newBookmarkLabel.trim(),
      description: newBookmarkDesc.trim() || undefined,
    };
    setLocalBookmarks((prev) => [...prev, newBm].sort((a, b) => a.time - b.time));
    setNewBookmarkLabel("");
    setNewBookmarkDesc("");
    setShowAddBookmarkDialog(false);
    toast.success(`Bookmark added at ${formatDuration(currentSeconds)}`);
  }, [currentSeconds, newBookmarkDesc, newBookmarkLabel]);

  const openExternal = useCallback(() => {
    window.open(data.url, "_blank");
  }, [data.url]);

  return (
    <div className="flex flex-1 flex-col h-full overflow-y-auto">
      {/* Full-width 2-column layout (7:5 split) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x-2 divide-ink min-h-0 flex-1">
        {/* Left Column (7 cols): Video Player & Controls */}
        <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between bg-black/5 dark:bg-black/25">
          <div className="space-y-4">
            {/* Embedded YouTube Player Container */}
            <div className="relative w-full aspect-video rounded-[6px] border-2 border-ink bg-black overflow-hidden shadow-[3px_3px_0_var(--ink)]">
              <iframe
                ref={iframeRef}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full border-0"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(
                  typeof window !== "undefined" ? window.location.origin : "http://localhost",
                )}&start=${currentSeconds}&rel=0`}
                title={data.title || "YouTube Video Player"}
              />
            </div>

            {/* Custom Seeker Bar with Chapter Anchor Dots */}
            <div className="p-3.5 rounded-[6px] border-1.5 border-ink bg-card shadow-[2px_2px_0_var(--ink)]">
              <div className="relative w-full mb-2">
                <input
                  className="w-full h-2 bg-muted/50 rounded-lg appearance-none cursor-pointer border border-ink/30 accent-signal-red"
                  max={totalDuration}
                  min={0}
                  onChange={(e) => {
                    const sec = parseInt(e.target.value, 10);
                    seekTo(sec);
                  }}
                  step={1}
                  type="range"
                  value={currentSeconds}
                />

                {/* Render Bookmark Dots along the track */}
                {localBookmarks.map((bm) => {
                  const percent = (bm.time / totalDuration) * 100;
                  const isActive = activeBookmarkId === bm.id;
                  return (
                    <button
                      key={bm.id}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full border border-white transition-transform hover:scale-150 cursor-pointer shadow",
                        isActive
                          ? "bg-signal-red scale-125 ring-2 ring-signal-red/50"
                          : "bg-signal-yellow",
                      )}
                      onClick={() => seekTo(bm.time, bm.id, bm.label)}
                      style={{ left: `${Math.min(98, Math.max(2, percent))}%` }}
                      title={`${formatDuration(bm.time)}: ${bm.label}`}
                      type="button"
                    />
                  );
                })}
              </div>

              {/* Player Controller Row */}
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Button
                    className="h-7 px-2.5 rounded border border-ink !bg-ink !text-white font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-[1px_1px_0_var(--ink)]"
                    onClick={togglePlay}
                    size="sm"
                    type="button"
                  >
                    {isPlaying ? (
                      <Pause className="size-3.5 mr-1 text-white" />
                    ) : (
                      <Play className="size-3.5 mr-1 text-white" />
                    )}
                    <span className="!text-white">{isPlaying ? "Pause" : "Play"}</span>
                  </Button>

                  <Button
                    className="h-7 px-2 border border-ink !bg-card !text-ink hover:!bg-muted font-mono text-[11px] font-bold shadow-[1px_1px_0_var(--ink)] cursor-pointer"
                    onClick={() => seekTo(currentSeconds - 5)}
                    size="sm"
                    title="Rewind 5 seconds"
                    type="button"
                  >
                    <Rewind className="size-3 mr-0.5 text-ink" />
                    <span className="!text-ink">-5s</span>
                  </Button>

                  <Button
                    className="h-7 px-2 border border-ink !bg-card !text-ink hover:!bg-muted font-mono text-[11px] font-bold shadow-[1px_1px_0_var(--ink)] cursor-pointer"
                    onClick={() => seekTo(currentSeconds + 5)}
                    size="sm"
                    title="Forward 5 seconds"
                    type="button"
                  >
                    <FastForward className="size-3 mr-0.5 text-ink" />
                    <span className="!text-ink">+5s</span>
                  </Button>

                  <span className="font-bold text-ink ml-1 font-mono text-[11px]">
                    {formatDuration(currentSeconds)}
                  </span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    / {formatDuration(totalDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {data.startTime !== undefined || data.endTime !== undefined ? (
                    <span className="hidden sm:inline-flex items-center gap-1 rounded bg-muted/40 border border-ink/20 px-1.5 py-0.5 text-[9.5px]">
                      <Clock className="size-2.5 text-muted-foreground" />
                      <span>
                        Clip:{" "}
                        {data.startTime !== undefined ? formatDuration(data.startTime) : "00:00"} ~{" "}
                        {data.endTime !== undefined
                          ? formatDuration(data.endTime)
                          : formatDuration(totalDuration)}
                      </span>
                    </span>
                  ) : null}
                  <button
                    className="hover:text-primary transition-colors text-muted-foreground p-1"
                    onClick={openExternal}
                    title="Open on YouTube"
                    type="button"
                  >
                    <ExternalLink className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Video Overview / Metadata Card */}
            <div className="rounded-[4px] border border-ink/25 bg-card p-3 font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink truncate max-w-[320px]">
                  {data.title || "YouTube Video Evidence"}
                </span>
                <span className="text-[9.5px] text-muted-foreground">ID: {videoId}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground pt-1 border-t border-ink/10">
                {data.authorName ? <span>Author: {data.authorName}</span> : null}
                <span>Duration: {formatDuration(totalDuration)}</span>
                <span className="truncate max-w-[280px]">URL: {data.url}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Timeline Bookmarks & AI Transcripts */}
        <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between bg-card">
          <div className="space-y-4">
            {/* Timeline Bookmarks Header */}
            <div className="flex items-center justify-between border-b border-ink/15 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono text-xs text-ink">
                  📍 Timeline Bookmarks (进度打点)
                </span>
                <span className="text-[9.5px] font-mono px-1.5 py-0.2 bg-signal-red/10 text-signal-red rounded border border-signal-red/30 font-bold">
                  {localBookmarks.length}
                </span>
              </div>
              <Button
                className="h-6 px-2 text-[10.5px] font-mono font-bold !text-signal-red hover:!bg-signal-red/10 border border-signal-red/30 !bg-card cursor-pointer shadow-[1px_1px_0_var(--signal-red)]"
                onClick={() => setShowAddBookmarkDialog(!showAddBookmarkDialog)}
                size="sm"
                type="button"
              >
                <Plus className="size-3 mr-0.5 text-signal-red" />
                <span className="!text-signal-red">
                  Bookmark [{formatDuration(currentSeconds)}]
                </span>
              </Button>
            </div>

            {/* Inline Add Bookmark Form */}
            {showAddBookmarkDialog ? (
              <div className="p-3 rounded-[4px] border-2 border-signal-red bg-signal-red/5 space-y-2 animate-in fade-in slide-in-from-top-1">
                <div className="text-[11px] font-mono font-bold text-signal-red">
                  New Bookmark at {formatDuration(currentSeconds)}
                </div>
                <Input
                  className="h-7 text-xs font-sans bg-card border-ink/40"
                  onChange={(e) => setNewBookmarkLabel(e.target.value)}
                  placeholder="Bookmark title (e.g. Bug repro moment)"
                  value={newBookmarkLabel}
                />
                <Input
                  className="h-7 text-xs font-sans bg-card border-ink/40"
                  onChange={(e) => setNewBookmarkDesc(e.target.value)}
                  placeholder="Optional description / details..."
                  value={newBookmarkDesc}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    className="h-6 px-2 text-[10.5px] font-mono font-bold !text-muted-foreground hover:!text-ink hover:!bg-muted cursor-pointer"
                    onClick={() => setShowAddBookmarkDialog(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    className="h-6 px-2.5 text-[10.5px] font-mono font-bold !bg-signal-red !text-white hover:!bg-signal-red/90 hover:!text-white border-0 shadow-[1px_1px_0_var(--ink)] cursor-pointer"
                    onClick={handleAddBookmark}
                    size="sm"
                    type="button"
                  >
                    <span className="!text-white">Save Bookmark</span>
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Bookmarks List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {localBookmarks.length > 0 ? (
                localBookmarks.map((bm) => {
                  const isActive = activeBookmarkId === bm.id;
                  return (
                    <div
                      key={bm.id}
                      className={cn(
                        "p-2.5 rounded-[4px] border transition-all cursor-pointer",
                        isActive
                          ? "border-2 border-signal-red bg-signal-red/10 shadow-[2px_2px_0_var(--signal-red)]"
                          : "border-ink/25 bg-muted/20 hover:border-ink hover:bg-muted/40",
                      )}
                      onClick={() => seekTo(bm.time, bm.id, bm.label)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded",
                              isActive ? "bg-signal-red text-white" : "bg-ink text-card",
                            )}
                          >
                            {formatDuration(bm.time)}
                          </span>
                          <span className="text-xs font-bold text-ink truncate">{bm.label}</span>
                        </div>
                        <span className="text-[9px] font-mono text-signal-red font-bold shrink-0 ml-1">
                          ▶ Seek
                        </span>
                      </div>
                      {bm.description ? (
                        <p className="text-[10px] text-muted-foreground mt-1 pl-1 line-clamp-2">
                          {bm.description}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs font-mono text-muted-foreground border border-dashed border-ink/20 rounded">
                  No bookmarks added yet. Click &quot;Bookmark&quot; to add time points.
                </div>
              )}
            </div>

            {/* AI Transcript Section */}
            <div className="p-3 rounded-[4px] border border-ink/25 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-success" />
                  <span>AI Video Transcript (转录内容)</span>
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">
                  Click timestamp to seek
                </span>
              </div>

              {data.transcriptExcerpt ? (
                <div className="text-[11px] leading-relaxed text-ink space-y-1 font-sans max-h-[140px] overflow-y-auto pr-1">
                  {parseTranscriptTimestamps(data.transcriptExcerpt, (sec, text) => {
                    seekTo(sec, undefined, text);
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground font-mono">
                  No transcript excerpt attached. AI can extract and attach subtitle timestamps
                  during graph generation.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function extractYoutubeId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  const id = match ? match[2] : undefined;
  return id && id.length === 11 ? id : null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function parseTranscriptTimestamps(
  text: string,
  onSeek: (seconds: number, snippet: string) => void,
) {
  const lines = text.split("\n");
  const timeRegex = /\[(\d{1,2}):(\d{2})\]/g;

  return lines.map((line, idx) => {
    const matches = [...line.matchAll(timeRegex)];
    if (matches.length === 0) {
      return (
        <p key={idx} className="text-[11px] leading-snug">
          {line}
        </p>
      );
    }

    let lastIndex = 0;
    const elements: React.ReactNode[] = [];

    matches.forEach((match, mIdx) => {
      const matchStart = match.index ?? 0;
      if (matchStart > lastIndex) {
        elements.push(line.substring(lastIndex, matchStart));
      }
      const min = parseInt(match[1] ?? "0", 10);
      const sec = parseInt(match[2] ?? "0", 10);
      const totalSec = min * 60 + sec;

      elements.push(
        <button
          key={`token-${mIdx}`}
          className="font-mono text-[10.5px] font-bold text-signal-red bg-signal-red/10 px-1 py-0.2 rounded hover:underline mr-1"
          onClick={() => onSeek(totalSec, line)}
          type="button"
        >
          {match[0]}
        </button>,
      );
      lastIndex = matchStart + match[0].length;
    });

    if (lastIndex < line.length) {
      elements.push(line.substring(lastIndex));
    }

    return (
      <p
        key={idx}
        className="text-[11px] leading-snug hover:bg-muted/40 p-0.5 rounded cursor-pointer"
      >
        {elements}
      </p>
    );
  });
}
