// Trusted-click via chrome.debugger (Chrome DevTools Protocol).
//
// Some ads cannot be dismissed from a content script:
//   1. isTrusted-gated buttons (e.g. the rewarded-interstitial #dismiss-button)
//      ignore synthetic .click()/dispatchEvent because event.isTrusted is false.
//   2. The in-player "ck-tagged" skip control lives inside a sandboxed iframe
//      with an opaque origin (no allow-same-origin), so no content script can
//      even see it via contentDocument walking.
//
// The catch: these buttons live in cross-origin ad iframes, which under site
// isolation are out-of-process (OOPIFs). A single DOM.performSearch on the
// tab-level session does NOT descend into an OOPIF's process, so the button is
// "not found" even over CDP. The fix (what DevTools/Puppeteer do) is the flat
// session protocol: Target.setAutoAttach gives us a separate debugging session
// per frame, and we search *inside each frame's own session*, where there is no
// process boundary to cross. Dispatching Input.dispatchMouseEvent in that same
// session means the frame-local coordinates from getContentQuads line up
// automatically - no cross-frame offset math required.
//
// Runs only when the user has opted in (Settings.cdpTrustedClick). While
// attached, Chrome shows its "started debugging this browser" banner; we detach
// as soon as the sweep finishes so it does not linger.

import { AD_DISMISS_TARGETS } from "./shared.js";

const DEBUGGEE_VERSION = "1.3";

// Absolute ceiling on how long we stay attached, even if an ad is still on
// screen. Ads gate their close behind a countdown that can run the better part
// of a minute, and on an inactive tab that countdown stalls until the user
// comes back - so while an ad is present we keep sweeping up to this cap (also
// the worst-case banner duration for an ad we ultimately can't dismiss).
const SWEEP_DEADLINE_MS = 60_000;
const SWEEP_INTERVAL_MS = 1_000;

// Selectors that mean "a rewarded interstitial is on screen right now" even when
// its close button is still .disabled (and so filtered out of the click
// targets). While any of these is present we keep sweeping and wait for the
// close to enable, instead of giving up on the no-match timeout below.
const AD_PRESENT_QUERY =
  "#ad_position_box, #dismiss-button, #close-button, #close-confirmation-dialog";

// The "started debugging this browser" banner is visible the whole time we're
// attached and can't be suppressed, so we detach as early as safely possible:
//   - If we've clicked something, keep sweeping only a short grace window (long
//     enough to catch a follow-up like the forfeit confirm dialog or the next
//     ad), then detach. Each click resets this window.
//   - If nothing has matched at all, give the ad a reasonable chance to appear,
//     then give up rather than holding the banner for the full deadline.
const POST_CLICK_GRACE_MS = 5_000;
// The interstitial's close button is gated behind a countdown (and on a
// background tab, even with keepActive(), it may progress slowly), so give it
// room to enable before giving up. Capped by SWEEP_DEADLINE_MS.
const NO_MATCH_TIMEOUT_MS = 22_000;

// Tabs we're currently attached to, so overlapping requests don't double-attach.
const busyTabs = new Set<number>();

// Tabs whose sweep the content script has asked us to stop early. The unmute
// signal (user started watching / the skip flow finished) is a deterministic
// "ads are resolved" marker, so honoring it detaches — and clears the debugging
// banner — sooner than the idle timers would on their own.
const stopRequested = new Set<number>();

/**
 * Ask an in-flight sweep for `tabId` to finish now. Safe to call when nothing is
 * attached (the flag is cleared at the start of the next sweep). Only ever makes
 * detach earlier, never later.
 */
export function cdpStop(tabId: number): void {
  stopRequested.add(tabId);
}

// A debugging session: the root page (no sessionId) or a per-frame OOPIF
// session. chrome.debugger's Debuggee type in @types/chrome is stale and omits
// sessionId, but modern Chrome accepts it (flat protocol), hence the casts.
interface Session {
  tabId: number;
  sessionId?: string;
}

const AUTO_ATTACH_PARAMS = {
  autoAttach: true,
  flatten: true,
  waitForDebuggerOnStart: false,
};

