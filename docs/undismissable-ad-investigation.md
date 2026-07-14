# Undismissable rewarded-ad investigation

## Bug

A specific Google ad unit (`AD_rwdweb_ani_videorewarded`, a full-screen
"rewarded" interstitial — e.g. promoting PChome24h) shows a `關閉` (close)
button that the extension cannot dismiss.

The extension's ad-dismiss logic lives in `src/ad-controller.ts`, a content
script injected (`all_frames: true`, isolated world) into frames matching
`https://imasdk.googleapis.com/*` and `https://*.safeframe.googlesyndication.com/*`
(see `src/manifest.json`). It listens for a `postMessage` broadcast from
`src/main.ts` (`dispatchGoogleAdClick()`) and tries `element.click()` on a
list of selectors including `#dismiss-button` / `#dismiss-button-element`.

## Root cause theory (unconfirmed)

This Google Vignette/rewarded ad format likely gates its real dismiss
handler on `event.isTrusted`, so synthetic `.click()` calls are silently
ignored — a known anti-adblock technique.

Already added to `src/ad-controller.ts` (uncommitted):
- A DOM-removal fallback: walk up from whatever button matched to the
  top-level child of `<body>` and `.remove()` it, since removal doesn't
  care about event trust.
- Verbose logging tagged per-frame with `[iframe:<hostname>]` (multiple ad
  frames run this same script concurrently and interleave in the console
  otherwise).

## Where it's stuck

Two static HTML captures were provided by the user (repo root, gitignored,
not committed):
- `bug.html` — a similar ad's outer safeframe `container.html`, showing
  `#ad_position_box > #card > #dismiss-button-element` structure sitting
  directly at the document root.
- `full.html` — the full top-level page. Shows the ad lives inside
  `<ins id="gpt_unit_/1017768/AD_rwdweb_ani_videorewarded_0">`
  (`full.html:7316`), which is a direct child of the top `ani.gamer.com.tw`
  document, wrapping only a container `<div>` + the safeframe `<iframe>` —
  no close button of its own at that level.

But **live console logs from the user's actual browser session did not
show the expected `#dismiss-button` selectors matching** in the frames
that logged `message received`. Unclear whether:

1. The real close button lives in a further-nested, `document.write`-created
   iframe (like `#ad_iframe` in `bug.html:730`, which has `src="about:blank"`
   and thus can never be reached by URL-pattern-matched content scripts —
   a fundamentally different fix would be needed: reach in via
   `contentDocument` from the parent frame instead of relying on manifest
   `matches`), or
2. The specific frame instance showing the visible ad just hadn't logged
   yet at capture time (ads on this page rotate frequently — new
   random-subdomain safeframe instances load/reload mid-session, observed
   going from `eeb4c477...` to `90edced7...`), or
3. Something else entirely.

## Current code state

`src/ad-controller.ts` has been modified (uncommitted) with:
- `describe()` / `chain()` helpers for logging an element's tag/id/class
  ancestor chain.
- Per-frame `tag` prefix (`` `[iframe:${location.hostname}]` ``) on all
  console logs.
- Logs `message received, body children: ...` on every postMessage
  received, and `no dismiss button matched any selector this pass` if
  nothing hit.

A DOM-removal fallback (`root.remove()` walking up to the top-level child of
`<body>` after every successful selector match) was added and then **removed
again** — see "Root cause confirmed" below.

Build passes (`npm run typecheck && npm run build` both clean).
**Not yet committed** — this is uncommitted work on top of local commits
`99a5f19` (Vite/TS migration) and `52f3feb` (CI workflow), which are
themselves not yet pushed to `origin/main`.

## Root cause confirmed (2026-07-13 live debugging session)

Live reproduction on `ani.gamer.com.tw` (via Chrome MCP automation) confirmed
theory #2 from above, not #1: the frame *does* receive the `postMessage` and
*does* find the dismiss button via the existing selectors — the button is
directly reachable, no unreachable nested `about:blank` iframe involved.

The real problem is `event.isTrusted`: any event dispatched from a content
script (`el.click()`, `dispatchEvent(new MouseEvent(...))`, etc.) is always
synthetic (`isTrusted: false`). The ad's real dismiss handler silently ignores
it. There is no JS-only way around this from within a content script's
isolated world.

