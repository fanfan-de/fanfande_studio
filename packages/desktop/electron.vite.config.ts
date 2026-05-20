import react from "@vitejs/plugin-react"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import { resolve } from "node:path"

const workspaceAliases = {
  "@anybox/shared": resolve(__dirname, "../shared/src/index.ts"),
  "@anybox/platform": resolve(__dirname, "../platform/src/index.ts"),
  zod: resolve(__dirname, "../anyboxagent/node_modules/zod"),
}

const externalizeRuntimeDeps = externalizeDepsPlugin({
  exclude: ["@anybox/shared", "@anybox/platform"],
})

export default defineConfig({
  main: {
    plugins: [externalizeRuntimeDeps],
    resolve: {
      alias: workspaceAliases,
    },
  },
  preload: {
    plugins: [externalizeRuntimeDeps],
    resolve: {
      alias: workspaceAliases,
    },
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
    resolve: {
      alias: workspaceAliases,
    },
  },
})