// A single CDP command must not be able to hang the whole sweep. On a
// background-throttled/frozen ad frame, chrome.debugger.sendCommand can stall
// indefinitely - never resolving *or* rejecting - which used to freeze the
// sweep mid-await, so it never reached its deadline or the finally that clears
// busyTabs. That left the tab permanently "busy" and silently dropped every
// later dismiss request. Bounding every command (and the attach) fixes that.
const CMD_TIMEOUT_MS = 4_000;
const ATTACH_TIMEOUT_MS = 6_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`CDP timeout: ${label}`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

async function send<T = unknown>(
  session: Session,
  method: string,
  params?: object,
): Promise<T> {
  return (await withTimeout(
    chrome.debugger.sendCommand(
      session as chrome.debugger.Debuggee,
      method,
      params,
    ),
    CMD_TIMEOUT_MS,
    method,
  )) as T;
}

/**
 * Every element matching `selector` within this session's frame (and its
 * same-process descendant frames). Cross-process children are covered by their
 * own sessions instead.
 */
async function findNodes(
  session: Session,
  selector: string,
): Promise<number[]> {
  // The DOM agent needs the document requested before performSearch works.
  await send(session, "DOM.getDocument", { depth: 1 });
  const { searchId, resultCount } = await send<{
    searchId: string;
    resultCount: number;
  }>(session, "DOM.performSearch", {
    query: selector,
    includeUserAgentShadowDOM: true,
  });
  try {
    if (!resultCount) {
      return [];
    }
    const { nodeIds } = await send<{ nodeIds: number[] }>(
      session,
      "DOM.getSearchResults",
      { searchId, fromIndex: 0, toIndex: resultCount },
    );
    return nodeIds;
  } finally {
    await send(session, "DOM.discardSearchResults", { searchId }).catch(
      () => {},
    );
  }
}

// Runs inside the target frame to decide whether `this` element is genuinely
// clickable *right now*, returning the frame-local point to click or null.
// DOM.getContentQuads alone is not enough: it still returns a box for elements
// hidden via visibility:hidden / opacity:0 / an offscreen-but-laid-out ancestor
// (e.g. the rewarded-interstitial confirm dialog before it's shown), which made
// us "click" - and then permanently consume - a button the user never saw.
// getBoundingClientRect + a computed-style ancestor walk + an elementFromPoint
// hit-test cover size, visibility, and occlusion in one shot.
const CLICKABLE_PROBE = `function () {
  const rect = this.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  for (let el = this; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
      return null;
    }
  }
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const top = document.elementFromPoint(x, y);
  // The point must actually land on us (or something within our subtree, or a
  // wrapper that contains us) - otherwise a hidden element is occluded by, or
  // sitting behind, whatever is really on top there.
  if (top && (top === this || this.contains(top) || top.contains(this))) {
    return { x, y };
  }
  return null;
}`;

/**
 * Frame-local viewport point to click, or null if the node isn't actually
 * visible/clickable. Coordinates are in the same space Input.dispatchMouseEvent
 * expects when dispatched to this same session.
 */
async function clickableCenter(
  session: Session,
  nodeId: number,
): Promise<{ x: number; y: number } | null> {
  let objectId: string | undefined;
  try {
    const { object } = await send<{ object: { objectId?: string } }>(
      session,
      "DOM.resolveNode",
      { nodeId },
    );
    objectId = object?.objectId;
    if (!objectId) {
      return null;
    }
    const { result } = await send<{
      result: { value?: { x: number; y: number } | null };
    }>(session, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: CLICKABLE_PROBE,
      returnByValue: true,
    });
    return result?.value ?? null;
  } catch {
    return null;
  } finally {
    if (objectId) {
      await send(session, "Runtime.releaseObject", { objectId }).catch(() => {});
    }
  }
}

