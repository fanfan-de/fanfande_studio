import * as  Log from "#util/log.ts"
import { Instance } from "#project/instance.ts"
import z from "zod"
import path from "path"
import { Server } from "#server/server.ts"
import { Agent } from "#agent/agent.ts"
import { ModelsDev } from "#provider/modelsdev.ts"
import * as  Auth  from "#auth/auth.ts"



const ModelId = z.string().meta({ $ref: "https://models.dev/model-schema.json#/$defs/Model" })
let sad = ModelId.parse("asfafga")
const log = Log.create({ service: "config" })


//根据不同的操作系统返回系统管理的配置目录路径。
function systemManagedConfigDir(): string {
    switch (process.platform) {
        case "darwin":
            return "/Library/Application Support/opencode"
        case "win32":
            return path.join(process.env.ProgramData || "C:\\ProgramData", "opencode")
        default:
            return "/etc/opencode"
    }
}
export function managedConfigDir() {
    return process.env.OPENCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()
}
const managedDir = managedConfigDir()

//todo，合并

//获取project级别的配置
export const state = Instance.state(async () => {
    const auth = await Auth.all()

    let result: Info = {}

    return {
        config: result,
        //directories,
    }
})
/**
 * 
 * @returns 获取project 配置
 */
export async function get() {
    return state().then((x) => x.config)
}



export const Provider = ModelsDev.Provider.partial()
    .extend({
        whitelist: z.array(z.string()).optional(),
        blacklist: z.array(z.string()).optional(),
        models: z
            .record(
                z.string(),
                ModelsDev.Model.partial().extend({
                    variants: z
                        .record(
                            z.string(),
                            z
                                .object({
                                    disabled: z.boolean().optional().describe("Disable this variant for the model"),
                                })
                                .catchall(z.any()),
                        )
                        .optional()
                        .describe("Variant-specific configuration"),
                }),
            )
            .optional(),
        options: z
            .object({
                apiKey: z.string().optional(),
                baseURL: z.string().optional(),
                enterpriseUrl: z.string().optional().describe("GitHub Enterprise URL for copilot authentication"),
                setCacheKey: z.boolean().optional().describe("Enable promptCacheKey for this provider (default false)"),
                timeout: z
                    .union([
                        z
                            .number()
                            .int()
                            .positive()
                            .describe(
                                "Timeout in milliseconds for requests to this provider. Default is 300000 (5 minutes). Set to false to disable timeout.",
                            ),
                        z.literal(false).describe("Disable timeout for this provider entirely."),
                    ])
                    .optional()
                    .describe(
                        "Timeout in milliseconds for requests to this provider. Default is 300000 (5 minutes). Set to false to disable timeout.",
                    ),
            })
            .catchall(z.any())
            .optional(),
    })
    .strict()
    .meta({
        ref: "ProviderConfig",
    })
export type Provider = z.infer<typeof Provider>

