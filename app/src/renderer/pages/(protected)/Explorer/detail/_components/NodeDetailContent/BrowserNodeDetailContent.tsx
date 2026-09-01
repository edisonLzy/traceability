import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe2,
  LayoutPanelLeft,
  Link2,
  LocateFixed,
  MessageSquareOff,
  MousePointer2,
  PanelLeftClose,
  Quote,
  RotateCcw,
  TextSelect,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BrowserAnchor,
  BrowserLocator,
  BrowserMode,
  BrowserNodeData,
  BrowserSource,
  ExplorerFlowEdge,
  ExplorerFlowNode,
  ProjectionRule,
} from "../../../types";
import { ensureBrowserPageWebview, removeBrowserPageWebview } from "./browser-page-webview";

export interface BrowserNodeDetailContentProps {
  data: BrowserNodeData;
  nodeId?: string;
  graphId?: string;
  nodes?: ExplorerFlowNode[];
  edges?: ExplorerFlowEdge[];
  onSelectNode?: (nodeId: string) => void;
}

export function BrowserNodeDetailContent({
  data,
  nodeId = "browser-node",
  graphId,
}: BrowserNodeDetailContentProps) {
  const surfaceContainerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<BrowserMode>("read");
  const [activeTab, setActiveTab] = useState<"anchors" | "projection">("anchors");
  const [revealed, setRevealed] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Initialize source
  const source: BrowserSource = useMemo(() => {
    return (
      data.source || {
        provider: "generic-web",
        url: "https://example.com",
        title: "Web Document",
        profileId: "default",
      }
    );
  }, [data.source]);

  // Local state for anchors and projection rules
  const [anchors, setAnchors] = useState<BrowserAnchor[]>(() => {
    if (data.anchors && data.anchors.length > 0) return data.anchors;
    return [];
  });

  const [projectionRules, setProjectionRules] = useState<ProjectionRule[]>(() => {
    if (data.projection?.rules && data.projection.rules.length > 0) return data.projection.rules;
    return [];
  });

  const [focusedAnchorId, setFocusedAnchorId] = useState<string | null>(
    data.viewState?.focusedAnchorId || null,
  );
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectedLocators, setSelectedLocators] = useState<BrowserLocator[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ top: number; left: number } | null>(null);

  // Compute hidden and stale counts
  const hiddenRulesCount = useMemo(() => {
    if (revealed) return 0;
    return projectionRules.filter((r) => r.enabled !== false).length;
  }, [projectionRules, revealed]);

  const staleRulesCount = useMemo(() => {
    return projectionRules.filter((r) => r.lastResolution?.state === "stale").length;
  }, [projectionRules]);

  // Mount <webview> using imperative factory
  useEffect(() => {
    const container = surfaceContainerRef.current;
    if (!container) return;

    const partition = `persist:traceability-browser-${source.profileId || "default"}`;
    const targetUrl = source.url || "about:blank";

    ensureBrowserPageWebview(container, {
      nodeId,
      url: targetUrl,
      partition,
      onDomReady: (webContentsId) => {
        if (typeof window !== "undefined" && window.browserRuntimeAPI) {
          void window.browserRuntimeAPI.registerGuest({
            nodeId,
            graphId: graphId || "default-graph",
            source,
            webContentsId,
            projection: { rules: projectionRules },
            viewState: { focusedAnchorId: focusedAnchorId || undefined },
            mode,
          });
        }
      },
      onIpcMessage: (channel, payload) => {
        if (channel === "__tr_selection__") {
          const data = payload as {
            text?: string;
            locators?: BrowserLocator[];
            rectViewport?: { top: number; left: number; width: number; height: number };
          };
          if (data?.text && data.rectViewport) {
            setSelectedText(data.text);
            setSelectedLocators(data.locators || [{ type: "text-quote", exact: data.text }]);
            setSelectionBox({
              top: Math.max(10, data.rectViewport.top - 46),
              left: Math.max(100, data.rectViewport.left + data.rectViewport.width / 2),
            });
          }
        } else if (channel === "__tr_selection_cleared__") {
          setSelectionBox(null);
        } else if (channel === "__tr_zap_element__") {
          const data = payload as {
            locators?: BrowserLocator[];
            suggestedName?: string;
            selector?: string;
          };
          if (data?.locators && data.locators.length > 0) {
            const ruleId = `zap-${Date.now()}`;
            const ruleName = data.suggestedName || `Hide ${data.selector || "element"}`;
            const newRule: ProjectionRule = {
              id: ruleId,
              operation: "hide",
              name: ruleName,
              target: {
                selector: data.selector,
                locators: data.locators,
              },
              enabled: true,
              origin: "user",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastResolution: { state: "resolved", checkedAt: new Date().toISOString() },
            };

            setProjectionRules((prev) => [...prev, newRule]);
            setActiveTab("projection");
            setRevealed(false);
            toast.success(`已隐藏: ${ruleName}`);
          }
        } else if (channel === "__tr_escape__") {
          setMode("read");
          setSelectionBox(null);
        }
      },
    });

    return () => {
      removeBrowserPageWebview(nodeId);
      if (typeof window !== "undefined" && window.browserRuntimeAPI) {
        void window.browserRuntimeAPI.detachGuest({
          nodeId,
          viewState: { focusedAnchorId: focusedAnchorId || undefined },
        });
      }
    };
  }, [graphId, nodeId, source.profileId, source.url]);

  // Sync mode changes to Electron runtime
  useEffect(() => {
    if (typeof window !== "undefined" && window.browserRuntimeAPI) {
      void window.browserRuntimeAPI.setMode({ nodeId, mode });
    }
  }, [mode, nodeId]);

  // Sync projection changes to Electron runtime
  useEffect(() => {
    if (typeof window !== "undefined" && window.browserRuntimeAPI) {
      void window.browserRuntimeAPI.applyProjection({
        nodeId,
        rules: projectionRules,
        revealed,
      });
    }
  }, [nodeId, projectionRules, revealed]);

  // Scroll to focused anchor
  const focusAnchor = useCallback(
    (anchorId: string) => {
      setFocusedAnchorId(anchorId);
      if (typeof window !== "undefined" && window.browserRuntimeAPI) {
        const anchor = anchors.find((a) => a.id === anchorId);
        void window.browserRuntimeAPI.focusAnchor({
          nodeId,
          anchorId,
          locators: anchor?.locators,
        });
      }
    },
    [anchors, nodeId],
  );

  // Create new Anchor from selection
  const handleCreateAnchor = useCallback(() => {
    if (!selectedText) return;
    const newId = `anchor-${Date.now()}`;
    const newAnchor: BrowserAnchor = {
      id: newId,
      label: selectedText.slice(0, 24) + (selectedText.length > 24 ? "…" : ""),
      quote: selectedText,
      locators:
        selectedLocators.length > 0
          ? selectedLocators
          : [{ type: "text-quote", exact: selectedText }],
      createdBy: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastResolution: { state: "resolved", checkedAt: new Date().toISOString() },
    };

    setAnchors((prev) => [...prev, newAnchor]);
    setFocusedAnchorId(newId);
    setSelectionBox(null);
    setSelectedText("");
    setSelectedLocators([]);
    setMode("read");
    setActiveTab("anchors");
    toast.success(`Anchor "${newAnchor.label}" created`);
  }, [selectedLocators, selectedText]);

  // Toggle Rule
  const toggleRule = useCallback((ruleId: string) => {
    setProjectionRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: !(r.enabled !== false) } : r)),
    );
    setRevealed(false);
  }, []);

  // Delete Rule
  const deleteRule = useCallback((ruleId: string) => {
    setProjectionRules((prev) => prev.filter((r) => r.id !== ruleId));
    toast.info("Projection rule removed");
  }, []);

  // Delete Anchor
  const deleteAnchor = useCallback(
    (anchorId: string) => {
      setAnchors((prev) => prev.filter((a) => a.id !== anchorId));
      if (focusedAnchorId === anchorId) {
        setFocusedAnchorId(null);
      }
      toast.info("Anchor deleted");
    },
    [focusedAnchorId],
  );

  // Reset Projection
  const handleResetProjection = useCallback(() => {
    setProjectionRules((prev) => prev.map((r) => ({ ...r, enabled: false })));
    setRevealed(false);
    toast.success("Projection rules reset");
  }, []);

  // Copy URL
  const copyUrl = useCallback(() => {
    const url = source.canonicalUrl || source.url;
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast.success("URL copied to clipboard");
    setTimeout(() => setCopiedUrl(false), 2000);
  }, [source.canonicalUrl, source.url]);

  // Keyboard shortcut Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("read");
        setSelectionBox(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const displayTitle = data.source?.title || data.preview?.title || "Browser Evidence";
  const displayUrl = data.source?.canonicalUrl || data.source?.url || "https://example.com";
  const providerName =
    source.provider === "feishu-doc"
      ? "Feishu Doc"
      : source.provider === "confluence"
        ? "Confluence"
        : "Web";

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 min-w-0 bg-card select-text">
      {/* Top Browser Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b-2 border-ink bg-muted/20 px-4 sm:px-5">
        {/* Left: Source Identity */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="grid size-6 shrink-0 place-items-center rounded border border-ink/40 bg-signal-cyan/20 text-signal-cyan">
            {source.provider === "feishu-doc" ? (
              <FileText className="size-3.5" />
            ) : source.provider === "confluence" ? (
              <LayoutPanelLeft className="size-3.5" />
            ) : (
              <Globe2 className="size-3.5" />
            )}
          </span>

          <span className="rounded-[3px] border border-ink/30 bg-card px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-ink shrink-0">
            {providerName}
          </span>

          <span
            className="truncate font-mono text-xs font-bold text-ink max-w-[240px] sm:max-w-[340px]"
            title={displayTitle}
          >
            {displayTitle}
          </span>

          <button
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-ink truncate max-w-[260px] transition-colors cursor-pointer"
            onClick={copyUrl}
            title={`Click to copy: ${displayUrl}`}
            type="button"
          >
            <span className="truncate">({displayUrl})</span>
            {copiedUrl ? (
              <Check className="size-2.5 text-success shrink-0" />
            ) : (
              <Copy className="size-2.5 text-muted-foreground hover:text-ink shrink-0" />
            )}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Anchor Mode Button */}
          <Button
            className={cn(
              "h-7 px-2.5 border border-ink/40 font-mono text-[10.5px] font-bold transition-all cursor-pointer",
              mode === "anchor"
                ? "!bg-ink !text-white border-ink shadow-[1.5px_1.5px_0_var(--browser)]"
                : "!bg-card !text-ink hover:!bg-muted",
            )}
            onClick={() => {
              setMode(mode === "anchor" ? "read" : "anchor");
              setActiveTab("anchors");
            }}
            size="sm"
            type="button"
          >
            <TextSelect className="size-3.5 mr-1" />
            <span className={cn(mode === "anchor" ? "!text-white" : "!text-ink")}>Anchor</span>
          </Button>

          {/* Zap Mode Button */}
          <Button
            className={cn(
              "h-7 px-2.5 border border-ink/40 font-mono text-[10.5px] font-bold transition-all cursor-pointer",
              mode === "zap"
                ? "!bg-ink !text-white border-ink shadow-[1.5px_1.5px_0_var(--browser)]"
                : "!bg-card !text-ink hover:!bg-muted",
            )}
            onClick={() => {
              setMode(mode === "zap" ? "read" : "zap");
              setActiveTab("projection");
            }}
            size="sm"
            type="button"
          >
            <MousePointer2 className="size-3.5 mr-1" />
            <span className={cn(mode === "zap" ? "!text-white" : "!text-ink")}>Zap</span>
          </Button>

          {/* Reveal Toggle Button */}
          <Button
            className={cn(
              "h-7 px-2 border border-ink/40 font-mono text-[10.5px] font-bold !bg-card !text-ink hover:!bg-muted cursor-pointer",
              revealed && "!bg-signal-yellow/20 border-warning !text-ink",
            )}
            onClick={() => setRevealed(!revealed)}
            size="sm"
            title="Temporarily reveal hidden content"
            type="button"
          >
            <Eye className="size-3.5 mr-1 text-ink" />
            <span className="!text-ink">
              {revealed ? "revealed" : `${hiddenRulesCount} hidden`}
            </span>
          </Button>

          {/* External Link */}
          <Button
            className="h-7 size-7 p-0 border border-ink/40 !bg-card !text-ink hover:!bg-muted font-mono cursor-pointer"
            onClick={() => window.open(source.url, "_blank")}
            size="sm"
            title="Open in system browser"
            type="button"
          >
            <ExternalLink className="size-3.5 text-ink" />
          </Button>
        </div>
      </div>

      {/* Main Split: Browser Surface (Left) + Inspector (Right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden divide-x-2 divide-ink">
        {/* Left: Browser Surface Viewport */}
        <div
          ref={surfaceContainerRef}
          className="relative flex flex-1 flex-col min-h-0 min-w-0 bg-[#eef2f8] dark:bg-[#101827] overflow-hidden"
        >
          {/* Mode Floating Hint Banners */}
          {mode === "anchor" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded border border-ink bg-card px-3 py-1 font-mono text-[11px] font-bold text-ink shadow-[2px_2px_0_var(--ink)] animate-in fade-in slide-in-from-top-1 backdrop-blur-xs pointer-events-none">
              <TextSelect className="size-3.5 text-primary" />
              <span>在网页中划词选择文本以创建 Anchor · Esc 退出</span>
            </div>
          )}

          {mode === "zap" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded border-2 border-danger bg-signal-pink/20 px-3 py-1 font-mono text-[11px] font-bold text-danger shadow-[2px_2px_0_var(--danger)] animate-in fade-in slide-in-from-top-1 backdrop-blur-xs pointer-events-none">
              <MousePointer2 className="size-3.5 text-danger" />
              <span>点击网页元素隐藏无关内容 · Esc 退出</span>
            </div>
          )}

          {/* Selection Toolbar Floating Popup */}
          {selectionBox && (
            <div
              className="absolute z-40 flex items-center gap-1.5 rounded-[6px] border-2 border-ink bg-ink text-card p-1 shadow-[3px_3px_0_var(--browser)] animate-in zoom-in-95 -translate-x-1/2"
              style={{ top: `${selectionBox.top}px`, left: `${selectionBox.left}px` }}
            >
              <button
                className="flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] font-bold hover:bg-white/15 transition-colors"
                onClick={handleCreateAnchor}
                type="button"
              >
                <Quote className="size-3" />
                <span>证据片段</span>
              </button>
              <button
                className="flex items-center gap-1 rounded bg-signal-cyan text-ink px-2 py-1 font-mono text-[10px] font-bold hover:opacity-90 transition-opacity"
                onClick={handleCreateAnchor}
                type="button"
              >
                <Link2 className="size-3" />
                <span>创建 Anchor</span>
              </button>
              <button
                aria-label="Cancel"
                className="grid size-5 place-items-center rounded hover:bg-white/20 text-muted-foreground hover:text-white"
                onClick={() => setSelectionBox(null)}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Streamlined Browser Inspector (300px) */}
        <aside className="w-[300px] shrink-0 bg-card flex flex-col min-h-0 overflow-hidden">
          {/* Tab Navigation: 2 Tabs only (Anchors & Rules) */}
          <div className="flex h-10 shrink-0 border-b border-ink/20 bg-muted/30 px-2">
            <button
              className={cn(
                "flex-1 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer",
                activeTab === "anchors"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-ink",
              )}
              onClick={() => setActiveTab("anchors")}
              type="button"
            >
              Anchors ({anchors.length})
            </button>
            <button
              className={cn(
                "flex-1 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer",
                activeTab === "projection"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-ink",
              )}
              onClick={() => setActiveTab("projection")}
              type="button"
            >
              Rules ({projectionRules.length})
            </button>
          </div>

          {/* Inspector Content Scroll Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {/* Anchors Tab */}
            {activeTab === "anchors" && (
              <div className="space-y-2.5">
                {/* Anchor Cards List */}
                {anchors.length > 0 ? (
                  <div className="space-y-2">
                    {anchors.map((anchor, idx) => {
                      const isFocused = focusedAnchorId === anchor.id;
                      const isResolved = anchor.lastResolution?.state !== "stale";
                      return (
                        <div
                          key={anchor.id}
                          className={cn(
                            "p-2.5 rounded-[5px] border transition-all cursor-pointer font-mono",
                            isFocused
                              ? "border-2 border-primary bg-primary/5 shadow-[2px_2px_0_var(--primary)]"
                              : "border-ink/25 bg-muted/20 hover:border-ink hover:bg-muted/40",
                          )}
                          onClick={() => focusAnchor(anchor.id)}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0 font-bold text-xs text-ink truncate">
                              <LocateFixed className="size-3.5 text-signal-cyan shrink-0" />
                              <span className="truncate">{anchor.label}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span
                                className={cn(
                                  "flex items-center gap-0.5 text-[8.5px] font-bold uppercase px-1 py-0.2 rounded border",
                                  isResolved
                                    ? "bg-success/10 text-success border-success/20"
                                    : "bg-destructive/10 text-destructive border-destructive/20",
                                )}
                              >
                                {isResolved ? (
                                  <Check className="size-2.5" />
                                ) : (
                                  <CircleAlert className="size-2.5" />
                                )}
                                <span>{isResolved ? "resolved" : "stale"}</span>
                              </span>
                              <button
                                aria-label="Delete anchor"
                                className="hover:text-destructive text-muted-foreground p-0.5 rounded transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAnchor(anchor.id);
                                }}
                                title="Delete anchor"
                                type="button"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>

                          {anchor.quote && (
                            <p className="text-[10.5px] italic text-muted-foreground mt-1.5 line-clamp-2 leading-snug">
                              “{anchor.quote}”
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[8px] text-tertiary mt-2 pt-1 border-t border-ink/10">
                            <span className="truncate max-w-[190px]">
                              {anchor.locators?.map((l) => l.type).join(" → ") || "text-quote"}
                            </span>
                            <span className="font-bold">A-{String(idx + 1).padStart(2, "0")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-ink/30 p-4 text-center">
                    <p className="text-xs font-mono text-muted-foreground">
                      在网页中划词选择文本即可创建 Anchor
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Projection / Rules Tab */}
            {activeTab === "projection" && (
              <div className="space-y-3">
                {staleRulesCount > 0 && (
                  <div className="flex items-start gap-1.5 p-2 rounded border border-destructive/40 bg-destructive/10 text-destructive text-[10.5px] font-mono leading-tight">
                    <TriangleAlert className="size-3.5 shrink-0 mt-0.5" />
                    <span>{staleRulesCount} rule(s) failed locator resolution on current DOM.</span>
                  </div>
                )}

                {/* Rules List */}
                {projectionRules.length > 0 ? (
                  <div className="space-y-2">
                    {projectionRules.map((rule) => {
                      const isEnabled = rule.enabled !== false;
                      return (
                        <div
                          key={rule.id}
                          className="flex items-start justify-between gap-2 p-2.5 rounded border border-ink/25 bg-muted/20 font-mono"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-ink truncate">
                              {rule.id.includes("sidebar") ? (
                                <PanelLeftClose className="size-3.5 text-primary shrink-0" />
                              ) : (
                                <MessageSquareOff className="size-3.5 text-primary shrink-0" />
                              )}
                              <span className="truncate">{rule.name || rule.id}</span>
                            </div>
                            <div className="text-[8.5px] text-muted-foreground truncate">
                              {rule.target?.elementRole ||
                                rule.target?.selector ||
                                "provider-element"}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                            <button
                              aria-checked={isEnabled}
                              aria-label={`Toggle rule ${rule.name}`}
                              className={cn(
                                "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                                isEnabled ? "bg-primary" : "bg-muted-foreground/30",
                              )}
                              onClick={() => toggleRule(rule.id)}
                              role="switch"
                              type="button"
                            >
                              <span
                                className={cn(
                                  "pointer-events-none inline-block size-3 rounded-full bg-white shadow transform transition duration-200 ease-in-out",
                                  isEnabled ? "translate-x-3" : "translate-x-0",
                                )}
                              />
                            </button>
                            <button
                              aria-label="Delete rule"
                              className="hover:text-destructive text-muted-foreground p-0.5 rounded transition-colors"
                              onClick={() => deleteRule(rule.id)}
                              type="button"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-ink/30 p-4 text-center">
                    <p className="text-xs font-mono text-muted-foreground">
                      点击顶部 Zap 按钮即可拾取网页元素隐藏
                    </p>
                  </div>
                )}

                {/* Projection Action Buttons */}
                <div className="space-y-1.5 pt-2 border-t border-ink/15 font-mono">
                  <Button
                    className="w-full h-7 border border-ink/40 !bg-card !text-ink font-bold text-[10px] hover:!bg-muted cursor-pointer shadow-[1px_1px_0_var(--ink)]"
                    onClick={() => setRevealed(!revealed)}
                    size="sm"
                    type="button"
                  >
                    <Eye className="size-3 mr-1 text-ink" />
                    <span className="!text-ink">
                      {revealed ? "Restore hidden elements" : "Reveal all hidden"}
                    </span>
                  </Button>

                  <Button
                    className="w-full h-7 border border-destructive/40 !bg-card !text-destructive font-bold text-[10px] hover:!bg-destructive/10 cursor-pointer shadow-[1px_1px_0_var(--destructive)]"
                    onClick={handleResetProjection}
                    size="sm"
                    type="button"
                  >
                    <RotateCcw className="size-3 mr-1 text-destructive" />
                    <span className="!text-destructive">Reset projection rules</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
