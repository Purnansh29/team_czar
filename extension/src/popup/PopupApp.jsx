import React, { useEffect, useState, useCallback } from "react";
import { storageGet, storageSet } from "../shared/storage";

const FEATURES = [
  { icon: "🎙️", label: "Voice Commands" },
  { icon: "📖", label: "Read Aloud" },
  { icon: "🧠", label: "AI Summaries" },
  { icon: "🌐", label: "Hindi / English" },
];

const COMMANDS = [
  "Summarize this page",
  "Explain this article",
  "Read this page",
  "What does this mean?",
  "Read important points",
  "Explain this code",
];

export default function PopupApp() {
  const [backendUrl, setBackendUrl] = useState("http://localhost:5000");
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("checking"); // "checking" | "online" | "offline"
  const [showSettings, setShowSettings] = useState(false);
  const [model, setModel] = useState("llama3.2:1b");

  useEffect(() => {
    storageGet(["backendUrl", "ollamaModel"]).then((r) => {
      if (r.backendUrl) setBackendUrl(r.backendUrl);
      if (r.ollamaModel) setModel(r.ollamaModel);
    });
    checkBackend();
  }, []);

  const checkBackend = useCallback(async () => {
    setStatus("checking");
    try {
      const { backendUrl: url } = await storageGet("backendUrl");
      const base = url || "http://localhost:5000";
      const res = await fetch(`${base}/api/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(4000),
      });
      setStatus(res.ok ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }, []);

  const openPanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "JARVIS_TOGGLE_PANEL" });
    window.close();
  };

  const saveSettings = async () => {
    await storageSet({ backendUrl, ollamaModel: model });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const statusColor = status === "online" ? "#4ade80" : status === "offline" ? "#f87171" : "#facc15";
  const statusLabel = status === "online" ? "Backend Online" : status === "offline" ? "Backend Offline" : "Checking…";

  return (
    <div className="popup">
      {/* ── Header ── */}
      <header className="popup__header">
        <div className="popup__logo-wrap">
          <div className="popup__logo">
            <span className="popup__logo-j">J</span>
            <div className="popup__logo-ring" />
          </div>
        </div>
        <div className="popup__header-text">
          <h1 className="popup__title">Jarvis</h1>
          <p className="popup__subtitle">AI Browser Companion</p>
        </div>
        <button
          className="popup__settings-btn"
          onClick={() => setShowSettings((s) => !s)}
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* ── Status Bar ── */}
      <div className="popup__status-bar">
        <span className="popup__status-dot" style={{ background: statusColor }} />
        <span className="popup__status-label">{statusLabel}</span>
        <button className="popup__refresh-btn" onClick={checkBackend} title="Refresh status">↻</button>
        <span className="popup__model-tag">🤖 Ollama</span>
      </div>

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="popup__settings">
          <label className="popup__label" htmlFor="backend-url">Backend URL</label>
          <input
            id="backend-url"
            className="popup__input"
            type="text"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="http://localhost:5000"
          />
          <label className="popup__label" htmlFor="model-name" style={{ marginTop: 8 }}>Ollama Model</label>
          <input
            id="model-name"
            className="popup__input"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="llama3.2:1b"
          />
          <button className="popup__save-btn" onClick={saveSettings}>
            {saved ? "✓ Saved!" : "Save Settings"}
          </button>
        </div>
      )}

      {/* ── Main CTA ── */}
      {!showSettings && (
        <>
          <button className="popup__cta" onClick={openPanel}>
            <span className="popup__cta-icon">✨</span>
            <span>Open Jarvis on this page</span>
            <span className="popup__cta-arrow">→</span>
          </button>

          <p className="popup__shortcut-hint">
            or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> anywhere
          </p>

          {/* ── Features Grid ── */}
          <div className="popup__features">
            {FEATURES.map((f) => (
              <div key={f.label} className="popup__feature">
                <span className="popup__feature-icon">{f.icon}</span>
                <span className="popup__feature-label">{f.label}</span>
              </div>
            ))}
          </div>

          {/* ── Command Examples ── */}
          <div className="popup__commands-section">
            <p className="popup__section-label">Try saying…</p>
            <div className="popup__commands">
              {COMMANDS.map((cmd) => (
                <span key={cmd} className="popup__command-chip">{cmd}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <footer className="popup__footer">
        <span>Powered by Ollama — 100% local & private</span>
      </footer>
    </div>
  );
}
