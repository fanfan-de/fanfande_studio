import { existsSync, readdirSync, readFileSync } from "node:fs"
import { delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import z from "zod"
import * as Auth from "#auth/auth.ts"
import * as Config from "#config/config.ts"
import * as db from "#database/Sqlite.ts"
import { toCreateTableSQL, withPrimaryKey, zodObjectToColumnDefs } from "#database/parser.ts"
import * as Mcp from "#mcp/manager.ts"

const INSTALLED_PLUGINS_TABLE = "installed_plugins"
const PLUGIN_MANIFEST_PATH = join(".fanfande-plugin", "plugin.json")
const DEFAULT_SKILLS_DIRECTORY = "skills"
const API_KEY_METHOD = "api-key"
const PLUGIN_APP_CONNECTOR_PREFIX = "plugin-app:"

export type PluginErrorCode =
  | "PLUGIN_NOT_FOUND"
  | "INSTALLED_PLUGIN_NOT_FOUND"
  | "PLUGIN_ALREADY_INSTALLED"
  | "PLUGIN_CONFIG_INVALID"
  | "PLUGIN_RISK_NOT_ALLOWED"
  | "PLUGIN_CONNECTOR_NOT_FOUND"
  | "PLUGIN_CONNECTOR_NOT_CONNECTED"

export class PluginError extends Error {
  readonly code: PluginErrorCode

  constructor(code: PluginErrorCode, message: string) {
    super(message)
    this.name = "PluginError"
    this.code = code
  }
}

export const PluginCategory = z.enum(["Code", "Browser", "Git", "Database", "Docs", "Automation", "Design"])
export type PluginCategory = z.infer<typeof PluginCategory>

export const PluginRisk = z.enum(["low", "medium", "high", "critical"])
export type PluginRisk = z.infer<typeof PluginRisk>

export const PluginToolPreview = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().min(1),
    readOnly: z.boolean().optional(),
    destructive: z.boolean().optional(),
  })
  .strict()
export type PluginToolPreview = z.infer<typeof PluginToolPreview>

export const PluginConfigField = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "password", "url", "path"]).optional(),
    required: z.boolean().optional(),
    secret: z.boolean().optional(),
    placeholder: z.string().optional(),
    defaultValue: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
export type PluginConfigField = z.infer<typeof PluginConfigField>

const PluginRuntimeBase = {
  timeoutMs: z.number().int().positive().optional(),
  toolPolicies: Config.McpToolPolicies,
} as const

export const PluginStdioRuntime = z
  .object({
    ...PluginRuntimeBase,
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().min(1).optional(),
  })
  .strict()
export type PluginStdioRuntime = z.infer<typeof PluginStdioRuntime>

export const PluginRemoteRuntime = z
  .object({
    ...PluginRuntimeBase,
    transport: z.literal("remote"),
    provider: Config.McpRemoteProvider.optional(),
    serverUrl: z.string().min(1).optional(),
    connectorId: z.string().min(1).optional(),
    authorization: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    serverDescription: z.string().min(1).optional(),
    allowedTools: Config.McpAllowedTools,
    requireApproval: Config.McpRequireApproval,
  })
  .strict()
export type PluginRemoteRuntime = z.infer<typeof PluginRemoteRuntime>

export const PluginRuntimeTemplate = z.union([PluginStdioRuntime, PluginRemoteRuntime])
export type PluginRuntimeTemplate = z.infer<typeof PluginRuntimeTemplate>

const PluginDiagnosticTool = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1).optional(),
    displayName: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.unknown().optional(),
    annotations: z.record(z.string(), z.unknown()).optional(),
    riskHint: z.enum(["read-only", "destructive", "open-world", "unknown"]),
    recommendedPolicy: Config.McpToolPolicyValue,
  })
  .strict()

const PluginDiagnostic = z
  .object({
    serverID: z.string(),
    enabled: z.boolean(),
    ok: z.boolean(),
    toolCount: z.number(),
    toolNames: z.array(z.string()),
    tools: z.array(PluginDiagnosticTool),
    error: z.string().optional(),
  })
  .strict()
type PluginDiagnostic = z.infer<typeof PluginDiagnostic>

export const PluginMcpServerCatalogEntry = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    risk: PluginRisk.optional(),
    permissions: z.array(z.string()).optional(),
    tools: z.array(PluginToolPreview),
    configFields: z.array(PluginConfigField).optional(),
    runtime: PluginRuntimeTemplate,
    installReview: z.array(z.string()).optional(),
  })
  .strict()
export type PluginMcpServerCatalogEntry = z.infer<typeof PluginMcpServerCatalogEntry>

export const PluginSkillPreview = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    directory: z.string().min(1),
  })
  .strict()
export type PluginSkillPreview = z.infer<typeof PluginSkillPreview>

