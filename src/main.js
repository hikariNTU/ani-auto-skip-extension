// @ts-check
const skipQuery = ".nativeAD-skip-button";
const acceptQuery = "#adult";
const videoElementQuery = "#ani_video_html5_api";

/**
 * Google Ad Iframe example
 * https://imasdk.googleapis.com/js/core/bridge3.595.0_en.html#goog_2096627656
 * https://de3207840d8a56f2d4a2b4d89f1ddfcf.safeframe.googlesyndication.com/safeframe/1-0-40/html/container.html
 */

if (typeof browser === "undefined") {
  /** @global */
  var browser = chrome;
  globalThis.browser = chrome;
}

async function dispatchGoogleAdClick(seconds = 20) {
  let i = 0;
  while (i < seconds) {
    i += 1;
    for (let frame of document.querySelectorAll("iframe")) {
      if (
        frame.src.startsWith("https://imasdk.googleapis.com") ||
        frame.src.includes("googlesyndication.com")
      ) {
        frame.contentWindow.postMessage(`[aniskip]: try ${i}`, {
          targetOrigin: "*",
        });
      }
    }
    await sleep(1000);
  }
}

async function main() {
  const acceptBtn = /** @type {HTMLButtonElement} */ (
    await waitFor(acceptQuery)
  );
  log("Click the button: ", acceptBtn);
  acceptBtn.click();

  log("Mute the page");
  mute();

  const videoPlayer = /** @type {HTMLVideoElement} */ (
    await waitFor(videoElementQuery, { timeout: 1000 })
  );
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

  // Wait 30 sec and see if user already dismiss unmute button (start watching)
  await sleep(30000);

  if (!document.getElementById("unmute-btn")) {
    return;
  }

  // If not, try to click skip button and pause the main video afterward
  try {
    const skipButton = /**@type {HTMLButtonElement} */ (
      await waitFor(skipQuery, {
        include: "點此跳過廣告",
        timeout: 10000,
      })
    );
    log("Try Click Skip:", skipButton.innerText);
    skipButton.click();
    log("Wait for 2 seconds to pause the playing anime");
    await sleep(2000);
  } catch (e) {
    console.error(e);
    log("No skip button found");
    log("Try restoring the starting time");
    videoPlayer.currentTime = prevTime;
  }

  log("Pause Video");
  videoPlayer.pause();
  unmute();
}
window.addEventListener("load", main);

function mute() {
  // Only background script can mute tab
  browser.runtime.sendMessage("mute");
  addUnmuteBtn();
}

function unmute() {
  browser.runtime.sendMessage("unmute");
  removeUnmuteBtn();
}

// Utils
/**
 * @param {RegExp|string=} include
 */
function getElement(selector = "", include = "", includeIframe = false) {
  const documents = includeIframe
    ? [...document.querySelectorAll("iframe")].map(
        (iframe) => iframe.contentDocument
      )
    : [document];
  for (let doc of documents) {
    for (let node of doc.querySelectorAll(selector)) {
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

/**
 * Busy wait until element found or timeout
 * @param {string} selector
 * @param {Object} options
 * @param {number=} [options.timeout=40000] timeout ms
 * @param {RegExp|string=} [options.include] Partial string or RegExp
 * @returns {Promise<Element>}
 */
function waitFor(selector, { timeout = 40000, include = "" } = {}) {
  return new Promise((res, rej) => {
    const intTime = setInterval(() => {
      const el = getElement(selector, include);
      // log("Try find: ", selector);
      if (el) {
        // log("Found: ", selector, el);
        clear();
        res(el);
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

/** @type {Console["log"]} */
function log(...args) {
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
