import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import VoiceOrb from "./components/VoiceOrb";
import ChatHistory from "./components/ChatHistory";
import Controls from "./components/Controls";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { matchVoiceCommand } from "./lib/voiceCommands";
import { askJarvis, translateSelection } from "./lib/api";
import { getPageState, savePageState } from "../shared/storage";

export default function Panel({ page, onClose, initialAction }) {
  const [history, setHistory]           = useState([]);
  const [transcript, setTranscript]     = useState("");
  const [inputValue, setInputValue]     = useState("");
  const [busy, setBusy]                 = useState(false);
  const [summary, setSummary]           = useState(null);
  const [activeParagraph, setActiveParagraph] = useState(null);
  const [error, setError]               = useState(null);
  const [wakeFlash, setWakeFlash]       = useState(false); // brief badge on wake

  const historyRef = useRef(history);
  historyRef.current = history;

  // ── Speech Recognition (declared first — used in callbacks below) ──
  const recognition = useSpeechRecognition({
    onTranscript: (t) => {
      setTranscript(t);
      const action = matchVoiceCommand(t);
      handleVoiceCommandRef.current?.(action, t);
    },
    onWakeWord: () => {
      // Auto-activate mic on wake word; show brief badge
      recognition.start();
      setWakeFlash(true);
      setTimeout(() => setWakeFlash(false), 2200);
    },
  });

  // ── Load page state from storage ──
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
        history: patch.history ?? historyRef.current,
        summary: patch.summary ?? summary,
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

  const runAssistant = useCallback(
    async (command, message, target) => {
      setBusy(true);
      setError(null);
      appendTurn("user", message);
      try {
        let reply;
        if (command === "translate") {
          const data = await translateSelection({
            text: target?.selectionText || message,
            targetLanguage: target?.targetLanguage || "English",
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
        const msg = `Sorry, I couldn't reach the assistant backend: ${err.message}`;
        appendTurn("assistant", msg);
        setError(err.message);
        tts.say("Sorry, I ran into a problem reaching the backend.", recognition.lang);
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
          const codeId = customTarget?.codeId || page.codeBlocks?.[0]?.id;
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

  // Stable ref so recognition's onTranscript closure always uses the latest handler
  const handleVoiceCommandRef = useRef(handleVoiceCommand);
  handleVoiceCommandRef.current = handleVoiceCommand;

  const handleToggleMic = () =>
    recognition.listening ? recognition.stop() : recognition.start();

  const handleToggleLang = () => {
    const nextLang = recognition.lang === "en-US" ? "hi-IN" : "en-US";
    recognition.switchLanguage(nextLang);
  };

  // Run initial action (e.g. from selection toolbar) once on mount
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
    const action = matchVoiceCommand(inputValue.toLowerCase());
    if (action) {
      handleVoiceCommand(action, inputValue);
    } else {
      runAssistant("chat", inputValue);
    }
    setInputValue("");
  };

  const paragraphPreview = useMemo(() => {
    if (activeParagraph == null) return null;
    return page.paragraphs?.[activeParagraph] || null;
  }, [activeParagraph, page.paragraphs]);

  return (
    <div className="jarvis-panel" role="dialog" aria-label="Jarvis assistant">
      {/* ── Header ── */}
      <header className="jarvis-panel__header">
        <VoiceOrb listening={recognition.listening} speaking={tts.speaking} />
        <div className="jarvis-panel__titles">
          <strong className="jarvis-panel__title" title={page.title}>
            {page.title}
          </strong>
          <span className="jarvis-panel__site">{page.siteName}</span>
        </div>
        <div className="jarvis-panel__header-right">
          {wakeFlash && (
            <span className="jarvis-panel__wake-badge" key={Date.now()}>👋 Hey Jarvis!</span>
          )}
          <span className="jarvis-panel__word-count">
            {page.wordCount ? `~${page.wordCount.toLocaleString()} words` : ""}
          </span>
          <button className="jarvis-panel__close" onClick={onClose} aria-label="Close assistant">
            ✕
          </button>
        </div>
      </header>

      {/* ── Transcript display ── */}
      {transcript && (
        <div className="jarvis-panel__transcript">
          <span className="jarvis-panel__transcript-icon">🎙️</span>
          "{transcript}"
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
          <span>⚠️</span> {error}
        </div>
      )}

      {/* ── Input row ── */}
      <form className="jarvis-panel__input-row" onSubmit={handleSubmitTyped}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask about this page…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !inputValue.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>

      {/* ── Controls ── */}
      <Controls
        listening={recognition.listening}
        speaking={tts.speaking}
        paused={tts.paused}
        lang={recognition.lang}
        onToggleMic={handleToggleMic}
        onToggleLang={handleToggleLang}
        onRead={() =>
          tts.readParagraphs(page.paragraphs, {
            fromIndex: activeParagraph ?? 0,
            lang: recognition.lang,
          })
        }
        onPause={tts.pause}
        onResume={tts.resume}
        onStop={tts.stop}
      />
    </div>
  );
}
