/**
 * Helper scripts injected into guest <webview> pages to provide
 * Anchor selection, Zap element picker, Projection CSS application,
 * and Anchor focus scrolling.
 */
export function getGuestBridgeScript(): string {
  return `
(function() {
  if (window.__TR_GUEST_BRIDGE_INJECTED__) return;
  window.__TR_GUEST_BRIDGE_INJECTED__ = true;

  var currentMode = "read";
  var hoverOverlay = null;
  var hoveredElement = null;

  function sendToHost(channel, data) {
    var payloadStr = JSON.stringify({ channel: channel, data: data });

    // 1. Output console-message for host <webview> and main process to capture
    try {
      console.debug('__TR_GUEST_EVENT__:' + payloadStr);
    } catch(e) {}

    // 2. Try electron ipcRenderer if available (e.g. in preload)
    try {
      if (typeof require !== 'undefined') {
        var electron = require('electron');
        if (electron && electron.ipcRenderer) {
          electron.ipcRenderer.sendToHost(channel, data);
        }
      }
    } catch(e) {}
  }

  // Helper to compute CSS selector for an element
  function computeCssSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return '';
    if (el.id) return '#' + CSS.escape(el.id);

    var role = el.getAttribute('role');
    if (role) {
      var roleSelector = el.tagName.toLowerCase() + '[role="' + CSS.escape(role) + '"]';
      try {
        if (document.querySelectorAll(roleSelector).length === 1) return roleSelector;
      } catch(e) {}
    }

    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      var ariaSelector = el.tagName.toLowerCase() + '[aria-label="' + CSS.escape(ariaLabel) + '"]';
      try {
        if (document.querySelectorAll(ariaSelector).length === 1) return ariaSelector;
      } catch(e) {}
    }

    if (el.className && typeof el.className === 'string') {
      var classes = el.className.trim().split(/\\s+/).filter(function(c) {
        return c && !c.startsWith('__tr_') && !c.includes(':');
      });
      if (classes.length > 0) {
        var classSelector = el.tagName.toLowerCase() + '.' + classes.slice(0, 2).map(CSS.escape).join('.');
        try {
          if (document.querySelectorAll(classSelector).length <= 3) return classSelector;
        } catch(e) {}
      }
    }

    var tag = el.tagName.toLowerCase();
    var parent = el.parentElement;
    if (!parent) return tag;
    var siblings = Array.from(parent.children).filter(function(child) { return child.tagName === el.tagName; });
    if (siblings.length > 1) {
      var index = siblings.indexOf(el) + 1;
      tag += ':nth-of-type(' + index + ')';
    }
    var parentSelector = computeCssSelector(parent);
    return parentSelector ? parentSelector + ' > ' + tag : tag;
  }

  // Helper to compute XPath for an element
  function computeXPath(node) {
    if (!node || node === document.body) return '';
    var segments = [];
    var current = node;
    while (current && current !== document.body && current !== document.documentElement) {
      var parent = current.parentNode;
      if (!parent) break;
      if (current.nodeType === Node.ELEMENT_NODE) {
        var tagName = current.nodeName.toLowerCase();
        var siblings = Array.from(parent.children).filter(function(c) { return c.nodeName.toLowerCase() === tagName; });
        var index = siblings.indexOf(current) + 1;
        segments.unshift(tagName + '[' + index + ']');
      }
      current = parent;
    }
    return '//' + segments.join('/');
  }

  // --- ZAP PICKER OVERLAY ---
  function createHoverOverlay() {
    if (hoverOverlay) return hoverOverlay;
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = '__tr_zap_overlay__';
    hoverOverlay.style.position = 'fixed';
    hoverOverlay.style.pointerEvents = 'none';
    hoverOverlay.style.border = '2px dashed #f43f5e';
    hoverOverlay.style.backgroundColor = 'rgba(244, 63, 94, 0.15)';
    hoverOverlay.style.zIndex = '2147483647';
    hoverOverlay.style.transition = 'all 0.05s ease-out';
    hoverOverlay.style.display = 'none';
    hoverOverlay.style.borderRadius = '4px';

    var badge = document.createElement('div');
    badge.id = '__tr_zap_badge__';
    badge.style.position = 'absolute';
    badge.style.top = '-22px';
    badge.style.left = '0';
    badge.style.backgroundColor = '#f43f5e';
    badge.style.color = '#ffffff';
    badge.style.fontFamily = 'monospace';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = 'bold';
    badge.style.padding = '2px 6px';
    badge.style.borderRadius = '3px';
    badge.style.whiteSpace = 'nowrap';
    badge.style.pointerEvents = 'none';
    badge.textContent = '点击隐藏此区域 (Esc 退出)';
    hoverOverlay.appendChild(badge);

    (document.body || document.documentElement).appendChild(hoverOverlay);
    return hoverOverlay;
  }

  function updateHoverOverlay(el) {
    if (!el || !hoverOverlay) return;
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      hoverOverlay.style.display = 'none';
      return;
    }
    hoverOverlay.style.display = 'block';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
  }

  function handleMouseMove(e) {
    if (currentMode !== 'zap') return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverOverlay || el === document.body || el === document.documentElement) {
      if (hoverOverlay) hoverOverlay.style.display = 'none';
      hoveredElement = null;
      return;
    }
    hoveredElement = el;
    updateHoverOverlay(el);
  }

  function handleClick(e) {
    if (currentMode !== 'zap') return;
    var target = hoveredElement || document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === hoverOverlay || target === document.body || target === document.documentElement) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    var selector = computeCssSelector(target);
    var xpath = computeXPath(target);
    var tag = target.tagName.toLowerCase();
    var role = target.getAttribute('role') || target.getAttribute('aria-label') || tag;
    var textSnippet = (target.textContent || '').slice(0, 30).trim();
    var suggestedName = 'Hide ' + (role ? role : tag) + (textSnippet ? ' (' + textSnippet + ')' : '');

    var locators = [];
    if (selector) locators.push({ type: 'css-selector', selector: selector });
    if (xpath) locators.push({ type: 'dom-path', xpath: xpath });

    if (hoverOverlay) hoverOverlay.style.display = 'none';
    currentMode = 'read';
    document.body.style.cursor = '';

    sendToHost('__tr_zap_element__', {
      locators: locators,
      suggestedName: suggestedName,
      selector: selector,
      tagName: tag
    });
  }

  // --- ANCHOR SELECTION ---
  var selectionTimer = null;
  function handleSelection() {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(emitSelection, 80);
  }

  function emitSelection() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      sendToHost('__tr_selection_cleared__', {});
      return;
    }

    var text = selection.toString().replace(/\\s+/g, ' ').trim();
    if (!text || text.length < 2) {
      sendToHost('__tr_selection_cleared__', {});
      return;
    }

    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    var container = range.commonAncestorContainer;
    var el = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    var xpath = computeXPath(el);

    var locators = [
      { type: 'text-quote', exact: text }
    ];
    if (xpath) {
      locators.push({ type: 'dom-path', xpath: xpath });
    }

    sendToHost('__tr_selection__', {
      text: text,
      quote: text,
      locators: locators,
      rectViewport: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right
      }
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (currentMode !== 'read') {
        currentMode = 'read';
        if (hoverOverlay) hoverOverlay.style.display = 'none';
        document.body.style.cursor = '';
        sendToHost('__tr_escape__', {});
      }
    }
  }

  // Listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('mouseup', handleSelection, true);
  document.addEventListener('keyup', handleSelection, true);
  window.addEventListener('keydown', handleKeyDown, true);

  // Exposed controller methods on guest window
  window.__tr_update_mode = function(mode) {
    currentMode = mode;
    createHoverOverlay();
    if (mode === 'zap') {
      hoverOverlay.style.display = 'none';
      document.body.style.cursor = 'crosshair';
    } else {
      if (hoverOverlay) hoverOverlay.style.display = 'none';
      document.body.style.cursor = '';
    }
  };

  window.__tr_apply_projection = function(rulesJson, revealed) {
    try {
      var rules = typeof rulesJson === 'string' ? JSON.parse(rulesJson) : rulesJson;
      var hideSelectors = [];
      if (!revealed && Array.isArray(rules)) {
        for (var i = 0; i < rules.length; i++) {
          var r = rules[i];
          if (r.enabled !== false && r.target && r.target.selector) {
            hideSelectors.push(r.target.selector);
          }
        }
      }
      var styleEl = document.getElementById('__tr_projection_styles__');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__tr_projection_styles__';
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = hideSelectors.length > 0 ? hideSelectors.join(', ') + ' { display: none !important; }' : '';
    } catch(e) {
      console.error('Error applying projection styles in guest:', e);
    }
  };

  window.__tr_focus_anchor = function(anchorId, locators) {
    if (!locators || locators.length === 0) return;
    for (var i = 0; i < locators.length; i++) {
      var loc = locators[i];
      var target = null;
      if (loc.type === 'text-quote' && loc.exact) {
        var elements = Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, span, div, a, article, section'));
        for (var j = 0; j < elements.length; j++) {
          if (elements[j].textContent && elements[j].textContent.includes(loc.exact)) {
            target = elements[j];
            break;
          }
        }
      } else if (loc.type === 'css-selector' && loc.selector) {
        target = document.querySelector(loc.selector);
      } else if (loc.type === 'dom-path' && loc.xpath) {
        try {
          var result = document.evaluate(loc.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          target = result.singleNodeValue;
        } catch(e) {}
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var originalOutline = target.style.outline;
        var originalTransition = target.style.transition;
        target.style.transition = 'outline 0.2s ease-in-out';
        target.style.outline = '3px solid #27b9dc';
        setTimeout(function() {
          target.style.outline = originalOutline;
          target.style.transition = originalTransition;
        }, 3000);
        return;
      }
    }
  };
})();
`;
}
