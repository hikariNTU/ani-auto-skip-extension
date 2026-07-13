import { DEFAULT_SETTINGS, loadSettings, playChime } from "./shared.js";

if (typeof browser === "undefined") {
  globalThis.browser = chrome;
}

const inputs = {
  autoMute: document.getElementById("autoMute") as HTMLInputElement,
  pauseAfterSkip: document.getElementById("pauseAfterSkip") as HTMLInputElement,
  waitSeconds: document.getElementById("waitSeconds") as HTMLInputElement,
  chimeOnReady: document.getElementById("chimeOnReady") as HTMLInputElement,
  chimeOnEnded: document.getElementById("chimeOnEnded") as HTMLInputElement,
  chimeVolume: document.getElementById("chimeVolume") as HTMLInputElement,
  notifyOnReady: document.getElementById("notifyOnReady") as HTMLInputElement,
};

async function init() {
  const settings = await loadSettings();
  inputs.autoMute.checked = settings.autoMute;
  inputs.pauseAfterSkip.checked = settings.pauseAfterSkip;
  inputs.waitSeconds.value = String(settings.waitSeconds);
  inputs.chimeOnReady.checked = settings.chimeOnReady;
  inputs.chimeOnEnded.checked = settings.chimeOnEnded;
  inputs.chimeVolume.value = String(settings.chimeVolume);
  inputs.notifyOnReady.checked = settings.notifyOnReady;

  const version = document.getElementById("version");
  if (version) {
    version.textContent = "v" + browser.runtime.getManifest().version;
  }
}

function save() {
  const waitSeconds = Number(inputs.waitSeconds.value);
  browser.storage.sync.set({
    autoMute: inputs.autoMute.checked,
    pauseAfterSkip: inputs.pauseAfterSkip.checked,
    waitSeconds: Number.isFinite(waitSeconds)
      ? Math.min(120, Math.max(5, waitSeconds))
      : DEFAULT_SETTINGS.waitSeconds,
    chimeOnReady: inputs.chimeOnReady.checked,
    chimeOnEnded: inputs.chimeOnEnded.checked,
    chimeVolume: Number(inputs.chimeVolume.value),
    notifyOnReady: inputs.notifyOnReady.checked,
  });
}

for (const input of Object.values(inputs)) {
  input.addEventListener("change", save);
}

document.getElementById("test-chime")?.addEventListener("click", () => {
  playChime(Number(inputs.chimeVolume.value));
});

init();
