import { afterEach, describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Auth from "#auth/auth.ts"
import * as Config from "#config/config.ts"
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
        key: string
        label: string
      }
      runtime: {
        transport: string
        serverUrl?: string
        headers?: Record<string, string>
      }
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
  config: Record<string, string>
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
    credentialLabel?: string
    generatedMcpServerID: string
  }>
>

type SingleConnectorStatusEnvelope = JsonEnvelope<{
  pluginID: string
  appID: string
  connectorID: string
  connected: boolean
  credentialLabel?: string
  generatedMcpServerID: string
}>

let activeRoot: string | null = null
let previousPluginPackageDirs: string | undefined

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
  previousPluginPackageDirs = process.env.FanFande_PLUGIN_PACKAGE_DIRS
  await Auth.clearProvider("plugin-app:manifest-lab:docs")
}

async function writeManifestPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = join(activeRoot, "plugin-packages")
  const packageRoot = join(packageSourceRoot, "manifest-lab")
  const manifestRoot = join(packageRoot, ".fanfande-plugin")
  const skillRoot = join(packageRoot, "skills", "review")
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

  process.env.FanFande_PLUGIN_PACKAGE_DIRS = packageSourceRoot
  return packageSourceRoot
}

async function writeCriticalPluginPackage() {
  if (!activeRoot) throw new Error("Temp root has not been initialized.")

  const packageSourceRoot = join(activeRoot, "critical-plugin-packages")
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

  process.env.FanFande_PLUGIN_PACKAGE_DIRS = packageSourceRoot
  return packageSourceRoot
}

afterEach(async () => {
  await Auth.clearProvider("plugin-app:manifest-lab:docs")
  if (previousPluginPackageDirs === undefined) {
    delete process.env.FanFande_PLUGIN_PACKAGE_DIRS
  } else {
    process.env.FanFande_PLUGIN_PACKAGE_DIRS = previousPluginPackageDirs
  }
  previousPluginPackageDirs = undefined
  Sqlite.closeDatabase()
  Sqlite.setDatabaseFile()
  Sqlite.closeDatabase()
  if (activeRoot) {
    await removeTreeWithRetry(activeRoot).catch(() => undefined)
    activeRoot = null
  }
})

