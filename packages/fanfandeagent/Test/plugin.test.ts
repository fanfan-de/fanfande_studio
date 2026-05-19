import { afterEach, describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Auth from "#auth/auth.ts"
import * as Config from "#config/config.ts"
import * as Connector from "#connector/connector.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as Plugin from "#plugin/plugin.ts"
import { createServerApp } from "#server/server.ts"
import * as Skill from "#skill/skill.ts"

interface JsonEnvelope<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

type PluginCatalogEnvelope = JsonEnvelope<
  Array<{
    id: string
    name: string
    description: string
    thumbnailUrl?: string
    screenshots: string[]
    installable?: boolean
    source?: string
    download?: {
      type: string
      url?: string
      sha256?: string
    }
    version: string
    risk: string
    runtime?: {
      transport: string
      command?: string
      serverUrl?: string
    }
    tools: Array<{
      name: string
      description: string
    }>
    mcpServers: Array<{
      id: string
      runtime: {
        transport: string
      }
    }>
    skills: Array<{
      id: string
      directory: string
    }>
    apps: Array<{
      appID: string
      credential: {
        kind?: string
        key?: string
        label: string
        clientID?: string
        authorizationURL?: string
        tokenURL?: string
        scopes?: string[]
      }
      runtime: {
        transport: string
        serverUrl?: string
        headers?: Record<string, string>
      }
    }>
    connectors: Array<{
      id?: string
      appID: string
      credential: {
        kind?: string
        key?: string
        label: string
      }
      runtime: {
        transport: string
        command?: string
        args?: string[]
        env?: Record<string, string>
        serverUrl?: string
        headers?: Record<string, string>
      }
    }>
    connectorRequirements: Array<{
      connector: string
      tools?: string[]
      permissions?: string[]
      required?: boolean
      reason?: string
    }>
  }>
>

type InstalledPluginEnvelope = JsonEnvelope<{
  pluginID: string
  enabled: boolean
  mcpServerID: string
  mcpServerIDs: string[]
  skillIDs: string[]
  connectorIDs: string[]
  connectorRequirementIDs: string[]
  config: Record<string, string>
}>

type ConnectorCatalogEnvelope = JsonEnvelope<
  Array<{
    id: string
    name: string
    credential?: {
      kind: "api_key" | "oauth"
      label: string
      key?: string
    }
    runtime?: {
      transport: "remote"
      serverUrl?: string
    }
  }>
>

type PlatformConnectorStatusEnvelope = JsonEnvelope<
  Array<{
    connectorID: string
    definitionID: string
    connected: boolean
    authStatus: "connected" | "not_connected" | "pending" | "expired" | "error" | "unavailable"
    credentialKind?: "api_key" | "oauth"
    generatedMcpServerID?: string
  }>
>

type SinglePlatformConnectorStatusEnvelope = JsonEnvelope<{
  connectorID: string
  definitionID: string
  connected: boolean
  authStatus: "connected" | "not_connected" | "pending" | "expired" | "error" | "unavailable"
  credentialKind?: "api_key" | "oauth"
  generatedMcpServerID?: string
}>

type InstalledPluginsEnvelope = JsonEnvelope<
  Array<{
    pluginID: string
    enabled: boolean
    mcpServerID: string
    mcpServerIDs: string[]
  }>
>

type DiagnosticEnvelope = JsonEnvelope<{
  serverID: string
  enabled: boolean
  ok: boolean
  toolCount: number
  error?: string
}>

type DeletePluginEnvelope = JsonEnvelope<{
  pluginID: string
  mcpServerID: string
  mcpServerIDs: string[]
  connectorIDs: string[]
  removed: boolean
}>

type ConnectorStatusEnvelope = JsonEnvelope<
  Array<{
    pluginID: string
    appID: string
    connectorID: string
    connected: boolean
    credentialKind: "api_key" | "oauth"
    authStatus: "connected" | "not_connected" | "pending" | "expired" | "error"
    credentialLabel?: string
    email?: string
    expiresAt?: number
    generatedMcpServerID: string
  }>
>

type SingleConnectorStatusEnvelope = JsonEnvelope<{
  pluginID: string
  appID: string
  connectorID: string
  connected: boolean
  credentialKind: "api_key" | "oauth"
  authStatus: "connected" | "not_connected" | "pending" | "expired" | "error"
  credentialLabel?: string
  email?: string
  expiresAt?: number
  generatedMcpServerID: string
}>

let activeRoot: string | null = null
let previousPluginInstallDir: string | undefined
let previousPluginRegistryIndexURL: string | undefined
let previousPluginRegistryCacheDir: string | undefined
let previousConnectorRegistryFiles: string | undefined
let previousFetch: typeof fetch | undefined

async function removeTreeWithRetry(path: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

async function useTempDatabase() {
  activeRoot = await mkdtemp(join(tmpdir(), "fanfande-plugin-api-"))
  Sqlite.setDatabaseFile(join(activeRoot, "plugin.db"))
  Sqlite.closeDatabase()
  previousPluginInstallDir = process.env.FANFANDE_PLUGIN_INSTALL_DIR
  previousPluginRegistryIndexURL = process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL
  previousPluginRegistryCacheDir = process.env.FANFANDE_PLUGIN_REGISTRY_CACHE_DIR
  previousConnectorRegistryFiles = process.env.FANFANDE_CONNECTOR_REGISTRY_FILES
  previousFetch = globalThis.fetch
  process.env.FANFANDE_PLUGIN_INSTALL_DIR = join(activeRoot, "installed-plugins")
  process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL = "off"
  process.env.FANFANDE_PLUGIN_REGISTRY_CACHE_DIR = join(activeRoot, "registry-cache")
  delete process.env.FANFANDE_CONNECTOR_REGISTRY_FILES
  await Auth.clearProvider("plugin-app:manifest-lab:docs")
  await Auth.clearProvider("plugin-connector:manifest-lab:docs")
  await Auth.clearProvider("plugin-connector:local-connector-lab:docs-local")
  await Auth.clearProvider("connector:docs:default")
}

function pluginInstallRoot() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")
  return process.env.FANFANDE_PLUGIN_INSTALL_DIR ?? join(activeRoot, "installed-plugins")
}

async function writeManifestPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "manifest-lab")
  const versionRoot = join(packageRoot, "0.1.0")
  const manifestRoot = join(versionRoot, ".fanfande-plugin")
  const skillRoot = join(versionRoot, "skills", "review")
  await mkdir(manifestRoot, { recursive: true })
  await mkdir(skillRoot, { recursive: true })

  await writeFile(join(skillRoot, "SKILL.md"), [
    "---",
    "name: Review Notes",
    "description: Review docs produced by the manifest lab plugin.",
    "---",
    "",
    "# Review Notes",
    "",
    "Use this skill to review generated documentation notes.",
    "",
  ].join("\n"))

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "manifest-lab",
    version: "0.1.0",
    description: "Fixture plugin package with MCP, skills, and API-key backed app connector.",
    author: {
      name: "Fanfande Tests",
    },
    interface: {
      displayName: "Manifest Lab",
      shortDescription: "Fixture plugin package.",
      developerName: "Fanfande Tests",
      category: "Docs",
      logo: "docs",
    },
    mcpServers: [
      {
        id: "notes",
        name: "Manifest Notes",
        risk: "low",
        permissions: ["Starts a fixture stdio MCP server"],
        tools: [
          {
            name: "list_notes",
            description: "List fixture notes.",
            readOnly: true,
          },
        ],
        runtime: {
          transport: "stdio",
          command: "node",
          args: ["server.js"],
          timeoutMs: 1000,
        },
      },
    ],
    skills: "skills",
    apps: [
      {
        appID: "docs",
        name: "Docs API",
        description: "Fixture remote MCP app connector.",
        risk: "medium",
        permissions: ["Sends requests to docs.example.test"],
        tools: [
          {
            name: "search_docs",
            description: "Search fixture docs.",
            readOnly: true,
          },
        ],
        credential: {
          key: "DOCS_API_KEY",
          label: "Docs API key",
          type: "password",
          required: true,
          secret: true,
        },
        runtime: {
          transport: "remote",
          serverUrl: "https://docs.example.test/mcp",
          headers: {
            "x-api-key": "${DOCS_API_KEY}",
          },
          allowedTools: {
            readOnly: true,
          },
          requireApproval: "always",
          timeoutMs: 1000,
        },
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeOAuthPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "oauth-lab", "0.1.0")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  await mkdir(manifestRoot, { recursive: true })

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "oauth-lab",
    version: "0.1.0",
    description: "Fixture plugin package with an OAuth app connector.",
    author: "Fanfande Tests",
    interface: {
      displayName: "OAuth Lab",
      shortDescription: "OAuth connector fixture.",
      developerName: "Fanfande Tests",
      category: "Docs",
    },
    apps: [
      {
        appID: "mail",
        name: "Mail OAuth",
        description: "Fixture OAuth remote MCP app connector.",
        permissions: ["Reads fixture mail metadata"],
        tools: [
          {
            name: "list_mail",
            description: "List fixture mail.",
            readOnly: true,
          },
        ],
        credential: {
          kind: "oauth",
          label: "Mail OAuth",
          clientID: "fixture-client",
          authorizationURL: "https://auth.example.test/authorize",
          tokenURL: "https://auth.example.test/token",
          scopes: ["mail.readonly"],
        },
        runtime: {
          transport: "remote",
          serverUrl: "https://mail.example.test/mcp",
          allowedTools: {
            readOnly: true,
          },
          requireApproval: "never",
        },
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeLocalConnectorPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "local-connector-lab", "0.1.0")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  const connectorRoot = join(packageRoot, "connectors", "docs-local")
  await mkdir(manifestRoot, { recursive: true })
  await mkdir(connectorRoot, { recursive: true })
  await writeFile(join(connectorRoot, "server.js"), "console.error('fixture local connector server')\n")

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "local-connector-lab",
    version: "0.1.0",
    description: "Fixture plugin package with a local stdio connector.",
    author: "Fanfande Tests",
    interface: {
      displayName: "Local Connector Lab",
      shortDescription: "Local connector fixture.",
      developerName: "Fanfande Tests",
      category: "Docs",
    },
    connectors: [
      {
        id: "docs-local",
        name: "Docs Local",
        description: "Fixture local MCP connector.",
        permissions: ["Starts a local fixture MCP wrapper"],
        tools: [
          {
            name: "search_local_docs",
            description: "Search local docs.",
            readOnly: true,
          },
        ],
        credential: {
          kind: "api_key",
          key: "DOCS_API_KEY",
          label: "Docs local key",
          type: "password",
          required: true,
          secret: true,
        },
        runtime: {
          transport: "stdio",
          command: "node",
          args: ["${PLUGIN_ROOT}/connectors/docs-local/server.js"],
          cwd: "${PLUGIN_ROOT}",
          env: {
            DOCS_API_KEY: "${DOCS_API_KEY}",
          },
          timeoutMs: 1000,
        },
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeConnectorRegistryFile() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const registryPath = join(activeRoot, "connectors.json")
  await writeFile(registryPath, JSON.stringify({
    schemaVersion: 1,
    connectors: [
      {
        id: "docs",
        name: "Docs",
        description: "Platform-owned docs connector.",
        publisher: "Fanfande",
        risk: "medium",
        permissions: ["Sends requests to docs.example.test"],
        tools: [
          {
            name: "search_docs",
            description: "Search fixture docs.",
            readOnly: true,
          },
        ],
        credential: {
          kind: "api_key",
          key: "DOCS_API_KEY",
          label: "Docs API key",
          type: "password",
          required: true,
          secret: true,
        },
        runtime: {
          transport: "remote",
          serverUrl: "https://docs.example.test/mcp",
          headers: {
            "x-api-key": "${DOCS_API_KEY}",
          },
          allowedTools: {
            readOnly: true,
          },
          requireApproval: "always",
        },
      },
    ],
  }, null, 2))
  process.env.FANFANDE_CONNECTOR_REGISTRY_FILES = registryPath
  return registryPath
}

async function writePlatformConnectorRequirementPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "connector-requirement-lab", "0.1.0")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  await mkdir(manifestRoot, { recursive: true })

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "connector-requirement-lab",
    version: "0.1.0",
    description: "Fixture plugin package that depends on a platform connector.",
    author: "Fanfande Tests",
    interface: {
      displayName: "Connector Requirement Lab",
      shortDescription: "Platform connector requirement fixture.",
      developerName: "Fanfande Tests",
      category: "Docs",
    },
    connectorRequirements: [
      {
        connector: "docs",
        tools: ["search_docs"],
        permissions: ["Sends requests to docs.example.test"],
        required: true,
        reason: "Search official docs through the platform connector.",
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeConfigRequiredPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "config-lab", "0.1.0")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  await mkdir(manifestRoot, { recursive: true })

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "config-lab",
    version: "0.1.0",
    description: "Fixture plugin package with a required MCP configuration field.",
    author: "Fanfande Tests",
    interface: {
      displayName: "Config Lab",
      shortDescription: "Configuration fixture package.",
      developerName: "Fanfande Tests",
      category: "Docs",
    },
    mcpServers: [
      {
        id: "docs",
        name: "Config Docs",
        risk: "low",
        configFields: [
          {
            key: "DOCS_TOKEN",
            label: "Docs token",
            type: "password",
            required: true,
            secret: true,
          },
        ],
        tools: [
          {
            name: "search_docs",
            description: "Search docs.",
            readOnly: true,
          },
        ],
        runtime: {
          transport: "remote",
          serverUrl: "https://docs.example.test/mcp",
          headers: {
            authorization: "Bearer ${DOCS_TOKEN}",
          },
          allowedTools: {
            readOnly: true,
          },
          requireApproval: "never",
        },
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeCriticalPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "critical-lab")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  await mkdir(manifestRoot, { recursive: true })

  await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
    name: "critical-lab",
    version: "0.1.0",
    description: "Fixture plugin package with a critical-risk MCP binding.",
    author: "Fanfande Tests",
    interface: {
      displayName: "Critical Lab",
      shortDescription: "Critical fixture package.",
      developerName: "Fanfande Tests",
      category: "Code",
    },
    mcpServers: [
      {
        id: "danger",
        name: "Critical Danger",
        risk: "critical",
        permissions: ["Fixture critical-risk capability"],
        tools: [
          {
            name: "dangerous_write",
            description: "Fixture destructive write.",
            readOnly: false,
            destructive: true,
          },
        ],
        runtime: {
          transport: "stdio",
          command: "node",
          args: ["danger.js"],
        },
      },
    ],
  }, null, 2))

  return packageSourceRoot
}

