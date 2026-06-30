// =====================================================================
// PlantUML for Confluence - Content Script (POC step 1)
// =====================================================================
// Injected on every https page (see manifest "matches": https://*/*),
// but only ACTIVE on Confluence pages. We detect Confluence generically
// from DOM markers so no specific host name has to be hard-coded.
//
// For now it ONLY detects PlantUML code blocks (@startuml ... @enduml)
// inside <code> elements and logs them to the console. No rendering yet.
// =====================================================================

(function () {
  'use strict';

  // ====== TRACE ======
  const TRACE = (...args) => console.log('[PUML4Confluence][content]', ...args);
  // ===================

  // ------------------------------------------------------------------
  // Generic Confluence detection.
  //
  // Confluence (Server / Data Center) exposes several DOM markers that
  // are independent of the host name:
  //   - <body id="com-atlassian-confluence"> (or that id on <html>)
  //   - <meta name="ajs-*"> tags (AJS = Atlassian JavaScript), e.g.
  //     ajs-page-id, ajs-confluence-flavour, ajs-base-url...
  //   - a global "confluence" CSS class / data attributes
  // We treat the page as Confluence if any of these are present.
  // ------------------------------------------------------------------
  function isConfluence() {
    if (document.getElementById('com-atlassian-confluence')) return true;
    if (document.querySelector('meta[name^="ajs-confluence"]')) return true;
    if (document.querySelector('meta[name="ajs-page-id"]')) return true;
    if (document.querySelector('meta[name="confluence-request-time"]')) return true;
    // Body / html marker classes used by Confluence themes.
    const root = document.documentElement;
    if (root && /confluence/i.test(root.className)) return true;
    return false;
  }

  if (!isConfluence()) {
    // Not a Confluence page: stay completely silent and do nothing.
    return;
  }

  TRACE('content script active on', location.href);

  // Marker so we don't re-process / re-log the same <code> block twice
  // (the MutationObserver can fire many times on a SPA).
  const PROCESSED_ATTR = 'data-plantuml-for-confluence-seen';

  // ------------------------------------------------------------------
  // Scan the given root for PlantUML blocks and log them.
  // Core extraction logic based on the provided snippet.
  // ------------------------------------------------------------------
  function scanAndLog(root) {
    const codeElements = root.querySelectorAll('code');
    const plantUmlBlocks = [];

    codeElements.forEach((element) => {
      if (element.hasAttribute(PROCESSED_ATTR)) return;

      const content = element.textContent;
      const regex = /@startuml[\s\S]*?@enduml/;
      const match = content.match(regex);

      if (match) {
        element.setAttribute(PROCESSED_ATTR, '1');
        plantUmlBlocks.push(match[0].trim());
      }
    });

    if (plantUmlBlocks.length === 0) return;

    TRACE(`${plantUmlBlocks.length} bloc PlantUML :`);
    plantUmlBlocks.forEach((bloc, index) => {
      TRACE(`--- Bloc ${index + 1} ---`);
      TRACE(bloc);
    });
  }

  // ------------------------------------------------------------------
  // Initial scan.
  // ------------------------------------------------------------------
  TRACE('starting initial scan');
  scanAndLog(document.body);
  TRACE('initial scan done');

  // ------------------------------------------------------------------
  // Watch for dynamically added content. Confluence is a SPA: it loads
  // page content after the initial document and navigates without full
  // reloads, so blocks often appear after document_idle.
  // ------------------------------------------------------------------
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanAndLog(node);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  TRACE('MutationObserver attached');
})();
