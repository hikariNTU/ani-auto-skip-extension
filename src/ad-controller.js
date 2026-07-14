// @ts-check

(function overrideVisibilityFast() {
  try {
    Object.defineProperty(document, "hidden", {
      get: () => {
        console.log("[IFRAME?] Document hidden property accessed.");
        return false;
      },
      configurable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      get: () => {
        console.log("[IFRAME?] Document visibilityState property accessed.");
        return "visible";
      },
      configurable: true,
    });
    Object.assign(window, {
      foo: "Inject to iframe",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    console.log("[Ani Skip] Page Visibility API overridden in ad iframe.");
  } catch (e) {
    console.error("[Ani Skip] Failed to override visibility:", e);
  }
})();

/**
 * @param {string} q
 */
function click(q) {
  const btn = /**@type {HTMLButtonElement | undefined} */ (
    document.querySelector(q)
  );
  if (btn) {
    btn.click();
    console.log("[iframe]: Button ", q, "Founded!");
  }
}

window.addEventListener(
  "message",
  (event) => {
    if (
      event.origin !== "https://ani.gamer.com.tw" ||
      typeof event.data !== "string" ||
      !event.data.startsWith("[aniskip]:")
    ) {
      return;
    }
    overrideVisibilityForAdCountdown();
    // console.log("[Iframe]", event.data);
    click("button.videoAdUiSkipButton");
    click("div.rewardCloseButton");
    click("#count_down");
    click("#close_video_button");
    // click("#dismiss-button-element"); // white modal google ad with translucent backdrop
    // click("#dismiss-button"); // white modal google ad with translucent backdrop v2?
  },
  false
);

console.log("[Iframe controller Loaded]", location.href);

// Store references to the original descriptors globally within your script's scope
const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "hidden"
);
const originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState"
);

function overrideVisibilityForAdCountdown() {
  // 1. Ensure the properties are currently overridden to 'visible'
  //    We only need to define them if they are not already set to our desired values
  //    or if they haven't been overridden yet.

  // Check and set 'hidden'
  Object.defineProperty(document, "hidden", {
    get: function () {
      console.log("{IFRAME?} Document hidden property accessed.");
      return false;
    },
    configurable: true, // Ensure it's configurable for later restoration
  });

  // Check and set 'visibilityState'
  Object.defineProperty(document, "visibilityState", {
    get: function () {
      console.log("{IFRAME?} Document visibilityState property accessed.");
      return "visible";
    },
    configurable: true, // Ensure it's configurable for later restoration
  });

  // Dispatch event only if a change actually occurred, to avoid unnecessary events
  document.dispatchEvent(new Event("visibilitychange"));
}
