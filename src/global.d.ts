export {};

declare global {
  var browser: typeof chrome;

  interface Window {
    navigation?: EventTarget;
  }

  interface DOMStringMap {
    aniskipEndedHook?: string;
  }
}
