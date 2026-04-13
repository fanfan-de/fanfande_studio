import z from "zod"
import { mergeDeep } from "remeda"
import * as Log from "#util/log.ts"
import * as db from "#database/Sqlite.ts"
import { toCreateTableSQL, withPrimaryKey, zodObjectToColumnDefs } from "#database/parser.ts"
import { DevModel, DevProvider } from "#provider/modelsdev.ts"
import * as Permission from "#permission/schema.ts"

const log = Log.create({ service: "config" })
export const GLOBAL_CONFIG_ID = "__global__"

export const Provider = DevProvider.partial()
  .extend({
    whitelist: z.array(z.string()).optional(),
    blacklist: z.array(z.string()).optional(),
    models: z
      .record(
        z.string(),
        DevModel.partial().extend({
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

const ProviderMapField = z
  .record(z.string(), Provider)
  .optional()
  .describe("Custom provider configurations and model overrides")

  
const ModelField = z.string().describe("Model to use in the format of provider/model, eg anthropic/claude-2")

const SmallModelField = z
  .string()
  .describe("Small model to use for tasks like title generation in the format of provider/model")

const EnabledProvidersField = z
  .array(z.string())
  .optional()
  .describe("When set, ONLY these providers will be enabled. All other providers will be ignored")

const DisabledProvidersField = z.array(z.string()).optional().describe("Disable providers that are loaded automatically")

const ProviderConfigFields = {
  disabled_providers: DisabledProvidersField,
  enabled_providers: EnabledProvidersField,
  model: ModelField.optional(),
  small_model: SmallModelField.optional(),
  provider: ProviderMapField,
}

const ModelSelectionFields = {
  model: ModelField.nullable().optional(),
  small_model: SmallModelField.nullable().optional(),
}

const SelectedMcpServersField = z
  .array(z.string())
  .optional()
  .describe("Project-scoped selected global MCP server ids")

const SelectedSkillsField = z
  .array(z.string())
  .optional()
  .describe("Project-scoped selected skill ids")

export const McpServerTransport = z.enum(["stdio", "remote"]).meta({
  ref: "McpServerTransport",
})
export type McpServerTransport = z.infer<typeof McpServerTransport>

export const McpRemoteProvider = z.literal("openai").meta({
  ref: "McpRemoteProvider",
})
export type McpRemoteProvider = z.infer<typeof McpRemoteProvider>

export const McpAllowedTools = z
  .union([
    z.array(z.string()),
    z.object({
      readOnly: z.boolean().optional(),
      toolNames: z.array(z.string()).optional(),
    }),
  ])
  .optional()
  .meta({
    ref: "McpAllowedTools",
  })
export type McpAllowedTools = z.infer<typeof McpAllowedTools>

export const McpRequireApproval = z
  .union([
    z.enum(["always", "never"]),
    z.object({
      never: z
        .object({
          toolNames: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ])
  .optional()
  .meta({
    ref: "McpRequireApproval",
  })
export type McpRequireApproval = z.infer<typeof McpRequireApproval>

const McpServerBaseFields = {
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().positive().optional(),
} as const

export const McpStdioServerConfig = z
  .object({
    ...McpServerBaseFields,
    transport: z.literal("stdio").optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().min(1).optional(),
  })
  .strict()
  .meta({
    ref: "McpStdioServerConfig",
  })
export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfig>

export const McpRemoteServerConfig = z
  .object({
    ...McpServerBaseFields,
    transport: z.literal("remote"),
    provider: McpRemoteProvider.optional(),
    serverUrl: z.string().min(1).optional(),
    connectorId: z.string().min(1).optional(),
    authorization: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    serverDescription: z.string().min(1).optional(),
    allowedTools: McpAllowedTools,
    requireApproval: McpRequireApproval,
  })
  .strict()
  .refine((value) => Boolean(value.serverUrl || value.connectorId), {
    message: "Remote MCP servers require either serverUrl or connectorId.",
    path: ["serverUrl"],
  })
  .meta({
    ref: "McpRemoteServerConfig",
  })
export type McpRemoteServerConfig = z.infer<typeof McpRemoteServerConfig>

export const McpServerConfig = z.union([McpStdioServerConfig, McpRemoteServerConfig]).meta({
  ref: "McpServerConfig",
})
export type McpServerConfig = z.infer<typeof McpServerConfig>

export const McpStdioServerInput = McpStdioServerConfig.omit({
  id: true,
}).meta({
  ref: "McpStdioServerInput",
})
export type McpStdioServerInput = z.infer<typeof McpStdioServerInput>

export const McpRemoteServerInput = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional(),
    transport: z.literal("remote"),
    provider: McpRemoteProvider.optional(),
    serverUrl: z.string().min(1).optional(),
    connectorId: z.string().min(1).optional(),
    authorization: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    serverDescription: z.string().min(1).optional(),
    allowedTools: McpAllowedTools,
    requireApproval: McpRequireApproval,
  })
  .strict()
  .refine((value) => Boolean(value.serverUrl || value.connectorId), {
    message: "Remote MCP servers require either serverUrl or connectorId.",
    path: ["serverUrl"],
  })
  .meta({
    ref: "McpRemoteServerInput",
  })
export type McpRemoteServerInput = z.infer<typeof McpRemoteServerInput>

export const McpServerInput = z.union([McpStdioServerInput, McpRemoteServerInput]).meta({
  ref: "McpServerInput",
})
export type McpServerInput = z.infer<typeof McpServerInput>

export const McpStdioServerSummary = McpStdioServerConfig.extend({
  transport: z.literal("stdio"),
  enabled: z.boolean(),
}).meta({
  ref: "McpStdioServerSummary",
})
export type McpStdioServerSummary = z.infer<typeof McpStdioServerSummary>

export const McpRemoteServerSummary = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    enabled: z.boolean(),
    timeoutMs: z.number().int().positive().optional(),
    transport: z.literal("remote"),
    provider: McpRemoteProvider.optional(),
    serverUrl: z.string().min(1).optional(),
    connectorId: z.string().min(1).optional(),
    authorization: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    serverDescription: z.string().min(1).optional(),
    allowedTools: McpAllowedTools,
    requireApproval: McpRequireApproval,
  })
  .strict()
  .refine((value) => Boolean(value.serverUrl || value.connectorId), {
    message: "Remote MCP servers require either serverUrl or connectorId.",
    path: ["serverUrl"],
  })
  .meta({
    ref: "McpRemoteServerSummary",
  })
export type McpRemoteServerSummary = z.infer<typeof McpRemoteServerSummary>

export const McpServerSummary = z.union([McpStdioServerSummary, McpRemoteServerSummary]).meta({
  ref: "McpServerSummary",
})
export type McpServerSummary = z.infer<typeof McpServerSummary>

const McpConfigField = z
  .object({
    servers: z.record(z.string(), McpServerConfig).optional(),
  })
  .strict()
  .optional()
  .describe("MCP server definitions")

export const Info = z
  .object({
    $schema: z.string().optional().describe("JSON schema reference for configuration validation"),
    logLevel: Log.Level.optional().describe("Log level"),
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
    ...ProviderConfigFields,
    default_agent: z
      .string()
      .optional()
      .describe(
        "Default agent to use when none is specified. Must be a primary agent. Falls back to 'build' if not set or if the specified agent is invalid.",
      ),
    username: z.string().optional().describe("Custom username to display in conversations instead of system username"),
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
    instructions: z.array(z.string()).optional().describe("Additional instruction files or patterns to include"),
    tools: z.record(z.string(), z.boolean()).optional(),
    mcp: McpConfigField,
    selected_mcp_servers: SelectedMcpServersField,
    selected_skills: SelectedSkillsField,
    permission: Permission.Config.optional(),
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
export const PermissionConfig = Permission.Config

const ProjectConfigRecord = z.object({
  projectID: z.string(),
  config: Info,
})
type ProjectConfigRecord = z.infer<typeof ProjectConfigRecord>

export const ProjectProviderConfig = z
  .object(ProviderConfigFields)
  .strict()
  .meta({
    ref: "ProjectProviderConfig",
  })
export type ProjectProviderConfig = z.infer<typeof ProjectProviderConfig>

export const ModelSelection = z
  .object(ModelSelectionFields)
  .strict()
  .meta({
    ref: "ProjectModelSelection",
  })
export type ModelSelection = z.infer<typeof ModelSelection>

export const ProjectMcpSelection = z
  .object({
    serverIDs: z.array(z.string()),
  })
  .strict()
  .meta({
    ref: "ProjectMcpSelection",
  })
export type ProjectMcpSelection = z.infer<typeof ProjectMcpSelection>

export const ProjectSkillSelection = z
  .object({
    skillIDs: z.array(z.string()),
  })
  .strict()
  .meta({
    ref: "ProjectSkillSelection",
  })
export type ProjectSkillSelection = z.infer<typeof ProjectSkillSelection>

function projectProviderConfigFromInfo(config: Info): ProjectProviderConfig {
  return {
    provider: config.provider,
    model: config.model,
    small_model: config.small_model,
    enabled_providers: config.enabled_providers,
    disabled_providers: config.disabled_providers,
  }
}

let projectConfigTableGeneration = -1

function ensureProjectConfigTable() {
  const generation = db.getDatabaseGeneration()
  if (projectConfigTableGeneration === generation && generation > 0) return
  if (db.tableExists("project_configs")) {
    projectConfigTableGeneration = db.getDatabaseGeneration()
    return
  }

  const columns = zodObjectToColumnDefs(ProjectConfigRecord)
  columns.projectID = withPrimaryKey(columns.projectID)
  db.db.run(toCreateTableSQL("project_configs", columns))
  projectConfigTableGeneration = db.getDatabaseGeneration()
}

function normalizeMcpServer(config: McpServerConfig): McpServerSummary {
  if ((config.transport ?? "stdio") === "remote") {
    const remote = config as McpRemoteServerConfig
    return {
      id: remote.id,
      name: remote.name,
      transport: "remote",
      serverUrl: remote.serverUrl,
      authorization: remote.authorization,
      headers: remote.headers,
      allowedTools: remote.allowedTools,
      requireApproval: remote.requireApproval,
      provider: remote.provider,
      connectorId: remote.connectorId,
      serverDescription: remote.serverDescription,
      enabled: remote.enabled ?? true,
      timeoutMs: remote.timeoutMs,
    }
  }

  const stdio = config as McpStdioServerConfig
  return {
    ...stdio,
    transport: "stdio",
    enabled: stdio.enabled ?? true,
  }
}

function normalizeConfigID(configID: string | undefined) {
  const trimmed = configID?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : GLOBAL_CONFIG_ID
}

function normalizeMcpServerIDs(serverIDs: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const serverID of serverIDs) {
    const trimmed = serverID.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

function normalizeSkillIDs(skillIDs: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const skillID of skillIDs) {
    const trimmed = skillID.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}

function readConfig(configID: string): Info {
  ensureProjectConfigTable()
  const row = db.findById("project_configs", ProjectConfigRecord, configID, "projectID")
  return row?.config ?? {}
}

function writeConfig(configID: string, config: Info) {
  ensureProjectConfigTable()
  db.upsert(
    "project_configs",
    {
      projectID: configID,
      config,
    },
    ["projectID"],
  )
  log.info("config-updated", {
    configID,
    keys: Object.keys(config),
  })
  return config
}

export async function get(configID = GLOBAL_CONFIG_ID) {
  return readConfig(normalizeConfigID(configID))
}

export async function set(configID: string, config: Info) {
  const parsed = Info.parse(config)
  return writeConfig(normalizeConfigID(configID), parsed)
}

export async function merge(configID: string, patch: Partial<Info>) {
  const normalizedConfigID = normalizeConfigID(configID)
  const next = Info.parse(mergeDeep(readConfig(normalizedConfigID), patch))
  return writeConfig(normalizedConfigID, next)
}

export function mergeProviderConfig(previous: Provider | undefined, provider: Provider) {
  const parsed = Provider.parse(provider)
  return Provider.parse({
    ...previous,
    ...parsed,
    env: parsed.env ?? previous?.env,
    whitelist: parsed.whitelist ?? previous?.whitelist,
    blacklist: parsed.blacklist ?? previous?.blacklist,
    models: parsed.models ? mergeDeep(previous?.models ?? {}, parsed.models) : previous?.models,
    options: parsed.options ? mergeDeep(previous?.options ?? {}, parsed.options) : previous?.options,
  })
}

export async function setProvider(configID: string, providerID: string, provider: Provider) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const previous = current.provider?.[providerID]
  const nextProvider = mergeProviderConfig(previous, provider)
  const next = Info.parse({
    ...current,
    provider: {
      ...(current.provider ?? {}),
      [providerID]: nextProvider,
    },
  })
  return writeConfig(normalizedConfigID, next)
}

export async function removeProvider(configID: string, providerID: string) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const providers = { ...(current.provider ?? {}) }
  delete providers[providerID]

  const next: Info = {
    ...current,
    provider: Object.keys(providers).length > 0 ? providers : undefined,
    model: current.model?.startsWith(`${providerID}/`) ? undefined : current.model,
    small_model: current.small_model?.startsWith(`${providerID}/`) ? undefined : current.small_model,
  }

  return writeConfig(normalizedConfigID, Info.parse(next))
}

export async function getProviderConfig(configID = GLOBAL_CONFIG_ID): Promise<ProjectProviderConfig> {
  const config = readConfig(normalizeConfigID(configID))
  return projectProviderConfigFromInfo(config)
}

export async function setModelSelection(configID: string, input: ModelSelection) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const parsed = ModelSelection.parse(input)
  const next: Info = {
    ...current,
    model: parsed.model === null ? undefined : parsed.model ?? current.model,
    small_model: parsed.small_model === null ? undefined : parsed.small_model ?? current.small_model,
  }
  return writeConfig(normalizedConfigID, Info.parse(next))
}

export async function listMcpServers(configID = GLOBAL_CONFIG_ID): Promise<McpServerSummary[]> {
  const config = readConfig(normalizeConfigID(configID))
  const servers = Object.values(config.mcp?.servers ?? {}).map((server) => normalizeMcpServer(server))
  return servers.toSorted((left, right) => left.id.localeCompare(right.id))
}

function readSelectedMcpServerIDs(configID: string) {
  const selected = readConfig(configID).selected_mcp_servers
  return selected ? normalizeMcpServerIDs(selected) : null
}

export async function getSelectedMcpServerIDs(configID: string): Promise<string[]> {
  return readSelectedMcpServerIDs(normalizeConfigID(configID)) ?? []
}

export async function setSelectedMcpServerIDs(configID: string, serverIDs: string[]) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const next: Info = {
    ...current,
    selected_mcp_servers: normalizeMcpServerIDs(serverIDs),
  }

  return writeConfig(normalizedConfigID, Info.parse(next))
}

function readSelectedSkillIDs(configID: string) {
  const selected = readConfig(configID).selected_skills
  return selected ? normalizeSkillIDs(selected) : null
}

export async function getSelectedSkillIDs(configID: string): Promise<string[]> {
  return readSelectedSkillIDs(normalizeConfigID(configID)) ?? []
}

export async function setSelectedSkillIDs(configID: string, skillIDs: string[]) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const next: Info = {
    ...current,
    selected_skills: normalizeSkillIDs(skillIDs),
  }

  return writeConfig(normalizedConfigID, Info.parse(next))
}

export async function resolveProjectMcpServers(projectID: string): Promise<McpServerSummary[]> {
  const normalizedProjectID = normalizeConfigID(projectID)
  const selectedServerIDs = readSelectedMcpServerIDs(normalizedProjectID)
  const globalServers = await listMcpServers(GLOBAL_CONFIG_ID)

  if (selectedServerIDs !== null) {
    if (selectedServerIDs.length === 0) return []

    const selectedServerIDSet = new Set(selectedServerIDs)
    return globalServers.filter((server) => selectedServerIDSet.has(server.id))
  }

  return await listMcpServers(normalizedProjectID)
}

export async function getProjectMcpServer(projectID: string, serverID: string): Promise<McpServerSummary | undefined> {
  const normalizedProjectID = normalizeConfigID(projectID)
  const trimmedServerID = serverID.trim()
  if (!trimmedServerID) return undefined

  const globalServer = await getMcpServer(GLOBAL_CONFIG_ID, trimmedServerID)
  if (globalServer) return globalServer

  return await getMcpServer(normalizedProjectID, trimmedServerID)
}

export async function getMcpServer(configID: string, serverID: string): Promise<McpServerSummary | undefined> {
  const config = readConfig(normalizeConfigID(configID))
  const server = config.mcp?.servers?.[serverID]
  if (!server) return undefined
  return normalizeMcpServer(server)
}

export async function setMcpServer(configID: string, serverID: string, server: McpServerInput) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const parsed = McpServerConfig.parse({
    ...server,
    id: serverID,
  })
  const next: Info = {
    ...current,
    mcp: {
      servers: {
        ...(current.mcp?.servers ?? {}),
        [serverID]: parsed,
      },
    },
  }
  writeConfig(normalizedConfigID, Info.parse(next))
  return normalizeMcpServer(parsed)
}

export async function removeMcpServer(configID: string, serverID: string) {
  const normalizedConfigID = normalizeConfigID(configID)
  const current = readConfig(normalizedConfigID)
  const servers = { ...(current.mcp?.servers ?? {}) }
  const removed = servers[serverID]
  delete servers[serverID]

  const next: Info = {
    ...current,
    mcp:
      Object.keys(servers).length > 0
        ? {
            servers,
          }
        : undefined,
  }
  writeConfig(normalizedConfigID, Info.parse(next))
  return removed ? normalizeMcpServer(removed) : undefined
}
