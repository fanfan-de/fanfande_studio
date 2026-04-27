import { afterEach, describe, expect, it } from "bun:test"
import "./sqlite.cleanup.ts"
import z from "zod"
import * as Agent from "#agent/agent.ts"
import * as Config from "#config/config.ts"
import { Instance } from "#project/instance.ts"
import { resolveTools } from "#session/resolve-tools.ts"
import * as ToolRegistry from "#tool/registry.ts"
import * as Tool from "#tool/tool.ts"

async function resolveAgentToolNames(agentName: string) {
  const agent = await Agent.get(agentName)
  if (!agent) {
    throw new Error(`Expected built-in agent '${agentName}' to exist.`)
  }

  return Object.keys(
    await resolveTools({
      agent,
      sessionID: `ses_tool_selection_${agentName}`,
      messageID: `msg_tool_selection_${agentName}`,
      abort: new AbortController().signal,
    }),
  )
}

describe("global built-in tool selection", () => {
  afterEach(async () => {
    await Config.setToolSelection(Config.GLOBAL_CONFIG_ID, {})
  })

  it("keeps built-in tools available when the global selection is empty", async () => {
    await Config.setToolSelection(Config.GLOBAL_CONFIG_ID, {})

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const toolNames = await resolveAgentToolNames("default")
        expect(toolNames).toContain("read-file")
        expect(toolNames).toContain("exec_command")
        expect(toolNames).toContain("bash")
      },
    })
  })

  it("filters a globally disabled built-in tool and its aliases", async () => {
    await Config.setToolSelection(Config.GLOBAL_CONFIG_ID, {
      exec_command: false,
    })

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const toolNames = await resolveAgentToolNames("default")
        expect(toolNames).not.toContain("exec_command")
        expect(toolNames).not.toContain("bash")
        expect(toolNames).not.toContain("exec-command")
      },
    })
  })

  it("does not let explicit global true bypass the agent allowlist", async () => {
    await Config.setToolSelection(Config.GLOBAL_CONFIG_ID, {
      "write-file": true,
    })

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const toolNames = await resolveAgentToolNames("plan")
        expect(toolNames).toContain("read-file")
        expect(toolNames).not.toContain("write-file")
      },
    })
  })

  it("does not apply built-in selection records to custom tools", async () => {
    await Config.setToolSelection(Config.GLOBAL_CONFIG_ID, {
      "custom-test-tool": false,
    })

    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const registry = await ToolRegistry.state()
        registry.custom.push(
          Tool.define("custom-test-tool", async () => ({
            description: "Test-only custom tool.",
            parameters: z.object({}),
            execute: async () => "ok",
          })),
        )

        const toolNames = await resolveAgentToolNames("default")
        expect(toolNames).toContain("custom-test-tool")
      },
    })
  })
})
