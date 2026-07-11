import React, { useState, useRef, useEffect } from "react";
import './LanguageSelector.css';
import { LANGUAGES, getLang } from "../lib/languages";

/**
 * LanguageSelector — beautiful dropdown for all 20 supported languages.
 * Shows flag + short code on the button, full list in the dropdown.
 *
 * NOTE: This component runs inside a Shadow DOM, so we use composedPath()
 * for outside-click detection instead of contains(), which fails across
 * shadow boundaries.
 */
export default function LanguageSelector({ lang, onSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = getLang(lang);

  // Close when clicking outside — Shadow DOM safe
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      // composedPath() traverses shadow boundaries correctly
      const path = e.composedPath ? e.composedPath() : [e.target];
      if (ref.current && !path.includes(ref.current)) {
        setOpen(false);
      }
    };
    // Use setTimeout so this listener isn't triggered by the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handler, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler, true);
    };
  }, [open]);

  const handleSelect = (code) => {
    setOpen(false);
    if (code !== lang) onSwitch(code);
  };

  return (
    <div className="jarvis-lang-selector" ref={ref}>
      <button
        id="jarvis-lang-btn"
        className="jarvis-btn jarvis-btn--lang jarvis-lang-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={`Language: ${current.name} — click to change`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="jarvis-lang-flag">{current.flag}</span>
        <span className="jarvis-lang-code">{current.code.split("-")[0].toUpperCase()}</span>
        <span className="jarvis-lang-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="jarvis-lang-dropdown" role="listbox" aria-label="Select language">
          <div className="jarvis-lang-dropdown__header">🌐 Choose Language</div>
          <div className="jarvis-lang-dropdown__list">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={`jarvis-lang-option ${l.code === lang ? "is-active" : ""}`}
                role="option"
                aria-selected={l.code === lang}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(l.code);
                }}
              >
                <span className="jarvis-lang-option__flag">{l.flag}</span>
                <span className="jarvis-lang-option__info">
                  <span className="jarvis-lang-option__name">{l.name}</span>
                  <span className="jarvis-lang-option__native">{l.nativeName}</span>
                </span>
                {l.code === lang && (
                  <span className="jarvis-lang-option__check">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