export const PluginAppConnector = z
  .object({
    appID: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
    risk: PluginRisk.optional(),
    permissions: z.array(z.string()).optional(),
    tools: z.array(PluginToolPreview).optional(),
    credential: PluginConfigField,
    runtime: PluginRemoteRuntime,
    installReview: z.array(z.string()).optional(),
  })
  .strict()
export type PluginAppConnector = z.infer<typeof PluginAppConnector>

export const PluginConnectorStatus = z
  .object({
    pluginID: z.string().min(1),
    appID: z.string().min(1),
    connectorID: z.string().min(1),
    connected: z.boolean(),
    credentialLabel: z.string().optional(),
    generatedMcpServerID: z.string().min(1),
    lastDiagnostic: PluginDiagnostic.optional(),
  })
  .strict()
export type PluginConnectorStatus = z.infer<typeof PluginConnectorStatus>

const PluginAuthor = z.union([
  z.string().min(1),
  z
    .object({
      name: z.string().min(1),
      email: z.string().optional(),
      url: z.string().optional(),
    })
    .passthrough(),
])

const PluginInterface = z
  .object({
    displayName: z.string().optional(),
    shortDescription: z.string().optional(),
    longDescription: z.string().optional(),
    developerName: z.string().optional(),
    category: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    websiteURL: z.string().optional(),
    privacyPolicyURL: z.string().optional(),
    termsOfServiceURL: z.string().optional(),
    defaultPrompt: z.union([z.string(), z.array(z.string())]).optional(),
    composerIcon: z.string().optional(),
    logo: z.string().optional(),
    screenshots: z.array(z.string()).optional(),
    brandColor: z.string().optional(),
  })
  .passthrough()
export type PluginInterface = z.infer<typeof PluginInterface>

const PluginManifestMcpServer = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    risk: PluginRisk.optional(),
    permissions: z.array(z.string()).optional(),
    tools: z.array(PluginToolPreview).optional(),
    configFields: z.array(PluginConfigField).optional(),
    runtime: PluginRuntimeTemplate,
    installReview: z.array(z.string()).optional(),
  })
  .strict()
type PluginManifestMcpServer = z.infer<typeof PluginManifestMcpServer>

export const PluginManifest = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().min(1),
    author: PluginAuthor.optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    interface: PluginInterface.optional(),
    mcpServers: z.array(PluginManifestMcpServer).optional(),
    skills: z.union([z.string(), z.array(z.string())]).optional(),
    apps: z.array(PluginAppConnector).optional(),
    commands: z.union([z.string(), z.array(z.string())]).optional(),
    agents: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict()
export type PluginManifest = z.infer<typeof PluginManifest>

export const PluginCatalogItem = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().min(1),
    publisher: z.string().min(1),
    category: PluginCategory,
    icon: z.string().optional(),
    homepage: z.string().optional(),
    documentationUrl: z.string().optional(),
    risk: PluginRisk,
    permissions: z.array(z.string()),
    tools: z.array(PluginToolPreview),
    configFields: z.array(PluginConfigField),
    runtime: PluginRuntimeTemplate.optional(),
    mcpServers: z.array(PluginMcpServerCatalogEntry),
    skills: z.array(PluginSkillPreview),
    apps: z.array(PluginAppConnector),
    installReview: z.array(z.string()).optional(),
  })
  .strict()
export type PluginCatalogItem = z.infer<typeof PluginCatalogItem>

export const InstalledPlugin = z
  .object({
    pluginID: z.string().min(1),
    version: z.string().min(1),
    enabled: z.boolean(),
    mcpServerID: z.string().min(1).optional(),
    mcpServerIDs: z.array(z.string()).optional(),
    skillIDs: z.array(z.string()).optional(),
    connectorIDs: z.array(z.string()).optional(),
    config: z.record(z.string(), z.string()),
    installedAt: z.number().int().positive(),
    updatedAt: z.number().int().positive(),
    lastDiagnostic: PluginDiagnostic.optional(),
    lastConnectorDiagnostics: z.record(z.string(), PluginDiagnostic).optional(),
  })
  .strict()
export type InstalledPlugin = Omit<
  z.infer<typeof InstalledPlugin>,
  "mcpServerIDs" | "skillIDs" | "connectorIDs" | "lastConnectorDiagnostics"
> & {
  mcpServerIDs: string[]
  skillIDs: string[]
  connectorIDs: string[]
  lastConnectorDiagnostics?: Record<string, PluginDiagnostic>
}

export const InstallPluginInput = z
  .object({
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.string()).optional(),
  })
  .strict()
export type InstallPluginInput = z.infer<typeof InstallPluginInput>

export const UpdateInstalledPluginInput = z
  .object({
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.string()).optional(),
  })
  .strict()
export type UpdateInstalledPluginInput = z.infer<typeof UpdateInstalledPluginInput>

