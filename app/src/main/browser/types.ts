import type {
  BrowserAnchor,
  BrowserLocator,
  BrowserNodeData,
  BrowserProjection,
  BrowserProvider,
  BrowserResolution,
  BrowserSource,
  BrowserViewState,
  ProjectionRule,
} from "../../shared/browser-node-types.js";

export type {
  BrowserAnchor,
  BrowserLocator,
  BrowserNodeData,
  BrowserProjection,
  BrowserProvider,
  BrowserResolution,
  BrowserSource,
  BrowserViewState,
  ProjectionRule,
};

export type BrowserRuntimeState = "dormant" | "loading" | "active" | "warm" | "destroyed";

export type BrowserMode = "read" | "anchor" | "zap";

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserRuntimeAttachInput {
  nodeId: string;
  graphId: string;
  source: BrowserSource;
  bounds: BrowserBounds;
  projection?: BrowserProjection;
  viewState?: BrowserViewState;
  mode?: BrowserMode;
}

export interface BrowserRuntimeUpdateBoundsInput {
  nodeId: string;
  bounds: BrowserBounds;
}

export interface BrowserRuntimeDetachInput {
  nodeId: string;
  viewState?: BrowserViewState;
}

export interface BrowserRuntimeSetModeInput {
  nodeId: string;
  mode: BrowserMode;
}

export interface BrowserRuntimeApplyProjectionInput {
  nodeId: string;
  rules: ProjectionRule[];
  revealed?: boolean;
}

export interface BrowserRuntimeFocusAnchorInput {
  nodeId: string;
  anchorId: string;
  locators?: BrowserLocator[];
}

export interface BrowserRuntimeEventMap {
  "browser-runtime:anchorSelected": {
    nodeId: string;
    quote: string;
    locators: BrowserLocator[];
  };
  "browser-runtime:elementZapped": {
    nodeId: string;
    locators: BrowserLocator[];
    suggestedName?: string;
  };
  "browser-runtime:resolutions": {
    nodeId: string;
    anchors: Record<string, BrowserResolution>;
    rules: Record<string, BrowserResolution>;
  };
  "browser-runtime:stateChanged": {
    nodeId: string;
    state: BrowserRuntimeState;
    title?: string;
    url?: string;
  };
}
