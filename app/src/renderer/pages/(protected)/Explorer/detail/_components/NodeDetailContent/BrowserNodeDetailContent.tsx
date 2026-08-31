import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import {
  Check,
  CircleAlert,
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
  BrowserMode,
  BrowserNodeData,
  BrowserSource,
  ExplorerFlowEdge,
  ExplorerFlowNode,
  ProjectionRule,
} from "../../../types";
import { getNodeTitle } from "../ExplorerGraphNodeCard";

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
  nodes = [],
  edges = [],
  onSelectNode,
}: BrowserNodeDetailContentProps) {
  const surfaceContainerRef = useRef<HTMLDivElement>(null);
  const articleScrollRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<BrowserMode>("read");
  const [activeTab, setActiveTab] = useState<"anchors" | "projection" | "node">("anchors");
  const [revealed, setRevealed] = useState(false);

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
    // Default initial mock anchors for Feishu / Generic doc if empty
    return [
      {
        id: "anchor-review-window",
        label: "人工审核触发条件",
        quote: "退款申请提交后超过 24 小时仍未完成自动校验时，必须进入人工审核队列。",
        locators: [
          { type: "feishu-block", documentId: "refund-review-policy", blockId: "block-101" },
          { type: "text-quote", exact: "退款申请提交后超过 24 小时仍未完成自动校验时" },
          { type: "heading-path", headings: ["2. 人工审核时效"] },
        ],
        createdBy: "user",
        createdAt: "2026-08-31T10:00:00.000Z",
        updatedAt: "2026-08-31T10:00:00.000Z",
        lastResolution: { state: "resolved", checkedAt: "2026-08-31T10:05:00.000Z" },
      },
      {
        id: "anchor-notification",
        label: "状态通知策略",
        quote: "服务端只发送一次状态变更通知，并在退款结果确定后发送最终结果。",
        locators: [
          { type: "feishu-block", documentId: "refund-review-policy", blockId: "block-102" },
          { type: "text-quote", exact: "服务端只发送一次状态变更通知" },
        ],
        createdBy: "user",
        createdAt: "2026-08-31T10:00:00.000Z",
        updatedAt: "2026-08-31T10:00:00.000Z",
        lastResolution: { state: "resolved", checkedAt: "2026-08-31T10:05:00.000Z" },
      },
    ];
  });

  const [projectionRules, setProjectionRules] = useState<ProjectionRule[]>(() => {
    if (data.projection?.rules && data.projection.rules.length > 0) return data.projection.rules;
    return [
      {
        id: "sidebar",
        operation: "hide",
        name: "Hide left navigation",
        target: {
          elementRole: "feishu.sidebar",
          selector: ".remote-sidebar",
          locators: [{ type: "provider-element", provider: source.provider, role: "sidebar" }],
        },
        enabled: true,
        origin: "user",
        createdAt: "2026-08-31T10:00:00.000Z",
        updatedAt: "2026-08-31T10:00:00.000Z",
        lastResolution: { state: "resolved", checkedAt: "2026-08-31T10:05:00.000Z" },
      },
      {
        id: "comments",
        operation: "hide",
        name: "Hide comments panel",
        target: {
          elementRole: "feishu.comments",
          selector: ".remote-comments",
          locators: [{ type: "provider-element", provider: source.provider, role: "comments" }],
        },
        enabled: true,
        origin: "user",
        createdAt: "2026-08-31T10:00:00.000Z",
        updatedAt: "2026-08-31T10:00:00.000Z",
        lastResolution: { state: "resolved", checkedAt: "2026-08-31T10:05:00.000Z" },
      },
    ];
  });

  const [focusedAnchorId, setFocusedAnchorId] = useState<string | null>(
    data.viewState?.focusedAnchorId || "anchor-review-window",
  );
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionBox, setSelectionBox] = useState<{ top: number; left: number } | null>(null);

  // Compute hidden and stale counts
  const hiddenRulesCount = useMemo(() => {
    if (revealed) return 0;
    return projectionRules.filter((r) => r.enabled !== false).length;
  }, [projectionRules, revealed]);

  const staleRulesCount = useMemo(() => {
    return projectionRules.filter((r) => r.lastResolution?.state === "stale").length;
  }, [projectionRules]);

  const isSidebarHidden = useMemo(() => {
    const r = projectionRules.find((rule) => rule.id === "sidebar" || rule.name?.includes("left"));
    return Boolean(r?.enabled !== false && !revealed);
  }, [projectionRules, revealed]);

  const isCommentsHidden = useMemo(() => {
    const r = projectionRules.find(
      (rule) => rule.id === "comments" || rule.name?.includes("comment"),
    );
    return Boolean(r?.enabled !== false && !revealed);
  }, [projectionRules, revealed]);

  // Connect native Electron WebContentsView if available
  useEffect(() => {
    const container = surfaceContainerRef.current;
    if (!container || typeof window === "undefined" || !window.browserRuntimeAPI) return;

    const reportBounds = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        void window.browserRuntimeAPI?.updateBounds({
          nodeId,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }
    };

    const rect = container.getBoundingClientRect();
    void window.browserRuntimeAPI.attach({
      nodeId,
      graphId: graphId || "default-graph",
      source,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      projection: { rules: projectionRules },
      viewState: { focusedAnchorId: focusedAnchorId || undefined },
      mode,
    });

    const observer = new ResizeObserver(reportBounds);
    observer.observe(container);

    return () => {
      observer.disconnect();
      void window.browserRuntimeAPI?.detach({
        nodeId,
        viewState: { focusedAnchorId: focusedAnchorId || undefined },
      });
    };
  }, [graphId, nodeId, source]);

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

      // DOM fallback scroll for simulated preview
      const targetEl = document.querySelector(`[data-anchor-id="${anchorId}"]`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [anchors, nodeId],
  );

  // Handle text selection in Anchor mode
  const handleMouseUp = useCallback(() => {
    if (mode !== "anchor") return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const text = selection.toString().trim();
      if (text.length > 0) {
        setSelectedText(text);
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = surfaceContainerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setSelectionBox({
            top: rect.top - containerRect.top - 42,
            left: rect.left - containerRect.left + rect.width / 2,
          });
        }
        return;
      }
    }
    setSelectionBox(null);
  }, [mode]);

  // Create new Anchor from selection
  const handleCreateAnchor = useCallback(() => {
    if (!selectedText) return;
    const newId = `anchor-${Date.now()}`;
    const newAnchor: BrowserAnchor = {
      id: newId,
      label: selectedText.slice(0, 20) + (selectedText.length > 20 ? "…" : ""),
      quote: selectedText,
      locators: [
        { type: "text-quote", exact: selectedText },
        { type: "heading-path", headings: ["2. 人工审核时效"] },
        { type: "dom-path", xpath: "//article/p" },
      ],
      createdBy: "user",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastResolution: { state: "resolved", checkedAt: new Date().toISOString() },
    };

    setAnchors((prev) => [...prev, newAnchor]);
    setFocusedAnchorId(newId);
    setSelectionBox(null);
    setSelectedText("");
    setMode("read");
    setActiveTab("anchors");
    toast.success(`Anchor "${newAnchor.label}" created`);
  }, [selectedText]);

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

  // Add Zap rule from clicking target
  const handleZapElement = useCallback(
    (targetType: "sidebar" | "comments") => {
      const isSidebar = targetType === "sidebar";
      const ruleId = isSidebar ? "sidebar" : "comments";
      const ruleName = isSidebar ? "Hide left navigation" : "Hide comments panel";

      setProjectionRules((prev) => {
        const exists = prev.find((r) => r.id === ruleId);
        if (exists) {
          return prev.map((r) => (r.id === ruleId ? { ...r, enabled: true } : r));
        }
        return [
          ...prev,
          {
            id: ruleId,
            operation: "hide",
            name: ruleName,
            target: {
              elementRole: `feishu.${targetType}`,
              selector: isSidebar ? ".remote-sidebar" : ".remote-comments",
              locators: [{ type: "provider-element", provider: source.provider, role: targetType }],
            },
            enabled: true,
            origin: "user",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastResolution: { state: "resolved", checkedAt: new Date().toISOString() },
          },
        ];
      });

      setMode("read");
      setRevealed(false);
      setActiveTab("projection");
      toast.success(`${isSidebar ? "Left navigation" : "Comments panel"} hidden and saved`);
    },
    [source.provider],
  );

  // Reset Projection
  const handleResetProjection = useCallback(() => {
    setProjectionRules((prev) => prev.map((r) => ({ ...r, enabled: false })));
    setRevealed(false);
    toast.success("Node projection rules reset");
  }, []);

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

  // Connected relations matching anchors
  const anchorRelations = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const list: Array<{
      edge: ExplorerFlowEdge;
      direction: "in" | "out";
      otherNode?: ExplorerFlowNode;
      anchorId?: string;
    }> = [];

    edges.forEach((edge) => {
      if (edge.target === nodeId) {
        list.push({
          edge,
          direction: "in",
          otherNode: nodeMap.get(edge.source),
          anchorId: edge.data?.targetAnchorId,
        });
      } else if (edge.source === nodeId) {
        list.push({
          edge,
          direction: "out",
          otherNode: nodeMap.get(edge.target),
          anchorId: edge.data?.sourceAnchorId,
        });
      }
    });

    return list;
  }, [edges, nodeId, nodes]);

  const displayTitle = data.source?.title || data.preview?.title || "Browser Evidence";
  const displayUrl = data.source?.canonicalUrl || data.source?.url || "https://feishu.cn/docx/...";

  return (
    <div className="flex flex-1 flex-col h-full min-h-0 min-w-0 bg-card select-text">
      {/* Top Browser Toolbar (50px / h-12) */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b-2 border-ink bg-muted/20 px-4 sm:px-5">
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
          <span
            className="truncate font-mono text-xs font-bold text-ink max-w-[280px] sm:max-w-[360px]"
            title={displayTitle}
          >
            {displayTitle}
          </span>
          <span
            className="truncate font-mono text-[10px] text-muted-foreground hidden sm:inline max-w-[320px]"
            title={displayUrl}
          >
            ({displayUrl})
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Runtime Status Pill */}
          <span className="hidden md:inline-flex items-center gap-1.5 rounded border border-ink/30 bg-muted/50 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-ink">
            <span className="size-1.5 rounded-full bg-success animate-pulse" />
            <span>active · shared session</span>
          </span>

          {/* Anchor Mode Button */}
          <Button
            className={cn(
              "h-7 px-2.5 border border-ink/40 font-mono text-[10.5px] font-bold transition-all",
              mode === "anchor"
                ? "bg-ink text-card border-ink shadow-[1.5px_1.5px_0_var(--browser)]"
                : "bg-card text-ink hover:bg-muted",
            )}
            onClick={() => {
              setMode(mode === "anchor" ? "read" : "anchor");
              setActiveTab("anchors");
            }}
            size="sm"
            type="button"
          >
            <TextSelect className="size-3.5 mr-1" />
            <span>Anchor</span>
          </Button>

          {/* Zap Mode Button */}
          <Button
            className={cn(
              "h-7 px-2.5 border border-ink/40 font-mono text-[10.5px] font-bold transition-all",
              mode === "zap"
                ? "bg-ink text-card border-ink shadow-[1.5px_1.5px_0_var(--browser)]"
                : "bg-card text-ink hover:bg-muted",
            )}
            onClick={() => {
              setMode(mode === "zap" ? "read" : "zap");
              setActiveTab("projection");
            }}
            size="sm"
            type="button"
          >
            <MousePointer2 className="size-3.5 mr-1" />
            <span>Zap</span>
          </Button>

          {/* Reveal Toggle Button */}
          <Button
            className={cn(
              "h-7 px-2.5 border border-ink/40 font-mono text-[10.5px] font-bold bg-card text-ink hover:bg-muted",
              revealed && "bg-signal-yellow/20 border-warning text-ink",
            )}
            onClick={() => setRevealed(!revealed)}
            size="sm"
            title="Temporarily reveal hidden content"
            type="button"
          >
            <Eye className="size-3.5 mr-1" />
            <span>{revealed ? "revealed" : `${hiddenRulesCount} hidden`}</span>
          </Button>

          {/* External Link */}
          <Button
            className="h-7 size-7 p-0 border border-ink/40 bg-card text-ink hover:bg-muted font-mono"
            onClick={() => window.open(source.url, "_blank")}
            size="sm"
            title="Open in system browser"
            type="button"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Split: Browser Surface (Left) + Inspector (Right) */}
      <div className="flex flex-1 min-h-0 overflow-hidden divide-x-2 divide-ink">
        {/* Left: Browser Surface Viewport */}
        <div
          ref={surfaceContainerRef}
          className="relative flex flex-1 flex-col min-h-0 min-w-0 bg-[#eef2f8] dark:bg-[#101827] overflow-hidden"
          onMouseUp={handleMouseUp}
        >
          {/* Mode Floating Hint Banners */}
          {mode === "anchor" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded border border-ink bg-card px-3 py-1 font-mono text-[11px] font-bold text-ink shadow-[2px_2px_0_var(--ink)] animate-in fade-in slide-in-from-top-1">
              <TextSelect className="size-3.5 text-primary" />
              <span>选择网页文字创建 Anchor · Esc 退出</span>
            </div>
          )}

          {mode === "zap" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded border-2 border-danger bg-signal-pink/20 px-3 py-1 font-mono text-[11px] font-bold text-danger shadow-[2px_2px_0_var(--danger)] animate-in fade-in slide-in-from-top-1">
              <MousePointer2 className="size-3.5 text-danger" />
              <span>点击红色区域隐藏无关内容 · Esc 退出</span>
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

          {/* Remote Document Surface Layout */}
          <div
            className={cn(
              "grid h-full w-full min-h-0 bg-white dark:bg-[#111824] text-slate-800 dark:text-slate-200 transition-all duration-200",
              isSidebarHidden && isCommentsHidden
                ? "grid-cols-[0px_minmax(520px,1fr)_0px]"
                : isSidebarHidden
                  ? "grid-cols-[0px_minmax(520px,1fr)_210px]"
                  : isCommentsHidden
                    ? "grid-cols-[190px_minmax(520px,1fr)_0px]"
                    : "grid-cols-[190px_minmax(520px,1fr)_210px]",
            )}
          >
            {/* Remote Left Sidebar */}
            <aside
              className={cn(
                "relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-[#f7f8fa] dark:bg-[#171f2d] overflow-hidden transition-opacity duration-150",
                isSidebarHidden ? "opacity-0 pointer-events-none" : "opacity-100",
              )}
            >
              <div className="flex h-12 items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <LayoutPanelLeft className="size-4 text-primary" />
                <span>产品空间</span>
              </div>
              <div className="p-2 space-y-1 text-xs">
                <div className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer">
                  <span>📁</span> <span>最近访问</span>
                </div>
                <div className="flex items-center gap-2 rounded px-2 py-1.5 bg-slate-200/80 dark:bg-slate-800 font-bold text-slate-900 dark:text-white cursor-pointer">
                  <span>📄</span> <span className="truncate">退款时效策略 PRD</span>
                </div>
                <div className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer">
                  <span>📄</span> <span className="truncate">风控例外清单</span>
                </div>
                <div className="flex items-center gap-2 rounded px-2 py-1.5 text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800 cursor-pointer">
                  <span>📄</span> <span className="truncate">客服协同流程</span>
                </div>
              </div>

              {/* Zap Overlay Button on Sidebar */}
              {mode === "zap" && (
                <button
                  className="absolute inset-1 grid place-items-center rounded border-2 border-dashed border-danger bg-signal-pink/30 text-danger font-mono text-[10px] font-bold uppercase tracking-wider z-20 hover:bg-signal-pink/50 transition-colors"
                  onClick={() => handleZapElement("sidebar")}
                  type="button"
                >
                  隐藏左侧导航
                </button>
              )}
            </aside>

            {/* Remote Main Article Content */}
            <div
              ref={articleScrollRef}
              className="min-w-0 overflow-y-auto px-6 sm:px-12 py-8 bg-white dark:bg-[#111824] space-y-6"
            >
              <div className="max-w-[680px] mx-auto space-y-5">
                {/* Breadcrumbs & Title */}
                <div>
                  <div className="font-mono text-[10.5px] text-muted-foreground mb-2">
                    支付产品 / 需求文档 / 退款
                  </div>
                  <h1 className="font-heading text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                    {displayTitle}
                  </h1>
                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground font-mono">
                    <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-primary font-bold text-[9px]">
                      ZY
                    </span>
                    <span>产品团队</span>
                    <span>·</span>
                    <span>更新于 2026-08-18</span>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  本文档定义退款申请进入人工审核的触发条件，以及超时后的客服协同方式。现行策略需要同时考虑订单风险等级、支付渠道和用户历史行为。
                </p>

                <div className="space-y-2">
                  <h2 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                    2. 人工审核时效
                  </h2>
                  <div className="rounded-[6px] border border-primary/30 border-l-4 border-l-primary bg-primary/5 p-4 text-xs text-slate-800 dark:text-slate-200 leading-relaxed space-y-1">
                    <div className="font-bold text-primary font-mono text-[10.5px]">核心规则：</div>
                    <p>
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 transition-all cursor-pointer",
                          focusedAnchorId === "anchor-review-window"
                            ? "bg-signal-cyan/40 ring-2 ring-signal-cyan font-semibold text-slate-950 dark:text-slate-50"
                            : "bg-[#fff0a8] dark:bg-[#6b5800] text-slate-900 dark:text-yellow-100 hover:ring-1 hover:ring-warning",
                        )}
                        data-anchor-id="anchor-review-window"
                        onClick={() => focusAnchor("anchor-review-window")}
                      >
                        退款申请提交后超过 24 小时仍未完成自动校验时，必须进入人工审核队列。
                      </span>
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    人工审核任务由支付风控组接收，工作日 09:00–18:00 内需要在 2
                    小时内首次处理。非工作时段产生的任务顺延至下一工作日。
                  </p>
                </div>

                <div className="space-y-2">
                  <h2 className="font-heading text-base font-bold text-slate-900 dark:text-white">
                    3. 状态通知
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    当订单进入人工审核后，客户端展示“退款处理中”。
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 ml-1 transition-all cursor-pointer",
                        focusedAnchorId === "anchor-notification"
                          ? "bg-signal-cyan/40 ring-2 ring-signal-cyan font-semibold text-slate-950 dark:text-slate-50"
                          : "bg-signal-cyan/20 text-slate-900 dark:text-cyan-100 hover:ring-1 hover:ring-primary",
                      )}
                      data-anchor-id="anchor-notification"
                      onClick={() => focusAnchor("anchor-notification")}
                    >
                      服务端只发送一次状态变更通知，并在退款结果确定后发送最终结果。
                    </span>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 dark:text-slate-400 pl-2">
                    <li>审核通过：进入原渠道退款。</li>
                    <li>需要补充材料：创建客服跟进任务。</li>
                    <li>审核拒绝：记录原因并通知用户。</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Remote Right Comments Panel */}
            <aside
              className={cn(
                "relative flex flex-col border-l border-slate-200 dark:border-slate-800 bg-[#f7f8fa] dark:bg-[#171f2d] overflow-hidden transition-opacity duration-150",
                isCommentsHidden ? "opacity-0 pointer-events-none" : "opacity-100",
              )}
            >
              <div className="flex h-12 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>评论</span>
                <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 text-[10px]">
                  2
                </span>
              </div>
              <div className="p-3 space-y-2.5 text-xs overflow-y-auto">
                <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111824] p-2.5 space-y-1 shadow-sm">
                  <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                    周琪 · 产品
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-snug">
                    这里的 24 小时是自然时间还是工作时间？
                  </p>
                </div>
                <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111824] p-2.5 space-y-1 shadow-sm">
                  <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
                    林凯 · 风控
                  </div>
                  <p className="text-[10.5px] text-slate-500 leading-snug">
                    建议补充高风险订单的例外策略。
                  </p>
                </div>
              </div>

              {/* Zap Overlay Button on Comments */}
              {mode === "zap" && (
                <button
                  className="absolute inset-1 grid place-items-center rounded border-2 border-dashed border-danger bg-signal-pink/30 text-danger font-mono text-[10px] font-bold uppercase tracking-wider z-20 hover:bg-signal-pink/50 transition-colors"
                  onClick={() => handleZapElement("comments")}
                  type="button"
                >
                  隐藏评论区
                </button>
              )}
            </aside>
          </div>
        </div>

        {/* Right: Browser Inspector (320px) */}
        <aside className="w-[320px] shrink-0 bg-card flex flex-col min-h-0 overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex h-11 shrink-0 border-b border-ink/20 bg-muted/30 px-3">
            <button
              className={cn(
                "flex-1 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all",
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
                "flex-1 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all",
                activeTab === "projection"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-ink",
              )}
              onClick={() => setActiveTab("projection")}
              type="button"
            >
              Projection
            </button>
            <button
              className={cn(
                "flex-1 py-2 font-mono text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all",
                activeTab === "node"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-ink",
              )}
              onClick={() => setActiveTab("node")}
              type="button"
            >
              Node
            </button>
          </div>

          {/* Inspector Content Scroll Area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Anchors Tab */}
            {activeTab === "anchors" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10.5px] font-bold uppercase text-tertiary">
                    Browser Anchors
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-primary">
                    {anchors.length}
                  </span>
                </div>

                {/* Anchor Cards List */}
                <div className="space-y-2.5">
                  {anchors.map((anchor, idx) => {
                    const isFocused = focusedAnchorId === anchor.id;
                    const isResolved = anchor.lastResolution?.state !== "stale";
                    return (
                      <div
                        key={anchor.id}
                        className={cn(
                          "p-3 rounded-[5px] border transition-all cursor-pointer",
                          isFocused
                            ? "border-2 border-primary bg-primary/5 shadow-[2px_2px_0_var(--primary)]"
                            : "border-ink/25 bg-muted/20 hover:border-ink hover:bg-muted/40",
                        )}
                        onClick={() => focusAnchor(anchor.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 font-mono text-xs font-bold text-ink truncate">
                            <LocateFixed className="size-3.5 text-signal-cyan shrink-0" />
                            <span className="truncate">{anchor.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={cn(
                                "flex items-center gap-0.5 font-mono text-[8.5px] font-bold uppercase px-1 py-0.2 rounded border",
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
                          <p className="text-[11px] italic text-muted-foreground mt-2 line-clamp-2 leading-snug">
                            “{anchor.quote}”
                          </p>
                        )}

                        <div className="flex items-center justify-between text-[8.5px] font-mono text-tertiary mt-2.5 pt-1.5 border-t border-ink/10">
                          <span className="truncate max-w-[200px]">
                            {anchor.locators?.map((l) => l.type).join(" → ") || "text-quote"}
                          </span>
                          <span className="font-bold">A-{String(idx + 1).padStart(2, "0")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Anchor CTA */}
                <Button
                  className="w-full h-8 border border-ink/40 bg-card font-mono text-[11px] font-bold text-ink hover:bg-muted"
                  onClick={() => setMode("anchor")}
                  size="sm"
                  type="button"
                >
                  <TextSelect className="size-3.5 mr-1.5" />
                  <span>Select text to create anchor</span>
                </Button>

                {/* Connected Graph Relationships */}
                <div className="space-y-2 pt-2 border-t border-ink/15">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] font-bold uppercase text-tertiary">
                      Connected Relationships
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {anchorRelations.length}
                    </span>
                  </div>

                  {anchorRelations.length > 0 ? (
                    <div className="space-y-1.5">
                      {anchorRelations.map(({ edge, direction, otherNode, anchorId }) => (
                        <div
                          key={edge.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded border border-ink/20 bg-muted/20 text-xs font-mono transition-all",
                            otherNode && "cursor-pointer hover:border-ink hover:bg-muted/40",
                          )}
                          onClick={() => otherNode && onSelectNode?.(otherNode.id)}
                        >
                          <div className="min-w-0">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold block">
                              {direction === "in" ? "↳ INBOUND" : "OUTBOUND ⇁"}{" "}
                              {anchorId ? `· ${anchorId}` : ""}
                            </span>
                            <span
                              className="font-semibold text-ink truncate block max-w-[180px]"
                              title={otherNode ? getNodeTitle(otherNode.data) : edge.target}
                            >
                              {otherNode ? getNodeTitle(otherNode.data) : edge.target}
                            </span>
                          </div>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[8.5px] font-bold uppercase text-primary border border-primary/20 shrink-0">
                            {edge.data?.relation?.replaceAll("_", " ") || "RELATES"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-mono text-muted-foreground italic">
                      No connected graph relations
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Projection Tab */}
            {activeTab === "projection" && (
              <div className="space-y-4">
                {staleRulesCount > 0 && (
                  <div className="flex items-start gap-2 p-2.5 rounded border border-destructive/40 bg-destructive/10 text-destructive text-[11px] font-mono leading-tight">
                    <TriangleAlert className="size-4 shrink-0 mt-0.5" />
                    <span>{staleRulesCount} rule(s) failed locator resolution on current DOM.</span>
                  </div>
                )}

                {/* Projection Summary Grid */}
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="p-2.5 rounded border border-ink/20 bg-muted/30">
                    <span className="text-[9.5px] uppercase text-muted-foreground font-bold block">
                      Hidden
                    </span>
                    <span className="text-sm font-bold text-ink mt-0.5 block">
                      {hiddenRulesCount}
                    </span>
                  </div>
                  <div className="p-2.5 rounded border border-ink/20 bg-muted/30">
                    <span className="text-[9.5px] uppercase text-muted-foreground font-bold block">
                      Stale
                    </span>
                    <span className="text-sm font-bold text-ink mt-0.5 block">
                      {staleRulesCount}
                    </span>
                  </div>
                </div>

                {/* Rules List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-mono text-[10.5px] font-bold uppercase text-tertiary">
                    <span>Projection Rules</span>
                    <span>{projectionRules.length}</span>
                  </div>

                  {projectionRules.map((rule) => {
                    const isEnabled = rule.enabled !== false;
                    return (
                      <div
                        key={rule.id}
                        className="flex items-start justify-between gap-2 p-2.5 rounded border border-ink/25 bg-muted/20 font-mono"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-ink truncate">
                            {rule.id.includes("sidebar") ? (
                              <PanelLeftClose className="size-3.5 text-primary shrink-0" />
                            ) : (
                              <MessageSquareOff className="size-3.5 text-primary shrink-0" />
                            )}
                            <span className="truncate">{rule.name || rule.id}</span>
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate">
                            {rule.target?.elementRole ||
                              rule.target?.selector ||
                              "provider-element"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <button
                            aria-checked={isEnabled}
                            aria-label={`Toggle rule ${rule.name}`}
                            className={cn(
                              "relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                              isEnabled ? "bg-primary" : "bg-muted-foreground/30",
                            )}
                            onClick={() => toggleRule(rule.id)}
                            role="switch"
                            type="button"
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block size-3.5 rounded-full bg-white shadow transform transition duration-200 ease-in-out",
                                isEnabled ? "translate-x-3.5" : "translate-x-0",
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

                {/* Projection Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-ink/15 font-mono">
                  <Button
                    className="w-full h-7.5 border border-ink/40 bg-card text-ink font-bold text-[10.5px] hover:bg-muted"
                    onClick={() => setRevealed(!revealed)}
                    size="sm"
                    type="button"
                  >
                    <Eye className="size-3.5 mr-1" />
                    <span>
                      {revealed ? "Restore hidden projection" : "Temporarily reveal hidden"}
                    </span>
                  </Button>

                  <Button
                    className="w-full h-7.5 border border-destructive/40 bg-card text-destructive font-bold text-[10.5px] hover:bg-destructive/10"
                    onClick={handleResetProjection}
                    size="sm"
                    type="button"
                  >
                    <RotateCcw className="size-3.5 mr-1" />
                    <span>Reset node projection</span>
                  </Button>
                </div>

                {/* Provider Preset Info */}
                <div className="rounded border border-ink/20 bg-muted/30 p-3 space-y-1.5 font-mono text-[10px]">
                  <div className="font-bold uppercase text-tertiary">Provider Preset</div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Provider:</span>
                    <span className="text-ink font-semibold">{source.provider}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Preset:</span>
                    <span className="text-ink font-semibold">document-clean-v3</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Merge order:</span>
                    <span className="text-ink font-semibold">provider → node → focus</span>
                  </div>
                </div>
              </div>
            )}

            {/* Node Metadata Tab */}
            {activeTab === "node" && (
              <div className="space-y-4 font-mono text-xs">
                <div className="font-bold uppercase text-tertiary text-[10.5px]">Node Metadata</div>
                <div className="rounded border border-ink/20 bg-muted/20 p-3 space-y-2 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Node ID:</span>
                    <span className="font-bold text-ink">{nodeId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-bold uppercase text-signal-cyan">BROWSER</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider:</span>
                    <span className="font-bold uppercase text-ink">{source.provider}</span>
                  </div>
                  {source.documentId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Document ID:</span>
                      <span className="font-bold text-ink truncate max-w-[140px]">
                        {source.documentId}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Profile:</span>
                    <span className="font-bold text-ink">{source.profileId || "default"}</span>
                  </div>
                </div>

                <div className="font-bold uppercase text-tertiary text-[10.5px]">Runtime Pool</div>
                <div className="rounded border border-ink/20 bg-muted/20 p-3 space-y-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between text-ink">
                    <span className="flex items-center gap-1.5">
                      <Globe2 className="size-3 text-success" />
                      <span className="font-bold">Current Node</span>
                    </span>
                    <span className="rounded bg-success/10 border border-success/20 px-1.5 py-0.2 text-[8px] font-bold uppercase text-success">
                      active
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Globe2 className="size-3 text-warning" />
                      <span>Warm Pool #1</span>
                    </span>
                    <span className="rounded bg-warning/10 border border-warning/20 px-1.5 py-0.2 text-[8px] font-bold uppercase text-warning">
                      warm
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Globe2 className="size-3 text-warning" />
                      <span>Warm Pool #2</span>
                    </span>
                    <span className="rounded bg-warning/10 border border-warning/20 px-1.5 py-0.2 text-[8px] font-bold uppercase text-warning">
                      warm
                    </span>
                  </div>
                </div>

                <div className="font-bold uppercase text-tertiary text-[10.5px]">
                  Persistence Boundary
                </div>
                <div className="rounded border border-ink/20 bg-muted/20 p-3 space-y-1.5 text-[10px] text-muted-foreground">
                  <p>• Graph Server: source, preview, anchors, projection rules.</p>
                  <p>• Electron Local: session, cookies, cache, WebContentsView.</p>
                  <p>• Security: sandboxed, permissions denied, popups blocked.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Content Status Bar (28px / h-7) */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-ink/20 bg-muted/30 px-4 sm:px-5 font-mono text-[10px] text-tertiary">
        <div className="flex items-center gap-3">
          <span className="uppercase font-bold text-ink">
            {source.provider.replaceAll("-", " ")}
          </span>
          <span>PROFILE · {source.profileId ? source.profileId.toUpperCase() : "DEFAULT"}</span>
          <span>RUNTIME 1/3</span>
        </div>
        <div className="flex items-center gap-3 font-semibold">
          <span>{anchors.length} ANCHORS</span>
          <span>{projectionRules.length} RULES</span>
          <span className={cn(staleRulesCount > 0 ? "text-danger font-bold" : "text-success")}>
            {staleRulesCount > 0 ? `${staleRulesCount} STALE` : "ALL RESOLVED"}
          </span>
        </div>
      </div>
    </div>
  );
}