export const SavePluginConnectorApiKeyInput = z
  .object({
    apiKey: z.string().nullable().optional(),
  })
  .strict()
export type SavePluginConnectorApiKeyInput = z.infer<typeof SavePluginConnectorApiKeyInput>

let installedPluginsTableGeneration = -1

function ensureInstalledPluginsTable() {
  const generation = db.getDatabaseGeneration()
  if (installedPluginsTableGeneration === generation && generation > 0) return

  if (db.tableExists(INSTALLED_PLUGINS_TABLE)) {
    db.syncTableColumnsWithZodObject(INSTALLED_PLUGINS_TABLE, InstalledPlugin)
    installedPluginsTableGeneration = db.getDatabaseGeneration()
    return
  }

  const columns = zodObjectToColumnDefs(InstalledPlugin)
  columns.pluginID = withPrimaryKey(columns.pluginID)
  db.db.run(toCreateTableSQL(INSTALLED_PLUGINS_TABLE, columns))
  installedPluginsTableGeneration = db.getDatabaseGeneration()
}

function normalizePluginID(pluginID: string) {
  return normalizeManifestID(pluginID)
}

function normalizeManifestID(id: string) {
  return id.trim().toLowerCase()
}

function normalizeServerTemplateID(serverID: string | undefined) {
  const trimmed = serverID?.trim()
  return trimmed || "default"
}

function now() {
  return Date.now()
}

function uniqueStrings(items: Array<string | undefined>) {
  return [...new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))]
}

function riskWeight(risk: PluginRisk) {
  return ["low", "medium", "high", "critical"].indexOf(risk)
}

function highestRisk(items: Array<PluginRisk | undefined>) {
  return items.reduce<PluginRisk>((result, item) => {
    if (!item) return result
    return riskWeight(item) > riskWeight(result) ? item : result
  }, "low")
}

function normalizeCategory(category: string | undefined): PluginCategory {
  const value = category?.trim()
  if (value && PluginCategory.safeParse(value).success) return value as PluginCategory

  const normalized = value?.toLowerCase()
  if (normalized === "engineering" || normalized === "coding") return "Code"
  if (normalized === "productivity" || normalized === "documentation") return "Docs"

  return "Code"
}

function authorName(author: PluginManifest["author"]) {
  if (!author) return "Unknown"
  return typeof author === "string" ? author : author.name
}

function safeReadPluginManifest(packageRoot: string) {
  const manifestPath = join(packageRoot, PLUGIN_MANIFEST_PATH)
  if (!existsSync(manifestPath)) return undefined

  try {
    const raw = readFileSync(manifestPath, "utf8")
    return PluginManifest.parse(JSON.parse(raw))
  } catch {
    return undefined
  }
}

function packageSearchRoots() {
  const roots: string[] = []
  const moduleRoot = dirname(fileURLToPath(import.meta.url))
  const builtinRoots = [
    join(moduleRoot, "plugins", "builtin"),
    resolve(moduleRoot, "..", "..", "plugins", "builtin"),
  ]
  roots.push(...builtinRoots.filter((root) => existsSync(root)))

  const configured = process.env["FanFande_PLUGIN_PACKAGE_DIRS"]?.trim()
  if (configured) {
    roots.push(...configured.split(delimiter).map((entry) => entry.trim()).filter(Boolean))
  }

  return uniqueStrings(roots.map((root) => resolve(root)))
}

function readPackageManifestsFromRoot(root: string) {
  if (!existsSync(root)) return []

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageRoot = join(root, entry.name)
      const manifest = safeReadPluginManifest(packageRoot)
      return manifest ? [{ manifest, packageRoot }] : []
    })
}

function listManifestSources() {
  const sources: Array<{ manifest: PluginManifest; packageRoot?: string }> = []
  for (const root of packageSearchRoots()) {
    sources.push(...readPackageManifestsFromRoot(root))
  }

  const byID = new Map<string, { manifest: PluginManifest; packageRoot?: string }>()
  for (const source of sources) {
    byID.set(normalizeManifestID(source.manifest.name), source)
  }

  return [...byID.values()]
}

function skillIDForPlugin(pluginID: string, directoryName: string) {
  return `plugin:${pluginID}:${directoryName}`
}

function skillDirectoryDeclarations(manifest: PluginManifest) {
  const declaration = manifest.skills ?? DEFAULT_SKILLS_DIRECTORY
  return Array.isArray(declaration) ? declaration : [declaration]
}

function resolvePackageRelativePath(packageRoot: string, relativePath: string) {
  const resolved = resolve(packageRoot, relativePath)
  const normalizedRoot = resolve(packageRoot)
  const relativePathFromRoot = relative(normalizedRoot, resolved)
  if (relativePathFromRoot.startsWith("..") || isAbsolute(relativePathFromRoot)) {
    return undefined
  }

  return resolved
}

