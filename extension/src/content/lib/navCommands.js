// navCommands.js — Browser Navigation Command Matcher
//
// Detects navigation intent from a raw voice transcript or typed text.
// Completely separate from voiceCommands.js — existing features are unaffected.
//
// Returns: { action, params } or null

// ── Known sites shorthand ──────────────────────────────────────────────────
const KNOWN_SITES = {
  youtube:       "https://www.youtube.com",
  google:        "https://www.google.com",
  gmail:         "https://mail.google.com",
  maps:          "https://maps.google.com",
  "google maps": "https://maps.google.com",
  github:        "https://www.github.com",
  twitter:       "https://www.twitter.com",
  x:             "https://www.x.com",
  instagram:     "https://www.instagram.com",
  facebook:      "https://www.facebook.com",
  fb:            "https://www.facebook.com",
  reddit:        "https://www.reddit.com",
  netflix:       "https://www.netflix.com",
  amazon:        "https://www.amazon.com",
  wikipedia:     "https://www.wikipedia.org",
  wiki:          "https://www.wikipedia.org",
  stackoverflow: "https://stackoverflow.com",
  "stack overflow": "https://stackoverflow.com",
  linkedin:      "https://www.linkedin.com",
  whatsapp:      "https://web.whatsapp.com",
  spotify:       "https://open.spotify.com",
  chatgpt:       "https://chat.openai.com",
  openai:        "https://www.openai.com",
  notion:        "https://www.notion.so",
  discord:       "https://discord.com",
  twitch:        "https://www.twitch.tv",
  pinterest:     "https://www.pinterest.com",
  snapchat:      "https://www.snapchat.com",
  tiktok:        "https://www.tiktok.com",
  zoom:          "https://zoom.us",
  meet:          "https://meet.google.com",
  "google meet": "https://meet.google.com",
  drive:         "https://drive.google.com",
  "google drive":"https://drive.google.com",
  docs:          "https://docs.google.com",
  sheets:        "https://sheets.google.com",
  slides:        "https://slides.google.com",
  translate:     "https://translate.google.com",
  news:          "https://news.google.com",
  "google news": "https://news.google.com",
  medium:        "https://www.medium.com",
  vercel:        "https://vercel.com",
  netlify:       "https://www.netlify.com",
  heroku:        "https://www.heroku.com",
  npm:           "https://www.npmjs.com",
  mdn:           "https://developer.mozilla.org",
};

