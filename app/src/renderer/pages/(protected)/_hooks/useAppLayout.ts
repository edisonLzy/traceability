import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react-dom";
import { cn } from "@renderer/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type ComponentPropsWithRef,
} from "react";
import type {
  GroupImperativeHandle,
  GroupProps,
  Layout as ResizableLayout,
  LayoutChangedMeta,
  PanelProps,
  SeparatorProps,
} from "react-resizable-panels";

import type { FloatingAgentLauncherProps } from "../_components/AgentPanel/FloatingAgentLauncher";
import { useDraggableAgentLauncher } from "./useDraggableAgentLauncher";

export const DEFAULT_CONTENT_SHARE = 50;
export const MIN_CONTENT_SHARE = 38;
export const MAX_CONTENT_SHARE = 68;

export type AppLayoutMode = "split" | "content" | "agent";

export interface AppLayoutState {
  contentShare: number;
  mode: AppLayoutMode;
  isFloatingAgentOpen: boolean;
}

export type AppLayoutAction =
  | { type: "resize"; contentShare: number }
  | { type: "focus-content" }
  | { type: "focus-agent" }
  | { type: "restore-split" }
  | { type: "set-floating-agent-open"; open: boolean };

export const INITIAL_APP_LAYOUT_STATE: AppLayoutState = {
  contentShare: DEFAULT_CONTENT_SHARE,
  mode: "split",
  isFloatingAgentOpen: false,
};

export function clampContentShare(contentShare: number): number {
  if (!Number.isFinite(contentShare)) return DEFAULT_CONTENT_SHARE;
  return Math.min(MAX_CONTENT_SHARE, Math.max(MIN_CONTENT_SHARE, contentShare));
}

export function appLayoutReducer(state: AppLayoutState, action: AppLayoutAction): AppLayoutState {
  switch (action.type) {
    case "resize":
      return { ...state, contentShare: clampContentShare(action.contentShare) };
    case "focus-content":
      return { ...state, mode: "content", isFloatingAgentOpen: false };
    case "focus-agent":
      return { ...state, mode: "agent", isFloatingAgentOpen: false };
    case "restore-split":
      return { ...state, mode: "split", isFloatingAgentOpen: false };
    case "set-floating-agent-open":
      return state.mode === "content" ? { ...state, isFloatingAgentOpen: action.open } : state;
  }
}

export interface AppPanelLayout {
  content: number;
  agent: number;
}

export function getAppPanelLayout(state: AppLayoutState): AppPanelLayout {
  if (state.mode === "content") return { content: 100, agent: 0 };
  if (state.mode === "agent") return { content: 0, agent: 100 };
  return { content: state.contentShare, agent: 100 - state.contentShare };
}

const CONTENT_PANEL_ID = "workspace-content";
const AGENT_PANEL_ID = "workspace-agent";
const FLOATING_AGENT_GAP = 12;
const FLOATING_AGENT_PADDING = 18;

const DEFAULT_WORKSPACE_PANEL_LAYOUT = {
  [CONTENT_PANEL_ID]: INITIAL_APP_LAYOUT_STATE.contentShare,
  [AGENT_PANEL_ID]: 100 - INITIAL_APP_LAYOUT_STATE.contentShare,
};

