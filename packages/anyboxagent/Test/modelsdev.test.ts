import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import * as ModelsDev from "#provider/modelsdev.ts"

test("models.dev cache is reloaded when models.json changes on disk", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "anybox-modelsdev-"))
  const cache = path.join(root, "cache")
  const modelsPath = path.join(cache, "models.json")

  const restoreCachePath = ModelsDev.setCacheFilePathForTesting(modelsPath)

  try {
    await mkdir(cache, { recursive: true })
    await writeFile(
      modelsPath,
      JSON.stringify({
        "alibaba-cn": {
          id: "alibaba-cn",
          name: "Alibaba (China)",
          env: ["DASHSCOPE_API_KEY"],
          models: {
            "qwen-vl-max": {
              id: "qwen-vl-max",
              name: "Qwen VL Max",
              release_date: "2025-01",
              attachment: false,
              reasoning: false,
              temperature: true,
              tool_call: true,
              limit: {
                context: 32768,
                output: 8192,
              },
              modalities: {
                input: ["text"],
                output: ["text"],
              },
              options: {},
            },
          },
        },
      }),
    )

    const initial = await ModelsDev.get()
    expect(initial["alibaba-cn"]?.models["qwen-vl-max"]?.modalities?.input).toEqual(["text"])

    await writeFile(
      modelsPath,
      JSON.stringify({
        "alibaba-cn": {
          id: "alibaba-cn",
          name: "Alibaba (China)",
          env: ["DASHSCOPE_API_KEY"],
          models: {
            "qwen-vl-max": {
              id: "qwen-vl-max",
              name: "Qwen VL Max",
              release_date: "2025-01",
              attachment: false,
              reasoning: false,
              temperature: true,
              tool_call: true,
              limit: {
                context: 32768,
                output: 8192,
              },
              modalities: {
                input: ["text", "image"],
                output: ["text"],
              },
              options: {},
            },
          },
        },
      }),
    )

    const updated = await ModelsDev.get()
    expect(updated["alibaba-cn"]?.models["qwen-vl-max"]?.modalities?.input).toEqual(["text", "image"])
  } finally {
    restoreCachePath()
    await rm(root, { recursive: true, force: true })
  }
})