function firstParagraph(markdown: string) {
  for (const section of markdown.split(/\r?\n\s*\r?\n/)) {
    const collapsed = section
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^#+\s*/, "")
      .trim()
    if (collapsed) return collapsed
  }

  return ""
}

function discoverSkillPreviews(pluginID: string, manifest: PluginManifest, packageRoot?: string): PluginSkillPreview[] {
  if (!packageRoot) return []

  return skillDirectoryDeclarations(manifest).flatMap((directory) => {
    const root = resolvePackageRelativePath(packageRoot, directory)
    if (!root || !existsSync(root)) return []

    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const skillPath = join(root, entry.name, "SKILL.md")
        if (!existsSync(skillPath)) return []

        const raw = readFileSync(skillPath, "utf8")
        const parsed = matter(raw)
        const frontmatter = parsed.data as { name?: unknown; description?: unknown }
        const name = typeof frontmatter.name === "string" && frontmatter.name.trim()
          ? frontmatter.name.trim()
          : entry.name
        const description = typeof frontmatter.description === "string" && frontmatter.description.trim()
          ? frontmatter.description.trim()
          : firstParagraph(parsed.content) || name

        return [{
          id: skillIDForPlugin(pluginID, entry.name),
          name,
          description,
          directory: entry.name,
        }]
      })
  })
}

function normalizeMcpServers(manifest: PluginManifest): PluginMcpServerCatalogEntry[] {
  return (manifest.mcpServers ?? []).map((server) => {
    const serverID = normalizeServerTemplateID(server.id)
    return PluginMcpServerCatalogEntry.parse({
      id: serverID,
      name: server.name ?? manifest.interface?.displayName ?? manifest.name,
      description: server.description ?? manifest.description,
      risk: server.risk ?? "medium",
      permissions: server.permissions ?? [],
      tools: server.tools ?? [],
      configFields: server.configFields ?? [],
      runtime: server.runtime,
      installReview: server.installReview ?? [],
    })
  })
}

function normalizeCatalogItem(source: { manifest: PluginManifest; packageRoot?: string }): PluginCatalogItem {
  const { manifest, packageRoot } = source
  const pluginID = normalizeManifestID(manifest.name)
  const mcpServers = normalizeMcpServers(manifest)
  const apps = manifest.apps ?? []
  const skills = discoverSkillPreviews(pluginID, manifest, packageRoot)
  const icon = manifest.interface?.logo ?? manifest.interface?.composerIcon
  const risk = highestRisk([
    ...mcpServers.map((server) => server.risk),
    ...apps.map((app) => app.risk ?? "medium"),
    skills.length > 0 ? "low" : undefined,
  ])

  return PluginCatalogItem.parse({
    id: pluginID,
    name: manifest.interface?.displayName ?? manifest.name,
    description: manifest.interface?.shortDescription ?? manifest.description,
    version: manifest.version,
    publisher: manifest.interface?.developerName ?? authorName(manifest.author),
    category: normalizeCategory(manifest.interface?.category),
    icon,
    homepage: manifest.homepage ?? manifest.interface?.websiteURL,
    documentationUrl: manifest.repository ?? manifest.homepage ?? manifest.interface?.websiteURL,
    risk,
    permissions: uniqueStrings([
      ...mcpServers.flatMap((server) => server.permissions ?? []),
      ...apps.flatMap((app) => app.permissions ?? []),
    ]),
    tools: [
      ...mcpServers.flatMap((server) => server.tools),
      ...apps.flatMap((app) => app.tools ?? []),
    ],
    configFields: dedupeConfigFields(mcpServers.flatMap((server) => server.configFields ?? [])),
    runtime: mcpServers[0]?.runtime,
    mcpServers,
    skills,
    apps,
    installReview: uniqueStrings([
      ...mcpServers.flatMap((server) => server.installReview ?? []),
      ...apps.flatMap((app) => app.installReview ?? []),
    ]),
  })
}

function dedupeConfigFields(fields: PluginConfigField[]) {
  const byKey = new Map<string, PluginConfigField>()
  for (const field of fields) {
    if (!byKey.has(field.key)) byKey.set(field.key, field)
  }
  return [...byKey.values()]
}

function listCatalogInternal() {
  return listManifestSources().map(normalizeCatalogItem)
}

export function mcpServerIDForPlugin(pluginID: string, serverID?: string) {
  const normalizedPluginID = normalizePluginID(pluginID)
  const normalizedServerID = normalizeServerTemplateID(serverID)
  return normalizedServerID === "default"
    ? `plugin.${normalizedPluginID}`
    : `plugin.${normalizedPluginID}.${normalizedServerID}`
}

