"use client";

/**
 * Distinct notification tones synthesized with the Web Audio API — no binary
 * assets (CSP-safe). Each event type gets its own pitch/pattern so the merchant
 * can tell what arrived without looking.
 *
 * Browsers block audio until a user gesture, so call `unlockAudio()` from a
 * one-time interaction handler to prime the shared AudioContext.
 */

const MUTE_KEY = "moeen-notif-sound";

export type NotificationKind = "message" | "order" | "flag" | "flag-critical";

// One shared context for the tab.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
  }
  return ctx;
}

/** Prime/resume the AudioContext on a user gesture (autoplay policy). */
export function unlockAudio(): void {
  const audio = getCtx();
  if (audio && audio.state === "suspended") {
    void audio.resume();
  }
}

export function isSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "off";
}

// --- tiny external store so UI can read the mute flag via useSyncExternalStore ---

const muteListeners = new Set<() => void>();

export function setSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
  muteListeners.forEach((cb) => cb());
}

/** Subscribe to mute-flag changes (for useSyncExternalStore). */
export function subscribeMuted(callback: () => void): () => void {
  muteListeners.add(callback);
  return () => muteListeners.delete(callback);
}

/** Client snapshot of the mute flag. */
export function getMutedSnapshot(): boolean {
  return isSoundMuted();
}

/** Server snapshot — sounds are never muted during SSR. */
export function getMutedServerSnapshot(): boolean {
  return false;
}

/** A single beep: frequency (Hz), start offset (s), duration (s), peak gain. */
interface Beep {
  freq: number;
  start: number;
  duration: number;
  gain?: number;
  type?: OscillatorType;
}

const PATTERNS: Record<NotificationKind, Beep[]> = {
  // soft single blip
  message: [{ freq: 660, start: 0, duration: 0.12, type: "sine" }],
  // pleasant rising two-note chime
  order: [
    { freq: 523.25, start: 0, duration: 0.12, type: "sine" },
    { freq: 783.99, start: 0.12, duration: 0.16, type: "sine" },
  ],
  // neutral two-pulse alert
  flag: [
    { freq: 440, start: 0, duration: 0.1, type: "triangle" },
    { freq: 440, start: 0.16, duration: 0.1, type: "triangle" },
  ],
  // urgent low triple pulse
  "flag-critical": [
    { freq: 311.13, start: 0, duration: 0.12, gain: 0.5, type: "square" },
    { freq: 311.13, start: 0.18, duration: 0.12, gain: 0.5, type: "square" },
    { freq: 311.13, start: 0.36, duration: 0.16, gain: 0.5, type: "square" },
  ],
};

/** Play the tone for a notification kind, unless muted. */
export function playNotificationSound(kind: NotificationKind): void {
  if (isSoundMuted()) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === "suspended") {
    // Not yet unlocked by a gesture — skip rather than throw.
    void audio.resume();
    if (audio.state === "suspended") return;
  }

  const now = audio.currentTime;
  for (const beep of PATTERNS[kind]) {
    const osc = audio.createOscillator();
    const gainNode = audio.createGain();
    osc.type = beep.type ?? "sine";
    osc.frequency.value = beep.freq;

    const peak = beep.gain ?? 0.25;
    const t0 = now + beep.start;
    const t1 = t0 + beep.duration;
    // Quick attack + smooth decay to avoid clicks.
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gainNode);
    gainNode.connect(audio.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}
