import { existsSync } from "node:fs"
import { resolve } from "node:path"

const localZod = resolve(__dirname, "node_modules/zod")
const fallbackZod = resolve(__dirname, "../anyboxagent/node_modules/zod")

export default {
  resolve: {
    alias: {
      zod: existsSync(localZod) ? localZod : fallbackZod,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}