export function connectorIDForPluginApp(pluginID: string, appID: string) {
  return `${PLUGIN_APP_CONNECTOR_PREFIX}${normalizePluginID(pluginID)}:${appID.trim()}`
}

export function mcpServerIDForPluginApp(pluginID: string, appID: string) {
  return `plugin.${normalizePluginID(pluginID)}.app.${appID.trim()}`
}

function parsePluginAppConnectorID(connectorID: string) {
  if (!connectorID.startsWith(PLUGIN_APP_CONNECTOR_PREFIX)) return undefined
  const rest = connectorID.slice(PLUGIN_APP_CONNECTOR_PREFIX.length)
  const separator = rest.indexOf(":")
  if (separator <= 0 || separator === rest.length - 1) return undefined

  return {
    pluginID: rest.slice(0, separator),
    appID: rest.slice(separator + 1),
  }
}

function assertCatalogPlugin(pluginID: string) {
  const normalizedPluginID = normalizePluginID(pluginID)
  const item = listCatalogInternal().find((entry) => entry.id === normalizedPluginID)
  if (!item) {
    throw new PluginError("PLUGIN_NOT_FOUND", `Plugin '${pluginID}' was not found in the curated catalog.`)
  }

  if (item.risk === "critical") {
    throw new PluginError("PLUGIN_RISK_NOT_ALLOWED", `Plugin '${pluginID}' has a risk level that is not allowed.`)
  }

  return item
}

function assertPluginApp(plugin: PluginCatalogItem, appID: string) {
  const app = plugin.apps.find((item) => item.appID === appID.trim())
  if (!app) {
    throw new PluginError("PLUGIN_CONNECTOR_NOT_FOUND", `Plugin '${plugin.id}' does not declare app '${appID}'.`)
  }

  return app
}

function normalizeInstalledRecord(record: z.infer<typeof InstalledPlugin> | null | undefined): InstalledPlugin | null {
  if (!record) return null
  const mcpServerIDs = uniqueStrings([...(record.mcpServerIDs ?? []), record.mcpServerID])
  const skillIDs = uniqueStrings(record.skillIDs ?? [])
  const connectorIDs = uniqueStrings(record.connectorIDs ?? [])

  return {
    ...record,
    mcpServerID: record.mcpServerID ?? mcpServerIDs[0],
    mcpServerIDs,
    skillIDs,
    connectorIDs,
    lastConnectorDiagnostics: record.lastConnectorDiagnostics ?? {},
  }
}

function readInstalled(pluginID: string) {
  ensureInstalledPluginsTable()
  return normalizeInstalledRecord(
    db.findById(INSTALLED_PLUGINS_TABLE, InstalledPlugin, normalizePluginID(pluginID), "pluginID"),
  )
}

function requiredConfigValue(plugin: PluginCatalogItem, config: Record<string, string>, field: PluginConfigField) {
  const explicitValue = config[field.key]?.trim()
  if (explicitValue) return explicitValue

  const defaultValue = field.defaultValue?.trim()
  if (defaultValue) return defaultValue

  if (field.required) {
    throw new PluginError("PLUGIN_CONFIG_INVALID", `${plugin.name} requires '${field.label}'.`)
  }

  return ""
}

function normalizeConfig(plugin: PluginCatalogItem, config: Record<string, string> | undefined) {
  const raw = config ?? {}
  const normalized: Record<string, string> = {}
  for (const field of plugin.configFields) {
    const value = requiredConfigValue(plugin, raw, field)
    if (value) {
      normalized[field.key] = value
    }
  }

  for (const [key, value] of Object.entries(raw)) {
    if (!key.trim()) continue
    if (normalized[key] !== undefined) continue
    normalized[key] = value
  }

  return normalized
}

function replacePlaceholders(value: string, config: Record<string, string>) {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, key: string) => config[key] ?? "")
}

function replaceOptionalPlaceholders(value: string | undefined, config: Record<string, string>) {
  if (!value) return undefined
  const replaced = replacePlaceholders(value, config).trim()
  return replaced ? replaced : undefined
}

