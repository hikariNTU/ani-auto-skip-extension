import { cpSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";

const manifest = JSON.parse(
  readFileSync(new URL("./src/manifest.json", import.meta.url), "utf-8")
);

/** Copies the whole src/images dir, not just the icons crx statically detects. */
function copyImages() {
  return {
    name: "copy-images",
    closeBundle() {
      cpSync(
        fileURLToPath(new URL("./src/images", import.meta.url)),
        fileURLToPath(new URL("./dist/images", import.meta.url)),
        { recursive: true }
      );
    },
  };
}

export default defineConfig({
  root: "src",
  plugins: [crx({ manifest }), copyImages()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