describe("plugin marketplace API", () => {
  test("returns a stable curated plugin catalog without critical risk entries", async () => {
    await useTempDatabase()
    const app = createServerApp()

    const response = await app.request("/api/plugins/catalog")
    const body = (await response.json()) as PluginCatalogEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.length).toBeGreaterThan(0)
    expect(body.data?.some((plugin) => plugin.id === "github")).toBe(true)
    expect(body.data?.every((plugin) => plugin.risk !== "critical")).toBe(true)
    expect(body.data?.every((plugin) => plugin.tools.length > 0)).toBe(true)
    expect(body.data?.every((plugin) => plugin.mcpServers.length + plugin.skills.length + plugin.apps.length > 0)).toBe(true)
  })

  test("installs, disables, diagnoses, and removes a plugin-backed MCP server", async () => {
    await useTempDatabase()
    const app = createServerApp()
    const root = activeRoot ?? "~"

    const installResponse = await app.request("/api/plugins/installed/filesystem", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        config: {
          ROOT_PATH: root,
        },
        enabled: true,
      }),
    })
    const installBody = (await installResponse.json()) as InstalledPluginEnvelope

    expect(installResponse.status).toBe(200)
    expect(installBody.success).toBe(true)
    expect(installBody.data?.pluginID).toBe("filesystem")
    expect(installBody.data?.mcpServerID).toBe("plugin.filesystem")
    expect(installBody.data?.mcpServerIDs).toEqual(["plugin.filesystem"])

    const server = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.filesystem")
    expect(server?.transport).toBe("stdio")
    expect(server?.enabled).toBe(true)
    expect(server?.name).toBe("Filesystem")
    expect(server?.transport === "stdio" ? server.args?.at(-1) : undefined).toBe(root)

    const disableResponse = await app.request("/api/plugins/installed/filesystem", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: false,
      }),
    })
    const disableBody = (await disableResponse.json()) as InstalledPluginEnvelope
    const disabledServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.filesystem")

    expect(disableResponse.status).toBe(200)
    expect(disableBody.data?.enabled).toBe(false)
    expect(disabledServer?.enabled).toBe(false)

    const diagnosticResponse = await app.request("/api/plugins/installed/filesystem/diagnostic")
    const diagnosticBody = (await diagnosticResponse.json()) as DiagnosticEnvelope

    expect(diagnosticResponse.status).toBe(200)
    expect(diagnosticBody.success).toBe(true)
    expect(diagnosticBody.data?.serverID).toBe("plugin.filesystem")
    expect(diagnosticBody.data?.enabled).toBe(false)
    expect(diagnosticBody.data?.ok).toBe(false)
    expect(diagnosticBody.data?.error).toBe("Server is disabled.")

    const listResponse = await app.request("/api/plugins/installed")
    const listBody = (await listResponse.json()) as InstalledPluginsEnvelope
    expect(listBody.data?.some((plugin) => plugin.pluginID === "filesystem")).toBe(true)

    const deleteResponse = await app.request("/api/plugins/installed/filesystem", {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeletePluginEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.data?.removed).toBe(true)
    expect(deleteBody.data?.mcpServerIDs).toEqual(["plugin.filesystem"])
    expect(await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.filesystem")).toBeUndefined()
  })

  test("rejects installs that omit required plugin configuration", async () => {
    await useTempDatabase()
    const app = createServerApp()

    const response = await app.request("/api/plugins/installed/github", {
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
      "plugin.manifest-lab.app.docs",
    ])
    expect(installBody.data?.skillIDs).toEqual(["plugin:manifest-lab:review"])
    expect(installBody.data?.connectorIDs).toEqual(["plugin-app:manifest-lab:docs"])

    const appServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.app.docs")
    expect(appServer?.transport).toBe("remote")
    expect(appServer?.transport === "remote" ? appServer.connectorId : undefined).toBe("plugin-app:manifest-lab:docs")
    expect(appServer?.transport === "remote" ? appServer.serverUrl : undefined).toBeUndefined()
    expect(appServer?.transport === "remote" ? appServer.headers : undefined).toBeUndefined()

    const projectRoot = activeRoot ?? "."
    const skills = await Skill.list(projectRoot)
    expect(skills.some((skill) => skill.id === "plugin:manifest-lab:review" && skill.scope === "plugin")).toBe(true)
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

    const appServer = await Config.getMcpServer(Config.GLOBAL_CONFIG_ID, "plugin.manifest-lab.app.docs")
    expect(appServer?.transport).toBe("remote")
    expect(appServer?.transport === "remote" ? appServer.connectorId : undefined).toBe("plugin-app:manifest-lab:docs")
    expect(appServer?.transport === "remote" ? appServer.headers : undefined).toBeUndefined()
    expect(appServer?.transport === "remote" ? appServer.authorization : undefined).toBeUndefined()
    expect(JSON.stringify(appServer)).not.toContain("secret-test-key")

    const runtime = await Plugin.resolveConnectorRemoteServer("plugin-app:manifest-lab:docs")
    expect(runtime.serverUrl).toBe("https://docs.example.test/mcp")
    expect(runtime.headers?.["x-api-key"]).toBe("secret-test-key")

    const disconnectResponse = await app.request("/api/plugins/installed/manifest-lab/connectors/docs/api-key", {
      method: "DELETE",
    })
    const disconnectBody = (await disconnectResponse.json()) as SingleConnectorStatusEnvelope

    expect(disconnectResponse.status).toBe(200)
    expect(disconnectBody.data?.connected).toBe(false)

    await expect(Plugin.resolveConnectorRemoteServer("plugin-app:manifest-lab:docs")).rejects.toThrow("not connected")
  })
})
