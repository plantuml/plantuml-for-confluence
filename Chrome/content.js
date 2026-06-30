// =====================================================================
// PlantUML for Confluence - Content Script (POC step 2)
// =====================================================================
// Injected on every https page (see manifest "matches": https://*/*),
// but only ACTIVE on Confluence pages (detected via DOM markers, so no
// host name is hard-coded).
//
// Detects PlantUML code blocks (@startuml ... @enduml) inside <code>
// elements and renders each one client-side with the TeaVM-compiled
// PlantUML engine. The rendered diagram is shown in a sandboxed iframe
// inserted right AFTER the original code block. Minimal: no toolbar,
// no copy buttons, no edit modal.
// =====================================================================

(function () {
  'use strict';

  // ====== TRACE ======
  const TRACE = (...args) => console.log('[PUML4Confluence][content]', ...args);
  // ===================

  // ------------------------------------------------------------------
  // Generic Confluence detection (no host name hard-coded).
  // ------------------------------------------------------------------
  function isConfluence() {
    if (document.getElementById('com-atlassian-confluence')) return true;
    if (document.querySelector('meta[name^="ajs-confluence"]')) return true;
    if (document.querySelector('meta[name="ajs-page-id"]')) return true;
    if (document.querySelector('meta[name="confluence-request-time"]')) return true;
    const root = document.documentElement;
    if (root && /confluence/i.test(root.className)) return true;
    return false;
  }

  if (!isConfluence()) {
    return; // Not Confluence: stay silent.
  }

  TRACE('content script active on', location.href);

  // URL of the renderer page packaged inside the extension.
  const RENDERER_URL = chrome.runtime.getURL('renderer.html');
  const RENDERER_ORIGIN = new URL(RENDERER_URL).origin;

  // Marker so we don't re-process the same <code> block twice.
  const PROCESSED_ATTR = 'data-plantuml-for-confluence-seen';

  let blockCounter = 0;

  // ------------------------------------------------------------------
  // Resolve the right postMessage targetOrigin for the renderer iframe.
  // sandbox="allow-scripts" without allow-same-origin gives the iframe
  // an opaque "null" origin; messages to chrome-extension://... get
  // dropped unless we target '*'.
  // ------------------------------------------------------------------
  function targetOriginFor(iframe) {
    const sb = iframe.getAttribute('sandbox') || '';
    if (sb.includes('allow-scripts') && !sb.includes('allow-same-origin')) {
      return '*';
    }
    return RENDERER_ORIGIN;
  }

  // ------------------------------------------------------------------
  // Render one PlantUML block: insert a renderer iframe right after the
  // <code> element and post the source to it once loaded.
  // ------------------------------------------------------------------
  function renderBlock(codeEl, source) {
    const requestId = `puml-${++blockCounter}-${Date.now()}`;

    const iframe = document.createElement('iframe');
    iframe.src = RENDERER_URL;
    iframe.sandbox = 'allow-scripts';
    iframe.dataset.requestId = requestId;
    iframe.className = 'plantuml-for-confluence-frame';
    iframe.style.cssText =
      'border: none; width: 100%; min-height: 60px; display: block; ' +
      'margin: 8px 0; background: transparent;';
    iframe.setAttribute('title', 'PlantUML diagram');

    // Insert right after the code block. Walk up to the enclosing <pre>
    // if there is one, so the iframe lands after the whole block rather
    // than inside it.
    const anchor = codeEl.closest('pre') || codeEl;
    anchor.parentNode.insertBefore(iframe, anchor.nextSibling);

    iframe.addEventListener('load', () => {
      iframe.contentWindow.postMessage({
        type: 'PLANTUML_RENDER',
        source,
        requestId,
        options: { dark: false }
      }, targetOriginFor(iframe));
      TRACE('PLANTUML_RENDER posted, requestId=' + requestId);
    });
  }

  // ------------------------------------------------------------------
  // Scan the given root for PlantUML blocks and render each one.
  // ------------------------------------------------------------------
  function scanAndRender(root) {
    const codeElements = root.querySelectorAll('code');

    codeElements.forEach((element) => {
      if (element.hasAttribute(PROCESSED_ATTR)) return;

      const content = element.textContent;
      const regex = /@startuml[\s\S]*?@enduml/;
      const match = content.match(regex);

      if (match) {
        element.setAttribute(PROCESSED_ATTR, '1');
        const source = match[0].trim();
        TRACE('rendering block, source.len=' + source.length);
        renderBlock(element, source);
      }
    });
  }

  // ------------------------------------------------------------------
  // Listen for results coming back from the renderer iframes and set
  // the iframe height to fit the rendered diagram.
  // ------------------------------------------------------------------
  window.addEventListener('message', (event) => {
    if (event.origin !== RENDERER_ORIGIN && event.origin !== 'null') return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'PLANTUML_RESULT' && data.type !== 'PLANTUML_ERROR') return;

    const iframe = document.querySelector(
      `iframe[data-request-id="${CSS.escape(data.requestId)}"]`
    );
    if (!iframe) return;

    if (data.type === 'PLANTUML_RESULT' && typeof data.height === 'number') {
      iframe.style.height = (data.height + 8) + 'px';
      TRACE('iframe height set to ' + (data.height + 8) + 'px for ' + data.requestId);
    }
    // On PLANTUML_ERROR the renderer already shows the error inline.
  });

  // ------------------------------------------------------------------
  // Initial scan.
  // ------------------------------------------------------------------
  TRACE('starting initial scan');
  scanAndRender(document.body);
  TRACE('initial scan done');

  // ------------------------------------------------------------------
  // Watch for dynamically added content (Confluence is a SPA).
  // ------------------------------------------------------------------
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanAndRender(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  TRACE('MutationObserver attached');
})();
