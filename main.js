// @ts-check
const skipQuery = ".nativeAD-skip-button";
const acceptQuery = "#adult";
const videoElementQuery = "#ani_video_html5_api";

// @ts-expect-error
if (typeof browser === "undefined") {
  /** @global */
  var browser = chrome;
  globalThis.browser = chrome;
}

async function main() {
  const acceptBtn = await waitFor(acceptQuery);
  log("Click the button: ", acceptBtn);
  acceptBtn.click();

  log("Mute the page");
  mute();

  /** @type {HTMLVideoElement} */
  const videoPlayer = await waitFor(videoElementQuery, { timeout: 1000 });

  log("Video Player Status: ", videoPlayer, "Paused? ", videoPlayer?.paused);

  const prevTime = videoPlayer.currentTime;

  // Wait 30 sec and see if user already dismiss unmute button (start watching)
  await sleep(30000);
  if (!document.getElementById("unmute-btn")) {
    return;
  }

  // If not, try to click skip button and pause the main video afterward
  try {
    const skipButton = await waitFor(skipQuery, {
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

function addUnmuteBtn() {
  const unmuteBtn = document.createElement("button");
  unmuteBtn.id = "unmute-btn";
  const s = unmuteBtn.style;
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
  unmuteBtn.innerText = "取 消 靜 音";
  unmuteBtn.addEventListener("click", unmute);

  const logo = document.querySelector("div.logo");
  if (logo) {
    logo?.insertAdjacentElement("afterend", unmuteBtn);
  } else {
    document.body.appendChild(unmuteBtn);
  }
}

function removeUnmuteBtn() {
  document.getElementById("unmute-btn")?.remove();
}

// Utils

function getElement(selector = "", include = "") {
  for (let node of document.querySelectorAll(selector)) {
    if (!include || node.textContent?.includes(include)) {
      return node;
    }
  }
}

function waitFor(
  /** @type {string} */ selector,
  { timeout = 40000, include = "" } = {}
) {
  return new Promise((res, rej) => {
    const firstTry = getElement(selector, include);
    if (firstTry) {
      res(firstTry);
    }

    const obs = new MutationObserver((mutations) => {
      const el = getElement(selector, include);
      if (el) {
        obs.disconnect();
        clearTimeout(timer);
        res(el);
      }
      return;
    });

    const timer = setTimeout(() => {
      rej("[Timeout] " + selector);
      obs.disconnect();
    }, timeout);

    obs.observe(document, {
      childList: true,
      subtree: true,
    });
  });
}

async function sleep(ms = 0) {
  return new Promise((res) => setTimeout(res, ms));
}

/** @type {Console["log"]} */
function log(...args) {
  console.log("[Ani Skip] ", ...args);
}
