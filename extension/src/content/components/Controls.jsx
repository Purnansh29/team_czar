import React, { useState } from "react";
import LanguageSelector from "./LanguageSelector";

export default function Controls({
  listening,
  speaking,
  paused,
  lang,
  alwaysOnEnabled,
  wakeListening,
  onToggleMic,
  onSwitchLang,
  onToggleAlwaysOn,
  onRead,
  onPause,
  onResume,
  onStop,
  onSummarize,
  onTranslate,
  // ── Navigation props ──
  navBarInput,
  onNavBarInput,
  onNavBarSubmit,
  onNavCommand,
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [navInput, setNavInput] = useState(navBarInput || "");

  const handleNavSubmit = (e) => {
    e.preventDefault();
    if (!navInput.trim()) return;
    onNavBarSubmit?.(navInput.trim());
    setNavInput("");
    onNavBarInput?.("");
  };

  const quickNav = (action, params = {}) => {
    onNavCommand?.(action, params);
  };

  return (
    <div className="jarvis-controls">
      {/* Row 1: Primary actions */}
      <div className="jarvis-controls__row">
        <button
          id="jarvis-mic-btn"
          className={`jarvis-btn jarvis-btn--mic ${listening ? "is-active" : ""}`}
          onClick={onToggleMic}
          title={listening ? "Click to stop listening" : "Click to start voice input"}
        >
          {listening ? "🔴 Listening…" : "🎙️ Mic"}
        </button>

        <button
          id="jarvis-summarize-btn"
          className="jarvis-btn jarvis-btn--action"
          onClick={onSummarize}
          title="Summarize this page"
        >
          🧠 Summarize
        </button>

        <button
          id="jarvis-read-btn"
          className="jarvis-btn jarvis-btn--action"
          onClick={onRead}
          title="Read this page aloud"
        >
          📖 Read
        </button>
      </div>

      {/* Row 2: Playback + translate */}
      <div className="jarvis-controls__row">
        {!paused ? (
          <button
            id="jarvis-pause-btn"
            className="jarvis-btn"
            onClick={onPause}
            disabled={!speaking}
            title="Pause reading"
          >
            ⏸ Pause
          </button>
        ) : (
          <button
            id="jarvis-resume-btn"
            className="jarvis-btn"
            onClick={onResume}
            title="Resume reading"
          >
            ▶️ Resume
          </button>
        )}

        <button
          id="jarvis-stop-btn"
          className="jarvis-btn"
          onClick={onStop}
          disabled={!speaking && !paused}
          title="Stop reading"
        >
          ⏹ Stop
        </button>

        <button
          id="jarvis-translate-btn"
          className="jarvis-btn jarvis-btn--translate"
          onClick={onTranslate}
          title="Translate page content to English"
        >
          🌐 Translate
        </button>

        {/* Nav Mode toggle */}
        <button
          id="jarvis-nav-toggle-btn"
          className={`jarvis-btn jarvis-btn--nav ${navOpen ? "is-active" : ""}`}
          onClick={() => setNavOpen((v) => !v)}
          title="Toggle navigation controls"
        >
          🧭 Navigate
        </button>
      </div>

      {/* ── Nav Bar (collapsible) ── */}
      {navOpen && (
        <div className="jarvis-nav-bar">
          {/* URL / Command input */}
          <form className="jarvis-nav-bar__form" onSubmit={handleNavSubmit}>
            <input
              id="jarvis-nav-input"
              className="jarvis-nav-bar__input"
              type="text"
              value={navInput}
              onChange={(e) => {
                setNavInput(e.target.value);
                onNavBarInput?.(e.target.value);
              }}
              placeholder="URL or command: go to youtube, scroll down…"
              autoComplete="off"
            />
            <button
              id="jarvis-nav-go-btn"
              className="jarvis-btn jarvis-btn--nav-go"
              type="submit"
              disabled={!navInput.trim()}
            >
              Go
            </button>
          </form>

          {/* Quick-action chips */}
          <div className="jarvis-nav-bar__chips">
            <button className="jarvis-chip" onClick={() => quickNav("nav_back")} title="Go back">⬅️ Back</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_forward")} title="Go forward">➡️ Fwd</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_refresh")} title="Refresh">🔄 Reload</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_new_tab")} title="New tab">➕ Tab</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_scroll_top")} title="Scroll to top">⏫ Top</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_scroll_bottom")} title="Scroll to bottom">⏬ Bottom</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_scroll_up")} title="Scroll up">⬆️ Up</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_scroll_down")} title="Scroll down">⬇️ Down</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_close_tab")} title="Close tab">✖️ Close</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_zoom_in")} title="Zoom in">🔍+</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_zoom_out")} title="Zoom out">🔍-</button>
            <button className="jarvis-chip" onClick={() => quickNav("nav_zoom_reset")} title="Reset zoom">🔍=</button>
          </div>
        </div>
      )}

      {/* Row 3: Language selector + Always-on toggle */}
      <div className="jarvis-controls__row jarvis-controls__row--settings">
        {/* Always-on wake word toggle */}
        <button
          id="jarvis-alwayson-btn"
          className={`jarvis-btn jarvis-btn--alwayson ${alwaysOnEnabled ? "is-active" : ""}`}
          onClick={onToggleAlwaysOn}
          title={
            alwaysOnEnabled
              ? `Always-on: ON — say "Hey Jarvis" to activate without pressing the mic button`
              : `Always-on: OFF — click to enable "Hey Jarvis" wake word`
          }
        >
          {alwaysOnEnabled ? (
            <>
              <span className={`jarvis-wake-dot ${wakeListening ? "is-listening" : ""}`} />
              👂 Hey Jarvis
            </>
          ) : (
            "🔇 Wake: Off"
          )}
        </button>

        {/* Language dropdown */}
        <LanguageSelector lang={lang} onSwitch={onSwitchLang} />
      </div>
    </div>
  );
}
