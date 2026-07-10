// useSpeechRecognition.js
//
// Upgraded with "Hey Jarvis" wake-word detection:
//   - A separate always-on background recognizer listens passively for "hey jarvis"
//   - When heard, it fires onWakeWord() so the Panel can auto-enable the main mic
//   - The main recognizer (for commands) is unchanged

import { useEffect, useRef, useState, useCallback } from "react";
import { storageGet, storageSet } from "../../shared/storage";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

// ── Wake-word hook (always-on, low-power) ──────────────────────────────────
export function useWakeWord({ onWakeWord } = {}) {
  const wakeRef = useRef(null);
  const onWakeRef = useRef(onWakeWord);
  onWakeRef.current = onWakeWord;
  const activeRef = useRef(false);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return;

    const rec = new SpeechRecognitionImpl();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    wakeRef.current = rec;

    rec.onresult = (e) => {
      const t = e.results[e.resultIndex][0].transcript.trim().toLowerCase();
      if (t.includes("hey jarvis") || t.includes("jarvis") || t.includes("hey jarvis")) {
        onWakeRef.current?.();
      }
    };

    rec.onend = () => {
      if (activeRef.current) {
        setTimeout(() => {
          try { rec.start(); } catch { /* already started */ }
        }, 500);
      }
    };

    rec.onerror = () => { /* silently ignore wake-word errors */ };

    // start immediately
    activeRef.current = true;
    try { rec.start(); } catch { /* ignore */ }

    return () => {
      activeRef.current = false;
      rec.onend = null;
      try { rec.stop(); } catch { /* ignore */ }
    };
  }, []);
}

// ── Main command recognizer ────────────────────────────────────────────────
export function useSpeechRecognition({ onTranscript } = {}) {
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState("en-US");
  const recognitionRef = useRef(null);
  const stoppingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // load persisted language preference
  useEffect(() => {
    storageGet("jarvisLang").then(({ jarvisLang }) => {
      setLang(jarvisLang || "en-US");
    });
  }, []);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return undefined;

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.trim().toLowerCase();
      // Filter out the wake word itself so it doesn't trigger a chat command
      if (transcript === "hey jarvis" || transcript === "jarvis") return;
      onTranscriptRef.current?.(transcript);
    };

    recognition.onend = () => {
      setListening(false);
      if (!stoppingRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            /* already started — ignore */
          }
        }, 500);
      }
    };

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stoppingRef.current = true;
      }
    };

    return () => {
      stoppingRef.current = true;
      recognition.onend = null;
      recognition.stop();
    };
  }, [lang]);

  const start = useCallback(() => {
    stoppingRef.current = false;
    try {
      recognitionRef.current?.start();
    } catch {
      /* already listening — ignore */
    }
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    recognitionRef.current?.stop();
  }, []);

  const switchLanguage = useCallback(async (nextLang) => {
    await storageSet({ jarvisLang: nextLang });
    setLang(nextLang);
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
