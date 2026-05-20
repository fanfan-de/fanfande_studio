import { existsSync, readFileSync } from "node:fs"
import { delimiter } from "node:path"
import z from "zod"
import * as Auth from "#auth/auth.ts"
import * as ProviderAuth from "#auth/provider-auth.ts"
import * as Config from "#config/config.ts"
import * as Mcp from "#mcp/manager.ts"
import { getProcessEnvValue } from "#env/compat.ts"

const API_KEY_METHOD = "api-key"
const CONNECTOR_PREFIX = "connector:"
const PLUGIN_CONNECTOR_PREFIX = "plugin-connector:"
const LEGACY_PLUGIN_APP_CONNECTOR_PREFIX = "plugin-app:"
const CONNECTOR_REGISTRY_FILES_ENV = "ANYBOX_CONNECTOR_REGISTRY_FILES"

export type ResolvedConnectorRuntime =
  | {
      transport: "stdio"
      command: string
      args?: string[]
      cwd?: string
      env?: Record<string, string>
    }
  | {
      transport: "remote"
      serverUrl: string
      authorization?: string
      headers?: Record<string, string>
    }

export const ConnectorToolPreview = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string(),
    readOnly: z.boolean().optional(),
    destructive: z.boolean().optional(),
  })
  .strict()
export type ConnectorToolPreview = z.infer<typeof ConnectorToolPreview>