function replaceRecordPlaceholders(record: Record<string, string> | undefined, config: Record<string, string>) {
  if (!record) return undefined

  const entries = Object.entries(record)
    .map(([key, value]) => [key, replacePlaceholders(value, config)] as const)
    .filter(([key, value]) => key.trim() && value.trim())

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function runtimeBindingForMcpServer(
  plugin: PluginCatalogItem,
  server: PluginMcpServerCatalogEntry,
  installed: InstalledPlugin,
): Config.McpServerInput {
  const serverName = server.name || plugin.name
  const enabled = installed.enabled

  if (server.runtime.transport === "stdio") {
    return {
      name: serverName,
      transport: "stdio",
      command: replacePlaceholders(server.runtime.command, installed.config),
      args: server.runtime.args?.map((arg) => replacePlaceholders(arg, installed.config)),
      env: replaceRecordPlaceholders(server.runtime.env, installed.config),
      cwd: replaceOptionalPlaceholders(server.runtime.cwd, installed.config),
      toolPolicies: server.runtime.toolPolicies,
      enabled,
      timeoutMs: server.runtime.timeoutMs,
    }
  }

  return {
    name: serverName,
    transport: "remote",
    provider: server.runtime.provider,
    serverUrl: replaceOptionalPlaceholders(server.runtime.serverUrl, installed.config),
    connectorId: replaceOptionalPlaceholders(server.runtime.connectorId, installed.config),
    authorization: replaceOptionalPlaceholders(server.runtime.authorization, installed.config),
    headers: replaceRecordPlaceholders(server.runtime.headers, installed.config),
    serverDescription: server.runtime.serverDescription,
    allowedTools: server.runtime.allowedTools,
    toolPolicies: server.runtime.toolPolicies,
    requireApproval: server.runtime.requireApproval,
    enabled,
    timeoutMs: server.runtime.timeoutMs,
  }
}

function runtimeBindingForAppConnector(
  plugin: PluginCatalogItem,
  app: PluginAppConnector,
  installed: InstalledPlugin,
): Config.McpServerInput {
  return {
    name: `${plugin.name}: ${app.name}`,
    transport: "remote",
    provider: app.runtime.provider,
    connectorId: connectorIDForPluginApp(plugin.id, app.appID),
    serverDescription: app.runtime.serverDescription,
    allowedTools: app.runtime.allowedTools,
    toolPolicies: app.runtime.toolPolicies,
    requireApproval: app.runtime.requireApproval,
    enabled: installed.enabled,
    timeoutMs: app.runtime.timeoutMs,
  }
}

function generatedMcpServerIDs(plugin: PluginCatalogItem) {
  return [
    ...plugin.mcpServers.map((server) => mcpServerIDForPlugin(plugin.id, server.id)),
    ...plugin.apps.map((app) => mcpServerIDForPluginApp(plugin.id, app.appID)),
  ]
}

function generatedSkillIDs(plugin: PluginCatalogItem) {
  return plugin.skills.map((skill) => skill.id)
}

function generatedConnectorIDs(plugin: PluginCatalogItem) {
  return plugin.apps.map((app) => connectorIDForPluginApp(plugin.id, app.appID))
}

async function syncPluginRuntimeBindings(plugin: PluginCatalogItem, installed: InstalledPlugin) {
  for (const server of plugin.mcpServers) {
    await Config.setMcpServer(
      Config.GLOBAL_CONFIG_ID,
      mcpServerIDForPlugin(plugin.id, server.id),
      runtimeBindingForMcpServer(plugin, server, installed),
    )
  }

  for (const app of plugin.apps) {
    await Config.setMcpServer(
      Config.GLOBAL_CONFIG_ID,
      mcpServerIDForPluginApp(plugin.id, app.appID),
      runtimeBindingForAppConnector(plugin, app, installed),
    )
  }
}

async function writeInstalled(record: InstalledPlugin) {
  ensureInstalledPluginsTable()
  const plugin = assertCatalogPlugin(record.pluginID)
  const parsed = normalizeInstalledRecord(InstalledPlugin.parse(record))
  if (!parsed) throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${record.pluginID}' is not installed.`)

  db.upsert(INSTALLED_PLUGINS_TABLE, parsed, ["pluginID"])
  await syncPluginRuntimeBindings(plugin, parsed)
  return parsed
}

export function listCatalog() {
  return listCatalogInternal().toSorted((left, right) => {
    const category = left.category.localeCompare(right.category)
    return category === 0 ? left.name.localeCompare(right.name) : category
  })
}

export function getCatalogItem(pluginID: string) {
  return listCatalogInternal().find((entry) => entry.id === normalizePluginID(pluginID))
}

export function listInstalled() {
  ensureInstalledPluginsTable()
  return db.findManyWithSchema(INSTALLED_PLUGINS_TABLE, InstalledPlugin)
    .map((record) => normalizeInstalledRecord(record))
    .filter((record): record is InstalledPlugin => Boolean(record))
    .toSorted((left, right) => left.pluginID.localeCompare(right.pluginID))
}

export function getInstalled(pluginID: string) {
  return readInstalled(pluginID)
}

export async function install(pluginID: string, input: InstallPluginInput) {
  const plugin = assertCatalogPlugin(pluginID)
  const existing = readInstalled(plugin.id)
  const timestamp = now()
  const record: InstalledPlugin = {
    pluginID: plugin.id,
    version: plugin.version,
    enabled: input.enabled ?? existing?.enabled ?? true,
    mcpServerID: existing?.mcpServerID ?? generatedMcpServerIDs(plugin)[0],
    mcpServerIDs: generatedMcpServerIDs(plugin),
    skillIDs: generatedSkillIDs(plugin),
    connectorIDs: generatedConnectorIDs(plugin),
    config: normalizeConfig(plugin, input.config ?? existing?.config),
    installedAt: existing?.installedAt ?? timestamp,
    updatedAt: timestamp,
    lastDiagnostic: existing?.lastDiagnostic,
    lastConnectorDiagnostics: existing?.lastConnectorDiagnostics,
  }

  return writeInstalled(record)
}

export async function update(pluginID: string, input: UpdateInstalledPluginInput) {
  const plugin = assertCatalogPlugin(pluginID)
  const existing = readInstalled(plugin.id)
  if (!existing) {
    throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${pluginID}' is not installed.`)
  }

  const record: InstalledPlugin = {
    ...existing,
    version: plugin.version,
    enabled: input.enabled ?? existing.enabled,
    mcpServerID: existing.mcpServerID ?? generatedMcpServerIDs(plugin)[0],
    mcpServerIDs: generatedMcpServerIDs(plugin),
    skillIDs: generatedSkillIDs(plugin),
    connectorIDs: generatedConnectorIDs(plugin),
    config: normalizeConfig(plugin, input.config ?? existing.config),
    updatedAt: now(),
  }

  return writeInstalled(record)
}

export async function remove(pluginID: string) {
  const normalizedPluginID = normalizePluginID(pluginID)
  const existing = readInstalled(normalizedPluginID)
  const plugin = getCatalogItem(normalizedPluginID)
  const mcpServerIDs = existing?.mcpServerIDs ?? (plugin ? generatedMcpServerIDs(plugin) : [mcpServerIDForPlugin(normalizedPluginID)])
  const connectorIDs = existing?.connectorIDs ?? (plugin ? generatedConnectorIDs(plugin) : [])

  ensureInstalledPluginsTable()
  const removedCount = existing ? db.deleteById(INSTALLED_PLUGINS_TABLE, normalizedPluginID, "pluginID") : 0
  await Promise.all(mcpServerIDs.map((serverID) => Config.removeMcpServer(Config.GLOBAL_CONFIG_ID, serverID)))
  await Promise.all(connectorIDs.map((connectorID) => Auth.clearProvider(connectorID)))

  return {
    pluginID: normalizedPluginID,
    mcpServerID: mcpServerIDs[0],
    mcpServerIDs,
    connectorIDs,
    removed: removedCount > 0,
  }
}

export async function diagnose(pluginID: string) {
  const normalizedPluginID = normalizePluginID(pluginID)
  const plugin = assertCatalogPlugin(normalizedPluginID)
  const installed = readInstalled(normalizedPluginID)
  if (!installed) {
    throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${pluginID}' is not installed.`)
  }

  const serverID = installed.mcpServerIDs[0] ?? generatedMcpServerIDs(plugin)[0]
  if (!serverID) {
    throw new PluginError(
      "INSTALLED_PLUGIN_NOT_FOUND",
      `Plugin '${pluginID}' does not have a generated MCP server binding.`,
    )
  }

  const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, serverID)
  if (!server) {
    throw new PluginError(
      "INSTALLED_PLUGIN_NOT_FOUND",
      `Plugin '${pluginID}' does not have a generated MCP server binding.`,
    )
  }

  const diagnostic = await Mcp.diagnoseServer(server)
  const record: InstalledPlugin = {
    ...installed,
    updatedAt: now(),
    lastDiagnostic: diagnostic,
  }
  ensureInstalledPluginsTable()
  db.upsert(INSTALLED_PLUGINS_TABLE, record, ["pluginID"])
  return diagnostic
}

