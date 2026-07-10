// useSpeechRecognition.js
//
// Single-recognizer design that handles BOTH wake-word detection AND
// button-triggered command listening without any conflict.
//
// How it works:
//   • One SpeechRecognition instance runs ALL the time (auto-restarts on end).
//   • "Passive mode"  (button OFF): only reacts to "hey jarvis" → fires onWakeWord
//   • "Active mode"   (button ON ): reacts to all speech   → fires onTranscript
//   • The button press just flips a ref flag — it never stops/restarts the recognizer.

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGet, storageSet } from "../../shared/storage";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

const WAKE_PHRASES = ["hey jarvis", "jarvis", "hey jarvis!"];

export function useSpeechRecognition({ onTranscript, onWakeWord } = {}) {
  const [listening, setListening] = useState(false); // mic button state
  const [lang, setLang]           = useState("en-US");

  const recognitionRef  = useRef(null);
  const stoppingRef     = useRef(false); // true only when user explicitly stops
  const activeRef       = useRef(false); // mirrors `listening` for use inside callbacks
  const onTranscriptRef = useRef(onTranscript);
  const onWakeWordRef   = useRef(onWakeWord);
  onTranscriptRef.current = onTranscript;
  onWakeWordRef.current   = onWakeWord;

  // Load persisted language preference
  useEffect(() => {
    storageGet("jarvisLang").then(({ jarvisLang }) => {
      setLang(jarvisLang || "en-US");
    });
  }, []);

  // Build (or rebuild) the recognizer whenever lang changes
  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    const rec = new SpeechRecognitionImpl();
    rec.continuous       = true;
    rec.interimResults   = false;
    rec.lang             = lang;
    recognitionRef.current = rec;

    rec.onresult = (event) => {
      const t = event.results[event.resultIndex][0].transcript.trim().toLowerCase();

      const isWake = WAKE_PHRASES.some((p) => t.includes(p));

      if (isWake) {
        // Wake word heard — fire onWakeWord regardless of mic button state
        onWakeWordRef.current?.();
        return; // don't also treat it as a command
      }

      // Only forward to command handler when mic button is ON
      if (activeRef.current) {
        onTranscriptRef.current?.(t);
      }
    };

    rec.onstart = () => {
      // Keep listening indicator in sync with button state
      setListening(activeRef.current);
    };

    // Auto-restart so the recognizer never goes idle on its own
    rec.onend = () => {
      if (!stoppingRef.current) {
        setTimeout(() => {
          try { rec.start(); } catch { /* already running */ }
        }, 300);
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stoppingRef.current = true;
      }
      // For all other transient errors (network, aborted) let onend restart it
    };

    // Start immediately in passive mode (wake-word only)
    stoppingRef.current = false;
    try { rec.start(); } catch { /* ignore */ }

    return () => {
      stoppingRef.current = true;
      rec.onend = null;
      try { rec.stop(); } catch { /* ignore */ }
    };
  }, [lang]);

  // ── Button handlers ──
  // These flip the flag but do NOT start/stop the recognizer (it's always on).
  const start = useCallback(() => {
    activeRef.current = true;
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    setListening(false);
  }, []);

  const switchLanguage = useCallback(async (nextLang) => {
    await storageSet({ jarvisLang: nextLang });
    setLang(nextLang); // triggers useEffect → rebuilds recognizer with new lang
  }, []);

  return {
    supported: Boolean(SpeechRecognitionImpl),
    listening,
    lang,
    start,
    stop,
    switchLanguage,
  };
}