/** Owns the protected app's split/focused panel modes and their command-palette actions. */
export function useAppLayout() {
  const [state, dispatch] = useReducer(appLayoutReducer, INITIAL_APP_LAYOUT_STATE);
  const panelGroupRef = useRef<GroupImperativeHandle>(null);
  const agentPanelContainerRef = useRef<HTMLDivElement>(null);
  const wasFloatingAgentOpenRef = useRef(false);

  const isSplitMode = state.mode === "split";
  const isFloatingAgentMode = state.mode === "content";
  const isFloatingAgentOpen = isFloatingAgentMode && state.isFloatingAgentOpen;
  const { content: visibleContentShare, agent: visibleAgentShare } = getAppPanelLayout(state);

  const handleFocusContent = useCallback(() => dispatch({ type: "focus-content" }), []);
  const handleFocusAgent = useCallback(() => dispatch({ type: "focus-agent" }), []);
  const handleSplitView = useCallback(() => dispatch({ type: "restore-split" }), []);
  const setFloatingAgentOpen = useCallback((open: boolean) => {
    dispatch({ type: "set-floating-agent-open", open });
  }, []);
  const handleFloatingAgentLauncherPress = useCallback(() => {
    setFloatingAgentOpen(!isFloatingAgentOpen);
  }, [isFloatingAgentOpen, setFloatingAgentOpen]);
  const {
    boundaryElement: floatingBoundaryElement,
    boundaryRef: setFloatingBoundaryElement,
    buttonProps: floatingLauncherButtonProps,
    launcherElement: floatingLauncherElement,
    launcherRef: setFloatingLauncherElement,
    position: floatingLauncherPosition,
    style: floatingLauncherStyle,
    summarySide: floatingSummarySide,
  } = useDraggableAgentLauncher({
    onPress: handleFloatingAgentLauncherPress,
  });

  const floatingBoundary = floatingBoundaryElement ?? "clippingAncestors";
  const {
    elements: { floating: floatingAgentElement },
    floatingStyles,
    isPositioned: isFloatingAgentPositioned,
    refs: { setFloating: setFloatingAgentElement },
    update: updateFloatingAgentPosition,
  } = useFloating<HTMLElement>({
    elements: { reference: floatingLauncherElement },
    middleware: [
      offset(FLOATING_AGENT_GAP),
      flip({ boundary: floatingBoundary, padding: FLOATING_AGENT_PADDING }),
      shift({ boundary: floatingBoundary, padding: FLOATING_AGENT_PADDING }),
    ],
    open: isFloatingAgentOpen,
    placement: "top-end",
    strategy: "fixed",
    transform: false,
  });
  const isFloatingAgentVisible = isFloatingAgentOpen && isFloatingAgentPositioned;

  const setAgentPanelContainer = useCallback(
    (element: HTMLDivElement | null) => {
      agentPanelContainerRef.current = element;
      setFloatingAgentElement(element);
    },
    [setFloatingAgentElement],
  );

  const handleOpenFloatingAgent = useCallback(() => {
    setFloatingAgentOpen(true);
  }, [setFloatingAgentOpen]);

  const handleLayoutChanged = useCallback(
    (layout: ResizableLayout, metadata: LayoutChangedMeta) => {
      if (!isSplitMode || !metadata.isUserInteraction) return;
      const contentShare = layout[CONTENT_PANEL_ID];
      if (contentShare === undefined) return;
      dispatch({ type: "resize", contentShare });
    },
    [isSplitMode],
  );

  useLayoutEffect(() => {
    // Panel constraint changes cause react-resizable-panels to re-register each
    // panel. Apply the imperative layout after that registration has settled;
    // otherwise the previous split-view max sizes clamp a 100/0 layout.
    const animationFrame = requestAnimationFrame(() => {
      panelGroupRef.current?.setLayout({
        [CONTENT_PANEL_ID]: visibleContentShare,
        [AGENT_PANEL_ID]: visibleAgentShare,
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [visibleAgentShare, visibleContentShare]);

  useLayoutEffect(() => {
    if (!isFloatingAgentOpen) return;
    updateFloatingAgentPosition();
  }, [floatingLauncherPosition, isFloatingAgentOpen, updateFloatingAgentPosition]);

  useEffect(() => {
    if (!isFloatingAgentOpen || !floatingLauncherElement || !floatingAgentElement) return;

    return autoUpdate(floatingLauncherElement, floatingAgentElement, updateFloatingAgentPosition);
  }, [
    floatingAgentElement,
    floatingLauncherElement,
    isFloatingAgentOpen,
    updateFloatingAgentPosition,
  ]);

  useEffect(() => {
    if (!isFloatingAgentOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setFloatingAgentOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isFloatingAgentOpen, setFloatingAgentOpen]);

  useEffect(() => {
    const wasOpen = wasFloatingAgentOpenRef.current;
    wasFloatingAgentOpenRef.current = isFloatingAgentVisible;

    if (isFloatingAgentVisible) {
      const animationFrame = requestAnimationFrame(() => agentPanelContainerRef.current?.focus());
      return () => cancelAnimationFrame(animationFrame);
    }

    if (wasOpen && isFloatingAgentMode) floatingLauncherElement?.focus();
  }, [floatingLauncherElement, isFloatingAgentMode, isFloatingAgentVisible]);

  const getMainRegionProps = useCallback(
    (): ComponentPropsWithRef<"div"> => ({
      ref: setFloatingBoundaryElement,
      className: "relative min-w-0 flex-1 overflow-hidden",
    }),
    [setFloatingBoundaryElement],
  );

  const getResizablePanelGroupProps = useCallback(
    (): GroupProps => ({
      className: "min-w-0 flex-1",
      defaultLayout: DEFAULT_WORKSPACE_PANEL_LAYOUT,
      groupRef: panelGroupRef,
      id: "workspace-panels",
      onLayoutChanged: handleLayoutChanged,
      orientation: "horizontal",
    }),
    [handleLayoutChanged],
  );

  const getMainPanelProps = useCallback(
    (): PanelProps => ({
      id: CONTENT_PANEL_ID,
      maxSize: isSplitMode ? `${MAX_CONTENT_SHARE}%` : isFloatingAgentMode ? "100%" : "0%",
      minSize: isSplitMode ? `${MIN_CONTENT_SHARE}%` : "0%",
    }),
    [isFloatingAgentMode, isSplitMode],
  );

  const getAgentPanelProps = useCallback(
    (): PanelProps => ({
      className: cn(isFloatingAgentMode && "!overflow-visible"),
      collapsedSize: "0%",
      collapsible: true,
      id: AGENT_PANEL_ID,
      maxSize: isSplitMode ? `${100 - MIN_CONTENT_SHARE}%` : "100%",
      minSize: isSplitMode ? `${100 - MAX_CONTENT_SHARE}%` : "0%",
    }),
    [isFloatingAgentMode, isSplitMode],
  );

  const getResizeHandleProps = useCallback(
    (): SeparatorProps => ({
      "aria-label": "Resize content and Agent panels",
      className: cn(
        "w-px bg-hairline transition-colors hover:bg-primary/70 focus-visible:bg-primary",
        !isSplitMode && "pointer-events-none invisible",
      ),
      disabled: !isSplitMode,
      id: "workspace-panel-resize-handle",
    }),
    [isSplitMode],
  );

  const getAgentPanelContainerProps = useCallback(
    (): ComponentPropsWithRef<"div"> => ({
      ref: setAgentPanelContainer,
      "aria-hidden": isFloatingAgentMode && !isFloatingAgentVisible ? true : undefined,
      "aria-label": isFloatingAgentMode ? "Floating Traceability Agent" : undefined,
      "aria-modal": isFloatingAgentMode ? false : undefined,
      className: cn(
        "min-w-0",
        isFloatingAgentMode
          ? "z-50 h-[min(580px,calc(100%_-_36px))] w-[min(390px,calc(100%_-_36px))] overflow-hidden rounded-2xl border border-hairline-strong bg-surface-glass-elevated shadow-[0_20px_60px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none"
          : "relative h-full",
        isFloatingAgentMode &&
          (isFloatingAgentVisible
            ? "visible translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-2 opacity-0"),
      ),
      id: "floating-agent-panel",
      inert: isFloatingAgentMode && !isFloatingAgentVisible ? true : undefined,
      role: isFloatingAgentMode ? "dialog" : undefined,
      style: isFloatingAgentMode ? floatingStyles : undefined,
      tabIndex: isFloatingAgentVisible ? -1 : undefined,
    }),
    [floatingStyles, isFloatingAgentMode, isFloatingAgentVisible, setAgentPanelContainer],
  );

  const getFloatingAgentLauncherProps = useCallback(
    (): FloatingAgentLauncherProps => ({
      buttonRef: setFloatingLauncherElement,
      isOpen: isFloatingAgentOpen,
      launcherButtonProps: floatingLauncherButtonProps,
      launcherStyle: floatingLauncherStyle,
      onOpen: handleOpenFloatingAgent,
      summarySide: floatingSummarySide,
    }),
    [
      floatingLauncherButtonProps,
      floatingLauncherStyle,
      floatingSummarySide,
      handleOpenFloatingAgent,
      isFloatingAgentOpen,
      setFloatingLauncherElement,
    ],
  );

  return {
    getAgentPanelContainerProps,
    getAgentPanelProps,
    getFloatingAgentLauncherProps,
    getMainPanelProps,
    getMainRegionProps,
    getResizablePanelGroupProps,
    getResizeHandleProps,
    handleFocusAgent,
    handleFocusContent,
    handleSplitView,
    isFloatingAgentMode,
    layoutMode: state.mode,
  };
}
