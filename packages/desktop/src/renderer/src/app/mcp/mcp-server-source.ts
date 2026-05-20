import type { InstalledPlugin, McpServerSummary, PluginCatalogItem } from "../types"

export interface McpServerPluginSource {
  pluginID: string
  pluginName?: string
}

function normalizePluginID(pluginID: string) {
  return pluginID.trim().toLowerCase()
}

function generatedMcpServerPluginIDFallback(serverID: string) {
  if (!serverID.startsWith("plugin.")) return null

  const generatedID = serverID.slice("plugin.".length)
  if (!generatedID) return null

  const connectorSeparatorIndex = generatedID.indexOf(".connector.")
  if (connectorSeparatorIndex > 0) return generatedID.slice(0, connectorSeparatorIndex)

  const legacyAppSeparatorIndex = generatedID.indexOf(".app.")
  if (legacyAppSeparatorIndex > 0) return generatedID.slice(0, legacyAppSeparatorIndex)

  return generatedID.split(".")[0] ?? null
}

export function buildMcpServerPluginSourceMap(
  installedPlugins: InstalledPlugin[] = [],
  pluginCatalog: PluginCatalogItem[] = [],
) {
  const pluginNamesByID = new Map(pluginCatalog.map((plugin) => [normalizePluginID(plugin.id), plugin.name]))
  const sourcesByServerID = new Map<string, McpServerPluginSource>()

  for (const installedPlugin of installedPlugins) {
    const normalizedPluginID = normalizePluginID(installedPlugin.pluginID)
    const source: McpServerPluginSource = {
      pluginID: installedPlugin.pluginID,
      pluginName: pluginNamesByID.get(normalizedPluginID) ?? installedPlugin.pluginID,
    }
    const serverIDs = new Set([
      installedPlugin.mcpServerID,
      ...installedPlugin.mcpServerIDs,
    ].filter((serverID): serverID is string => Boolean(serverID)))

    for (const serverID of serverIDs) {
      sourcesByServerID.set(serverID, source)
    }
  }

  return sourcesByServerID
}

export function getMcpServerPluginSource(
  server: McpServerSummary,
  sourcesByServerID: ReadonlyMap<string, McpServerPluginSource>,
): McpServerPluginSource | null {
  const exactSource = sourcesByServerID.get(server.id)
  if (exactSource) return exactSource

  const fallbackPluginID = generatedMcpServerPluginIDFallback(server.id)
  return fallbackPluginID ? { pluginID: fallbackPluginID } : null
}

export function getMcpServerPluginSourceTitle(source: McpServerPluginSource) {
  const pluginName = source.pluginName?.trim()
  return pluginName ? `From plugin: ${pluginName}` : "From plugin"
}

export function getMcpServerPluginSourceAriaLabel(source: McpServerPluginSource) {
  const pluginName = source.pluginName?.trim()
  return pluginName ? `from plugin ${pluginName}` : "from plugin"
}

export function getMcpServerPluginSourceSearchText(source: McpServerPluginSource | null) {
  if (!source) return ""

  return [
    "plugin",
    "from plugin",
    source.pluginID,
    source.pluginName ?? "",
  ].join(" ")
}
