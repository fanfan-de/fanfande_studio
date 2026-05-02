import { expect, test } from "bun:test"
import { Instance } from "#project/instance.ts"
import * as Provider from "#provider/provider.ts"

test("provider routes built-in DeepSeek models through the OpenAI-compatible adapter", async () => {
  const deepseekLanguageModel = {
    doGenerate() {},
    doStream() {},
  }
  const capturedImports: Array<{ pkg: string; version?: string }> = []
  const capturedFactoryInputs: Array<Record<string, unknown>> = []

  const restoreProvider = Provider.setProviderRuntimeDependenciesForTesting({
    getModelsDev: async () => ({
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        env: ["DEEPSEEK_API_KEY"],
        api: "https://api.deepseek.com",
        npm: "@ai-sdk/deepseek",
        models: {
          "deepseek-reasoner": {
            id: "deepseek-reasoner",
            name: "DeepSeek Reasoner",
            release_date: "2026-01-01",
            attachment: false,
            reasoning: true,
            temperature: false,
            tool_call: true,
            interleaved: {
              field: "reasoning_content",
            },
            limit: {
              context: 64_000,
              output: 8_192,
            },
            modalities: {
              input: ["text"],
              output: ["text"],
            },
            options: {},
          },
        },
      },
    }) as never,
    getConfig: async () => ({}) as never,
    getEnvAll: () => ({
      DEEPSEEK_API_KEY: "test-deepseek-env-key",
    }),
    importPackage: async (pkg: string, version?: string) => {
      capturedImports.push({ pkg, version })

      if (pkg === "@ai-sdk/openai-compatible") {
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
                  return deepseekLanguageModel
                },
              }
            },
          },
        }
      }

      return {
        name: pkg,
        version: version ?? "test-version",
        entry: `${pkg}/index.js`,
        root: pkg,
        module: {
          createDeepSeek() {
            throw new Error("DeepSeek adapter should not be used for runtime requests")
          },
        },
      }
    },
  })

  try {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const model = await Provider.getModel("deepseek", "deepseek-reasoner")
        const language = await Provider.getLanguage(model)

        expect(model.api.npm).toBe("@ai-sdk/deepseek")
        expect(language).toMatchObject(deepseekLanguageModel)
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
      },
    })
  } finally {
    restoreProvider()
  }
})
