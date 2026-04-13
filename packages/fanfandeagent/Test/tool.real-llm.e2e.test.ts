import { expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance } from "#project/instance.ts"
import * as Message from "#session/message.ts"
import * as Prompt from "#session/prompt.ts"
import * as Session from "#session/session.ts"

const hasRealModel = Boolean(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY)
const realTest = hasRealModel ? test : test.skip

function selectModel() {
  if (process.env.OPENAI_API_KEY) {
    return {
      providerID: "openai",
      modelID: "gpt-4o-mini",
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    return {
      providerID: "deepseek",
      modelID: "deepseek-chat",
    }
  }

  throw new Error("No supported LLM API key found.")
}

type Scenario = {
  name: string
  toolName: string
  prompt: string
  setup: (directory: string) => Promise<void>
  verify: (
    directory: string,
    assistant: Message.WithParts,
    toolPart: Message.ToolPart,
  ) => Promise<void> | void
}

async function runScenario(scenario: Scenario) {
  const workspaceRoot = process.cwd()
  const tempRoot = path.join(workspaceRoot, "Test", ".tmp")
  const directory = path.join(
    tempRoot,
    `prompt-llm-${scenario.toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  await fs.mkdir(directory, { recursive: true })

  try {
    await scenario.setup(directory)

    await Instance.provide({
      directory,
      async fn() {
        const selectedModel = selectModel()
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const assistant = await Prompt.prompt({
          sessionID: session.id,
          model: selectedModel,
          system: "You are validating a code-agent tool. Use the requested tool exactly once, then give a short confirmation.",
          parts: [
            {
              type: "text",
              text: scenario.prompt,
            },
          ],
        })

        const conversation: Message.WithParts[] = []
        for await (const item of Message.stream(session.id)) {
          if (item.info.role === "user") continue
          conversation.push(item)
        }

        const toolPart = conversation
          .flatMap((item) => item.parts)
          .find((part): part is Message.ToolPart => part.type === "tool" && part.tool === scenario.toolName)

        expect(toolPart, `${scenario.name}: expected ${scenario.toolName} to be persisted in DB`).toBeDefined()
        expect(toolPart?.state.status, `${scenario.name}: tool result was not completed`).toBe("completed")

        await scenario.verify(directory, assistant, toolPart as Message.ToolPart)

        return assistant
      },
    })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

realTest("real LLM can use prompt() to drive core tools", async () => {
  const scenarios: Scenario[] = [
    {
      name: "read-file",
      toolName: "read-file",
      setup: async (directory) => {
        await fs.writeFile(path.join(directory, "readme.txt"), "alpha-content", "utf8")
      },
      prompt: "Read readme.txt with the read-file tool and reply with the exact content.",
      verify: async (_directory, _assistant, toolPart) => {
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("alpha-content")
      },
    },
    {
      name: "list-directory",
      toolName: "list-directory",
      setup: async (directory) => {
        await fs.mkdir(path.join(directory, "nested", "deep"), { recursive: true })
        await fs.writeFile(path.join(directory, "root.txt"), "root", "utf8")
        await fs.writeFile(path.join(directory, "nested", "deep", "child.txt"), "child", "utf8")
      },
      prompt: "List the current directory recursively with the list-directory tool and mention nested and child.txt.",
      verify: async (_directory, _assistant, toolPart) => {
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("nested")
        expect(String(completed.output)).toContain("child.txt")
      },
    },
    {
      name: "search-files",
      toolName: "search-files",
      setup: async (directory) => {
        await fs.mkdir(path.join(directory, "search"), { recursive: true })
        await fs.writeFile(path.join(directory, "search", "one.txt"), "needle on line one", "utf8")
        await fs.writeFile(path.join(directory, "search", "two.txt"), "nothing here", "utf8")
      },
      prompt: "Search the current directory for needle with the search-files tool and mention one.txt.",
      verify: async (_directory, _assistant, toolPart) => {
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("needle")
        expect(String(completed.output)).toContain("one.txt")
      },
    },
    {
      name: "write-file",
      toolName: "write-file",
      setup: async () => undefined,
      prompt: "Create generated/from-llm.txt with the write-file tool and write the exact content created-by-llm.",
      verify: async (directory, _assistant, toolPart) => {
        const written = await fs.readFile(path.join(directory, "generated", "from-llm.txt"), "utf8")
        expect(written).toBe("created-by-llm")
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("Wrote")
      },
    },
    {
      name: "replace-text",
      toolName: "replace-text",
      setup: async (directory) => {
        await fs.writeFile(path.join(directory, "edit.txt"), "alpha beta alpha", "utf8")
      },
      prompt: "Replace alpha with omega in edit.txt using the replace-text tool.",
      verify: async (directory, _assistant, toolPart) => {
        const updated = await fs.readFile(path.join(directory, "edit.txt"), "utf8")
        expect(updated).toBe("omega beta omega")
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("Replaced 2")
      },
    },
    {
      name: "bash",
      toolName: "bash",
      setup: async () => undefined,
      prompt: "Run echo bash-ok with the bash tool and then confirm bash-ok.",
      verify: async (_directory, _assistant, toolPart) => {
        const completed = toolPart.state as Message.ToolStateCompleted
        expect(String(completed.output)).toContain("bash-ok")
      },
    },
  ]

  for (const scenario of scenarios) {
    await runScenario(scenario)
  }
}, 360000)
