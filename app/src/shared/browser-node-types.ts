export type BrowserProvider = "generic-web" | "feishu-doc" | "confluence";

export type BrowserLocator =
  | { type: "feishu-block"; documentId: string; blockId: string }
  | { type: "confluence-content"; pageId: string; localId?: string }
  | { type: "provider-element"; provider: BrowserProvider; role: string }
  | { type: "text-quote"; exact: string; prefix?: string; suffix?: string }
  | { type: "heading-path"; headings: string[]; occurrence?: number }
  | { type: "text-position"; start: number; end: number; contentHash?: string }
  | { type: "dom-path"; xpath: string; startOffset?: number; endOffset?: number }
  | { type: "css-selector"; selector: string };

export interface BrowserResolution {
  state: "resolved" | "unresolved" | "stale";
  locatorType?: string;
  checkedAt?: string;
  reason?: string;
}

export interface BrowserAnchor {
  id: string;
  label: string;
  quote?: string;
  locators?: BrowserLocator[];
  createdBy?: "user" | "agent";
  createdAt?: string;
  updatedAt?: string;
  lastResolution?: BrowserResolution;
}

export interface ProjectionRule {
  id: string;
  operation?: "hide" | "collapse" | "focus";
  name?: string;
  target?: {
    locators?: BrowserLocator[];
    selector?: string;
    xpath?: string;
    elementRole?: string;
  };
  enabled?: boolean;
  origin?: "user" | "agent" | "provider-preset";
  createdAt?: string;
  updatedAt?: string;
  lastResolution?: BrowserResolution;
}

export interface BrowserProjection {
  providerPresetVersion?: string;
  rules?: ProjectionRule[];
}

export interface BrowserViewState {
  focusedAnchorId?: string;
  scrollAnchorId?: string;
  scrollTop?: number;
  lastOpenedAt?: string;
}

export interface BrowserSource {
  provider: BrowserProvider;
  url: string;
  canonicalUrl?: string;
  title?: string;
  siteName?: string;
  documentId?: string;
  profileId?: string;
}

export interface BrowserPreview {
  title?: string;
  excerpt?: string;
  faviconUrl?: string;
  capturedAt?: string;
  contentHash?: string;
  snapshotObjectKey?: string;
}

export interface BrowserNodeData {
  kind: "browser";
  schemaVersion?: number;
  source: BrowserSource;
  preview?: BrowserPreview;
  anchors?: BrowserAnchor[];
  projection?: BrowserProjection;
  viewState?: BrowserViewState;
}
