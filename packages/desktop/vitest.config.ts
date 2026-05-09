import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

const workspaceAliases = {
  "@fanfande/shared": resolve(__dirname, "../shared/src/index.ts"),
  "@fanfande/platform": resolve(__dirname, "../platform/src/index.ts"),
  zod: resolve(__dirname, "../fanfandeagent/node_modules/zod"),
}

export default defineConfig({
  resolve: {
    alias: workspaceAliases,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/renderer/src/test-setup.ts"],
  },
})
