// index.jsx — content script entry point.
//
// Responsibilities:
//   1. Inject a floating circular button (bottom-right) that opens the panel.
//   2. Mount the React panel into an isolated Shadow DOM root so the host
//      page's CSS can never leak in or be leaked onto.
//   3. Listen for the CTRL+SHIFT+J toggle message from background.js.
//   4. Watch for text selections and show the Explain/Summarize/Translate
//      mini-toolbar next to them.
//   5. Extract the page's readable content (once, lazily, the first time the
//      panel is opened) via extractContent.js.
//
// This file intentionally contains no speech-recognition or AI-request
// logic itself — that all lives in Panel.jsx / the hooks, keeping this file
// focused purely on "getting the UI onto the page."

import React from "react";
import { createRoot } from "react-dom/client";
import Panel from "./Panel";
import SelectionToolbar from "./components/SelectionToolbar";
import { extractPageContent } from "./lib/extractContent";
// (api calls are handled inside Panel.jsx, not here)
// Imported so Vite includes it in the build graph and emits dist/content.css.
// It still only ever applies inside our Shadow DOM (loaded via a <link> tag
// in ensureHost below), never as a global page stylesheet.
import "./content.css";

const HOST_ID = "jarvis-ai-companion-host";

let panelOpen = false;
let reactRoot = null;
let cachedPage = null;
let initialAction = null;

// ── Context guard ──────────────────────────────────────────────────────────
// "Extension context invalidated" is thrown when the service worker has been
// reloaded but the old content script on this tab is still alive. We catch it
// everywhere we touch chrome.runtime so the error never bubbles to the
// console / extensions error page.
function isContextValid() {
  try {
    // Accessing chrome.runtime.id throws when the context is gone.
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function safePostMessage(msg) {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    // context invalidated — ignore
  }
}

function getPageData() {
  if (!cachedPage) cachedPage = extractPageContent();
  return cachedPage;
}

// ---------- Shadow DOM host + floating button ----------

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("dist/content.css");
  shadow.appendChild(styleLink);

  const fab = document.createElement("button");
  fab.className = "jarvis-fab";
  fab.title = "Open Jarvis (Ctrl+Shift+J)";
  fab.textContent = "J";
  fab.addEventListener("click", togglePanel);
  shadow.appendChild(fab);

  const panelMount = document.createElement("div");
  panelMount.className = "jarvis-panel-mount";
  shadow.appendChild(panelMount);

  const toolbarMount = document.createElement("div");
  toolbarMount.className = "jarvis-toolbar-mount";
  shadow.appendChild(toolbarMount);

  host._shadow = shadow;
  host._panelMount = panelMount;
  host._toolbarMount = toolbarMount;
  return host;
}

function togglePanel() {
  panelOpen = !panelOpen;
  safePostMessage({ type: "JARVIS_PANEL_STATE", open: panelOpen });
  renderPanel();
}

function renderPanel() {
  const host = ensureHost();
  if (!reactRoot) reactRoot = createRoot(host._panelMount);

  if (!panelOpen) {
    reactRoot.render(null);
    initialAction = null;
    return;
  }

  reactRoot.render(
    <Panel
      page={getPageData()}
      initialAction={initialAction}
      onClose={() => {
        panelOpen = false;
        safePostMessage({ type: "JARVIS_PANEL_STATE", open: false });
        renderPanel();
      }}
    />
  );
}

// Guard: only add listener when context is valid
if (isContextValid()) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "JARVIS_TOGGLE_PANEL") {
      togglePanel();
    }
  });
}

// ---------- Selection toolbar (Explain / Summarize / Translate) ----------

let toolbarRoot = null;

function renderToolbar(position, selectedText) {
  const host = ensureHost();
  if (!toolbarRoot) toolbarRoot = createRoot(host._toolbarMount);

  const dismiss = () => toolbarRoot.render(null);

  const runOnSelection = (command) => {
    dismiss();
    panelOpen = true;
    initialAction = {
      command,
      message: command === "translate"
        ? `Translate: "${selectedText}"`
        : command === "summarize_selection"
          ? `Summarize selection: "${selectedText}"`
          : `Explain selection: "${selectedText}"`,
      target: command === "translate"
        ? { selectionText: selectedText, targetLanguage: "en" }
        : { selectionText: selectedText }
    };
    renderPanel();
  };

  toolbarRoot.render(
    <SelectionToolbar
      position={position}
      onExplain={() => runOnSelection("explain_selection")}
      onSummarize={() => runOnSelection("summarize_selection")}
      onTranslate={() => runOnSelection("translate")}
      onDismiss={dismiss}
    />
  );
}

document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  const text = selection?.toString().trim();

  if (!text || text.length < 3) {
    toolbarRoot?.render(null);
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  renderToolbar(
    { top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX },
    text
  );
});

document.addEventListener("mousedown", (e) => {
  const host = document.getElementById(HOST_ID);
  if (host && !host.contains(e.target)) {
    toolbarRoot?.render(null);
  }
});

// Mount the floating button immediately; the panel itself renders lazily.
ensureHost();