async function trustedClick(session: Session, x: number, y: number) {
  const base = { x, y, button: "left" as const, clickCount: 1 };
  await send(session, "Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    buttons: 0,
  });
  await send(session, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...base,
    buttons: 1,
  });
  await send(session, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...base,
    buttons: 0,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirror a CDP status line into the page's own console. The [Ani Skip CDP] logs
 * otherwise only appear in the service worker's DevTools, so from the page you
 * can't tell whether e.g. the white-interstitial path actually fired. This
 * forwards a concise line the content script re-logs on the page.
 */
function pageLog(tabId: number, text: string) {
  chrome.tabs.sendMessage(tabId, { type: "cdp-log", text }).catch(() => {});
}

/**
 * Cleanly release every session before we drop the tab. Detaching only the root
 * (chrome.debugger.detach) can leave the auto-attached OOPIF child sessions
 * still bound to our debugger client, and Chrome keeps its "started debugging
 * this browser" infobar visible until *all* of them are gone. So we first turn
 * auto-attach off (no new children latch on mid-teardown) and explicitly detach
 * each child target, then let the caller detach the root.
 */
async function releaseChildren(root: Session, sessions: Session[]) {
  const noAutoAttach = {
    autoAttach: false,
    flatten: true,
    waitForDebuggerOnStart: false,
  };
  for (const s of sessions) {
    await send(s, "Target.setAutoAttach", noAutoAttach).catch(() => {});
  }
  for (const s of sessions) {
    if (!s.sessionId) {
      continue;
    }
    await send(root, "Target.detachFromTarget", {
      sessionId: s.sessionId,
    }).catch(() => {});
  }
}

/**
 * Fight Chrome's background-tab throttling for this frame while we're attached.
 * On an inactive tab, requestAnimationFrame/timers are frozen, so the rewarded
 * interstitial's countdown stalls and its close button never leaves .disabled -
 * meaning the ad just restarts from the beginning when the user returns.
 * Emulating focus + forcing the "active" lifecycle state keeps the countdown
 * ticking so we can dismiss it in the background. Best-effort: not every frame
 * supports every command, and this doesn't lift *all* hidden-tab throttling.
 */
async function keepActive(session: Session) {
  await send(session, "Emulation.setFocusEmulationEnabled", {
    enabled: true,
  }).catch(() => {});
  await send(session, "Page.setWebLifecycleState", { state: "active" }).catch(
    () => {},
  );
}

/**
 * Attach to the tab, recursively auto-attach to every (cross-origin) frame, and
 * repeatedly sweep each frame's session for any known dismiss/skip target,
 * dispatching a trusted click on the first match. Each selector is clicked at
 * most once per session so we don't hammer a button (or stray page elements)
 * after the ad is gone; matches that appear later in the sweep window (e.g. a
 * confirm dialog) are still picked up. Always detaches when finished.
 */
export async function cdpDismiss(tabId: number): Promise<void> {
  // Breadcrumb so the *page* console can tell whether the sweep even started,
  // was skipped as already-running, or failed to attach.
  console.log("[Ani Skip CDP] cdpDismiss called", { tabId, busy: busyTabs.has(tabId) });
  pageLog(tabId, `sweep requested (busy=${busyTabs.has(tabId)})`);
  if (busyTabs.has(tabId)) {
    return;
  }
  busyTabs.add(tabId);
  // Drop any stop flag left over from a previous cycle so it can't abort us
  // before we start.
  stopRequested.delete(tabId);

  const root: Session = { tabId };
  // Root session first; per-frame sessions are appended as they attach.
  const sessions: Session[] = [root];

  const onEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: object,
  ) => {
    if (source.tabId !== tabId) {
      return;
    }
    if (method === "Target.attachedToTarget") {
      const sessionId = (params as { sessionId?: string })?.sessionId;
      if (!sessionId || sessions.some((s) => s.sessionId === sessionId)) {
        return;
      }
      const child: Session = { tabId, sessionId };
      sessions.push(child);
      // Make this frame reveal *its* cross-process children too (recursion).
      send(child, "Target.setAutoAttach", AUTO_ATTACH_PARAMS).catch(() => {});
      // Keep the ad frame's countdown running even if the tab is backgrounded.
      keepActive(child);
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);

  const clicked = new Set<string>();
  try {
    await withTimeout(
      chrome.debugger.attach(root, DEBUGGEE_VERSION),
      ATTACH_TIMEOUT_MS,
      "attach",
    );
    pageLog(tabId, "attached ok");
    await keepActive(root);
    // Kick off auto-attach; attachedToTarget events populate `sessions`.
    await send(root, "Target.setAutoAttach", AUTO_ATTACH_PARAMS);

    const start = Date.now();
    const hardDeadline = start + SWEEP_DEADLINE_MS;
    let lastClickAt = 0;
    let lastAdPresentAt = 0;
    while (Date.now() < hardDeadline) {
      // The content script signalled the ad flow is over (unmute) - detach now.
      if (stopRequested.has(tabId)) {
        console.log("[Ani Skip CDP] stop requested (unmute) - detaching early");
        break;
      }
      // Copy: onEvent may append sessions mid-iteration.
      for (const session of [...sessions]) {
        for (const t of AD_DISMISS_TARGETS) {
          if (clicked.has(t.selector)) {
            continue;
          }
          let nodeIds: number[];
          try {
            nodeIds = await findNodes(session, t.selector);
          } catch {
            // Session/frame gone or DOM not ready in this frame - skip.
            continue;
          }
          for (const nodeId of nodeIds) {
            const c = await clickableCenter(session, nodeId);
            if (!c) {
              console.log(
                "[Ani Skip CDP] found but not clickable (hidden/occluded):",
                t.selector,
                "session",
                session.sessionId ?? "root",
              );
              continue;
            }
            console.log(
              "[Ani Skip CDP] trusted click",
              t.selector,
              `(${Math.round(c.x)}, ${Math.round(c.y)})`,
              "session",
              session.sessionId ?? "root",
            );
            pageLog(
              tabId,
              `trusted click ${t.selector} (${Math.round(c.x)}, ${Math.round(
                c.y,
              )})`,
            );
            await trustedClick(session, c.x, c.y);
            clicked.add(t.selector);
            lastClickAt = Date.now();
            break; // one match per selector is enough
          }
        }
      }

      // Is an interstitial still on screen (possibly mid-countdown)? If so we
      // keep sweeping until its close enables, rather than timing out early.
      let adPresent = false;
      for (const session of [...sessions]) {
        try {
          if ((await findNodes(session, AD_PRESENT_QUERY)).length) {
            adPresent = true;
            break;
          }
        } catch {
          // frame gone / not ready - ignore
        }
      }

      // Early detach: stop as soon as the useful work is done so the debugging
      // banner clears quickly, rather than idling until the hard deadline.
      const now = Date.now();
      if (adPresent) {
        // Ad is up - stay attached and wait for the close button to become
        // clickable (or the confirm dialog to appear).
        lastAdPresentAt = now;
      } else if (lastClickAt) {
        // We dismissed something and no ad is showing now - done.
        if (now - lastClickAt > POST_CLICK_GRACE_MS) {
          break;
        }
      } else if (lastAdPresentAt) {
        // An ad was here but vanished before we could click (self-dismissed or
        // the user closed it) - wind down.
        if (now - lastAdPresentAt > POST_CLICK_GRACE_MS) {
          break;
        }
      } else if (now - start > NO_MATCH_TIMEOUT_MS) {
        // No ad ever appeared - give up rather than holding the banner.
        break;
      }
      await sleep(SWEEP_INTERVAL_MS);
    }
  } catch (e) {
    console.error("[Ani Skip CDP] error", e);
    // Surface the reason on the page too - the most common one is that DevTools
    // is open on this tab, which blocks chrome.debugger.attach (Chrome allows
    // only one debugger client per target).
    pageLog(tabId, `ERROR: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    await releaseChildren(root, sessions);
    await chrome.debugger.detach(root).catch((e) => {
      console.warn("[Ani Skip CDP] detach failed", e);
    });
    busyTabs.delete(tabId);
    stopRequested.delete(tabId);
    console.log("[Ani Skip CDP] detached", {
      tabId,
      frames: sessions.length,
      clicked: [...clicked],
    });
    pageLog(
      tabId,
      `detached; clicked: ${clicked.size ? [...clicked].join(", ") : "(nothing)"}`,
    );
  }
}
