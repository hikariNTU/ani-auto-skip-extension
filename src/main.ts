import { loadSettings, playChime, type Settings } from "./shared.js";

const skipQuery = ".nativeAD-skip-button";
const acceptQuery = "#adult";
const videoElementQuery = "#ani_video_html5_api";

/**
 * Google Ad Iframe example
 * https://imasdk.googleapis.com/js/core/bridge3.595.0_en.html#goog_2096627656
 * https://de3207840d8a56f2d4a2b4d89f1ddfcf.safeframe.googlesyndication.com/safeframe/1-0-40/html/container.html
 */

if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

window.addEventListener("load", addMagicButton);
window.addEventListener("load", watchForEpisodeEnd);
window.navigation?.addEventListener("navigate", addMagicButton);
window.navigation?.addEventListener("navigate", watchForEpisodeEnd);

// Make sure page navigation will release the muted state!
window.addEventListener("beforeunload", () => {
  unmute();
});

async function addMagicButton() {
  log("Try add BUTTON");
  const id = "🚀SKIP";
  let container: Element;
  try {
    container = await waitFor(".ncc-choose-btn", { timeout: 3000 });
  } catch {
    return;
  }
  if (document.getElementById(id)) {
    return;
  }
  const btn = document.createElement("button");
  btn.id = id;
  btn.style.textWrap = "nowrap";
  btn.innerText = "🚀SKIP";
  btn.className = "choose-btn-agree";
  btn.addEventListener("click", () => {
    muteAndSkipAd();
  });
  container.removeChild(container.lastChild as ChildNode);
  container.append(btn);
}

async function muteAndSkipAd() {
  const settings = await loadSettings();
  // "User took over" sentinel: dismissing the unmute button means they
  // started watching. Only meaningful when we muted in the first place.
  const userTookOver = () =>
    settings.autoMute && !document.getElementById("unmute-btn");

  const acceptBtn = await waitFor<HTMLButtonElement>(acceptQuery);
  log("Click the button: ", acceptBtn);
  acceptBtn.click();

  if (settings.autoMute) {
    log("Mute the page");
    mute();
  }

  const videoPlayer = await waitFor<HTMLVideoElement>(videoElementQuery, {
    timeout: 1000,
  });
  const prevTime = videoPlayer.currentTime;

  log(
    "Video Player Status: ",
    videoPlayer,
    "Paused? ",
    videoPlayer?.paused,
    ", start time: ",
    prevTime
  );

  // notify google ad iframe to try click the skip ad button
  dispatchGoogleAdClick();

  // Wait and see if user already dismiss unmute button (start watching)
  await sleep(settings.waitSeconds * 1000);

  if (userTookOver()) {
    return;
  }

  // If not, try to click skip button and pause the main video afterward
  try {
    const skipButton = await waitFor<HTMLButtonElement>(skipQuery, {
      include: "點此跳過廣告",
      timeout: 10000,
    });
    log("Try Click Skip:", skipButton.innerText);
    skipButton.click();
    log("Wait for 2 seconds to pause the playing anime");
    await sleep(2000);
  } catch (e) {
    console.error(e);
    log("No skip button found");
    if (userTookOver()) {
      return;
    }
    log("Try restoring the starting time");
    videoPlayer.currentTime = prevTime;
  }

  if (settings.pauseAfterSkip) {
    log("Pause Video");
    videoPlayer.pause();
  }
  unmute();
  notifyReady(settings, "ready");
}

/** Chime / desktop-notify per settings. */
function notifyReady(settings: Settings, kind: "ready" | "ended") {
  const chime = kind === "ready" ? settings.chimeOnReady : settings.chimeOnEnded;
  if (chime) {
    playChime(settings.chimeVolume);
  }
  if (settings.notifyOnReady) {
    browser.runtime?.sendMessage("notify-" + kind);
  }
}

