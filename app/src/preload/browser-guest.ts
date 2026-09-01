import { ipcRenderer } from "electron";

import type { BrowserLocator, BrowserMode, ProjectionRule } from "../main/browser/types.js";

let currentMode: BrowserMode = "read";
let selectionTimer: NodeJS.Timeout | null = null;
let lastHoveredElement: Element | null = null;

function computeCssSelector(el: Element): string {
  if (!el || el === document.body || el === document.documentElement) return "";
  if (el.id) return `#${CSS.escape(el.id)}`;

  const role = el.getAttribute("role");
  if (role) {
    const roleSelector = `${el.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`;
    try {
      if (document.querySelectorAll(roleSelector).length === 1) return roleSelector;
    } catch {
      // ignore
    }
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const ariaSelector = `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]`;
    try {
      if (document.querySelectorAll(ariaSelector).length === 1) return ariaSelector;
    } catch {
      // ignore
    }
  }

  if (el.className && typeof el.className === "string") {
    const classes = el.className
      .trim()
      .split(/\s+/)
      .filter((c) => c && !c.startsWith("__tr_") && !c.includes(":"));
    if (classes.length > 0) {
      const classSelector = `${el.tagName.toLowerCase()}.${classes.slice(0, 2).map(CSS.escape).join(".")}`;
      try {
        if (document.querySelectorAll(classSelector).length <= 3) return classSelector;
      } catch {
        // ignore
      }
    }
  }

  let tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter((child) => child.tagName === el.tagName);
  if (siblings.length > 1) {
    const index = siblings.indexOf(el) + 1;
    tag += `:nth-of-type(${index})`;
  }
  const parentSelector = computeCssSelector(parent);
  return parentSelector ? `${parentSelector} > ${tag}` : tag;
}

function computeXPath(node: Node | null): string {
  if (!node || node === document.body) return "";
  const segments: string[] = [];
  let current: Node | null = node;
  while (current && current !== document.body && current !== document.documentElement) {
    const parent: Node | null = current.parentNode;
    if (!parent) break;
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tagName = (current as Element).nodeName.toLowerCase();
      const siblings = Array.from(parent.childNodes).filter(
        (c) =>
          c.nodeType === Node.ELEMENT_NODE && (c as Element).nodeName.toLowerCase() === tagName,
      );
      const index = siblings.indexOf(current as ChildNode) + 1;
      segments.unshift(`${tagName}[${index}]`);
    }
    current = parent;
  }
  return `//${segments.join("/")}`;
}

function handleMouseMove(e: MouseEvent) {
  if (currentMode !== "zap") return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el || el === document.body || el === document.documentElement) {
    if (lastHoveredElement) {
      lastHoveredElement = null;
      ipcRenderer.sendToHost("browser-guest:hover", { rect: null });
    }
    return;
  }

  if (el === lastHoveredElement) return;
  lastHoveredElement = el;

  const rect = el.getBoundingClientRect();
  const selector = computeCssSelector(el);
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || el.getAttribute("aria-label") || tag;
  const textSnippet = (el.textContent || "").slice(0, 30).trim();
  const label = `隐藏 ${role ? role : tag}${textSnippet ? ` (${textSnippet})` : ""}`;

  ipcRenderer.sendToHost("browser-guest:hover", {
    rect: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    selector,
    tag,
    label,
  });
}

function handleClick(e: MouseEvent) {
  if (currentMode !== "zap") return;
  const target = lastHoveredElement || document.elementFromPoint(e.clientX, e.clientY);
  if (!target || target === document.body || target === document.documentElement) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const selector = computeCssSelector(target);
  const xpath = computeXPath(target);
  const tag = target.tagName.toLowerCase();
  const role = target.getAttribute("role") || target.getAttribute("aria-label") || tag;
  const textSnippet = (target.textContent || "").slice(0, 30).trim();
  const suggestedName = `Hide ${role ? role : tag}${textSnippet ? ` (${textSnippet})` : ""}`;

  const locators: BrowserLocator[] = [];
  if (selector) locators.push({ type: "css-selector", selector });
  if (xpath) locators.push({ type: "dom-path", xpath });

  lastHoveredElement = null;
  currentMode = "read";
  document.body.style.cursor = "";

  ipcRenderer.sendToHost("browser-guest:element-picked", {
    locators,
    suggestedName,
    selector,
    tagName: tag,
  });
}