export const Info = z
    .object({
        $schema: z.string().optional().describe("JSON schema reference for configuration validation"),
        logLevel: Log.Level.optional().describe("Log level"),
        //server: Server.optional().describe("Server configuration for opencode serve and web commands"),
        // command: z
        //     .record(z.string(), Command)
        //     .optional()
        //     .describe("Command configuration, see https://opencode.ai/docs/commands"),
        watcher: z
            .object({
                ignore: z.array(z.string()).optional(),
            })
            .optional(),
        plugin: z.string().array().optional(),
        snapshot: z.boolean().optional(),
        share: z
            .enum(["manual", "auto", "disabled"])
            .optional()
            .describe(
                "Control sharing behavior:'manual' allows manual sharing via commands, 'auto' enables automatic sharing, 'disabled' disables all sharing",
            ),
        autoshare: z
            .boolean()
            .optional()
            .describe("@deprecated Use 'share' field instead. Share newly created sessions automatically"),
        autoupdate: z
            .union([z.boolean(), z.literal("notify")])
            .optional()
            .describe(
                "Automatically update to the latest version. Set to true to auto-update, false to disable, or 'notify' to show update notifications",
            ),
        disabled_providers: z.array(z.string()).optional().describe("Disable providers that are loaded automatically"),
        enabled_providers: z
            .array(z.string())
            .optional()
            .describe("When set, ONLY these providers will be enabled. All other providers will be ignored"),
        model: z.string().describe("Model to use in the format of provider/model, eg anthropic/claude-2").optional(),
        small_model: z
            .string()
            .describe("Small model to use for tasks like title generation in the format of provider/model")
            .optional(),
        default_agent: z
            .string()
            .optional()
            .describe(
                "Default agent to use when none is specified. Must be a primary agent. Falls back to 'build' if not set or if the specified agent is invalid.",
            ),
        username: z
            .string()
            .optional()
            .describe("Custom username to display in conversations instead of system username"),
        // mode: z
        //     .object({
        //         build: Agent.optional(),
        //         plan: Agent.optional(),
        //     })
        //     .catchall(Agent)
        //     .optional()
        //     .describe("@deprecated Use `agent` field instead."),
        // agent: z
        //     .object({
        //         // primary
        //         plan: Agent.optional(),
        //         build: Agent.optional(),
        //         // subagent
        //         general: Agent.optional(),
        //         explore: Agent.optional(),
        //         // specialized
        //         title: Agent.optional(),
        //         summary: Agent.optional(),
        //         compaction: Agent.optional(),
        //     })
        //     .catchall(Agent)
        //     .optional()
        //     .describe("Agent configuration, see https://opencode.ai/docs/agents"),
        provider: z
            .record(z.string(), Provider)
            .optional()
            .describe("Custom provider configurations and model overrides"),
        // mcp: z
        //     .record(
        //         z.string(),
        //         z.union([
        //             Mcp,
        //             z
        //                 .object({
        //                     enabled: z.boolean(),
        //                 })
        //                 .strict(),
        //         ]),
        //     )
        //     .optional()
        //     .describe("MCP (Model Context Protocol) server configurations"),
        formatter: z
            .union([
                z.literal(false),
                z.record(
                    z.string(),
                    z.object({
                        disabled: z.boolean().optional(),
                        command: z.array(z.string()).optional(),
                        environment: z.record(z.string(), z.string()).optional(),
                        extensions: z.array(z.string()).optional(),
                    }),
                ),
            ])
            .optional(),
        // lsp: z
        //     .union([
        //         z.literal(false),
        //         z.record(
        //             z.string(),
        //             z.union([
        //                 z.object({
        //                     disabled: z.literal(true),
        //                 }),
        //                 z.object({
        //                     command: z.array(z.string()),
        //                     extensions: z.array(z.string()).optional(),
        //                     disabled: z.boolean().optional(),
        //                     env: z.record(z.string(), z.string()).optional(),
        //                     initialization: z.record(z.string(), z.any()).optional(),
        //                 }),
        //             ]),
        //         ),
        //     ])
        //     .optional()
        //     .refine(
        //         (data) => {
        //             if (!data) return true
        //             if (typeof data === "boolean") return true
        //             const serverIds = new Set(Object.values(LSPServer).map((s) => s.id))

        //             return Object.entries(data).every(([id, config]) => {
        //                 if (config.disabled) return true
        //                 if (serverIds.has(id)) return true
        //                 return Boolean(config.extensions)
        //             })
        //         },
        //         {
        //             error: "For custom LSP servers, 'extensions' array is required.",
        //         },
        //     ),
        instructions: z.array(z.string()).optional().describe("Additional instruction files or patterns to include"),
        // layout: Layout.optional().describe("@deprecated Always uses stretch layout."),
        // permission: Permission.optional(),
        tools: z.record(z.string(), z.boolean()).optional(),
        enterprise: z
            .object({
                url: z.string().optional().describe("Enterprise URL"),
            })
            .optional(),
        compaction: z
            .object({
                auto: z.boolean().optional().describe("Enable automatic compaction when context is full (default: true)"),
                prune: z.boolean().optional().describe("Enable pruning of old tool outputs (default: true)"),
            })
            .optional(),
        experimental: z
            .object({
                hook: z
                    .object({
                        file_edited: z
                            .record(
                                z.string(),
                                z
                                    .object({
                                        command: z.string().array(),
                                        environment: z.record(z.string(), z.string()).optional(),
                                    })
                                    .array(),
                            )
                            .optional(),
                        session_completed: z
                            .object({
                                command: z.string().array(),
                                environment: z.record(z.string(), z.string()).optional(),
                            })
                            .array()
                            .optional(),
                    })
                    .optional(),
                chatMaxRetries: z.number().optional().describe("Number of retries for chat completions on failure"),
                disable_paste_summary: z.boolean().optional(),
                batch_tool: z.boolean().optional().describe("Enable the batch tool"),
                openTelemetry: z
                    .boolean()
                    .optional()
                    .describe("Enable OpenTelemetry spans for AI SDK calls (using the 'experimental_telemetry' flag)"),
                primary_tools: z
                    .array(z.string())
                    .optional()
                    .describe("Tools that should only be available to primary agents."),
                continue_loop_on_deny: z.boolean().optional().describe("Continue the agent loop when a tool call is denied"),
                mcp_timeout: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("Timeout in milliseconds for model context protocol (MCP) requests"),
            })
            .optional(),
    })
    .strict()
    .meta({
        ref: "Config",
    })
export type Info = z.output<typeof Info>




