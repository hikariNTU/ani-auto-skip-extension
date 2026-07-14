import { cdpDismiss, cdpStop } from "./cdp.js";

if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

browser.runtime.onMessage.addListener((message, sender) => {
  // Object messages (structured commands) are handled before the string switch.
  if (message && typeof message === "object" && message.type === "cdp-dismiss") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      cdpDismiss(tabId);
    }
    return;
  }
  switch (message) {
    case "mute":
      browser.tabs.update(sender.tab!.id!, { muted: true }).then(() => {
        console.log("Muted:", sender.tab?.title);
      });
      break;
    case "unmute":
      browser.tabs.update(sender.tab!.id!, { muted: false }).then(() => {
        console.log("Unmuted:", sender.tab?.title);
      });
      // Unmute is the content script's "ads resolved" marker - stop any CDP
      // sweep so the debugging banner clears without waiting on the idle timers.
      if (sender.tab?.id != null) {
        cdpStop(sender.tab.id);
      }
      break;
    case "notify-ready":
      notify("廣告跳過完成，可以開始看囉！", sender.tab?.title);
      break;
    case "notify-ended":
      notify("動畫播放完畢", sender.tab?.title);
      break;
    default:
      console.log("Unknown:", message);
  }
});

function notify(message: string, tabTitle?: string) {
  browser.notifications.create({
    type: "basic",
    iconUrl: "images/ani_skip_icon_128.png",
    title: tabTitle || "動畫瘋閉嘴",
    message,
  });
}
