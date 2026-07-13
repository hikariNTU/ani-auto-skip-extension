/**
 * Shared between the content script (loaded before main.ts) and the popup.
 */

export interface Settings {
  /** Mute the tab while ads are playing */
  autoMute: boolean;
  /** Pause the anime after ads are skipped (so you don't miss the start) */
  pauseAfterSkip: boolean;
  /** Seconds to wait before force-clicking the skip button */
  waitSeconds: number;
  /** Play a chime when ads are done and the anime is ready */
  chimeOnReady: boolean;
  /** Play a chime when the episode finishes */
  chimeOnEnded: boolean;
  /** Chime volume 0–1 */
  chimeVolume: number;
  /** Show a desktop notification when ads are done / episode ends */
  notifyOnReady: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoMute: true,
  pauseAfterSkip: true,
  waitSeconds: 30,
  chimeOnReady: true,
  chimeOnEnded: true,
  chimeVolume: 0.5,
  notifyOnReady: false,
};

export async function loadSettings(): Promise<Settings> {
  const api = globalThis.browser ?? chrome;
  try {
    return (await api.storage.sync.get(DEFAULT_SETTINGS)) as Settings;
  } catch (e) {
    console.error("[Ani Skip] Failed to load settings, using defaults", e);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Two-note chime via WebAudio, no audio asset needed.
 * Starts ~0.3s late so a just-unmuted tab is audible again by then.
 */
export function playChime(volume = 0.5) {
  try {
    const ctx = new AudioContext();
    const t0 = ctx.currentTime + 0.3;
    const notes: [freq: number, offset: number][] = [
      [880, 0], // A5
      [1174.66, 0.18], // D6
    ];
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0 + offset);
      gain.gain.linearRampToValueAtTime(volume, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 1);
    }
    setTimeout(() => ctx.close(), 2500);
  } catch (e) {
    console.error("[Ani Skip] Failed to play chime", e);
  }
}