// ── URL resolver ───────────────────────────────────────────────────────────
function resolveUrl(raw) {
  const trimmed = raw.trim();
  const lower   = trimmed.toLowerCase().replace(/\s+/g, " ");
  const noSpace  = lower.replace(/\s+/g, "");

  // Check multi-word known site shortcuts first (e.g. "google maps")
  for (const [key, url] of Object.entries(KNOWN_SITES)) {
    if (lower === key || lower === `${key}.com` || lower === `www.${key}.com`) {
      return url;
    }
  }
  // Single-word shortcuts
  for (const [key, url] of Object.entries(KNOWN_SITES)) {
    if (noSpace === key.replace(/\s+/g, "") ||
        noSpace === `${key.replace(/\s+/g, "")}.com` ||
        noSpace === `www.${key.replace(/\s+/g, "")}.com`) {
      return url;
    }
  }

  // If it already looks like a URL
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  if (/^[\w-]+\.(com|org|net|io|dev|co|in|ai|app|gov|edu|me|tv|info)/.test(noSpace)) {
    return `https://${noSpace}`;
  }

  // Fallback: Google search
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns true if transcript contains any of the given words/phrases */
function has(t, ...phrases) {
  return phrases.some((p) => t.includes(p));
}

/** Extracts text after a trigger phrase */
function after(t, ...triggers) {
  for (const trigger of triggers) {
    const idx = t.indexOf(trigger);
    if (idx !== -1) {
      const rest = t.slice(idx + trigger.length).trim();
      if (rest) return rest;
    }
  }
  return null;
}

// ── Command patterns ───────────────────────────────────────────────────────
// NOTE: Patterns are tested in ORDER — more specific ones must come first.
const NAV_PATTERNS = [

  // ── TAB CLOSE — must come before generic "close" ──
  {
    action: "nav_close_tab",
    test: (t) => {
      if (has(t,
        "close this tab", "close the tab", "close tab",
        "shut this tab", "shut the tab",
        "close this page", "close the page", "close page",
        "close this", "close the app", "close app", "close window tab",
        "exit tab", "exit this tab", "exit page",
        "terminate tab", "kill tab", "kill this tab",
        "get rid of this tab"
      )) return {};
      return null;
    },
  },

  // ── NEW TAB ──
  {
    action: "nav_new_tab",
    test: (t) => {
      if (has(t,
        "new tab", "open tab", "open new tab", "create tab",
        "create new tab", "add new tab", "add tab",
        "fresh tab", "blank tab"
      )) return {};
      return null;
    },
  },

  // ── NEW WINDOW ──
  {
    action: "nav_new_window",
    test: (t) => {
      if (has(t,
        "new window", "open new window", "create new window",
        "open window", "fresh window"
      )) return {};
      return null;
    },
  },

  // ── GO BACK ──
  {
    action: "nav_back",
    test: (t) => {
      if (has(t,
        "go back", "go back page", "back page", "previous page",
        "go to previous", "go previous", "navigate back",
        "take me back", "head back", "return to previous",
        "back button", "press back", "hit back",
        "undo navigation", "last page", "go to last page"
      )) return {};
      // Match lone "back" only if no other context
      if (/^back$/.test(t)) return {};
      return null;
    },
  },

  // ── GO FORWARD ──
  {
    action: "nav_forward",
    test: (t) => {
      if (has(t,
        "go forward", "go forward page", "forward page", "next page history",
        "navigate forward", "go next history",
        "forward button", "press forward"
      )) return {};
      if (/^forward$/.test(t)) return {};
      return null;
    },
  },

  // ── REFRESH / RELOAD ──
  {
    action: "nav_refresh",
    test: (t) => {
      if (has(t,
        "refresh", "reload", "refresh page", "reload page",
        "refresh this page", "reload this page",
        "refresh the page", "reload the tab",
        "hard refresh", "force refresh", "restart page",
        "update page", "refresh tab"
      )) return {};
      return null;
    },
  },

  // ── NEXT TAB ──
  {
    action: "nav_next_tab",
    test: (t) => {
      if (has(t,
        "next tab", "switch to next tab", "go to next tab",
        "move to next tab", "tab right", "right tab"
      )) return {};
      return null;
    },
  },

  // ── PREVIOUS TAB ──
  {
    action: "nav_prev_tab",
    test: (t) => {
      if (has(t,
        "previous tab", "prev tab", "last tab",
        "switch to previous tab", "go to previous tab",
        "tab left", "left tab", "go back tab"
      )) return {};
      return null;
    },
  },

  // ── SWITCH TO TAB N ──
  {
    action: "nav_switch_tab",
    test: (t) => {
      const m = t.match(/(?:switch\s+to\s+|go\s+to\s+|open\s+)?tab\s+(\d+)/i);
      if (m) return { index: parseInt(m[1], 10) - 1 };
      return null;
    },
  },

  // ── SCROLL DOWN ──
  {
    action: "nav_scroll_down",
    test: (t) => {
      if (has(t,
        "scroll down", "scroll page down", "page down",
        "move down", "go down", "scroll lower",
        "scroll a bit down", "scroll more down",
        "swipe down", "scroll below"
      )) return {};
      return null;
    },
  },

  // ── SCROLL UP ──
  {
    action: "nav_scroll_up",
    test: (t) => {
      if (has(t,
        "scroll up", "scroll page up", "page up",
        "move up", "go up", "scroll higher",
        "scroll a bit up", "scroll more up",
        "swipe up", "scroll above"
      )) return {};
      return null;
    },
  },

  // ── SCROLL TO TOP ──
  {
    action: "nav_scroll_top",
    test: (t) => {
      if (has(t,
        "scroll to top", "go to top", "scroll top",
        "jump to top", "back to top", "top of page",
        "beginning of page", "start of page"
      )) return {};
      if (/^top$/.test(t)) return {};
      return null;
    },
  },

  // ── SCROLL TO BOTTOM ──
  {
    action: "nav_scroll_bottom",
    test: (t) => {
      if (has(t,
        "scroll to bottom", "go to bottom", "scroll bottom",
        "jump to bottom", "end of page", "bottom of page",
        "scroll to end", "go to end"
      )) return {};
      if (/^bottom$/.test(t)) return {};
      return null;
    },
  },

  // ── FIND ON PAGE ──
  {
    action: "nav_find",
    test: (t) => {
      const q = after(t,
        "find on page ", "find ", "search on page ",
        "highlight ", "locate ", "look for "
      );
      if (q && q.length > 1) return { query: q };
      return null;
    },
  },

  // ── CLICK ELEMENT ──
  {
    action: "nav_click",
    test: (t) => {
      const q = after(t,
        "click on ", "click ", "tap ", "press ", "hit ", "select "
      );
      // avoid matching things like "click stop reading"
      if (q && q.length > 1 && !["mic", "button"].includes(q)) return { target: q };
      return null;
    },
  },

  // ── ZOOM IN ──
  {
    action: "nav_zoom_in",
    test: (t) => {
      if (has(t,
        "zoom in", "zoom more", "make bigger", "increase zoom",
        "make it bigger", "increase size", "bigger text"
      )) return {};
      return null;
    },
  },

  // ── ZOOM OUT ──
  {
    action: "nav_zoom_out",
    test: (t) => {
      if (has(t,
        "zoom out", "zoom less", "make smaller", "decrease zoom",
        "make it smaller", "decrease size", "smaller text"
      )) return {};
      return null;
    },
  },

  // ── ZOOM RESET ──
  {
    action: "nav_zoom_reset",
    test: (t) => {
      if (has(t,
        "zoom reset", "reset zoom", "normal zoom", "default zoom",
        "zoom normal", "zoom default", "100 percent zoom", "zoom 100"
      )) return {};
      return null;
    },
  },

  // ── FULLSCREEN ──
  {
    action: "nav_full_screen",
    test: (t) => {
      if (has(t,
        "fullscreen", "full screen", "full-screen",
        "enter fullscreen", "exit fullscreen",
        "toggle fullscreen", "maximize"
      )) return {};
      return null;
    },
  },

  // ── PRINT ──
  {
    action: "nav_print",
    test: (t) => {
      if (has(t, "print page", "print this page", "print", "open print")) return {};
      return null;
    },
  },

  // ── SEARCH (Google search for something) ──
  {
    action: "nav_search",
    test: (t) => {
      const q = after(t,
        "search for ", "google for ", "google ", "search ",
        "look up ", "look for ", "find me ",
        "what is ", "who is ", "how to "
      );
      if (q && q.length > 1) {
        return {
          url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          query: q,
        };
      }
      return null;
    },
  },

  // ── GOTO / NAVIGATE ── (must be last of nav commands; broadest match)
  {
    action: "nav_goto",
    test: (t) => {
      const dest = after(t,
        "go to ", "open ", "navigate to ", "visit ", "take me to ",
        "load ", "browse to ", "head to ", "launch ", "show me "
      );
      if (dest && dest.length > 1) return { url: resolveUrl(dest) };
      return null;
    },
  },
];

/**
 * Tries to match a nav command from the text.
 * @param {string} text - raw transcript or typed input
 * @returns {{ action: string, params: object } | null}
 */
export function matchNavCommand(text) {
  const t = text.trim().toLowerCase();
  for (const pattern of NAV_PATTERNS) {
    const result = pattern.test(t);
    if (result !== null && result !== false) {
      return { action: pattern.action, params: result || {} };
    }
  }
  return null;
}

/** Human-readable description for a nav action + params */
export function describeNavAction(action, params) {
  switch (action) {
    case "nav_goto":        return `🌐 Navigating to ${params.url}`;
    case "nav_search":      return `🔍 Searching for "${params.query}"`;
    case "nav_back":        return "⬅️ Going back";
    case "nav_forward":     return "➡️ Going forward";
    case "nav_refresh":     return "🔄 Refreshing page";
    case "nav_new_tab":     return "➕ Opening new tab";
    case "nav_close_tab":   return "✖️ Closing tab";
    case "nav_next_tab":    return "➡️ Switching to next tab";
    case "nav_prev_tab":    return "⬅️ Switching to previous tab";
    case "nav_switch_tab":  return `🔀 Switching to tab ${(params.index ?? 0) + 1}`;
    case "nav_scroll_down": return "⬇️ Scrolling down";
    case "nav_scroll_up":   return "⬆️ Scrolling up";
    case "nav_scroll_top":  return "⏫ Scrolled to top";
    case "nav_scroll_bottom": return "⏬ Scrolled to bottom";
    case "nav_find":        return `🔎 Finding "${params.query}"`;
    case "nav_click":       return `👆 Clicking "${params.target}"`;
    case "nav_zoom_in":     return "🔍 Zoomed in";
    case "nav_zoom_out":    return "🔍 Zoomed out";
    case "nav_zoom_reset":  return "🔍 Zoom reset";
    case "nav_new_window":  return "🪟 Opening new window";
    case "nav_full_screen": return "⛶ Fullscreen toggled";
    case "nav_print":       return "🖨️ Opening print dialog";
    default:                return `✅ Done`;
  }
}
