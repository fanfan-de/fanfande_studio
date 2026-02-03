import { Log } from "@/util/log";
import z from "zod"
import {
    type LanguageModel
} from "ai"
import { deepseek } from "@ai-sdk/deepseek";
import { openai } from "@ai-sdk/openai"
import { Instance } from "@/project/instance";

/**
 * 存储所有支持的provider
 */
export namespace Provider {
    const log = Log.create({ service: "provider" })

    export const Model = z
        .object({
            id: z.string(),
            providerID: z.string(),
            api: z.object({
                id: z.string(),
                url: z.string(),
                npm: z.string(),
            }),
            name: z.string(),
            family: z.string().optional(),
            capabilities: z.object({
                temperature: z.boolean(),
                reasoning: z.boolean(),
                attachment: z.boolean(),
                toolcall: z.boolean(),
                input: z.object({
                    text: z.boolean(),
                    audio: z.boolean(),
                    image: z.boolean(),
                    video: z.boolean(),
                    pdf: z.boolean(),
                }),
                output: z.object({
                    text: z.boolean(),
                    audio: z.boolean(),
                    image: z.boolean(),
                    video: z.boolean(),
                    pdf: z.boolean(),
                }),
                interleaved: z.union([
                    z.boolean(),
                    z.object({
                        field: z.enum(["reasoning_content", "reasoning_details"]),
                    }),
                ]),
            }),
            cost: z.object({
                input: z.number(),
                output: z.number(),
                cache: z.object({
                    read: z.number(),
                    write: z.number(),
                }),
                experimentalOver200K: z
                    .object({
                        input: z.number(),
                        output: z.number(),
                        cache: z.object({
                            read: z.number(),
                            write: z.number(),
                        }),
                    })
                    .optional(),
            }),
            limit: z.object({
                context: z.number(),
                input: z.number().optional(),
                output: z.number(),
            }),
            status: z.enum(["alpha", "beta", "deprecated", "active"]),
            options: z.record(z.string(), z.any()),
            headers: z.record(z.string(), z.string()),
            release_date: z.string(),
            variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
        })
        .meta({
            ref: "Model",
        })
    export type Model = z.infer<typeof Model>

    //提供商的配置
    export const Info = z
        .object({
            id: z.string(),
            name: z.string(),
            source: z.enum(["env", "config", "custom", "api"]),
            env: z.string().array(),
            key: z.string().optional(),
            options: z.record(z.string(), z.any()),
            models: z.record(z.string(), Model),
        })
        .meta({
            ref: "Provider",
        })
    export type Info = z.infer<typeof Info>

