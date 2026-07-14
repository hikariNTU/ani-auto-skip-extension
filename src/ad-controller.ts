// Visibility spoofing lives in visibility-spoof.ts (MAIN world);
// this script only clicks skip buttons when the main page asks.

import { AD_DISMISS_TARGETS } from "./shared.js";

function describe(el: Element | null): string {
  if (!el) return "null";
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().replace(/\s+/g, ".")
      : "";
  return `<${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}>`;
}

function chain(el: Element, depth = 6): string {
  const out: string[] = [];
  let node: Element | null = el;
  for (let i = 0; i < depth && node; i++) {
    out.push(describe(node));
    node = node.parentElement;
  }
  return out.join(" < ");
}

// Multiple ad iframes (imasdk bridge, several safeframes) run this same
// script at once, all logging to the same devtools console - tag every
// line with this frame's own hostname so the logs can be told apart.
const tag = `[iframe:${location.hostname}]`;

// Verbose per-pass diagnostics (body children, nested-iframe tree, "no match
// this pass") flood the console ~1/s per frame for the whole ad. They're only
// useful when debugging *why* a selector isn't matching, so keep them off by
// default. Actual matches (and clicks) are always logged. Flip to true to
// re-enable the frame-structure dumps.
const DEBUG = false;

let matchedThisMessage = 0;

// The manifest's URL-based frame matching only runs this script in frames
// whose own URL matches - a further-nested iframe (e.g. an about:blank child
// created via document.write by the ad SDK) never gets its own copy of the
// script. Walk into any same-origin-reachable nested iframe and search there
// too, since some dismiss buttons live one level deeper than the frame this
// script actually loaded into.
function queryDeep(root: Document, q: string): HTMLElement | null {
  const found = root.querySelector(q) as HTMLElement | null;
  if (found) {
    return found;
  }
  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    let nestedDoc: Document | null = null;
    try {
      nestedDoc = (frame as HTMLIFrameElement).contentDocument;
    } catch {
      // cross-origin - inaccessible from here, skip it
    }
    if (nestedDoc) {
      const nested = queryDeep(nestedDoc, q);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

// Diagnostic: log every nested iframe's src and, for same-origin-reachable
// ones, its body children too - so we can tell "cross-origin, can never be
// reached this way" apart from "reachable, but genuinely doesn't have the
// button" instead of just seeing every selector silently fail to match.
function describeFrames(root: Document, depth = 0): string[] {
  const out: string[] = [];
  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    const src = frame.getAttribute("src") || "(no src)";
    let nestedDoc: Document | null = null;
    let reachable = true;
    try {
      nestedDoc = (frame as HTMLIFrameElement).contentDocument;
    } catch {
      reachable = false;
    }
    const indent = "  ".repeat(depth);
    if (!reachable || !nestedDoc) {
      out.push(`${indent}iframe src=${src} -> UNREACHABLE (cross-origin)`);
    } else {
      const children = [...(nestedDoc.body?.children ?? [])]
        .map(describe)
        .join(", ");
      out.push(`${indent}iframe src=${src} -> reachable, body: ${children}`);
      out.push(...describeFrames(nestedDoc, depth + 1));
    }
  }
  return out;
}

function click(q: string) {
  const btn = queryDeep(document, q) as HTMLButtonElement | null;
  if (!btn) {
    return;
  }
  console.log(tag, "Button", q, "found:", chain(btn));
  btn.click();
  matchedThisMessage++;
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
    matchedThisMessage = 0;
    if (DEBUG) {
      console.log(
        tag,
        "message received, body children:",
        [...document.body.children].map(describe).join(", "),
      );
      const frameTree = describeFrames(document);
      if (frameTree.length > 0) {
        console.log(tag, "nested iframes:\n" + frameTree.join("\n"));
      }
    }
    for (const target of AD_DISMISS_TARGETS) {
      click(target.selector);
    }
    if (DEBUG && matchedThisMessage === 0) {
      console.log(tag, "no dismiss button matched any selector this pass");
    }
  },
  false,
);

if (DEBUG) {
  console.log(tag, "Iframe controller Loaded", location.href);
}