A DOM-removal fallback (`.remove()` the ad's root node after a synthetic click)
was tried as a workaround, but this was a regression, not a fix: it never lets
the ad's own reward-granted/ad-closed flow complete, so it defeats the whole
point of the rewarded-ad format (watch/interact → get reward → video unlocks).
In live testing this produced a *worse* symptom than the original bug: a stuck
blank grey full-viewport overlay with no visible content and no route forward,
instead of a merely-unclickable-but-visible close button. **This fallback has
been removed** from `src/ad-controller.ts`; `click()` now only does the
synthetic `.click()` and logs whether anything matched.

Manually clicking the real `關閉` (close) button (a genuine trusted click, not
synthetic) surfaced a second, native confirm dialog: **"關閉廣告？ /
您將無法獲得獎勵"** ("Close ad? / You won't receive the reward") with 關閉/繼續
buttons. So the real dismiss flow for this ad type is two sequential trusted
clicks, not one.

### A second, distinct unreachable-frame case (the "ck"-tagged skip button)

The rewarded interstitial's `#dismiss-button` above *is* directly reachable
(theory #2) — it's purely an `isTrusted` problem. But the separate "ck"-tagged
in-player skip button (`div[data-ck-tag="skip"]`, see ad-trait table below) is
a *different* case where theory #1 applies for real: added a `queryDeep()`
helper to `ad-controller.ts` that recursively walks into any
same-origin-reachable nested `iframe.contentDocument`, plus a
`describeFrames()` diagnostic logging every nested iframe's `src` and
reachability. Live logs showed, for the `imasdk.googleapis.com` frame, a
nested iframe with **no `src` attribute at all** (which would normally mean a
same-origin `about:blank` child) still reported **`UNREACHABLE
(cross-origin)`** when `contentDocument` was accessed.

The only way that happens is if the iframe is deliberately **sandboxed
without `allow-same-origin`** — this forces it into an opaque origin distinct
from its parent regardless of URL. That's intentional isolation from the ad
SDK, not an accident, and it's a dead end for any DOM/JS-based approach:
`querySelector`/`contentDocument` walking can never reach inside a
same-origin-opaque sandboxed frame, no matter how the manifest's frame
matching or in-page recursion is set up. This is very likely the same
isolation mechanism that makes synthetic clicks pointless even for buttons we
*can* reach — the ad vendor is deliberately isolating its UI from page/tab
scripting.

**Conclusion: the DOM-based approach (selectors + recursive `contentDocument`
walking) is fully exhausted for this ad type.** The only remaining path is
the `chrome.debugger`/CDP plan already scoped below — CDP dispatches input at
the browser's actual input/rendering layer (like a real click at screen
coordinates), which doesn't go through JS/DOM APIs at all, so it isn't
blocked by sandbox opacity or gated by `isTrusted` (it's how trusted input is
produced in the first place).

### Ad-trait survey: which ad types need a real (trusted) click

| Ad type | Selector(s) already in `ad-controller.ts` | Synthetic `.click()` | Needs CDP trusted click? |
|---|---|---|---|
| 基本款 無聲內嵌 AD / standard skippable pre-roll | `button.videoAdUiSkipButton` | **Works** — confirmed live (clicked "Skip Ad ▶\|", ad skipped cleanly, episode played) | No |
| 滿版 Google AD, 右下角透明黑按鈕（5s後可跳）| `div.skip-button-container`, `#close_video_button` | Presumed working (README already marks this covered pre-investigation) | Likely no, not directly reconfirmed this session |
| 滿版 Google AD, 白色背景, 右上角 XX 秒後領獎勵 (rewarded interstitial, `AD_rwdweb_ani_videorewarded`) | `#dismiss-button` / `#dismiss-button-element` / `div.rewardCloseButton` | **Ignored** (`isTrusted` gated) — confirmed live; real click surfaces a second confirm dialog (關閉/繼續) that also needs a real click | **Yes**, 2 sequential real clicks |
| 半版彈出式小型 Google AD | unknown (README: "出現機率感人，可用的 selector 未知") | Unconfirmed | Unknown — not yet reproduced this session |
| 內嵌全螢幕影音廣告 / in-player fullscreen video ad, "ck"-tagged skip widget nested inside the standard IMA `div.videoAdUi` wrapper (not a separate/unreachable frame — same `imasdk.googleapis.com` frame the manifest already matches, just a different skip-button implementation than plain `button.videoAdUiSkipButton`) | Previously **not matched by any selector** — its `skip-button`/hashed classes (`ns-ssbi9-e-24`, `ns-ncbzv-e-24` — confirmed two different hash suffixes across two separate ad instances, same `data-ck-tag="skip"` both times) are build-hashed and unstable; added `div[data-ck-tag="skip"]` instead (stable attribute, confirmed identical across both instances) | Unconfirmed whether synthetic click works — added optimistically since this looks like a plain skip button, not a Vignette/reward dismiss handler | Presumed no, needs live reconfirmation |

Separately, and not yet triaged: once, reproducing the rewarded ad via the
age-gate's "🚀SKIP" path (rather than "同意") produced a blank grey overlay
with no ad creative rendered at all, followed by an unexplained full-page
navigation to a different episode on the same site. Not yet understood
(possibly an ad-network redirect/malvertising behavior unrelated to this
extension) — needs isolated re-investigation without other interactions in
between, to confirm it's reproducible and whether it's in scope here.

## Plan: CDP-based trusted click (`chrome.debugger`)

The only way to produce an event Chrome itself marks as trusted from an
extension is to inject it through the real input pipeline via the
`chrome.debugger` API (`Input.dispatchMouseEvent` over CDP) — this bypasses
the `isTrusted` gate entirely, unlike anything dispatched from JS in a content
script.

**UX cost to weigh:** attaching `chrome.debugger` to a tab makes Chrome show a
persistent "`<extension name>` started debugging this browser" infobar on
that tab. This is not a one-time consent dialog — it reappears on every fresh
`attach()` call, for as long as the debugger stays attached, and there is no
supported way to suppress it for a Chrome Web Store–distributed extension
(only a dev-only `--silent-debugger-extension-api` launch flag or an
enterprise force-install policy, neither applicable here). To minimize how
long it's visible: attach only right before dispatching the click sequence,
detach immediately after (success, failure, or timeout) rather than holding
it attached for the whole video/session.

### Implementation steps

1. **Manifest**: add `"debugger"` under `optional_permissions` (not
   `permissions`) in `src/manifest.json`, so ordinary users installing from
   the Web Store never see a debugger-related permission warning unless they
   opt in.
2. **Settings** (`src/shared.ts` `Settings` interface, `src/popup.ts` +
   `src/popup.html`): add a new opt-in toggle, e.g.
   `bypassTrustedClickAds: boolean` (default `false`), for "略過需要模擬真實
   點擊的獎勵廣告" (bypass reward ads that need a real click). Flipping it on
   triggers `chrome.permissions.request({ permissions: ["debugger"] })` —
   Chrome's real one-time permission prompt, shown only to opted-in users.
3. **Coordinate mapping**: the dismiss button lives inside a nested
   cross-origin safeframe iframe. `ad-controller.ts` (running inside that
   frame) needs to compute the button's coordinates in *top-level page
   space*, not just its own frame-local `getBoundingClientRect()` — requires
   walking up through each ancestor frame's offset (content script in a
   sub-frame can't directly read a cross-origin parent's layout, so this
   likely needs the frame's own rect messaged up to `main.ts`/background
   alongside each ancestor frame's own rect, composed at the top).
4. **Message passing**: `ad-controller.ts` messages the background
   (`service_worker.ts`) with the resolved page-space coordinates instead of
   calling `.click()` directly (when the toggle is on and the matched
   selector is one of the known trusted-click-required ones from the trait
   table above).
5. **Background dispatch**: `service_worker.ts` attaches
   `chrome.debugger` to the tab, sends `Input.dispatchMouseEvent`
   (`mousePressed` then `mouseReleased`) at the coordinates, and handles the
   two-step flow for the rewarded interstitial specifically (initial 關閉 →
   wait for/detect the confirm dialog → real click on 關閉 or 繼續, per
   whatever the extension's intended behavior should be — TBD: does "skip the
   ad" mean confirm-close without reward, or should the user's existing
   `pauseAfterSkip`/`waitSeconds` settings decide?).
6. Detach the debugger immediately after the sequence completes (or on
   timeout/error).
7. Rebuild, reload the unpacked extension, and verify against the live page
   before committing — per this repo's established practice of never
   committing ad-behavior changes without a live re-test
   ([[feedback_ad_testing_no_agree_click]]: use only "SKIP"/the extension's
   own button when testing, never the site's native "同意").

### Open questions before implementing

- Exact wording/placement for the new settings toggle in `popup.html`.
- For the rewarded interstitial's two-step confirm: should the extension
  always choose "關閉" (close, forfeit reward) since the point is skipping
  ads, or should it respect some existing setting?
- Whether the "半版彈出式小型 Google AD" (still unconfirmed selectors) also
  needs trusted clicks, once it's ever reliably reproduced.
- Whether the SKIP-path blank-overlay-then-navigation anomaly is real/in-scope
  or a one-off artifact of the automation session.

## Implemented & verified working (2026-07-13): CDP trusted-click via the background

Both hard cases confirmed dismissed live: the in-player fullscreen video
(`data-ck-tag="skip"` in the opaque-origin frame) **and** the white rewarded
interstitial (two-step forfeit). Builds clean (`typecheck` + `build` pass).

### The one design decision that mattered: per-frame flat sessions

A first attempt attached `chrome.debugger` to the tab and ran a single
`DOM.performSearch`, assuming it would pierce every frame. **It does not.** Under
site isolation, each cross-origin ad iframe (`*.safeframe.googlesyndication.com`,
`imasdk.googleapis.com`) is out-of-process (an OOPIF), and a tab-level
`performSearch` never crosses that process boundary — the button came back "not
found" over CDP even though the content script inside that frame could see it.

The fix (what DevTools / Puppeteer / claude-in-chrome do) is CDP's **flat session
protocol**:

1. Attach to the tab, then `Target.setAutoAttach({autoAttach:true,
   flatten:true, waitForDebuggerOnStart:false})`.
2. Each `Target.attachedToTarget` event yields a `sessionId` (a separate
   debugging session for that frame). Re-run `setAutoAttach` on every new
   session so nested OOPIFs are revealed too (recursion).
3. Search **inside each frame's own session** (`DOM.performSearch` there has no
   process boundary to cross → the button is found).
4. Dispatch `Input.dispatchMouseEvent` in that **same session**, so the
   frame-local coordinates from `DOM.getContentQuads` line up automatically — no
   cross-frame offset math needed.

`chrome.debugger.Debuggee` in `@types/chrome` (0.0.268) is stale and omits
`sessionId`; modern Chrome accepts `{tabId, sessionId}` at runtime, so `cdp.ts`
casts around the type.

### The rewarded interstitial: forfeit, don't wait for the reward

The white interstitial hides its real reward-close (`#dismiss-button-element`,
the 😀) behind a ~6s countdown. Rather than wait it out, we **forfeit** — which
the user confirmed is faster and preferable, because it makes the platform serve
a lighter, easy-to-skip ad (inline / two-block, capped <30s) instead of an
open-ended reward wait. Two-click sequence, both trusted, caught across
successive 1s sweeps:

1. `#close-button` (visible "關閉" during countdown) → raises the confirm dialog.
2. `#close-ad-button` (the confirm dialog's "關閉" / 您將無法獲得獎勵; the other
   button is 繼續 = keep watching) → confirms the forfeit.

`#dismiss-button` (the `.close-button-outer` *wrapper*) was **removed** as a
target — clicking its center lands on the ad card, not a button. Both new
selectors and the removal live in `AD_DISMISS_TARGETS` (`src/shared.ts`).

### Files

- `src/manifest.json` — `"debugger"` in **required** `permissions`. Chrome
  rejects it in `optional_permissions` ("Permission 'debugger' cannot be listed
  as optional…"), so the planned opt-in-via-`permissions.request()` is
  impossible. Trade-off: every user sees a debugger permission warning at
  install, even though the feature is off by default.
- `src/shared.ts` — `Settings.cdpTrustedClick` (default `false`) gates the
  behavior (the permission is always present; the debugger only attaches when
  the toggle is on *and* an ad triggers the sweep). Plus the interstitial
  selectors above in `AD_DISMISS_TARGETS`.
- `src/popup.html` / `src/popup.ts` — toggle "強力關閉頑固廣告 / Force-close
  stubborn ads", saved like any other setting.
- `src/cdp.ts` — `cdpDismiss(tabId)`: attach → recursive `setAutoAttach` →
  per-session sweep of every `AD_DISMISS_TARGETS` selector (each clicked at most
  once) → same-session `getContentQuads` center → same-session trusted
  `Input.dispatchMouseEvent` → **always detach in `finally`**.
- `src/main.ts` — when `settings.cdpTrustedClick`, sends `{type:"cdp-dismiss"}`
  to the background alongside `dispatchGoogleAdClick()`.
- `src/service_worker.ts` — routes `{type:"cdp-dismiss"}` to `cdpDismiss`.

### The debugging banner (accepted limitation)

"`動畫瘋閉嘴` started debugging this browser" shows for the whole time we're
attached; there is **no way to suppress it** for a Web-Store extension. Only its
*duration* is controllable, so `cdpDismiss` detaches as early as safely
possible: after any click, it keeps sweeping only a 5s grace window (reset by
each new click, to catch the confirm dialog / next ad), then detaches; if
nothing ever matches it gives up after 15s; hard ceiling 30s. Result: banner is
visible ~7-8s for the interstitial instead of the full sweep window.