export async function listConnectorStatuses(pluginID: string): Promise<PluginConnectorStatus[]> {
  const plugin = assertCatalogPlugin(pluginID)
  const installed = readInstalled(plugin.id)
  if (!installed) {
    throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${pluginID}' is not installed.`)
  }

  return Promise.all(plugin.apps.map(async (app) => connectorStatusFor(plugin, installed, app)))
}

async function connectorStatusFor(
  plugin: PluginCatalogItem,
  installed: InstalledPlugin,
  app: PluginAppConnector,
): Promise<PluginConnectorStatus> {
  const connectorID = connectorIDForPluginApp(plugin.id, app.appID)
  const activeCredential = await Auth.getActiveProviderCredential(connectorID)
  const credential = activeCredential?.credential

  return {
    pluginID: plugin.id,
    appID: app.appID,
    connectorID,
    connected: credential?.kind === "api_key",
    credentialLabel: credential?.kind === "api_key" ? credential.label ?? "API key" : undefined,
    generatedMcpServerID: mcpServerIDForPluginApp(plugin.id, app.appID),
    lastDiagnostic: installed.lastConnectorDiagnostics?.[app.appID],
  }
}

export async function saveConnectorApiKey(pluginID: string, appID: string, input: SavePluginConnectorApiKeyInput) {
  const plugin = assertCatalogPlugin(pluginID)
  const installed = readInstalled(plugin.id)
  if (!installed) {
    throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${pluginID}' is not installed.`)
  }

  const app = assertPluginApp(plugin, appID)
  const connectorID = connectorIDForPluginApp(plugin.id, app.appID)
  const apiKey = input.apiKey?.trim()

  if (!apiKey) {
    await Auth.clearProvider(connectorID)
  } else {
    await Auth.setProviderCredential(
      connectorID,
      API_KEY_METHOD,
      {
        kind: "api_key",
        apiKey,
        label: app.credential.label,
      },
      { activate: true, lastError: null },
    )
  }

  const record: InstalledPlugin = {
    ...installed,
    updatedAt: now(),
  }
  ensureInstalledPluginsTable()
  db.upsert(INSTALLED_PLUGINS_TABLE, record, ["pluginID"])
  return connectorStatusFor(plugin, record, app)
}

