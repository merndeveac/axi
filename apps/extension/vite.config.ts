import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    lib: {
      entry: fileURLToPath(new URL("./src/content.ts", import.meta.url)),
      formats: ["iife"],
      name: "AxiOverlayContent",
      fileName: () => "content.js"
    }
  }
});