export const ConnectorApiKeyCredential = z
  .object({
    kind: z.literal("api_key"),
    key: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["text", "password"]).optional(),
    required: z.boolean().optional(),
    secret: z.boolean().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
export type ConnectorApiKeyCredential = z.infer<typeof ConnectorApiKeyCredential>

export type ConnectorOAuthTokenPlacement =
  | {
      type: "authorization_bearer"
    }
  | {
      type: "header"
      name: string
      value?: string
    }

export const ConnectorOAuthTokenPlacement = z.union([
  z.object({ type: z.literal("authorization_bearer") }).strict(),
  z
    .object({
      type: z.literal("header"),
      name: z.string().min(1),
      value: z.string().min(1).optional(),
    })
    .strict(),
])

export const ConnectorOAuthCredential = z
  .object({
    kind: z.literal("oauth"),
    label: z.string().min(1),
    clientID: z.string().min(1),
    authorizationURL: z.string().min(1),
    tokenURL: z.string().min(1),
    scopes: z.array(z.string().min(1)),
    revocationURL: z.string().min(1).optional(),
    tokenPlacement: ConnectorOAuthTokenPlacement.optional(),
    authorizationParams: z.record(z.string(), z.string()).optional(),
    tokenParams: z.record(z.string(), z.string()).optional(),
    description: z.string().optional(),
  })
  .strict()
export type ConnectorOAuthCredential = z.infer<typeof ConnectorOAuthCredential>

export const ConnectorCredential = z.union([ConnectorApiKeyCredential, ConnectorOAuthCredential])
export type ConnectorCredential = z.infer<typeof ConnectorCredential>

export const ConnectorRemoteRuntime = z
  .object({
    transport: z.literal("remote"),
    provider: Config.McpRemoteProvider.optional(),
    serverUrl: z.string().min(1).optional(),
    authorization: z.string().min(1).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    serverDescription: z.string().min(1).optional(),
    allowedTools: Config.McpAllowedTools,
    toolPolicies: Config.McpToolPolicies,
    requireApproval: Config.McpRequireApproval,
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict()
export type ConnectorRemoteRuntime = z.infer<typeof ConnectorRemoteRuntime>

export const ConnectorDefinition = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    publisher: z.string().min(1).default("Anybox"),
    icon: z.string().optional(),
    risk: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    permissions: z.array(z.string()).default([]),
    tools: z.array(ConnectorToolPreview).default([]),
    credential: ConnectorCredential.optional(),
    runtime: ConnectorRemoteRuntime.optional(),
    installReview: z.array(z.string()).default([]),
    source: z.enum(["platform", "registry"]).default("platform"),
    available: z.boolean().default(true),
  })
  .strict()
export type ConnectorDefinition = z.infer<typeof ConnectorDefinition>

export const ConnectorRequirement = z
  .object({
    connector: z.string().min(1),
    tools: z.array(z.string().min(1)).optional(),
    permissions: z.array(z.string().min(1)).optional(),
    required: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .strict()
export type ConnectorRequirement = z.infer<typeof ConnectorRequirement>

const ConnectorRegistryFile = z
  .object({
    schemaVersion: z.literal(1).optional(),
    connectors: z.array(ConnectorDefinition),
  })
  .strict()

const ConnectorDiagnosticTool = z
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

const ConnectorDiagnostic = z
  .object({
    serverID: z.string(),
    enabled: z.boolean(),
    ok: z.boolean(),
    toolCount: z.number(),
    toolNames: z.array(z.string()),
    tools: z.array(ConnectorDiagnosticTool),
    error: z.string().optional(),
  })
  .strict()
type ConnectorDiagnostic = z.infer<typeof ConnectorDiagnostic>

export const ConnectorStatus = z
  .object({
    connectorID: z.string().min(1),
    definitionID: z.string().min(1),
    name: z.string().min(1),
    connected: z.boolean(),
    available: z.boolean(),
    authStatus: z.enum(["connected", "not_connected", "pending", "expired", "error", "unavailable"]),
    credentialKind: z.enum(["api_key", "oauth"]).optional(),
    credentialLabel: z.string().optional(),
    account: ProviderAuth.ProviderAuthAccountSummary.optional(),
    email: z.string().optional(),
    expiresAt: z.number().optional(),
    activeFlow: ProviderAuth.ProviderAuthFlow.optional(),
    generatedMcpServerID: z.string().min(1).optional(),
    lastDiagnostic: ConnectorDiagnostic.optional(),
  })
  .strict()
export type ConnectorStatus = z.infer<typeof ConnectorStatus>

export const SaveConnectorApiKeyInput = z
  .object({
    apiKey: z.string().nullable().optional(),
  })
  .strict()
export type SaveConnectorApiKeyInput = z.infer<typeof SaveConnectorApiKeyInput>

export class ConnectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ConnectorError"
  }
}

function normalizeConnectorDefinitionID(id: string) {
  return id.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
}

export function connectorIDForDefinition(definitionID: string, instanceID = "default") {
  const normalizedDefinitionID = normalizeConnectorDefinitionID(definitionID)
  const normalizedInstanceID = instanceID.trim() || "default"
  return `${CONNECTOR_PREFIX}${normalizedDefinitionID}:${normalizedInstanceID}`
}

export function mcpServerIDForConnector(definitionID: string, instanceID = "default") {
  return `connector.${normalizeConnectorDefinitionID(definitionID)}.${instanceID.trim() || "default"}`
}

function parseConnectorID(connectorID: string) {
  if (!connectorID.startsWith(CONNECTOR_PREFIX)) return undefined
  const rest = connectorID.slice(CONNECTOR_PREFIX.length)
  const separator = rest.indexOf(":")
  if (separator <= 0 || separator === rest.length - 1) return undefined

  return {
    definitionID: rest.slice(0, separator),
    instanceID: rest.slice(separator + 1),
  }
}

export function mcpServerIDForConnectorID(connectorID: string) {
  const parsed = parseConnectorID(connectorID)
  return parsed ? mcpServerIDForConnector(parsed.definitionID, parsed.instanceID) : undefined
}

function registryFilePaths() {
  return (getProcessEnvValue(CONNECTOR_REGISTRY_FILES_ENV) ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readConnectorRegistryFile(path: string): ConnectorDefinition[] {
  if (!existsSync(path)) return []

  try {
    const raw = readFileSync(path, "utf8")
    const parsedJSON = JSON.parse(raw) as unknown
    const parsed = Array.isArray(parsedJSON)
      ? z.array(ConnectorDefinition).parse(parsedJSON)
      : ConnectorRegistryFile.parse(parsedJSON).connectors

    return parsed.map((definition) => ConnectorDefinition.parse({
      ...definition,
      id: normalizeConnectorDefinitionID(definition.id),
      source: definition.source === "platform" ? "registry" : definition.source,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ConnectorError("CONNECTOR_REGISTRY_INVALID", `Connector registry '${path}' is invalid: ${message}`)
  }
}

function builtinDefinitions(): ConnectorDefinition[] {
  return []
}

export function listDefinitions(): ConnectorDefinition[] {
  const byID = new Map<string, ConnectorDefinition>()
  for (const definition of builtinDefinitions()) {
    byID.set(definition.id, definition)
  }

  for (const path of registryFilePaths()) {
    for (const definition of readConnectorRegistryFile(path)) {
      byID.set(definition.id, definition)
    }
  }

  return [...byID.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function getDefinition(definitionID: string) {
  const normalizedDefinitionID = normalizeConnectorDefinitionID(definitionID)
  return listDefinitions().find((definition) => definition.id === normalizedDefinitionID)
}

function assertDefinition(definitionID: string) {
  const definition = getDefinition(definitionID)
  if (!definition) {
    throw new ConnectorError("CONNECTOR_NOT_FOUND", `Connector '${definitionID}' was not found.`)
  }
  return definition
}

function assertDefinitionForConnectorID(connectorID: string) {
  const parsed = parseConnectorID(connectorID)
  if (!parsed) {
    throw new ConnectorError("CONNECTOR_NOT_FOUND", `Connector '${connectorID}' is not a platform connector.`)
  }
  return {
    parsed,
    definition: assertDefinition(parsed.definitionID),
  }
}

function assertApiKeyCredential(definition: ConnectorDefinition): ConnectorApiKeyCredential {
  if (definition.credential?.kind !== "api_key") {
    throw new ConnectorError("CONNECTOR_CREDENTIAL_UNSUPPORTED", `${definition.name} does not use API key authentication.`)
  }
  return definition.credential
}

function assertOAuthCredential(definition: ConnectorDefinition): ConnectorOAuthCredential {
  if (definition.credential?.kind !== "oauth") {
    throw new ConnectorError("CONNECTOR_CREDENTIAL_UNSUPPORTED", `${definition.name} does not use OAuth authentication.`)
  }
  return definition.credential
}

function oauthConfigForCredential(credential: ConnectorOAuthCredential): ProviderAuth.GenericOAuthProviderConfig {
  return {
    label: credential.label,
    clientID: credential.clientID,
    authorizationURL: credential.authorizationURL,
    tokenURL: credential.tokenURL,
    scopes: credential.scopes,
    revocationURL: credential.revocationURL,
    authorizationParams: credential.authorizationParams,
    tokenParams: credential.tokenParams,
  }
}

function oauthMethodForDefinition(_definition: ConnectorDefinition) {
  return "oauth"
}

function now() {
  return Date.now()
}

function accountSummary(credential: Auth.CredentialRecord | undefined) {
  if (credential?.kind !== "oauth_session") return undefined
  return {
    accountID: credential.accountID,
    userID: credential.userID,
    email: credential.email,
    planType: credential.planType,
    workspaceID: credential.workspaceID,
    workspaceName: credential.workspaceName,
    balanceMicrocents: credential.balanceMicrocents,
    currency: credential.currency,
    rechargeUrl: credential.rechargeUrl,
    label: credential.email ?? credential.workspaceName ?? credential.planType,
  }
}

async function statusForDefinition(definition: ConnectorDefinition): Promise<ConnectorStatus> {
  const connectorID = connectorIDForDefinition(definition.id)
  const activeCredential = await Auth.getActiveProviderCredential(connectorID)
  const credential = activeCredential?.credential
  const record = await Auth.getProviderRecord(connectorID)
  const activeFlow = ProviderAuth.getLatestProviderAuthFlow(connectorID)
  const isPendingFlow = activeFlow && ["pending", "waiting_user", "authorizing"].includes(activeFlow.status)
  const connected = !definition.credential
    ? Boolean(definition.runtime && definition.available)
    : definition.credential.kind === "api_key"
      ? credential?.kind === "api_key"
      : credential?.kind === "oauth_session" && credential.expiresAt > now()

  const authStatus: ConnectorStatus["authStatus"] = !definition.available
    ? "unavailable"
    : isPendingFlow
      ? "pending"
      : connected
        ? "connected"
        : credential?.kind === "oauth_session" && credential.expiresAt <= now()
          ? "expired"
          : record?.lastError
            ? "error"
            : "not_connected"

  return {
    connectorID,
    definitionID: definition.id,
    name: definition.name,
    connected,
    available: definition.available,
    authStatus,
    credentialKind: definition.credential?.kind,
    credentialLabel: credential?.kind === "api_key"
      ? credential.label ?? definition.credential?.label
      : credential?.kind === "oauth_session"
        ? credential.email ?? definition.credential?.label
        : undefined,
    account: accountSummary(credential),
    email: credential?.kind === "oauth_session" ? credential.email : undefined,
    expiresAt: credential?.kind === "oauth_session" ? credential.expiresAt : undefined,
    activeFlow,
    generatedMcpServerID: definition.runtime ? mcpServerIDForConnector(definition.id) : undefined,
  }
}

export async function listStatuses(): Promise<ConnectorStatus[]> {
  return Promise.all(listDefinitions().map((definition) => statusForDefinition(definition)))
}

export async function getStatus(connectorID: string): Promise<ConnectorStatus> {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  return statusForDefinition(definition)
}

export async function saveConnectorApiKey(connectorID: string, input: SaveConnectorApiKeyInput) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  const credential = assertApiKeyCredential(definition)
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
        label: credential.label,
      },
      { activate: true, lastError: null },
    )
  }

  await syncConnectorRuntimeBinding(definition)
  return statusForDefinition(definition)
}

export async function removeConnectorApiKey(connectorID: string) {
  return saveConnectorApiKey(connectorID, { apiKey: null })
}

export async function startConnectorOAuthFlow(connectorID: string, input: { serverBaseURL: string }) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  if (!definition.available) {
    throw new ConnectorError("CONNECTOR_UNAVAILABLE", `${definition.name} is not available.`)
  }

  const credential = assertOAuthCredential(definition)
  return ProviderAuth.startGenericOAuthFlow({
    providerID: connectorID,
    method: oauthMethodForDefinition(definition),
    serverBaseURL: input.serverBaseURL,
    oauth: oauthConfigForCredential(credential),
  })
}

export async function getConnectorOAuthFlow(connectorID: string, flowID: string) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  assertOAuthCredential(definition)
  return ProviderAuth.getProviderFlow(connectorID, flowID)
}

export async function cancelConnectorOAuthFlow(connectorID: string, flowID: string) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  assertOAuthCredential(definition)
  return ProviderAuth.cancelProviderAuthFlow(connectorID, flowID)
}

export async function deleteConnectorOAuthSession(connectorID: string) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  const credential = assertOAuthCredential(definition)
  await ProviderAuth.deleteGenericOAuthSession(
    connectorID,
    oauthMethodForDefinition(definition),
    oauthConfigForCredential(credential),
  )
  await syncConnectorRuntimeBinding(definition)
  return statusForDefinition(definition)
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

async function resolvePlatformRemoteServer(connectorID: string): Promise<{
  serverUrl: string
  authorization?: string
  headers?: Record<string, string>
}> {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  if (!definition.available) {
    throw new ConnectorError("CONNECTOR_UNAVAILABLE", `${definition.name} is not available.`)
  }
  if (!definition.runtime) {
    throw new ConnectorError("CONNECTOR_RUNTIME_MISSING", `${definition.name} does not define a runtime.`)
  }

  const config: Record<string, string> = {}

  if (definition.credential?.kind === "api_key") {
    const credential = assertApiKeyCredential(definition)
    const activeCredential = await Auth.getActiveProviderCredential(connectorID)
    if (activeCredential?.credential.kind !== "api_key") {
      throw new ConnectorError("CONNECTOR_NOT_CONNECTED", `${definition.name} is not connected.`)
    }
    config[credential.key] = activeCredential.credential.apiKey
  } else if (definition.credential?.kind === "oauth") {
    const credential = assertOAuthCredential(definition)
    const session = await ProviderAuth.resolveGenericOAuthCredential(
      connectorID,
      oauthMethodForDefinition(definition),
      oauthConfigForCredential(credential),
    )
    if (!session) {
      throw new ConnectorError("CONNECTOR_NOT_CONNECTED", `${definition.name} is not connected.`)
    }
    config.OAUTH_ACCESS_TOKEN = session.accessToken
    config.OAUTH_TOKEN_TYPE = session.tokenType ?? "Bearer"
  }

  const serverUrl = replaceOptionalPlaceholders(definition.runtime.serverUrl, config)
  if (!serverUrl) {
    throw new ConnectorError("CONNECTOR_RUNTIME_MISSING", `${definition.name} does not declare a remote MCP server URL.`)
  }

  const result: {
    serverUrl: string
    authorization?: string
    headers?: Record<string, string>
  } = {
    serverUrl,
    authorization: replaceOptionalPlaceholders(definition.runtime.authorization, config),
    headers: replaceRecordPlaceholders(definition.runtime.headers, config),
  }

  if (definition.credential?.kind === "oauth" && !result.authorization) {
    const placement = definition.credential.tokenPlacement ?? { type: "authorization_bearer" as const }
    if (placement.type === "authorization_bearer") {
      result.authorization = `Bearer ${config.OAUTH_ACCESS_TOKEN}`
    } else {
      result.headers = {
        ...(result.headers ?? {}),
        [placement.name]: replacePlaceholders(placement.value ?? "Bearer ${OAUTH_ACCESS_TOKEN}", config),
      }
    }
  }

  return result
}

export async function resolveRuntime(connectorID: string): Promise<ResolvedConnectorRuntime> {
  if (connectorID.startsWith(PLUGIN_CONNECTOR_PREFIX) || connectorID.startsWith(LEGACY_PLUGIN_APP_CONNECTOR_PREFIX)) {
    const pluginModule = await import("#plugin/plugin.ts")
    return pluginModule.resolveConnectorRuntime(connectorID)
  }

  return {
    transport: "remote",
    ...(await resolvePlatformRemoteServer(connectorID)),
  }
}

export async function resolveRemoteServer(connectorID: string): Promise<{
  serverUrl: string
  authorization?: string
  headers?: Record<string, string>
}> {
  const runtime = await resolveRuntime(connectorID)
  if (runtime.transport !== "remote") {
    throw new ConnectorError("CONNECTOR_RUNTIME_MISSING", `Connector '${connectorID}' does not resolve to a remote MCP server.`)
  }

  return {
    serverUrl: runtime.serverUrl,
    authorization: runtime.authorization,
    headers: runtime.headers,
  }
}

function runtimeBindingForConnector(definition: ConnectorDefinition): Config.McpServerInput | undefined {
  if (!definition.runtime) return undefined
  return {
    name: definition.name,
    transport: "connector",
    provider: definition.runtime.provider,
    connectorId: connectorIDForDefinition(definition.id),
    serverDescription: definition.runtime.serverDescription,
    allowedTools: definition.runtime.allowedTools,
    toolPolicies: definition.runtime.toolPolicies,
    requireApproval: definition.runtime.requireApproval,
    enabled: definition.available,
    timeoutMs: definition.runtime.timeoutMs,
  }
}

async function syncConnectorRuntimeBinding(definition: ConnectorDefinition) {
  const runtimeBinding = runtimeBindingForConnector(definition)
  if (!runtimeBinding) return
  await Config.setMcpServer(Config.GLOBAL_CONFIG_ID, mcpServerIDForConnector(definition.id), runtimeBinding)
}

export async function syncConnectorRuntimeBindings() {
  for (const definition of listDefinitions()) {
    await syncConnectorRuntimeBinding(definition)
  }
}

export async function diagnoseConnector(connectorID: string) {
  const { definition } = assertDefinitionForConnectorID(connectorID)
  const runtimeBinding = runtimeBindingForConnector(definition)
  if (!runtimeBinding) {
    return {
      serverID: mcpServerIDForConnector(definition.id),
      enabled: false,
      ok: false,
      toolCount: 0,
      toolNames: [],
      tools: [],
      error: `${definition.name} does not define a runtime.`,
    }
  }

  const server = Config.McpServerSummary.parse({
    id: mcpServerIDForConnector(definition.id),
    ...runtimeBinding,
    enabled: runtimeBinding.enabled ?? true,
  })
  return Mcp.diagnoseServer(server)
}
