# Issue: Google ads pause when the tab is backgrounded

## Symptom

When the user navigates away from the tab (or the tab is otherwise not active),
some Google ads stop their countdown / pause the ad video. The skip button never
becomes clickable, so the extension gets stuck and the ad never finishes.

## Why it happens — three separate mechanisms

### 1. The ad SDK reads the Page Visibility API (and we are not actually spoofing it)

Google's IMA SDK and ad creatives pause playback when the page reports hidden:

- `document.hidden` / `document.visibilityState`
- the `visibilitychange` event
- sometimes `window blur/focus` and `document.hasFocus()`

`ad-controller.js` already tries to counter this with
`overrideVisibilityForAdCountdown()`, which does
`Object.defineProperty(document, "hidden", ...)`.

**This does not work.** Content scripts run in an *isolated world*: they share
the DOM tree with the page, but JavaScript objects and property descriptors are
per-world. Redefining `document.hidden` inside the content script only changes
what *our own script* sees. The ad SDK runs in the **main world** and still
reads the real, browser-provided values. So the current override is effectively
a no-op against the ad.

### 2. Chrome throttles timers and stops rAF in background tabs

Even if visibility were spoofed, a hidden tab gets degraded scheduling:

- `requestAnimationFrame` stops firing entirely — many ad UIs (countdown text,
  skip-button reveal) are driven by rAF.
- `setTimeout` / `setInterval` are clamped to ≥ 1 s, and after ~5 minutes of
  being hidden, "intensive throttling" clamps them to ~1 per minute.
  (Tab-level mute removes the "audibly playing" exemption, so our muted tab is
  eligible for full throttling.)

This affects the ad's own countdown logic **and our extension's loops**:
`dispatchGoogleAdClick()`'s 1 s retry loop, `waitFor()`'s 500 ms polling, and
the `sleep(30000)` in `muteAndSkipAd()` all run in the page and all slow down
in a background tab. In practice the flow still completes within the first
5 minutes (1 s clamping is tolerable), but rAF-driven ad UI freezes immediately.

### 3. Media playback in a hidden tab

The ad `<video>` element itself generally keeps playing in a background tab
(Chrome only pauses it when the SDK explicitly pauses on `visibilitychange` —
mechanism 1). So if we defeat mechanism 1, playback-time-based countdowns
("skip in 5 s") continue to progress.

Net effect: **mechanism 1 is the primary cause** (SDK explicitly pauses on
hidden), mechanism 2 is a secondary degradation, mechanism 3 mostly takes care
of itself once 1 is fixed.

## Proposed solution

### A. Spoof visibility in the MAIN world of the ad iframes (core fix)

Add a new script, e.g. `src/visibility-spoof.js`, registered in the manifest as:

```json
{
  "matches": [
    "https://imasdk.googleapis.com/*",
    "https://*.safeframe.googlesyndication.com/*"
  ],
  "js": ["visibility-spoof.js"],
  "all_frames": true,
  "run_at": "document_start",
  "world": "MAIN"
}
```

Key points:

- `"world": "MAIN"` (Chrome 111+, MV3) makes the patches visible to the ad's
  own JavaScript — this is the piece the current implementation is missing.
- `"run_at": "document_start"` installs the patches **before** the IMA SDK
  loads and caches any references.
- Patch on the **prototype**, not the instance, so it survives whatever the
  page does:

```js
Object.defineProperty(Document.prototype, "hidden", { get: () => false });
Object.defineProperty(Document.prototype, "visibilityState", { get: () => "visible" });
Document.prototype.hasFocus = () => true;
```

- Swallow the events the SDK listens to, with capture-phase listeners installed
  at `document_start` (capture on `window` and `document` runs before the SDK's
  own listeners):

```js
for (const type of ["visibilitychange", "webkitvisibilitychange", "blur", "pagehide"]) {
  window.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
  document.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
}
```

- Scope it to the **ad iframes only** (same `matches` as `ad-controller.js`).
  Do **not** inject into `ani.gamer.com.tw` itself — the player site may rely
  on real visibility, and lying to it has side effects we don't want.

Since this spoof only ever runs inside ad frames, it can be unconditional —
which removes the need for the debounce/restore state machine currently in
`ad-controller.js`. `overrideVisibilityForAdCountdown()` and the descriptor
save/restore code can then be deleted from `ad-controller.js`, whose job
shrinks back to "click skip buttons on request".

### B. Make the extension's own loops throttle-resistant (hardening)

With 1 s timer clamping, the existing loops still work, just slower. Two cheap
hardenings:

1. `dispatchGoogleAdClick()`'s loop checks wall-clock time instead of
   iteration count (`while (Date.now() < deadline)`), so 20 "seconds" of
   retries doesn't silently stretch when each 1 s sleep is clamped.
2. The single `sleep(30000)` in `muteAndSkipAd()` is left as-is: a one-shot
   timeout has no cumulative drift, and throttling can only delay it — there
   is no way to fire earlier than the browser allows anyway.

If intensive throttling (>5 min hidden) ever becomes a real problem, the
escalation path is driving the retry ticks from the service worker via
`chrome.alarms` + `chrome.scripting.executeScript`, but that is likely
unnecessary for a 30–60 s ad flow.

### C. Known limitation

Google Active View viewability measurement can also use IntersectionObserver
v2 (real occlusion detection by the compositor), which cannot be spoofed from
JavaScript. If a particular ad gates its countdown on *actual* viewability
rather than the Page Visibility API, A/B above won't defeat it. In practice the
common IMA skip-countdown pauses on `visibilitychange`, which A does defeat.

## Implementation checklist

- [x] Add `src/visibility-spoof.js` (MAIN world, `document_start`, ad-frame matches only)
- [x] Register it in `src/manifest.json`
- [x] Remove `overrideVisibilityForAdCountdown()` and restore logic from `src/ad-controller.js`
- [x] Wall-clock the retry loop in `src/main.js` (`dispatchGoogleAdClick`)
- [ ] Manual test: start an ad, switch to another tab, confirm countdown keeps running and skip fires
