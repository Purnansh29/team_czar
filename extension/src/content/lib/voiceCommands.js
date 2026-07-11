// voiceCommands.js
//
// Small, dependency-free command matcher. Kept separate from the recognition
// hook (same separation of concerns as the original app.js, which matched
// `transcript.includes(...)` inline inside recognition.onresult).
//
// NOTE: Nav commands (navCommands.js) are checked BEFORE these in Panel.jsx,
// so patterns here don't need to worry about nav-intent conflicts.
//
// Each entry: { test(transcript) => boolean, action: string }
// `action` is handled by Panel.jsx's handleVoiceCommand().

export const VOICE_COMMANDS = [
  // ── Page reading ──
  {
    action: "read_page",
    test: (t) =>
      t.includes("read this page") ||
      t.includes("read the page") ||
      t.includes("read aloud") ||
      t.includes("read out loud") ||
      t.includes("start reading"),
  },
  {
    action: "continue_reading",
    test: (t) =>
      t.includes("continue reading") ||
      t.includes("keep reading") ||
      t.includes("continue"),
  },
  {
    action: "repeat",
    test: (t) =>
      t.includes("repeat") ||
      t.includes("say that again") ||
      t.includes("repeat that"),
  },
  // "stop reading" must come before generic "stop" to avoid conflicts with nav_close
  {
    action: "stop_reading",
    test: (t) =>
      t.includes("stop reading") ||
      t.includes("stop narration") ||
      t.includes("stop speaking") ||
      t.includes("stop audio"),
  },
  {
    action: "pause",
    test: (t) =>
      t.includes("pause reading") ||
      t.includes("pause audio") ||
      t === "pause",
  },
  {
    action: "resume",
    test: (t) =>
      t.includes("resume reading") ||
      t.includes("resume audio") ||
      t === "resume",
  },
  {
    action: "skip_section",
    test: (t) =>
      t.includes("skip this section") ||
      t.includes("skip section") ||
      t.includes("skip paragraph") ||
      t === "skip",
  },

  // ── Page AI analysis ──
  {
    action: "summarize",
    test: (t) =>
      t.includes("summarize") ||
      t.includes("summary") ||
      t.includes("give me a summary") ||
      t.includes("tldr"),
  },
  {
    action: "explain_paragraph",
    test: (t) =>
      t.includes("explain this paragraph") ||
      t.includes("explain that paragraph") ||
      t.includes("what does this paragraph mean"),
  },
  {
    action: "explain_article",
    test: (t) =>
      t.includes("explain this article") ||
      t.includes("explain the article") ||
      t.includes("what is this article about"),
  },
  {
    action: "explain_code",
    test: (t) =>
      t.includes("explain this code") ||
      t.includes("explain the code") ||
      t.includes("what does this code do"),
  },
  {
    action: "important_points",
    test: (t) =>
      t.includes("important points") ||
      t.includes("key points") ||
      t.includes("main points") ||
      t.includes("highlights"),
  },
  {
    action: "what_does_this_mean",
    test: (t) =>
      t.includes("what does this mean") ||
      t.includes("what does that mean") ||
      t.includes("meaning of this"),
  },
];

/** Returns the first matching action for a transcript, or null. */
export function matchVoiceCommand(transcript) {
  const t = transcript.trim().toLowerCase();
  const match = VOICE_COMMANDS.find((c) => c.test(t));
  return match ? match.action : null;
}
