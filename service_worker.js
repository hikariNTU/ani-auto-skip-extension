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
