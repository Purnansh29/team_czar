// navApi.js — Sends navigation commands to background.js via chrome.runtime.sendMessage.
//
// The content script cannot call chrome.tabs.* or chrome.scripting.* directly
// (those are privileged APIs only available in the service worker/background).
// This thin wrapper routes all nav intents through background.js, which handles
// the actual chrome API calls and returns a human-readable result string.

// ── Context guard ──────────────────────────────────────────────────────────
// Prevents "Extension context invalidated" errors when the service worker has
// been reloaded but this old content-script instance is still alive on a tab.
function isContextValid() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Execute a navigation action.
 * @param {string} action  - e.g. "nav_goto", "nav_back", "nav_scroll_down"
 * @param {object} params  - action-specific parameters
 * @returns {Promise<string>} - human-readable result message
 */
export function executeNavCommand(action, params = {}) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(new Error("Extension was reloaded — please refresh this tab."));
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: "JARVIS_NAV_REQUEST", action, params },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.ok) {
            resolve(response.message || "Done");
          } else {
            reject(new Error(response?.error || "Navigation failed"));
          }
        }
      );
    } catch (err) {
      reject(new Error("Extension context invalidated — please refresh this tab."));
    }
  });
}