async function writeVersionedPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = pluginInstallRoot()
  const packageRoot = join(packageSourceRoot, "version-lab")
  const versions = [
    ["0.1.0", "Version Lab Old"],
    ["0.2.0", "Version Lab New"],
  ] as const

  for (const [version, displayName] of versions) {
    const manifestRoot = join(packageRoot, version, ".fanfande-plugin")
    await mkdir(manifestRoot, { recursive: true })
    await writeFile(join(manifestRoot, "plugin.json"), JSON.stringify({
      name: "version-lab",
      version,
      description: `${displayName} fixture plugin.`,
      author: "Fanfande Tests",
      interface: {
        displayName,
        shortDescription: `${displayName} fixture.`,
        developerName: "Fanfande Tests",
        category: "Docs",
      },
      mcpServers: [
        {
          id: "notes",
          name: displayName,
          risk: "low",
          tools: [
            {
              name: "list_notes",
              description: "List fixture notes.",
              readOnly: true,
            },
          ],
          runtime: {
            transport: "stdio",
            command: "node",
            args: [`server-${version}.js`],
          },
        },
      ],
    }, null, 2))
  }

  return packageSourceRoot
}

afterEach(async () => {
  await Auth.clearProvider("plugin-app:manifest-lab:docs")
  await Auth.clearProvider("plugin-app:oauth-lab:mail")
  await Auth.clearProvider("plugin-connector:manifest-lab:docs")
  await Auth.clearProvider("plugin-connector:oauth-lab:mail")
  await Auth.clearProvider("plugin-connector:local-connector-lab:docs-local")
  await Auth.clearProvider("connector:docs:default")
  if (previousPluginInstallDir === undefined) {
    delete process.env.FANFANDE_PLUGIN_INSTALL_DIR
  } else {
    process.env.FANFANDE_PLUGIN_INSTALL_DIR = previousPluginInstallDir
  }
  if (previousPluginRegistryIndexURL === undefined) {
    delete process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL
  } else {
    process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL = previousPluginRegistryIndexURL
  }
  if (previousPluginRegistryCacheDir === undefined) {
    delete process.env.FANFANDE_PLUGIN_REGISTRY_CACHE_DIR
  } else {
    process.env.FANFANDE_PLUGIN_REGISTRY_CACHE_DIR = previousPluginRegistryCacheDir
  }
  if (previousConnectorRegistryFiles === undefined) {
    delete process.env.FANFANDE_CONNECTOR_REGISTRY_FILES
  } else {
    process.env.FANFANDE_CONNECTOR_REGISTRY_FILES = previousConnectorRegistryFiles
  }
  if (previousFetch) {
    globalThis.fetch = previousFetch
  }
  previousPluginInstallDir = undefined
  previousPluginRegistryIndexURL = undefined
  previousPluginRegistryCacheDir = undefined
  previousConnectorRegistryFiles = undefined
  previousFetch = undefined
  Sqlite.closeDatabase()
  Sqlite.setDatabaseFile()
  Sqlite.closeDatabase()
  if (activeRoot) {
    await removeTreeWithRetry(activeRoot).catch(() => undefined)
    activeRoot = null
  }
})

