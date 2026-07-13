/**
 * Runs in the MAIN world of Google ad iframes at document_start,
 * before the IMA SDK loads. Makes the page always look visible/focused
 * so ads keep their countdown running in background tabs.
 * See docs/background-tab-issue.md
 */

Object.defineProperty(Document.prototype, "hidden", {
  get: () => false,
  configurable: true,
});

Object.defineProperty(Document.prototype, "visibilityState", {
  get: () => "visible",
  configurable: true,
});

Document.prototype.hasFocus = () => true;

// Capture-phase listeners installed before the SDK's own listeners,
// so its pause-on-hidden handlers never fire.
for (const type of [
  "visibilitychange",
  "webkitvisibilitychange",
  "blur",
  "pagehide",
]) {
  window.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
  document.addEventListener(type, (e) => e.stopImmediatePropagation(), true);
}

console.log("[Ani Skip] visibility spoof active:", location.href);
