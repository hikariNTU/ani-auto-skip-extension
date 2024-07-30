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
    // console.log("[Iframe]", event.data);
    click("button.videoAdUiSkipButton");
    click("div.rewardCloseButton");
    click("#count_down");
    click("#close_video_button");
    click("#dismiss-button-element"); // white modal google ad with translucent backdrop
  },
  false
);

console.log("[Iframe controller Loaded]", location.href);
