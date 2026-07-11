// background.js — Manifest V3 service worker
//
// Responsibilities:
//   1. Listen for the "toggle-jarvis" keyboard command (Ctrl+Shift+J) and tell the
//      active tab's content script to show/hide the assistant panel.
//   2. Act as a thin relay between the popup / content script and the backend
//      server, so the extension never needs "backend URL" host permissions
//      sprinkled across multiple files, and so future CORS issues on the
//      backend are avoided (a MV3 service worker fetch is not subject to the
//      page's CORS policy the way a content-script fetch would be).
//   3. Keep track of which tabId currently has the panel open, purely for the
//      toolbar icon / popup status display.
//   4. [NEW] Handle JARVIS_NAV_REQUEST messages — execute browser navigation
//      commands (chrome.tabs.*, chrome.scripting.*) on behalf of content scripts.
//
// Nothing here talks to speech APIs — that logic lives entirely in
// content.js / the panel, exactly like it did in the original app.js.

const DEFAULT_BACKEND_URL = "http://localhost:5000";

// in-memory (per service-worker lifetime) map of tabId -> panel open state
const panelState = new Map();

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-jarvis") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  sendTogglePanel(tab.id);
});

// Toolbar icon click also opens the panel (in addition to showing the popup),
// this listener only fires if there is NO default_popup — kept here for
// robustness in case default_popup is ever removed.
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) sendTogglePanel(tab.id);
});

function sendTogglePanel(tabId) {
  chrome.tabs
    .sendMessage(tabId, { type: "JARVIS_TOGGLE_PANEL" })
    .catch(() => {
      // content script may not be injected yet (e.g. chrome:// pages) — ignore
    });
}

// Relay: popup / content script -> backend server.
// Using a background fetch keeps the Gemini/backend base URL configuration
// in one place and avoids re-implementing retry/error handling everywhere.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "JARVIS_PANEL_STATE") {
    if (sender.tab?.id) panelState.set(sender.tab.id, message.open);
    return false;
  }

  if (message?.type === "JARVIS_API_REQUEST") {
    handleApiRequest(message).then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  if (message?.type === "JARVIS_GET_PANEL_STATE") {
    const tabId = message.tabId ?? sender.tab?.id;
    sendResponse({ open: panelState.get(tabId) ?? false });
    return false;
  }

  // ── [NEW] Navigation command handler ────────────────────────────────────
  if (message?.type === "JARVIS_NAV_REQUEST") {
    handleNavRequest(message, sender).then(sendResponse);
    return true; // async response
  }

  return false;
});

async function handleApiRequest({ path, payload }) {
  try {
    const { backendUrl } = await chrome.storage.local.get("backendUrl");
    const base = backendUrl || DEFAULT_BACKEND_URL;

    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Server responded ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || "Network error reaching Jarvis backend" };
  }
}

