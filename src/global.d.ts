export {};

declare global {
  var browser: typeof chrome;

  /** Build timestamp (ISO 8601), injected by Vite's `define`. */
  const __BUILD_TIME__: string;

  interface Window {
    navigation?: EventTarget;
  }

  interface DOMStringMap {
    aniskipEndedHook?: string;
  }
}
