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
  /**
   * Use chrome.debugger (CDP) to dispatch genuinely trusted clicks on ads
   * that ignore synthetic clicks (isTrusted-gated) or live inside sandboxed
   * cross-origin iframes the content script cannot reach. Opt-in: enabling it
   * requests the "debugger" permission and shows Chrome's debugging banner
   * for the few seconds it is attached. Default off.
   */
  cdpTrustedClick: boolean;
}

export interface AdDismissTarget {
  /** What kind of control this is, for display/grouping in the settings panel */
  type: string;
  /** CSS selector ad-controller.ts queries for and clicks */
  selector: string;
  /** Short human note on which ad format this targets */
  note: string;
}

/**
 * Every selector ad-controller.ts tries on each dispatch, in the same order
 * it tries them. Kept here (rather than inline in ad-controller.ts) so the
 * settings popup can render the same list for visibility into what a given
 * build actually targets.
 */
export const AD_DISMISS_TARGETS: AdDismissTarget[] = [
  {
    type: "skip",
    selector: "button.videoAdUiSkipButton",
    note: "standard skippable pre-roll (Google IMA)",
  },
  {
    type: "reward-close",
    selector: "div.rewardCloseButton",
    note: "rewarded ad close button",
  },
  {
    type: "skip",
    selector: "div.skip-button-container",
    note: "full-screen ad, bottom-right translucent skip button",
  },
  {
    type: "skip",
    selector: "#count_down",
    note: "countdown-gated skip button",
  },
  {
    type: "skip",
    selector: "#close_video_button",
    note: "full-screen ad close button",
  },
  {
    type: "dismiss",
    // Visible "關閉" during the rewarded-interstitial countdown. Clicking it
    // forfeits the reward and pops a confirm dialog (handled by the selector
    // below) - which is what we want: it makes the platform serve a lighter,
    // easy-to-skip ad instead of an open-ended reward wait.
    // :not(.disabled) - the button carries .disabled while the countdown is
    // running (and on a background tab that countdown is throttled and stalls),
    // so only match it once it's actually clickable instead of wasting a click.
    selector: "#close-button:not(.disabled)",
    note: "rewarded interstitial: visible 關閉 (forfeit reward)",
  },
  {
    type: "dismiss",
    // The confirm dialog raised by #close-button: "關閉廣告？您將無法獲得獎勵",
    // with 關閉 (this one, forfeit) and 繼續 (keep watching). Clicking it
    // confirms the forfeit so the platform moves on to a lighter ad. The sweep
    // re-scans every second, so this is caught right after #close-button.
    selector: "#close-ad-button",
    note: "rewarded interstitial: confirm-dialog 關閉 (confirm forfeit)",
  },
  {
    type: "dismiss",
    // Post-countdown reward-close (the 😀). Kept as a fallback for the case
    // where the confirm-dialog forfeit path isn't available.
    selector: "#dismiss-button-element",
    note: "rewarded interstitial: reward-close after countdown",
  },
  {
    type: "skip",
    selector: 'div[data-ck-tag="skip"]',
    note: "in-player fullscreen video ad skip control (ck-tagged SDK)",
  },
];

export const DEFAULT_SETTINGS: Settings = {
  autoMute: true,
  pauseAfterSkip: true,
  waitSeconds: 35,
  chimeOnReady: true,
  chimeOnEnded: false,
  chimeVolume: 0.3,
  notifyOnReady: false,
  cdpTrustedClick: true,
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