export async function removeConnectorApiKey(pluginID: string, appID: string) {
  return saveConnectorApiKey(pluginID, appID, { apiKey: null })
}

export async function diagnoseConnector(pluginID: string, appID: string) {
  const plugin = assertCatalogPlugin(pluginID)
  const installed = readInstalled(plugin.id)
  if (!installed) {
    throw new PluginError("INSTALLED_PLUGIN_NOT_FOUND", `Plugin '${pluginID}' is not installed.`)
  }

  const app = assertPluginApp(plugin, appID)
  const serverID = mcpServerIDForPluginApp(plugin.id, app.appID)
  const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, serverID)
  if (!server) {
    throw new PluginError(
      "INSTALLED_PLUGIN_NOT_FOUND",
      `Plugin '${pluginID}' app '${appID}' does not have a generated MCP server binding.`,
    )
  }

  const diagnostic = await Mcp.diagnoseServer(server)
  const record: InstalledPlugin = {
    ...installed,
    updatedAt: now(),
    lastConnectorDiagnostics: {
      ...(installed.lastConnectorDiagnostics ?? {}),
      [app.appID]: diagnostic,
    },
  }
  ensureInstalledPluginsTable()
  db.upsert(INSTALLED_PLUGINS_TABLE, record, ["pluginID"])
  return diagnostic
}

export async function resolveConnectorRemoteServer(connectorID: string): Promise<{
  serverUrl: string
  authorization?: string
  headers?: Record<string, string>
}> {
  const parsed = parsePluginAppConnectorID(connectorID)
  if (!parsed) {
    throw new PluginError("PLUGIN_CONNECTOR_NOT_FOUND", `Connector '${connectorID}' is not a plugin app connector.`)
  }

  const plugin = assertCatalogPlugin(parsed.pluginID)
  const installed = readInstalled(plugin.id)
  if (!installed || !installed.enabled) {
    throw new PluginError("PLUGIN_CONNECTOR_NOT_CONNECTED", `Plugin '${plugin.id}' is not installed or enabled.`)
  }

  const app = assertPluginApp(plugin, parsed.appID)
  const activeCredential = await Auth.getActiveProviderCredential(connectorID)
  if (activeCredential?.credential.kind !== "api_key") {
    throw new PluginError("PLUGIN_CONNECTOR_NOT_CONNECTED", `${app.name} is not connected.`)
  }

  const config = {
    ...installed.config,
    [app.credential.key]: activeCredential.credential.apiKey,
  }
  const serverUrl = replaceOptionalPlaceholders(app.runtime.serverUrl, config)
  if (!serverUrl) {
    throw new PluginError("PLUGIN_CONNECTOR_NOT_FOUND", `${app.name} does not declare a remote MCP server URL.`)
  }

  return {
    serverUrl,
    authorization: replaceOptionalPlaceholders(app.runtime.authorization, config),
    headers: replaceRecordPlaceholders(app.runtime.headers, config),
  }
}

export function listInstalledPluginSkillRoots(): Array<{
  pluginID: string
  root: string
}> {
  const installedByID = new Map(listInstalled().filter((plugin) => plugin.enabled).map((plugin) => [plugin.pluginID, plugin]))

  return listManifestSources().flatMap((source) => {
    const pluginID = normalizeManifestID(source.manifest.name)
    if (!installedByID.has(pluginID) || !source.packageRoot) return []

    return skillDirectoryDeclarations(source.manifest)
      .map((directory) => resolvePackageRelativePath(source.packageRoot!, directory))
      .filter((root): root is string => Boolean(root && existsSync(root)))
      .map((root) => ({ pluginID, root }))
  })
}
