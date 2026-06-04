import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const threeRoot = fileURLToPath(new URL("./node_modules/three", import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: [
      { find: /^three$/, replacement: threeRoot },
      { find: /^three\/(.*)$/, replacement: `${threeRoot}/$1` }
    ],
    dedupe: ["three"]
  },
  test: {
    deps: {
      inline: ["gcode-viewer"]
    },
    server: {
      deps: {
        inline: true
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 1437,
    strictPort: true
  }
});