// ── [NEW] Navigation request handler ────────────────────────────────────────
async function handleNavRequest({ action, params }, sender) {
  try {
    const senderTabId = sender.tab?.id;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = senderTabId ?? activeTab?.id;

    switch (action) {

      // ── URL Navigation ──
      case "nav_goto": {
        await chrome.tabs.update(tabId, { url: params.url });
        return { ok: true, message: `Navigating to ${params.url}` };
      }

      case "nav_search": {
        await chrome.tabs.update(tabId, { url: params.url });
        return { ok: true, message: `Searching for "${params.query}"` };
      }

      // ── History ──
      case "nav_back": {
        await chrome.tabs.goBack(tabId);
        return { ok: true, message: "Going back" };
      }

      case "nav_forward": {
        await chrome.tabs.goForward(tabId);
        return { ok: true, message: "Going forward" };
      }

      case "nav_refresh": {
        await chrome.tabs.reload(tabId);
        return { ok: true, message: "Page refreshed" };
      }

      // ── Tabs ──
      case "nav_new_tab": {
        await chrome.tabs.create({});
        return { ok: true, message: "New tab opened" };
      }

      case "nav_close_tab": {
        await chrome.tabs.remove(tabId);
        return { ok: true, message: "Tab closed" };
      }

      case "nav_next_tab": {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const cur = allTabs.findIndex((t) => t.id === tabId);
        const next = allTabs[(cur + 1) % allTabs.length];
        await chrome.tabs.update(next.id, { active: true });
        return { ok: true, message: `Switched to: ${next.title || "next tab"}` };
      }

      case "nav_prev_tab": {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const cur = allTabs.findIndex((t) => t.id === tabId);
        const prev = allTabs[(cur - 1 + allTabs.length) % allTabs.length];
        await chrome.tabs.update(prev.id, { active: true });
        return { ok: true, message: `Switched to: ${prev.title || "previous tab"}` };
      }

      case "nav_switch_tab": {
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        const idx = Math.max(0, Math.min(params.index ?? 0, allTabs.length - 1));
        await chrome.tabs.update(allTabs[idx].id, { active: true });
        return { ok: true, message: `Switched to tab ${idx + 1}: ${allTabs[idx].title || ""}` };
      }

      // ── Scroll (via scripting) ──
      case "nav_scroll_down": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollBy({ top: window.innerHeight * 0.6, behavior: "smooth" }),
        });
        return { ok: true, message: "Scrolled down" };
      }

      case "nav_scroll_up": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollBy({ top: -window.innerHeight * 0.6, behavior: "smooth" }),
        });
        return { ok: true, message: "Scrolled up" };
      }

      case "nav_scroll_top": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        });
        return { ok: true, message: "Scrolled to top" };
      }

      case "nav_scroll_bottom": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }),
        });
        return { ok: true, message: "Scrolled to bottom" };
      }

      // ── Find text on page ──
      case "nav_find": {
        const query = params.query || "";
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (q) => {
            // Remove previous highlights
            document.querySelectorAll(".__jarvis_highlight__").forEach((el) => {
              el.replaceWith(document.createTextNode(el.textContent));
            });
            // Walk text nodes and highlight first match
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let found = false;
            while (walker.nextNode()) {
              const node = walker.currentNode;
              const idx = node.textContent.toLowerCase().indexOf(q.toLowerCase());
              if (idx !== -1 && !found) {
                const span = document.createElement("span");
                span.className = "__jarvis_highlight__";
                span.style.cssText =
                  "background:#fbbf24;color:#000;border-radius:2px;padding:0 2px;";
                const before = node.textContent.slice(0, idx);
                const match = node.textContent.slice(idx, idx + q.length);
                const after = node.textContent.slice(idx + q.length);
                node.replaceWith(
                  document.createTextNode(before),
                  span,
                  document.createTextNode(after)
                );
                span.textContent = match;
                span.scrollIntoView({ behavior: "smooth", block: "center" });
                found = true;
                break;
              }
            }
            return found;
          },
          args: [query],
        });
        return { ok: true, message: `Finding "${query}" on page` };
      }

      // ── Click element ──
      case "nav_click": {
        const target = params.target || "";
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (q) => {
            // Try links first
            const links = Array.from(document.querySelectorAll("a, button, [role='button']"));
            const match = links.find(
              (el) =>
                el.textContent.trim().toLowerCase().includes(q.toLowerCase()) &&
                el.offsetParent !== null // visible
            );
            if (match) {
              match.click();
              return `Clicked: ${match.textContent.trim().slice(0, 50)}`;
            }
            return null;
          },
          args: [target],
        });
        const msg = results?.[0]?.result;
        if (msg) return { ok: true, message: msg };
        return { ok: false, error: `Could not find element matching "${target}"` };
      }

      // ── Zoom ──
      case "nav_zoom_in": {
        const cur = await chrome.tabs.getZoom(tabId);
        await chrome.tabs.setZoom(tabId, Math.min(cur + 0.25, 5));
        return { ok: true, message: "Zoomed in" };
      }

      case "nav_zoom_out": {
        const cur = await chrome.tabs.getZoom(tabId);
        await chrome.tabs.setZoom(tabId, Math.max(cur - 0.25, 0.25));
        return { ok: true, message: "Zoomed out" };
      }

      case "nav_zoom_reset": {
        await chrome.tabs.setZoom(tabId, 1);
        return { ok: true, message: "Zoom reset to 100%" };
      }

      // ── Window ──
      case "nav_new_window": {
        await chrome.windows.create({});
        return { ok: true, message: "New window opened" };
      }

      // ── Page actions via scripting ──
      case "nav_full_screen": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          },
        });
        return { ok: true, message: "Fullscreen toggled" };
      }

      case "nav_print": {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.print(),
        });
        return { ok: true, message: "Print dialog opened" };
      }

      default:
        return { ok: false, error: `Unknown nav action: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: err?.message || "Navigation error" };
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const { backendUrl } = await chrome.storage.local.get("backendUrl");
  if (!backendUrl) {
    await chrome.storage.local.set({ backendUrl: DEFAULT_BACKEND_URL });
  }
  if (details.reason === "install") {
    console.log("[Jarvis] Installed. Press Ctrl+Shift+J on any page to start.");
  }
});
