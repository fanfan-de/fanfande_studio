import { expect, test } from "bun:test"
import { Instance } from "#project/instance.ts"
import * as Provider from "#provider/provider.ts"

test("provider supports @ai-sdk/openai-compatible with env-only API keys", async () => {
  const languageModel = {
    doGenerate() {},
    doStream() {},
  }
  const capturedImports: Array<{ pkg: string; version?: string }> = []
  const capturedFactoryInputs: Array<Record<string, unknown>> = []

  const restoreProvider = Provider.setProviderRuntimeDependenciesForTesting({
    getModelsDev: async () => ({}) as never,
    getConfig: async () =>
      ({
        provider: {
          "compatible-test": {
            name: "Compatible Test",
            env: ["COMPATIBLE_TEST_API_KEY"],
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: "https://api.deepseek.com",
            },
            models: {
              "compat-model": {
                id: "compat-model",
                name: "Compatible Model",
              },
            },
          },
        },
      }) as never,
    getEnvAll: () => ({
      COMPATIBLE_TEST_API_KEY: "test-compatible-env-key",
    }),
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
  })

  try {
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const model = await Provider.getModel("compatible-test", "compat-model")
        const language = await Provider.getLanguage(model)

        expect(model.api.npm).toBe("@ai-sdk/openai-compatible")
        expect(language).toMatchObject(languageModel)
        expect(capturedImports).toEqual([
          {
            pkg: "@ai-sdk/openai-compatible",
            version: "2.0.38",
          },
        ])
        expect(capturedFactoryInputs).toEqual([
          {
            name: "compatible-test",
            apiKey: "test-compatible-env-key",
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
