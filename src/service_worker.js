// @ts-check
if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

browser.runtime.onMessage.addListener((message, sender) => {
  switch (message) {
    case "mute":
      browser.tabs.update(sender.tab.id, { muted: true }).then(() => {
        console.log("Muted:", sender.tab.title);
      });
      break;
    case "unmute":
      browser.tabs.update(sender.tab.id, { muted: false }).then(() => {
        console.log("Unmuted:", sender.tab.title);
      });
      break;
    default:
      console.log("Unknown:", message);
  }
});

// In your background.js (service worker)
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    (tab.url.includes("ani.gamer.com.tw/animeVideo") ||
      tab.url.includes("imasdk.googleapis.com") ||
      /^https:\/\/([a-zA-Z0-9-]+\.)?safeframe\.googlesyndication\.com\//.test(
        tab.url
      ))
  ) {
    console.log("Tab updated:", tabId, tab.url);
    // Target specific ad pages if possible
    // Inject the function into the page's main world
    browser.scripting.executeScript(
      {
        target: { tabId: tabId, allFrames: true },
        func: injectMainWorldVisibilityOverride,
        world: "MAIN", // This is the key: inject into the page's main execution context
        injectImmediately: true,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Script injection failed:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log(`[${tab.url}] visibility override injected.`);
        }
      }
    );
  }
});

// This function will be stringified and executed in the page's main world
function injectMainWorldVisibilityOverride() {
  console.log("Injecting visibility override into MAIN world...");
  // Store original descriptors safely within this main world context if not already done

  if (!window._originalHiddenDescriptor) {
    window._originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden"
    );
  }
  if (!window._originalVisibilityStateDescriptor) {
    window._originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState"
    );
  }

  // Override them
  Object.defineProperty(document, "hidden", {
    get: function () {
      return false;
    },
    configurable: true,
    // Ensure it's writable if you want to set it directly (though get is usually enough)
    // writable: true
  });
  Object.defineProperty(document, "visibilityState", {
    get: function () {
      return "visible";
    },
    configurable: true,
    // writable: true
  });

  // Dispatch an event to notify any listeners on the page
  document.dispatchEvent(new Event("visibilitychange"));

  console.log("Page Visibility API overridden in MAIN world.");
}
