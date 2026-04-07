import { expect, mock, test } from "bun:test"

test("provider supports @ai-sdk/openai-compatible with env-only API keys", async () => {
  const languageModel = {
    doGenerate() {},
    doStream() {},
  }
  const capturedImports: Array<{ pkg: string; version?: string }> = []
  const capturedFactoryInputs: Array<Record<string, unknown>> = []

  mock.module("#project/instance.ts", () => ({
    Instance: {
      state<S>(init: () => S) {
        let value: S | undefined
        let initialized = false

        return () => {
          if (!initialized) {
            value = init()
            initialized = true
          }

          return value as S
        }
      },
    },
  }))

  mock.module("#provider/modelsdev.ts", () => ({
    get: async () => ({}),
  }))

  mock.module("#config/config.ts", () => ({
    get: async () => ({
      provider: {
        deepseek: {
          name: "DeepSeek",
          env: ["DEEPSEEK_API_KEY"],
          npm: "@ai-sdk/openai-compatible",
          options: {
            baseURL: "https://api.deepseek.com",
          },
          models: {
            "deepseek-reasoner": {
              id: "deepseek-reasoner",
              name: "DeepSeek Reasoner",
            },
          },
        },
      },
    }),
  }))

  mock.module("#env/env.ts", () => ({
    all: () => ({
      DEEPSEEK_API_KEY: "test-deepseek-env-key",
    }),
  }))

  mock.module("#bun/index.ts", () => ({
    BunProc: {
      importPackage: async (pkg: string, version?: string) => {
        capturedImports.push({ pkg, version })

        return {
          name: pkg,
          version: version ?? "test-version",
          entry: `${pkg}/index.js`,
          root: pkg,
          module: {
            createOpenAICompatible(options: Record<string, unknown>) {
              capturedFactoryInputs.push(options)
              return {
                languageModel() {
                  return languageModel
                },
              }
            },
          },
        }
      },
    },
  }))

  try {
    const Provider = await import("#provider/provider.ts")
    const model = await Provider.getModel("deepseek", "deepseek-reasoner")
    const language = await Provider.getLanguage(model)

    expect(model.api.npm).toBe("@ai-sdk/openai-compatible")
    expect(language).toBe(languageModel)
    expect(capturedImports).toEqual([
      {
        pkg: "@ai-sdk/openai-compatible",
        version: "2.0.38",
      },
    ])
    expect(capturedFactoryInputs).toEqual([
      {
        name: "deepseek",
        apiKey: "test-deepseek-env-key",
        baseURL: "https://api.deepseek.com",
        headers: undefined,
      },
    ])
  } finally {
    mock.restore()
  }
})