describe("plugin marketplace API", () => {
  test("returns installed plugin package catalog entries without critical risk entries", async () => {
    await useTempDatabase()
    await writeManifestPluginPackage()
    const app = createServerApp()

    const response = await app.request("/api/plugins/catalog")
    const body = (await response.json()) as PluginCatalogEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.length).toBeGreaterThan(0)
    expect(body.data?.some((plugin) => plugin.id === "manifest-lab")).toBe(true)
    expect(body.data?.every((plugin) => plugin.risk !== "critical")).toBe(true)
    expect(body.data?.every((plugin) =>
      plugin.mcpServers.length + plugin.skills.length + plugin.connectorRequirements.length + plugin.apps.length > 0
    )).toBe(true)

    const manifestPlugin = body.data?.find((plugin) => plugin.id === "manifest-lab")
    expect(manifestPlugin?.source).toBe("package")
    expect(manifestPlugin?.installable).toBe(true)
    expect(manifestPlugin?.skills.map((skill) => skill.directory)).toEqual(["review"])
  })

  test("loads remote plugin metadata from an index URL and falls back to cached metadata", async () => {
    await useTempDatabase()
    const app = createServerApp()
    process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL = "https://registry.example.test/index.json"

    const remotePluginMeta = {
      name: "remote-lab",
      version: "1.2.3",
      description: "Remote fixture plugin.",
      author: "Remote Tests",
      keywords: ["remote"],
      interface: {
        displayName: "Remote Lab",
        shortDescription: "Remote fixture.",
        longDescription: "Remote fixture marketplace details.",
        developerName: "Remote Tests",
        category: "Docs",
        thumbnailUrl: "./relative-thumbnail.png",
        screenshots: [
          "./relative-screenshot.png",
          "https://cdn.example.test/remote-lab.png",
        ],
      },
      package: {
        type: "zip",
        url: "https://cdn.example.test/remote-lab.zip",
        sha256: "a".repeat(64),
      },
      mcpServers: [
        {
          id: "docs",
          name: "Remote Docs",
          risk: "low",
          tools: [
            {
              name: "search_remote_docs",
              description: "Search remote docs.",
              readOnly: true,
            },
          ],
          runtime: {
            transport: "remote",
            serverUrl: "https://docs.example.test/mcp",
            allowedTools: {
              readOnly: true,
            },
            requireApproval: "never",
          },
        },
      ],
    }

    let failNetwork = false
    let fetchCount = 0
    globalThis.fetch = (async (input: string | URL | Request) => {
      fetchCount += 1
      if (failNetwork) throw new Error("offline")

      const url = typeof input === "string"
        ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === "https://registry.example.test/index.json") {
        return new Response(JSON.stringify(["https://plugins.example.test/remote-lab"]), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      }
      if (url === "https://plugins.example.test/remote-lab/plugin.meta.json") {
        return new Response(JSON.stringify(remotePluginMeta), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      }

      return new Response("not found", { status: 404 })
    }) as typeof fetch

    const firstResponse = await app.request("/api/plugins/catalog")
    const firstBody = (await firstResponse.json()) as PluginCatalogEnvelope
    const firstRemotePlugin = firstBody.data?.find((plugin) => plugin.id === "remote-lab")

    expect(firstResponse.status).toBe(200)
    expect(firstRemotePlugin?.name).toBe("Remote Lab")
    expect(firstRemotePlugin?.source).toBe("registry")
    expect(firstRemotePlugin?.installable).toBe(true)
    expect(firstRemotePlugin?.download?.url).toBe("https://cdn.example.test/remote-lab.zip")
    expect(firstRemotePlugin?.thumbnailUrl).toBeUndefined()
    expect(firstRemotePlugin?.screenshots).toEqual(["https://cdn.example.test/remote-lab.png"])

    const fetchCountBeforeCachedMode = fetchCount
    const cachedModeResponse = await app.request("/api/plugins/catalog?freshness=cached")
    const cachedModeBody = (await cachedModeResponse.json()) as PluginCatalogEnvelope
    const cachedModeRemotePlugin = cachedModeBody.data?.find((plugin) => plugin.id === "remote-lab")

    expect(cachedModeResponse.status).toBe(200)
    expect(cachedModeRemotePlugin?.name).toBe("Remote Lab")
    expect(fetchCount).toBe(fetchCountBeforeCachedMode)

    failNetwork = true
    const cachedResponse = await app.request("/api/plugins/catalog")
    const cachedBody = (await cachedResponse.json()) as PluginCatalogEnvelope
    const cachedRemotePlugin = cachedBody.data?.find((plugin) => plugin.id === "remote-lab")

    expect(cachedResponse.status).toBe(200)
    expect(cachedRemotePlugin?.name).toBe("Remote Lab")
  })

  test("shows remote metadata without a package as catalog-only", async () => {
    await useTempDatabase()
    const app = createServerApp()
    process.env.FANFANDE_PLUGIN_REGISTRY_INDEX_URL = "https://registry.example.test/index.json"
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL ? input.toString() : input.url
      if (url === "https://registry.example.test/index.json") {
        return new Response(JSON.stringify(["https://plugins.example.test/meta-only"]), { status: 200 })
      }
      if (url === "https://plugins.example.test/meta-only/plugin.meta.json") {
        return new Response(JSON.stringify({
          name: "meta-only",
          version: "1.0.0",
          description: "Remote plugin without a package.",
          interface: {
            displayName: "Meta Only",
            shortDescription: "Catalog only.",
            category: "Docs",
          },
          mcpServers: [],
          skills: [],
        }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }) as typeof fetch

    const response = await app.request("/api/plugins/catalog")
    const body = (await response.json()) as PluginCatalogEnvelope
    const plugin = body.data?.find((item) => item.id === "meta-only")

    expect(response.status).toBe(200)
    expect(plugin?.name).toBe("Meta Only")
    expect(plugin?.installable).toBe(false)
  })

  test("installs, disables, diagnoses, and removes a plugin-backed MCP server", async () => {
    await useTempDatabase()
    await writeManifestPluginPackage()
    const app = createServerApp()

    const installResponse = await app.request("/api/plugins/installed/manifest-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope

    expect(installResponse.status).toBe(200)
    expect(installBody.success).toBe(true)
    expect(installBody.data?.pluginID).toBe("manifest-lab")
    expect(installBody.data?.mcpServerID).toBe("plugin.manifest-lab.notes")
    expect(installBody.data?.mcpServerIDs).toEqual([
      "plugin.manifest-lab.notes",
      "plugin.manifest-lab.connector.docs",
    ])

    const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.notes")
    expect(server?.transport).toBe("stdio")
    expect(server?.enabled).toBe(true)
    expect(server?.name).toBe("Manifest Notes")
    expect(server?.transport === "stdio" ? server.args : undefined).toEqual(["server.js"])

    const disableResponse = await app.request("/api/plugins/installed/manifest-lab", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: false,
      }),
    })
    const disableBody = (await disableResponse.json()) as InstalledPluginEnvelope
    const disabledServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.notes")

    expect(disableResponse.status).toBe(200)
    expect(disableBody.data?.enabled).toBe(false)
    expect(disabledServer?.enabled).toBe(false)

    const diagnosticResponse = await app.request("/api/plugins/installed/manifest-lab/diagnostic")
    const diagnosticBody = (await diagnosticResponse.json()) as DiagnosticEnvelope

    expect(diagnosticResponse.status).toBe(200)
    expect(diagnosticBody.success).toBe(true)
    expect(diagnosticBody.data?.serverID).toBe("plugin.manifest-lab.notes")
    expect(diagnosticBody.data?.enabled).toBe(false)
    expect(diagnosticBody.data?.ok).toBe(false)
    expect(diagnosticBody.data?.error).toBe("Server is disabled.")

    const listResponse = await app.request("/api/plugins/installed")
    const listBody = (await listResponse.json()) as InstalledPluginsEnvelope
    expect(listBody.data?.some((plugin) => plugin.pluginID === "manifest-lab")).toBe(true)

    const deleteResponse = await app.request("/api/plugins/installed/manifest-lab", {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeletePluginEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.data?.removed).toBe(true)
    expect(deleteBody.data?.mcpServerIDs).toEqual([
      "plugin.manifest-lab.notes",
      "plugin.manifest-lab.connector.docs",
    ])
    expect(await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.notes")).toBeUndefined()
  })

  test("rejects installs that omit required plugin configuration", async () => {
    await useTempDatabase()
    await writeConfigRequiredPluginPackage()
    const app = createServerApp()

    const response = await app.request("/api/plugins/installed/config-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        config: {},
      }),
    })
    const body = (await response.json()) as JsonEnvelope<unknown>

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("PLUGIN_CONFIG_INVALID")
  })

  test("rejects critical-risk plugin installation", async () => {
    await useTempDatabase()
    await writeCriticalPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    expect(catalogBody.data?.some((plugin) => plugin.id === "critical-lab" && plugin.risk === "critical")).toBe(true)

    const response = await app.request("/api/plugins/installed/critical-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const body = (await response.json()) as JsonEnvelope<unknown>

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("PLUGIN_RISK_NOT_ALLOWED")
    expect(await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.critical-lab.danger")).toBeUndefined()
  })

  test("manages platform connectors outside plugin manifests", async () => {
    await useTempDatabase()
    await writeConnectorRegistryFile()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/connectors/catalog")
    const catalogBody = (await catalogResponse.json()) as ConnectorCatalogEnvelope
    expect(catalogResponse.status).toBe(200)
    expect(catalogBody.data?.[0]?.id).toBe("docs")
    expect(catalogBody.data?.[0]?.credential?.kind).toBe("api_key")

    const disconnectedResponse = await app.request("/api/connectors")
    const disconnectedBody = (await disconnectedResponse.json()) as PlatformConnectorStatusEnvelope
    expect(disconnectedResponse.status).toBe(200)
    expect(disconnectedBody.data?.[0]?.connectorID).toBe("connector:docs:default")
    expect(disconnectedBody.data?.[0]?.connected).toBe(false)

    const connectResponse = await app.request("/api/connectors/connector%3Adocs%3Adefault/api-key", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "platform-secret",
      }),
    })
    const connectBody = (await connectResponse.json()) as SinglePlatformConnectorStatusEnvelope
    expect(connectResponse.status).toBe(200)
    expect(connectBody.data?.connected).toBe(true)

    const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "connector.docs.default")
    expect(server?.transport).toBe("connector")
    expect(server?.transport === "connector" ? server.connectorId : undefined).toBe("connector:docs:default")
    expect(JSON.stringify(server)).not.toContain("platform-secret")

    const runtime = await Connector.resolveRemoteServer("connector:docs:default")
    expect(runtime.serverUrl).toBe("https://docs.example.test/mcp")
    expect(runtime.headers?.["x-api-key"]).toBe("platform-secret")
  })

  test("parses platform connector requirements without creating plugin-owned connectors", async () => {
    await useTempDatabase()
    await writeConnectorRegistryFile()
    await writePlatformConnectorRequirementPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    const plugin = catalogBody.data?.find((item) => item.id === "connector-requirement-lab")

    expect(catalogResponse.status).toBe(200)
    expect(plugin?.apps).toEqual([])
    expect(plugin?.connectorRequirements).toEqual([
      {
        connector: "docs",
        tools: ["search_docs"],
        permissions: ["Sends requests to docs.example.test"],
        required: true,
        reason: "Search official docs through the platform connector.",
      },
    ])

    const installResponse = await app.request("/api/plugins/installed/connector-requirement-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope
    expect(installResponse.status).toBe(200)
    expect(installBody.data?.connectorIDs).toEqual([])
    expect(installBody.data?.connectorRequirementIDs).toEqual(["connector:docs:default"])
  })

  test("loads plugin package manifests and exposes MCP, skills, and app connector metadata", async () => {
    await useTempDatabase()
    await writeManifestPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    const manifestPlugin = catalogBody.data?.find((plugin) => plugin.id === "manifest-lab")

    expect(catalogResponse.status).toBe(200)
    expect(manifestPlugin?.name).toBe("Manifest Lab")
    expect(manifestPlugin?.mcpServers.map((server) => server.id)).toEqual(["notes"])
    expect(manifestPlugin?.skills.map((skill) => skill.id)).toEqual(["plugin:manifest-lab:review"])
    expect(manifestPlugin?.apps.map((connector) => connector.appID)).toEqual(["docs"])
    expect(manifestPlugin?.apps[0]?.credential.key).toBe("DOCS_API_KEY")
    expect(manifestPlugin?.apps[0]?.runtime.headers?.["x-api-key"]).toBe("${DOCS_API_KEY}")

    const installResponse = await app.request("/api/plugins/installed/manifest-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope

    expect(installResponse.status).toBe(200)
    expect(installBody.data?.mcpServerIDs).toEqual([
      "plugin.manifest-lab.notes",
      "plugin.manifest-lab.connector.docs",
    ])
    expect(installBody.data?.skillIDs).toEqual(["plugin:manifest-lab:review"])
    expect(installBody.data?.connectorIDs).toEqual(["plugin-connector:manifest-lab:docs"])

    const appServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.connector.docs")
    expect(appServer?.transport).toBe("connector")
    expect(appServer?.transport === "connector" ? appServer.connectorId : undefined).toBe("plugin-connector:manifest-lab:docs")

    const projectRoot = activeRoot ?? "."
    const skills = await Skill.list(projectRoot)
    expect(skills.some((skill) => skill.id === "plugin:manifest-lab:review" && skill.scope === "plugin")).toBe(true)
  })

  test("loads the newest manifest from a versioned plugin package", async () => {
    await useTempDatabase()
    await writeVersionedPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    const versionedPlugin = catalogBody.data?.find((plugin) => plugin.id === "version-lab")

    expect(catalogResponse.status).toBe(200)
    expect(versionedPlugin?.version).toBe("0.2.0")
    expect(versionedPlugin?.name).toBe("Version Lab New")
    expect(versionedPlugin?.mcpServers[0]?.runtime.transport).toBe("stdio")
  })

  test("stores app connector API keys outside MCP config and resolves headers at runtime", async () => {
    await useTempDatabase()
    await writeManifestPluginPackage()
    const app = createServerApp()

    await app.request("/api/plugins/installed/manifest-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })

    const disconnectedResponse = await app.request("/api/plugins/installed/manifest-lab/connectors")
    const disconnectedBody = (await disconnectedResponse.json()) as ConnectorStatusEnvelope
    expect(disconnectedResponse.status).toBe(200)
    expect(disconnectedBody.data?.[0]?.connected).toBe(false)

    const disconnectedDiagnosticResponse = await app.request(
      "/api/plugins/installed/manifest-lab/connectors/docs/diagnostic",
    )
    const disconnectedDiagnosticBody = (await disconnectedDiagnosticResponse.json()) as DiagnosticEnvelope
    expect(disconnectedDiagnosticResponse.status).toBe(200)
    expect(disconnectedDiagnosticBody.data?.ok).toBe(false)
    expect(disconnectedDiagnosticBody.data?.error).toContain("not connected")

    const connectResponse = await app.request("/api/plugins/installed/manifest-lab/connectors/docs/api-key", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "secret-test-key",
      }),
    })
    const connectBody = (await connectResponse.json()) as SingleConnectorStatusEnvelope

    expect(connectResponse.status).toBe(200)
    expect(connectBody.data?.connected).toBe(true)
    expect(connectBody.data?.credentialLabel).toBe("Docs API key")

    const appServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.connector.docs")
    expect(appServer?.transport).toBe("connector")
    expect(appServer?.transport === "connector" ? appServer.connectorId : undefined).toBe("plugin-connector:manifest-lab:docs")
    expect(JSON.stringify(appServer)).not.toContain("secret-test-key")

    const runtime = await Plugin.resolveConnectorRemoteServer("plugin-connector:manifest-lab:docs")
    expect(runtime.serverUrl).toBe("https://docs.example.test/mcp")
    expect(runtime.headers?.["x-api-key"]).toBe("secret-test-key")

    const disconnectResponse = await app.request("/api/plugins/installed/manifest-lab/connectors/docs/api-key", {
      method: "DELETE",
    })
    const disconnectBody = (await disconnectResponse.json()) as SingleConnectorStatusEnvelope

    expect(disconnectResponse.status).toBe(200)
    expect(disconnectBody.data?.connected).toBe(false)

    await expect(Plugin.resolveConnectorRemoteServer("plugin-connector:manifest-lab:docs")).rejects.toThrow("not connected")
  })

  test("loads connector manifests and resolves local stdio connector runtimes with secrets in memory", async () => {
    await useTempDatabase()
    await writeLocalConnectorPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    const plugin = catalogBody.data?.find((item) => item.id === "local-connector-lab")

    expect(catalogResponse.status).toBe(200)
    expect(plugin?.connectors.map((connector) => connector.appID)).toEqual(["docs-local"])
    expect(plugin?.apps.map((connector) => connector.appID)).toEqual(["docs-local"])
    expect(plugin?.connectors[0]?.runtime.transport).toBe("stdio")

    const installResponse = await app.request("/api/plugins/installed/local-connector-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope

    expect(installResponse.status).toBe(200)
    expect(installBody.data?.mcpServerIDs).toEqual(["plugin.local-connector-lab.connector.docs-local"])
    expect(installBody.data?.connectorIDs).toEqual(["plugin-connector:local-connector-lab:docs-local"])

    const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.local-connector-lab.connector.docs-local")
    expect(server?.transport).toBe("connector")
    expect(server?.transport === "connector" ? server.connectorId : undefined)
      .toBe("plugin-connector:local-connector-lab:docs-local")
    expect(JSON.stringify(server)).not.toContain("local-secret")

    const disconnectedResponse = await app.request(
      "/api/plugins/installed/local-connector-lab/connectors/docs-local/diagnostic",
    )
    const disconnectedBody = (await disconnectedResponse.json()) as DiagnosticEnvelope
    expect(disconnectedResponse.status).toBe(200)
    expect(disconnectedBody.data?.ok).toBe(false)
    expect(disconnectedBody.data?.error).toContain("not connected")

    const connectResponse = await app.request(
      "/api/plugins/installed/local-connector-lab/connectors/docs-local/api-key",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          apiKey: "local-secret",
        }),
      },
    )
    const connectBody = (await connectResponse.json()) as SingleConnectorStatusEnvelope
    expect(connectResponse.status).toBe(200)
    expect(connectBody.data?.connected).toBe(true)

    const runtime = await Plugin.resolveConnectorRuntime("plugin-connector:local-connector-lab:docs-local")
    expect(runtime.transport).toBe("stdio")
    expect(runtime.transport === "stdio" ? runtime.command : undefined).toBe("node")
    expect(runtime.transport === "stdio" ? runtime.args?.[0] : undefined).toContain("connectors")
    expect(runtime.transport === "stdio" ? runtime.env?.DOCS_API_KEY : undefined).toBe("local-secret")
    await expect(Plugin.resolveConnectorRemoteServer("plugin-connector:local-connector-lab:docs-local"))
      .rejects.toThrow("does not resolve to a remote")
  })

  test("parses OAuth app connectors and starts cancellable PKCE auth flows", async () => {
    await useTempDatabase()
    await writeOAuthPluginPackage()
    const app = createServerApp()

    const catalogResponse = await app.request("/api/plugins/catalog")
    const catalogBody = (await catalogResponse.json()) as PluginCatalogEnvelope
    const plugin = catalogBody.data?.find((item) => item.id === "oauth-lab")

    expect(catalogResponse.status).toBe(200)
    expect(plugin?.apps.map((connector) => connector.appID)).toEqual(["mail"])
    expect(plugin?.apps[0]?.credential.kind).toBe("oauth")
    expect(plugin?.apps[0]?.credential.clientID).toBe("fixture-client")

    const installResponse = await app.request("/api/plugins/installed/oauth-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope
    expect(installResponse.status).toBe(200)
    expect(installBody.data?.mcpServerIDs).toEqual(["plugin.oauth-lab.connector.mail"])
    expect(installBody.data?.connectorIDs).toEqual(["plugin-connector:oauth-lab:mail"])

    const disconnectedResponse = await app.request("/api/plugins/installed/oauth-lab/connectors")
    const disconnectedBody = (await disconnectedResponse.json()) as ConnectorStatusEnvelope
    expect(disconnectedBody.data?.[0]?.credentialKind).toBe("oauth")
    expect(disconnectedBody.data?.[0]?.authStatus).toBe("not_connected")

    const flowResponse = await app.request("/api/plugins/installed/oauth-lab/connectors/mail/auth/flows", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    })
    const flowBody = (await flowResponse.json()) as JsonEnvelope<{
      id: string
      authorizationURL: string
      status: string
    }>
    expect(flowResponse.status).toBe(200)
    expect(flowBody.data?.status).toBe("waiting_user")
    const authorizationURL = new URL(flowBody.data?.authorizationURL ?? "")
    expect(authorizationURL.origin + authorizationURL.pathname).toBe("https://auth.example.test/authorize")
    expect(authorizationURL.searchParams.get("client_id")).toBe("fixture-client")
    expect(authorizationURL.searchParams.get("scope")).toBe("mail.readonly")
    expect(authorizationURL.searchParams.get("code_challenge_method")).toBe("S256")

    const pendingResponse = await app.request("/api/plugins/installed/oauth-lab/connectors")
    const pendingBody = (await pendingResponse.json()) as ConnectorStatusEnvelope
    expect(pendingBody.data?.[0]?.authStatus).toBe("pending")

    const cancelResponse = await app.request(
      `/api/plugins/installed/oauth-lab/connectors/mail/auth/flows/${flowBody.data?.id}`,
      {
        method: "DELETE",
      },
    )
    const cancelBody = (await cancelResponse.json()) as JsonEnvelope<{ status: string }>
    expect(cancelResponse.status).toBe(200)
    expect(cancelBody.data?.status).toBe("cancelled")
  })

  test("resolves OAuth app connector bearer tokens and refreshes expired sessions", async () => {
    await useTempDatabase()
    await writeOAuthPluginPackage()
    const app = createServerApp()

    await app.request("/api/plugins/installed/oauth-lab", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
      }),
    })

    await Auth.setProviderCredential(
      "plugin-connector:oauth-lab:mail",
      "oauth",
      {
        kind: "oauth_session",
        accessToken: "access-one",
        refreshToken: "refresh-one",
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenType: "Bearer",
        email: "user@example.test",
      },
      { activate: true, lastError: null },
    )

    const connectedResponse = await app.request("/api/plugins/installed/oauth-lab/connectors")
    const connectedBody = (await connectedResponse.json()) as ConnectorStatusEnvelope
    expect(connectedBody.data?.[0]?.connected).toBe(true)
    expect(connectedBody.data?.[0]?.credentialKind).toBe("oauth")
    expect(connectedBody.data?.[0]?.email).toBe("user@example.test")

    const runtime = await Plugin.resolveConnectorRemoteServer("plugin-connector:oauth-lab:mail")
    expect(runtime.serverUrl).toBe("https://mail.example.test/mcp")
    expect(runtime.authorization).toBe("Bearer access-one")

    await Auth.setProviderCredential(
      "plugin-connector:oauth-lab:mail",
      "oauth",
      {
        kind: "oauth_session",
        accessToken: "expired-access",
        refreshToken: "refresh-one",
        expiresAt: Date.now() - 1000,
        tokenType: "Bearer",
      },
      { activate: true, lastError: null },
    )

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const body = init?.body instanceof URLSearchParams ? init.body.toString() : String(init?.body)
      expect(url).toBe("https://auth.example.test/token")
      expect(body).toContain("grant_type=refresh_token")
      expect(body).toContain("refresh_token=refresh-one")
      return new Response(JSON.stringify({
        access_token: "access-two",
        refresh_token: "refresh-two",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "mail.readonly",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    }) as typeof fetch

    const refreshedRuntime = await Plugin.resolveConnectorRemoteServer("plugin-connector:oauth-lab:mail")
    expect(refreshedRuntime.authorization).toBe("Bearer access-two")
    const refreshedCredential = await Auth.getProviderCredential("plugin-connector:oauth-lab:mail", "oauth")
    expect(refreshedCredential?.kind === "oauth_session" ? refreshedCredential.accessToken : undefined).toBe("access-two")
    expect(refreshedCredential?.kind === "oauth_session" ? refreshedCredential.refreshToken : undefined).toBe("refresh-two")
  })
})
