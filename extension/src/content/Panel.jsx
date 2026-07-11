import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import VoiceOrb from "./components/VoiceOrb";
import ChatHistory from "./components/ChatHistory";
import Controls from "./components/Controls";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { matchVoiceCommand } from "./lib/voiceCommands";
import { matchNavCommand, describeNavAction } from "./lib/navCommands";
import { executeNavCommand } from "./lib/navApi";
import { askJarvis, translateSelection } from "./lib/api";
import { getPageState, savePageState } from "../shared/storage";
import { getLang } from "./lib/languages";

export default function Panel({ page, onClose, initialAction }) {
  const [history, setHistory]                 = useState([]);
  const [transcript, setTranscript]           = useState("");
  const [inputValue, setInputValue]           = useState("");
  const [busy, setBusy]                       = useState(false);
  const [summary, setSummary]                 = useState(null);
  const [activeParagraph, setActiveParagraph] = useState(null);
  const [error, setError]                     = useState(null);
  const [resetDone, setResetDone]             = useState(false);
  const [navToast, setNavToast]               = useState(null);   // { msg, ok }
  const navToastTimerRef                       = useRef(null);
  const [navBarInput, setNavBarInput]          = useState("");

  const historyRef = useRef(history);
  historyRef.current = history;

  // Ref used by onWakeWord to call start() without circular dependency
  const recognitionStartRef = useRef(null);
  const handleVoiceCommandRef = useRef(null);

  // ── Speech Recognition (declared first — used in callbacks below) ──
  const recognition = useSpeechRecognition({
    onTranscript: (t) => {
      setTranscript(t);
      // Nav commands take priority over AI commands
      const navMatch = matchNavCommand(t);
      if (navMatch) {
        handleNavCommandRef.current?.(navMatch.action, navMatch.params);
        return;
      }
      const action = matchVoiceCommand(t);
      handleVoiceCommandRef.current?.(action, t);
    },
    onWakeWord: () => {
      // Wake word detected — start main mic immediately
      recognitionStartRef.current?.();
    },
  });

  // Wire the start function via ref (avoids closure capture issues)
  recognitionStartRef.current = recognition.start;

  // ── Load page state from storage on mount ──
  useEffect(() => {
    let cancelled = false;
    getPageState(page.url).then((state) => {
      if (cancelled) return;
      setHistory(state.history || []);
      setSummary(state.summary || null);
      setActiveParagraph(state.readingProgress?.paragraphIndex ?? null);
    });
    return () => { cancelled = true; };
  }, [page.url]);

  const persist = useCallback(
    (patch) => {
      const next = {
        history:         patch.history         ?? historyRef.current,
        summary:         patch.summary         ?? summary,
        readingProgress: { paragraphIndex: patch.paragraphIndex ?? activeParagraph ?? 0 },
      };
      savePageState(page.url, next);
    },
    [page.url, summary, activeParagraph]
  );

  const tts = useSpeechSynthesis({
    onParagraphChange: (i) => {
      setActiveParagraph(i);
      persist({ paragraphIndex: i });
    },
  });

  const appendTurn = useCallback(
    (role, content) => {
      setHistory((prev) => {
        const next = [...prev, { role, content }];
        persist({ history: next });
        return next;
      });
    },
    [persist]
  );

  // ── Reset conversation ──
  const handleReset = useCallback(() => {
    tts.stop();
    recognition.stop();
    setHistory([]);
    setSummary(null);
    setTranscript("");
    setError(null);
    savePageState(page.url, { history: [], summary: null, readingProgress: { paragraphIndex: 0 } });
    setResetDone(true);
    setTimeout(() => setResetDone(false), 1800);
  }, [page.url, tts, recognition]);

  const runAssistant = useCallback(
    async (command, message, target) => {
      setBusy(true);
      setError(null);
      appendTurn("user", message);
      try {
        let reply;
        if (command === "translate") {
          const textToTranslate = target?.selectionText || page.textContent?.slice(0, 3000) || message;
          let targetLang = target?.targetLanguage;
          if (!targetLang || targetLang.length <= 3) {
            targetLang = getLang(recognition.lang).name;
          }
          const data = await translateSelection({
            text: textToTranslate,
            targetLanguage: targetLang,
          });
          reply = data.reply;
        } else {
          const data = await askJarvis({
            command,
            message,
            page,
            history: historyRef.current,
            target,
          });
          reply = data.reply;
        }
        appendTurn("assistant", reply);
        if (command === "summarize") {
          setSummary(reply);
          persist({ summary: reply });
        }
        tts.say(reply, recognition.lang);
        return reply;
      } catch (err) {
        const msg = `Sorry, I couldn't reach the assistant. Make sure the backend is running at localhost:5000. Error: ${err.message}`;
        appendTurn("assistant", msg);
        setError(err.message);
      } finally {
        setBusy(false);
      }
      return null;
    },
    [appendTurn, page, persist, tts, recognition.lang]
  );

  const activeParagraphRef = useRef(activeParagraph);
  activeParagraphRef.current = activeParagraph;

  const handleVoiceCommand = useCallback(
    (action, rawTranscript, customTarget) => {
      const curPara = activeParagraphRef.current;
      switch (action) {
        case "read_page":
          tts.readParagraphs(page.paragraphs, { fromIndex: 0, lang: recognition.lang });
          return;
        case "summarize":
          runAssistant("summarize", "Summarize this page", customTarget);
          return;
        case "explain_paragraph": {
          const idx = customTarget?.paragraphIndex ?? curPara ?? 0;
          runAssistant("explain_paragraph", `Explain paragraph ${idx + 1}`, { paragraphIndex: idx });
          return;
        }
        case "explain_article":
          runAssistant("explain_article", "Explain this article", customTarget);
          return;
        case "explain_code": {
          const blocks = page.codeBlocks;
          const codeId = customTarget?.codeId || (blocks && blocks[0] ? blocks[0].id : undefined);
          runAssistant("explain_code", "Explain this code", { codeId });
          return;
        }
        case "continue_reading":
          tts.continueReading(recognition.lang);
          return;
        case "repeat":
          tts.repeat(recognition.lang);
          return;
        case "stop_reading":
          tts.stop();
          return;
        case "pause":
          tts.pause();
          return;
        case "resume":
          tts.resume();
          return;
        case "skip_section":
          tts.skip();
          return;
        case "important_points":
          runAssistant("important_points", "Read the important points", customTarget);
          return;
        case "what_does_this_mean": {
          const idx = customTarget?.paragraphIndex ?? curPara ?? 0;
          runAssistant("what_does_this_mean", rawTranscript, { paragraphIndex: idx });
          return;
        }
        case "explain_selection":
          runAssistant("explain_selection", rawTranscript, customTarget);
          return;
        case "summarize_selection":
          runAssistant("summarize_selection", rawTranscript, customTarget);
          return;
        case "translate":
          runAssistant("translate", rawTranscript, customTarget);
          return;
        default:
          if (rawTranscript?.trim()) runAssistant("chat", rawTranscript);
      }
    },
    [page, runAssistant, tts, recognition.lang]
  );

  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  // ── Nav command ref (avoids stale closure in recognition.onTranscript) ──
  const handleNavCommandRef = useRef(null);

  // ── Navigation toast helper ──
  const showNavToast = useCallback((msg, ok = true) => {
    clearTimeout(navToastTimerRef.current);
    setNavToast({ msg, ok });
    navToastTimerRef.current = setTimeout(() => setNavToast(null), 3500);
  }, []);

  // ── Navigation command handler ──
  const handleNavCommand = useCallback(
    async (action, params) => {
      const preview = describeNavAction(action, params);
      showNavToast(preview);
      try {
        const result = await executeNavCommand(action, params);
        showNavToast(`${result}`, true);
      } catch (err) {
        showNavToast(`Failed: ${err.message}`, false);
      }
    },
    [showNavToast]
  );

  useEffect(() => {
    handleNavCommandRef.current = handleNavCommand;
  }, [handleNavCommand]);

  const handleToggleMic  = () => recognition.listening ? recognition.stop() : recognition.start();
  const handleSwitchLang = (code) => recognition.switchLanguage(code);

  // Translate button handler — translates the current page content to the selected language
  const handleTranslate = useCallback(() => {
    const langConfig = getLang(recognition.lang);
    runAssistant("translate", `Translate this page to ${langConfig.name}`, {
      selectionText: page.textContent?.slice(0, 3000) || "",
      targetLanguage: langConfig.name,
    });
  }, [runAssistant, page.textContent, recognition.lang]);

  // Summarize button handler
  const handleSummarize = useCallback(() => {
    runAssistant("summarize", "Summarize this page");
  }, [runAssistant]);

  // Run initial action (from selection toolbar) once on mount
  const initialActionRef = useRef(initialAction);
  useEffect(() => {
    if (initialActionRef.current) {
      const action = initialActionRef.current;
      initialActionRef.current = null;
      setTimeout(() => handleVoiceCommand(action.command, action.message, action.target), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmitTyped = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || busy) return;
    const text = inputValue.trim();
    // Nav commands take priority
    const navMatch = matchNavCommand(text);
    if (navMatch) {
      handleNavCommand(navMatch.action, navMatch.params);
      setInputValue("");
      setTranscript("");
      return;
    }
    const action = matchVoiceCommand(text.toLowerCase());
    action ? handleVoiceCommand(action, text) : runAssistant("chat", text);
    setInputValue("");
    setTranscript("");
  };

  // ── Nav bar quick-submit ──
  const handleNavBarSubmit = useCallback((text) => {
    if (!text.trim()) return;
    const navMatch = matchNavCommand(text.trim());
    if (navMatch) {
      handleNavCommand(navMatch.action, navMatch.params);
    } else {
      const raw = text.trim();
      const url = /^https?:\/\//.test(raw)
        ? raw
        : /^[\w-]+\./.test(raw)
          ? `https://${raw}`
          : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
      handleNavCommand("nav_goto", { url });
    }
  }, [handleNavCommand]);

  const paragraphPreview = useMemo(() => {
    if (activeParagraph == null) return null;
    return page.paragraphs?.[activeParagraph] || null;
  }, [activeParagraph, page.paragraphs]);

  return (
    <div className="jarvis-panel" role="dialog" aria-label="Jarvis assistant">

      {/* ── Navigation Toast ── */}
      {navToast && (
        <div className={`jarvis-nav-toast ${navToast.ok ? "jarvis-nav-toast--ok" : "jarvis-nav-toast--err"}`}>
          {navToast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="jarvis-panel__header">
        <VoiceOrb listening={recognition.listening} speaking={tts.speaking} />
        <div className="jarvis-panel__titles">
          <strong className="jarvis-panel__title" title={page.title}>{page.title}</strong>
          <span className="jarvis-panel__site">{page.siteName}</span>
        </div>
        <div className="jarvis-panel__header-right">
          {page.wordCount > 0 && (
            <span className="jarvis-panel__word-count">
              ~{page.wordCount.toLocaleString()} words
            </span>
          )}
          {/* Reset conversation button */}
          <button
            id="jarvis-reset-btn"
            className="jarvis-panel__reset-btn"
            onClick={handleReset}
            title="Reset conversation"
            disabled={busy}
          >
            {resetDone ? "✓" : "↺"}
          </button>
          <button
            id="jarvis-close-btn"
            className="jarvis-panel__close"
            onClick={onClose}
            aria-label="Close assistant"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── Transcript display ── */}
      {transcript && (
        <div className="jarvis-panel__transcript">
          <span>🎙️</span> "{transcript}"
        </div>
      )}

      {/* ── Currently reading paragraph ── */}
      {paragraphPreview && (
        <div className="jarvis-panel__paragraph-preview">
          <span className="jarvis-panel__paragraph-label">Currently reading</span>
          <p>{paragraphPreview}</p>
        </div>
      )}

      {/* ── Chat history ── */}
      <ChatHistory history={history} busy={busy} />

      {/* ── Error banner ── */}
      {error && (
        <div className="jarvis-panel__error">
          ⚠️ {error}
          <br />
          <small>Make sure the backend server is running: <code>cd backend && npm start</code></small>
        </div>
      )}

      {/* ── Input row ── */}
      <form className="jarvis-panel__input-row" onSubmit={handleSubmitTyped}>
        <input
          id="jarvis-chat-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={busy ? "Jarvis is thinking…" : "Ask about this page…"}
          disabled={busy}
          autoComplete="off"
        />
        <button id="jarvis-send-btn" type="submit" disabled={busy || !inputValue.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>

      {/* ── Controls ── */}
      <Controls
        listening={recognition.listening}
        speaking={tts.speaking}
        paused={tts.paused}
        lang={recognition.lang}
        alwaysOnEnabled={recognition.alwaysOnEnabled}
        wakeListening={recognition.wakeListening}
        onToggleMic={handleToggleMic}
        onSwitchLang={handleSwitchLang}
        onToggleAlwaysOn={recognition.toggleAlwaysOn}
        onRead={() => tts.readParagraphs(page.paragraphs, { fromIndex: activeParagraph ?? 0, lang: recognition.lang })}
        onPause={tts.pause}
        onResume={tts.resume}
        onStop={tts.stop}
        onSummarize={handleSummarize}
        onTranslate={handleTranslate}
        navBarInput={navBarInput}
        onNavBarInput={setNavBarInput}
        onNavBarSubmit={handleNavBarSubmit}
        onNavCommand={handleNavCommand}
      />
    </div>
  );
}
