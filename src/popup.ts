import {
  AD_DISMISS_TARGETS,
  DEFAULT_SETTINGS,
  loadSettings,
  playChime,
} from "./shared.js";

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
  cdpTrustedClick: document.getElementById(
    "cdpTrustedClick",
  ) as HTMLInputElement,
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
  inputs.cdpTrustedClick.checked = settings.cdpTrustedClick;

  const version = document.getElementById("version");
  if (version) {
    const built = new Date(__BUILD_TIME__);
    const builtLabel = Number.isNaN(built.getTime())
      ? __BUILD_TIME__
      : built.toLocaleString();
    version.textContent =
      "v" + browser.runtime.getManifest().version + " · built " + builtLabel;
  }

  const targetsBody = document.getElementById("ad-targets");
  if (targetsBody) {
    for (const t of AD_DISMISS_TARGETS) {
      const row = document.createElement("tr");
      for (const [text, cls] of [
        [t.type, ""],
        [t.selector, "selector"],
        [t.note, ""],
      ] as const) {
        const cell = document.createElement("td");
        if (cls) cell.className = cls;
        cell.textContent = text;
        row.appendChild(cell);
      }
      targetsBody.appendChild(row);
    }
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
    cdpTrustedClick: inputs.cdpTrustedClick.checked,
  });
}

for (const input of Object.values(inputs)) {
  input.addEventListener("change", save);
}

document.getElementById("test-chime")?.addEventListener("click", () => {
  playChime(Number(inputs.chimeVolume.value));
});

init();