function handleSelection() {
  if (selectionTimer) clearTimeout(selectionTimer);
  selectionTimer = setTimeout(emitSelection, 60);
}

function emitSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    ipcRenderer.sendToHost("browser-guest:selection-cleared", {});
    return;
  }

  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text || text.length < 2) {
    ipcRenderer.sendToHost("browser-guest:selection-cleared", {});
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const container = range.commonAncestorContainer;
  const el = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const xpath = computeXPath(el);

  const locators: BrowserLocator[] = [{ type: "text-quote", exact: text }];
  if (xpath) {
    locators.push({ type: "dom-path", xpath });
  }

  ipcRenderer.sendToHost("browser-guest:selection", {
    text,
    quote: text,
    locators,
    rectViewport: {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  });
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (currentMode !== "read") {
      currentMode = "read";
      lastHoveredElement = null;
      document.body.style.cursor = "";
      ipcRenderer.sendToHost("browser-guest:hover", { rect: null });
      ipcRenderer.sendToHost("browser-guest:escape", {});
    }
  }
}

function handleScroll() {
  ipcRenderer.sendToHost("browser-guest:scroll", {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  });
}

// Attach event listeners
document.addEventListener("mousemove", handleMouseMove, true);
document.addEventListener("click", handleClick, true);
document.addEventListener("mouseup", handleSelection, true);
document.addEventListener("keyup", handleSelection, true);
window.addEventListener("keydown", handleKeyDown, true);
window.addEventListener("scroll", handleScroll, { passive: true });

// Listen for commands from Host
ipcRenderer.on("browser-guest:set-mode", (_event, mode: BrowserMode) => {
  currentMode = mode;
  lastHoveredElement = null;
  if (mode === "zap") {
    document.body.style.cursor = "crosshair";
  } else {
    document.body.style.cursor = "";
    ipcRenderer.sendToHost("browser-guest:hover", { rect: null });
  }
});

ipcRenderer.on(
  "browser-guest:apply-projection",
  (_event, payload: { rules: ProjectionRule[]; revealed?: boolean }) => {
    try {
      const hideSelectors: string[] = [];
      if (!payload.revealed && Array.isArray(payload.rules)) {
        for (const r of payload.rules) {
          if (r.enabled !== false && r.target?.selector) {
            hideSelectors.push(r.target.selector);
          }
        }
      }
      let styleEl = document.getElementById("__tr_projection_styles__");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "__tr_projection_styles__";
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent =
        hideSelectors.length > 0 ? `${hideSelectors.join(", ")} { display: none !important; }` : "";
    } catch (err) {
      console.error("Error applying projection in guest:", err);
    }
  },
);

ipcRenderer.on(
  "browser-guest:focus-anchor",
  (_event, payload: { anchorId: string; locators?: BrowserLocator[] }) => {
    if (!payload.locators || payload.locators.length === 0) return;
    for (const loc of payload.locators) {
      let target: Element | null = null;
      if (loc.type === "text-quote" && loc.exact) {
        const elements = Array.from(
          document.querySelectorAll(
            "p, h1, h2, h3, h4, h5, h6, li, span, div, a, article, section",
          ),
        );
        for (const el of elements) {
          if (el.textContent && el.textContent.includes(loc.exact)) {
            target = el;
            break;
          }
        }
      } else if (loc.type === "css-selector" && loc.selector) {
        target = document.querySelector(loc.selector);
      } else if (loc.type === "dom-path" && loc.xpath) {
        try {
          const result = document.evaluate(
            loc.xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          target = result.singleNodeValue as Element | null;
        } catch {
          // ignore
        }
      }

      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const htmlTarget = target as HTMLElement;
        const originalOutline = htmlTarget.style.outline;
        const originalTransition = htmlTarget.style.transition;
        htmlTarget.style.transition = "outline 0.2s ease-in-out";
        htmlTarget.style.outline = "3px solid #27b9dc";
        setTimeout(() => {
          htmlTarget.style.outline = originalOutline;
          htmlTarget.style.transition = originalTransition;
        }, 3000);
        return;
      }
    }
  },
);
