// @ts-check

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
    overrideVisibilityForAdCountdown(10000, 5000);
    // console.log("[Iframe]", event.data);
    click("button.videoAdUiSkipButton");
    click("div.rewardCloseButton");
    click("#count_down");
    click("#close_video_button");
    click("#dismiss-button-element"); // white modal google ad with translucent backdrop
    click("#dismiss-button"); // white modal google ad with translucent backdrop v2?
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

let restoreTimeoutId = null; // To store the ID of the pending restore timeout

/**
 * Overrides document.hidden and document.visibilityState to 'visible' for a duration,
 * with debounce logic for restoration.
 *
 * @param {number} [durationMs=10000] The duration in milliseconds to keep the document active.
 * Defaults to 10 seconds.
 * @param {number} [debounceDelayMs=500] The delay in milliseconds to wait after the last
 * call before restoring the original properties.
 * Defaults to 500ms.
 */
function overrideVisibilityForAdCountdown(
  durationMs = 10000,
  debounceDelayMs = 500
) {
  // 1. Ensure the properties are currently overridden to 'visible'
  //    We only need to define them if they are not already set to our desired values
  //    or if they haven't been overridden yet.

  let changed = false;

  // Check and set 'hidden'
  if (document.hidden !== false) {
    Object.defineProperty(document, "hidden", {
      get: function () {
        return false;
      },
      configurable: true, // Ensure it's configurable for later restoration
    });
    changed = true;
  }

  // Check and set 'visibilityState'
  if (document.visibilityState !== "visible") {
    Object.defineProperty(document, "visibilityState", {
      get: function () {
        return "visible";
      },
      configurable: true, // Ensure it's configurable for later restoration
    });
    changed = true;
  }

  // Dispatch event only if a change actually occurred, to avoid unnecessary events
  if (changed) {
    document.dispatchEvent(new Event("visibilitychange"));
    console.log('Document visibility overridden to "visible".');
  }

  // 2. Clear any existing restore timeout
  if (restoreTimeoutId) {
    clearTimeout(restoreTimeoutId);
  }

  // 3. Set a new timeout to restore the original methods after the debounce delay
  //    This timeout will be cancelled if the function is called again before it fires.
  restoreTimeoutId = setTimeout(() => {
    console.log(
      "Debounce period ended. Attempting to restore original visibility."
    );

    // Restore 'hidden'
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, "hidden", originalHiddenDescriptor);
    } else {
      // @ts-ignore
      delete document.hidden; // Fallback if no descriptor was captured (less common for these props)
    }

    // Restore 'visibilityState'
    if (originalVisibilityStateDescriptor) {
      Object.defineProperty(
        document,
        "visibilityState",
        originalVisibilityStateDescriptor
      );
    } else {
      // @ts-ignore
      delete document.visibilityState; // Fallback
    }

    // Dispatch another event after restoring
    document.dispatchEvent(new Event("visibilitychange"));

    console.log("Original document visibility restored.");
    console.log("Current document.hidden:", document.hidden);
    console.log("Current document.visibilityState:", document.visibilityState);

    restoreTimeoutId = null; // Reset the timeout ID
  }, durationMs + debounceDelayMs); // The total time before restoration happens
  // is the override duration + the debounce delay

  console.log(
    `Visibility override extended. Restoration scheduled for ${
      durationMs + debounceDelayMs
    }ms from now.`
  );
}