    const state = Instance.state(async () => {
        using _ = log.time("state")
        const config = await Config.get()
        const modelsDev = await ModelsDev.get()
        const database = mapValues(modelsDev, fromModelsDevProvider)

        const disabled = new Set(config.disabled_providers ?? [])
        const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

        function isProviderAllowed(providerID: string): boolean {
            if (enabled && !enabled.has(providerID)) return false
            if (disabled.has(providerID)) return false
            return true
        }

        const providers: { [providerID: string]: Info } = {}
        const languages = new Map<string, LanguageModelV2>()
        const modelLoaders: {
            [providerID: string]: CustomModelLoader
        } = {}
        const sdk = new Map<number, SDK>()

        log.info("init")

        const configProviders = Object.entries(config.provider ?? {})

        // Add GitHub Copilot Enterprise provider that inherits from GitHub Copilot
        if (database["github-copilot"]) {
            const githubCopilot = database["github-copilot"]
            database["github-copilot-enterprise"] = {
                ...githubCopilot,
                id: "github-copilot-enterprise",
                name: "GitHub Copilot Enterprise",
                models: mapValues(githubCopilot.models, (model) => ({
                    ...model,
                    providerID: "github-copilot-enterprise",
                })),
            }
        }

        function mergeProvider(providerID: string, provider: Partial<Info>) {
            const existing = providers[providerID]
            if (existing) {
                // @ts-expect-error
                providers[providerID] = mergeDeep(existing, provider)
                return
            }
            const match = database[providerID]
            if (!match) return
            // @ts-expect-error
            providers[providerID] = mergeDeep(match, provider)
        }

        // extend database from config
        for (const [providerID, provider] of configProviders) {
            const existing = database[providerID]
            const parsed: Info = {
                id: providerID,
                name: provider.name ?? existing?.name ?? providerID,
                env: provider.env ?? existing?.env ?? [],
                options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
                source: "config",
                models: existing?.models ?? {},
            }

            for (const [modelID, model] of Object.entries(provider.models ?? {})) {
                const existingModel = parsed.models[model.id ?? modelID]
                const name = iife(() => {
                    if (model.name) return model.name
                    if (model.id && model.id !== modelID) return modelID
                    return existingModel?.name ?? modelID
                })
                const parsedModel: Model = {
                    id: modelID,
                    api: {
                        id: model.id ?? existingModel?.api.id ?? modelID,
                        npm:
                            model.provider?.npm ??
                            provider.npm ??
                            existingModel?.api.npm ??
                            modelsDev[providerID]?.npm ??
                            "@ai-sdk/openai-compatible",
                        url: provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api,
                    },
                    status: model.status ?? existingModel?.status ?? "active",
                    name,
                    providerID,
                    capabilities: {
                        temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
                        reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
                        attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
                        toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
                        input: {
                            text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
                            audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
                            image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
                            video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
                            pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
                        },
                        output: {
                            text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
                            audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
                            image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
                            video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
                            pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
                        },
                        interleaved: model.interleaved ?? false,
                    },
                    cost: {
                        input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
                        output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
                        cache: {
                            read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
                            write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
                        },
                    },
                    options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
                    limit: {
                        context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
                        output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
                    },
                    headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
                    family: model.family ?? existingModel?.family ?? "",
                    release_date: model.release_date ?? existingModel?.release_date ?? "",
                    variants: {},
                }
                const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
                parsedModel.variants = mapValues(
                    pickBy(merged, (v) => !v.disabled),
                    (v) => omit(v, ["disabled"]),
                )
                parsed.models[modelID] = parsedModel
            }
            database[providerID] = parsed
        }

        // load env
        const env = Env.all()
        for (const [providerID, provider] of Object.entries(database)) {
            if (disabled.has(providerID)) continue
            const apiKey = provider.env.map((item) => env[item]).find(Boolean)
            if (!apiKey) continue
            mergeProvider(providerID, {
                source: "env",
                key: provider.env.length === 1 ? apiKey : undefined,
            })
        }

        // load apikeys
        for (const [providerID, provider] of Object.entries(await Auth.all())) {
            if (disabled.has(providerID)) continue
            if (provider.type === "api") {
                mergeProvider(providerID, {
                    source: "api",
                    key: provider.key,
                })
            }
        }

        for (const plugin of await Plugin.list()) {
            if (!plugin.auth) continue
            const providerID = plugin.auth.provider
            if (disabled.has(providerID)) continue

            // For github-copilot plugin, check if auth exists for either github-copilot or github-copilot-enterprise
            let hasAuth = false
            const auth = await Auth.get(providerID)
            if (auth) hasAuth = true

            // Special handling for github-copilot: also check for enterprise auth
            if (providerID === "github-copilot" && !hasAuth) {
                const enterpriseAuth = await Auth.get("github-copilot-enterprise")
                if (enterpriseAuth) hasAuth = true
            }

            if (!hasAuth) continue
            if (!plugin.auth.loader) continue

            // Load for the main provider if auth exists
            if (auth) {
                const options = await plugin.auth.loader(() => Auth.get(providerID) as any, database[plugin.auth.provider])
                const opts = options ?? {}
                const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
                mergeProvider(providerID, patch)
            }

            // If this is github-copilot plugin, also register for github-copilot-enterprise if auth exists
            if (providerID === "github-copilot") {
                const enterpriseProviderID = "github-copilot-enterprise"
                if (!disabled.has(enterpriseProviderID)) {
                    const enterpriseAuth = await Auth.get(enterpriseProviderID)
                    if (enterpriseAuth) {
                        const enterpriseOptions = await plugin.auth.loader(
                            () => Auth.get(enterpriseProviderID) as any,
                            database[enterpriseProviderID],
                        )
                        const opts = enterpriseOptions ?? {}
                        const patch: Partial<Info> = providers[enterpriseProviderID]
                            ? { options: opts }
                            : { source: "custom", options: opts }
                        mergeProvider(enterpriseProviderID, patch)
                    }
                }
            }
        }

        for (const [providerID, fn] of Object.entries(CUSTOM_LOADERS)) {
            if (disabled.has(providerID)) continue
            const data = database[providerID]
            if (!data) {
                log.error("Provider does not exist in model list " + providerID)
                continue
            }
            const result = await fn(data)
            if (result && (result.autoload || providers[providerID])) {
                if (result.getModel) modelLoaders[providerID] = result.getModel
                const opts = result.options ?? {}
                const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
                mergeProvider(providerID, patch)
            }
        }

        // load config
        for (const [providerID, provider] of configProviders) {
            const partial: Partial<Info> = { source: "config" }
            if (provider.env) partial.env = provider.env
            if (provider.name) partial.name = provider.name
            if (provider.options) partial.options = provider.options
            mergeProvider(providerID, partial)
        }

        for (const [providerID, provider] of Object.entries(providers)) {
            if (!isProviderAllowed(providerID)) {
                delete providers[providerID]
                continue
            }

            const configProvider = config.provider?.[providerID]

            for (const [modelID, model] of Object.entries(provider.models)) {
                model.api.id = model.api.id ?? model.id ?? modelID
                if (modelID === "gpt-5-chat-latest" || (providerID === "openrouter" && modelID === "openai/gpt-5-chat"))
                    delete provider.models[modelID]
                if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID]
                if (model.status === "deprecated") delete provider.models[modelID]
                if (
                    (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
                    (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
                )
                    delete provider.models[modelID]

                model.variants = mapValues(ProviderTransform.variants(model), (v) => v)

                // Filter out disabled variants from config
                const configVariants = configProvider?.models?.[modelID]?.variants
                if (configVariants && model.variants) {
                    const merged = mergeDeep(model.variants, configVariants)
                    model.variants = mapValues(
                        pickBy(merged, (v) => !v.disabled),
                        (v) => omit(v, ["disabled"]),
                    )
                }
            }

            if (Object.keys(provider.models).length === 0) {
                delete providers[providerID]
                continue
            }

            log.info("found", { providerID })
        }

        return {
            models: languages,
            providers,
            sdk,
            modelLoaders,
        }
    })


    export async function getLanguage(model: Model): Promise<LanguageModel> {

    }




}