async function watchForEpisodeEnd() {
  let video: HTMLVideoElement;
  try {
    video = await waitFor<HTMLVideoElement>(videoElementQuery, {
      timeout: 60000,
    });
  } catch {
    return;
  }
  if (video.dataset.aniskipEndedHook) {
    return;
  }
  video.dataset.aniskipEndedHook = "1";
  video.addEventListener("ended", async () => {
    log("Episode ended");
    notifyReady(await loadSettings(), "ended");
  });
}

async function dispatchGoogleAdClick(seconds = 20) {
  // Wall-clock deadline: background tabs clamp timers to >=1s,
  // so counting iterations would silently stretch the loop.
  const deadline = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < deadline) {
    i += 1;
    for (const frame of document.querySelectorAll("iframe")) {
      if (
        frame.src.startsWith("https://imasdk.googleapis.com") ||
        frame.src.includes("googlesyndication.com")
      ) {
        frame.contentWindow?.postMessage(`[aniskip]: try ${i}`, {
          targetOrigin: "*",
        });
      }
    }
    await sleep(1000);
  }
}

function mute() {
  // Only background script can mute tab
  browser.runtime?.sendMessage("mute");
  addUnmuteBtn();
}

function unmute() {
  browser.runtime?.sendMessage("unmute");
  removeUnmuteBtn();
}

// Utils

function getElement(
  selector = "",
  include: RegExp | string = "",
  includeIframe = false
): Element | undefined {
  const documents: (Document | null)[] = includeIframe
    ? [...document.querySelectorAll("iframe")].map(
        (iframe) => iframe.contentDocument
      )
    : [document];
  for (const doc of documents) {
    for (const node of doc?.querySelectorAll(selector) ?? []) {
      if (
        !include ||
        (include instanceof RegExp
          ? include.test(node.textContent || "")
          : node.innerHTML.includes(include))
      ) {
        return node;
      }
    }
  }
}

interface WaitForOptions {
  /** @default 40000 */
  timeout?: number;
  /** Partial string or RegExp */
  include?: RegExp | string;
}

/** Busy wait until element found or timeout. */
function waitFor<T extends Element = Element>(
  selector: string,
  { timeout = 40000, include = "" }: WaitForOptions = {}
): Promise<T> {
  return new Promise((res, rej) => {
    const intTime = setInterval(() => {
      const el = getElement(selector, include);
      if (el) {
        clear();
        res(el as T);
      }
    }, 500);

    const timer = setTimeout(() => {
      clear();
      rej("[Timeout] " + selector);
    }, timeout);

    const clear = () => {
      clearInterval(intTime);
      clearTimeout(timer);
    };
  });
}

async function sleep(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

function log(...args: unknown[]) {
  console.log("[Ani Skip] ", ...args);
}

function addUnmuteBtn() {
  const unmuteBtn = document.createElement("button");

  unmuteBtn.id = "unmute-btn";

  const s = unmuteBtn.style;
  s.display = "flex";
  s.alignItems = "center";
  s.gap = "0.25em";
  s.padding = "4px 10px";
  s.fontSize = "2rem";
  s.position = "fixed";
  s.zIndex = "999999999";
  s.top = "10px";
  s.left = "50%";
  s.transform = "translateX(-50%)";
  s.background = "var(--anime-primary-color, #222)";
  s.color = "#fff";
  s.fontWeight = "bold";
  s.boxShadow = "0 0 4px 2px #2224";
  s.border = "none";
  s.borderRadius = "4px";
  s.cursor = "pointer";
  unmuteBtn.innerHTML = `<img width="16" height="16" src="${browser.runtime.getURL(
    "/images/speaker-off.svg"
  )}" alt="" />取消靜音`;
  unmuteBtn.addEventListener("click", unmute);

  document.body.appendChild(unmuteBtn);
}

function removeUnmuteBtn() {
  document.getElementById("unmute-btn")?.remove();
}
