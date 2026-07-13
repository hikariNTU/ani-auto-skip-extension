// Visibility spoofing lives in visibility-spoof.ts (MAIN world);
// this script only clicks skip buttons when the main page asks.

function click(q: string) {
  const btn = document.querySelector(q) as HTMLButtonElement | null;
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
