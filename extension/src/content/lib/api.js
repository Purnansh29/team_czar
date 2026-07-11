// api.js — talks to the Jarvis backend through background.js.
//
// We route every request through the service worker (rather than fetching
// directly from the content script) so that:
//   - the backend base URL lives in one place (background.js)
//   - a page's CSP can't block the request (content-script fetches are
//     subject to the host page's CSP; background fetches are not)

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

function callBackground(type, payload) {
  return new Promise((resolve, reject) => {
    if (!isContextValid()) {
      reject(new Error("Extension was reloaded — please refresh this tab."));
      return;
    }
    try {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(new Error("Extension context invalidated — please refresh this tab."));
    }
  });
}

async function post(path, payload) {
  const response = await callBackground("JARVIS_API_REQUEST", { path, payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Unknown error contacting Jarvis backend");
  }
  return response.data;
}

/**
 * Sends the page content + conversation history + the user's
 * question/command to the backend, and gets back the AI's reply.
 *
 * @param {object} args
 * @param {string} args.command - e.g. "summarize", "explain_paragraph", "chat"
 * @param {string} args.message - the user's raw question/utterance
 * @param {object} args.page - { title, url, textContent, paragraphs, codeBlocks }
 * @param {Array}  args.history - prior [{role, content}] turns for this page
 * @param {object} [args.target] - optional { paragraphIndex } or { codeId } or { selectionText }
 */
export async function askJarvis({ command, message, page, history, target }) {
  return post("/api/assistant", { command, message, page, history, target });
}

export async function translateSelection({ text, targetLanguage }) {
  return post("/api/translate", { text, targetLanguage });
}

export async function healthCheck() {
  return post("/api/health", {});
}
