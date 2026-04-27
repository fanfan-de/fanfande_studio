import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "node:path"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          "preview-webview": resolve(__dirname, "src/preload/preview-webview.ts"),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
