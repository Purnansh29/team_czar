// navCommands.js — Browser Navigation Command Matcher
//
// Detects navigation intent from a raw voice transcript or typed text.
// Completely separate from voiceCommands.js — existing features are unaffected.
//
// Returns: { action, params } or null

// ── Known sites shorthand ──────────────────────────────────────────────────
const KNOWN_SITES = {
  youtube:    "https://www.youtube.com",
  google:     "https://www.google.com",
  gmail:      "https://mail.google.com",
  maps:       "https://maps.google.com",
  github:     "https://www.github.com",
  twitter:    "https://www.twitter.com",
  x:          "https://www.x.com",
  instagram:  "https://www.instagram.com",
  facebook:   "https://www.facebook.com",
  reddit:     "https://www.reddit.com",
  netflix:    "https://www.netflix.com",
  amazon:     "https://www.amazon.com",
  wikipedia:  "https://www.wikipedia.org",
  stackoverflow: "https://stackoverflow.com",
  linkedin:   "https://www.linkedin.com",
  whatsapp:   "https://web.whatsapp.com",
  spotify:    "https://open.spotify.com",
  chatgpt:    "https://chat.openai.com",
  openai:     "https://www.openai.com",
  notion:     "https://www.notion.so",
  discord:    "https://discord.com",
  twitch:     "https://www.twitch.tv",
};

// ── URL resolver ───────────────────────────────────────────────────────────
function resolveUrl(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, "");

  // Check known site shortcuts
  for (const [key, url] of Object.entries(KNOWN_SITES)) {
    if (cleaned === key || cleaned === `${key}.com` || cleaned === `www.${key}.com`) {
      return url;
    }
  }

  // If it already looks like a URL
  if (/^https?:\/\//.test(raw.trim())) return raw.trim();
  if (/^[\w-]+\.(com|org|net|io|dev|co|in|ai|app|gov|edu)/.test(cleaned)) {
    return `https://${cleaned}`;
  }

  // Fallback: Google search
  return `https://www.google.com/search?q=${encodeURIComponent(raw.trim())}`;
}

