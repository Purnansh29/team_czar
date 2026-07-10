import React from "react";

/**
 * Animated orb: pulses red while mic is listening, glows blue while speaking,
 * glows green when wake word "Hey Jarvis" is detected.
 */
export default function VoiceOrb({ listening, speaking, wakeActive }) {
  const state = wakeActive ? "wake" : speaking ? "speaking" : listening ? "listening" : "idle";
  return (
    <div className={`jarvis-orb jarvis-orb--${state}`} aria-hidden="true">
      <div className="jarvis-orb__core" />
      <div className="jarvis-orb__ring" />
      <div className="jarvis-orb__ring jarvis-orb__ring--delay" />
    </div>
  );
}
