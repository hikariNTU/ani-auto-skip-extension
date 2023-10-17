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
    console.log('[Iframe]', event.data);
    /**@type {HTMLButtonElement | undefined} */ (
      document.querySelector("button.videoAdUiSkipButton")
    )?.click();

    /**@type {HTMLButtonElement | undefined} */ (
      document.querySelector("div.rewardCloseButton")
    )?.click();
  },
  false
);

console.log("[Loaded]", location.href);