// ── Command patterns ───────────────────────────────────────────────────────
const NAV_PATTERNS = [

  // ── Navigation ──
  {
    action: "nav_goto",
    test: (t) => {
      const m = t.match(/^(?:go\s+to|open|navigate\s+to|visit|take\s+me\s+to)\s+(.+)$/i);
      if (m) return { url: resolveUrl(m[1]) };
      return null;
    },
  },

  // ── Search ──
  {
    action: "nav_search",
    test: (t) => {
      const m = t.match(/^(?:search(?:\s+for)?|google(?:\s+for)?|look\s+up)\s+(.+)$/i);
      if (m) return { url: `https://www.google.com/search?q=${encodeURIComponent(m[1])}`, query: m[1] };
      return null;
    },
  },

  // ── History ──
  {
    action: "nav_back",
    test: (t) => /^(?:go\s+)?back(?:\s+page)?$/i.test(t) ? {} : null,
  },
  {
    action: "nav_forward",
    test: (t) => /^(?:go\s+)?forward(?:\s+page)?$/i.test(t) ? {} : null,
  },
  {
    action: "nav_refresh",
    test: (t) => /^(?:refresh|reload)(?:\s+(?:this\s+)?(?:page|tab))?$/i.test(t) ? {} : null,
  },

  // ── Tabs ──
  {
    action: "nav_new_tab",
    test: (t) => /^(?:open\s+)?new\s+tab$/i.test(t) ? {} : null,
  },
  {
    action: "nav_close_tab",
    test: (t) => /^close\s+(?:this\s+)?tab$/i.test(t) ? {} : null,
  },
  {
    action: "nav_next_tab",
    test: (t) => /^(?:switch\s+to\s+)?next\s+tab$/i.test(t) ? {} : null,
  },
  {
    action: "nav_prev_tab",
    test: (t) => /^(?:switch\s+to\s+)?(?:previous|prev|last)\s+tab$/i.test(t) ? {} : null,
  },
  {
    action: "nav_switch_tab",
    test: (t) => {
      const m = t.match(/^(?:switch\s+to\s+)?tab\s+(\d+)$/i);
      if (m) return { index: parseInt(m[1], 10) - 1 };
      return null;
    },
  },

  // ── Scroll ──
  {
    action: "nav_scroll_down",
    test: (t) => /^scroll\s+down(?:\s+(?:a\s+bit|more|page))?$/i.test(t) ? {} : null,
  },
  {
    action: "nav_scroll_up",
    test: (t) => /^scroll\s+up(?:\s+(?:a\s+bit|more|page))?$/i.test(t) ? {} : null,
  },
  {
    action: "nav_scroll_top",
    test: (t) => /^(?:scroll\s+to\s+)?(?:top|go\s+to\s+top)$/i.test(t) ? {} : null,
  },
  {
    action: "nav_scroll_bottom",
    test: (t) => /^(?:scroll\s+to\s+)?(?:bottom|end|go\s+to\s+bottom)$/i.test(t) ? {} : null,
  },

  // ── Find / Click ──
  {
    action: "nav_find",
    test: (t) => {
      const m = t.match(/^(?:find|search\s+on\s+page|highlight)\s+(.+)$/i);
      if (m) return { query: m[1] };
      return null;
    },
  },
  {
    action: "nav_click",
    test: (t) => {
      const m = t.match(/^click(?:\s+on)?\s+(.+)$/i);
      if (m) return { target: m[1] };
      return null;
    },
  },

  // ── Zoom ──
  {
    action: "nav_zoom_in",
    test: (t) => /^zoom\s+in$/i.test(t) ? {} : null,
  },
  {
    action: "nav_zoom_out",
    test: (t) => /^zoom\s+out$/i.test(t) ? {} : null,
  },
  {
    action: "nav_zoom_reset",
    test: (t) => /^(?:zoom\s+)?(?:reset|normal|default)\s*(?:zoom)?$/i.test(t) ? {} : null,
  },

  // ── Window ──
  {
    action: "nav_new_window",
    test: (t) => /^(?:open\s+)?new\s+window$/i.test(t) ? {} : null,
  },

  // ── Page actions ──
  {
    action: "nav_full_screen",
    test: (t) => /^(?:full\s*screen|fullscreen)$/i.test(t) ? {} : null,
  },
  {
    action: "nav_print",
    test: (t) => /^print(?:\s+page)?$/i.test(t) ? {} : null,
  },
];

/**
 * Tries to match a nav command from the text.
 * @param {string} text - lowercased transcript or typed input
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
    case "nav_goto":     return `🌐 Navigating to ${params.url}`;
    case "nav_search":   return `🔍 Searching for "${params.query}"`;
    case "nav_back":     return "⬅️ Going back";
    case "nav_forward":  return "➡️ Going forward";
    case "nav_refresh":  return "🔄 Refreshing page";
    case "nav_new_tab":  return "➕ Opening new tab";
    case "nav_close_tab":return "✖️ Closing tab";
    case "nav_next_tab": return "➡️ Switching to next tab";
    case "nav_prev_tab": return "⬅️ Switching to previous tab";
    case "nav_switch_tab": return `🔀 Switching to tab ${(params.index ?? 0) + 1}`;
    case "nav_scroll_down": return "⬇️ Scrolling down";
    case "nav_scroll_up":   return "⬆️ Scrolling up";
    case "nav_scroll_top":  return "⏫ Scrolled to top";
    case "nav_scroll_bottom": return "⏬ Scrolled to bottom";
    case "nav_find":    return `🔎 Finding "${params.query}"`;
    case "nav_click":   return `👆 Clicking "${params.target}"`;
    case "nav_zoom_in": return "🔍 Zoomed in";
    case "nav_zoom_out":return "🔍 Zoomed out";
    case "nav_zoom_reset": return "🔍 Zoom reset";
    case "nav_new_window": return "🪟 Opening new window";
    case "nav_full_screen": return "⛶ Fullscreen toggled";
    case "nav_print":   return "🖨️ Opening print dialog";
    default:            return `✅ Done`;
  }
}
