import { test, expect } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as Permission from "#permission/permission.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"
import * as db from "#database/Sqlite.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

test("permission defaults allow reads and ask writes while honoring tool deny intents", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-defaults-"))

  try {
    await createGitRepo(repositoryRoot, "permission-defaults")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const sessionID = Identifier.ascending("session")
        const messageID = Identifier.ascending("message")

        const readDecision = await Permission.evaluate({
          sessionID,
          messageID,
          projectID: Instance.project.id,
          agent: "plan",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          tool: {
            id: "read-file",
            kind: "read",
            readOnly: true,
            destructive: false,
            needsShell: false,
          },
          input: {
            path: "README.md",
          },
        })

        const writeDecision = await Permission.evaluate({
          sessionID,
          messageID,
          projectID: Instance.project.id,
          agent: "plan",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          tool: {
            id: "replace-text",
            kind: "write",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
          input: {
            file_path: "README.md",
            old_string: "# permission-defaults",
            new_string: "# changed",
          },
        })

        const execDecision = await Permission.evaluate({
          sessionID,
          messageID,
          projectID: Instance.project.id,
          agent: "plan",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          tool: {
            id: "git_bash_command",
            kind: "exec",
            readOnly: false,
            destructive: true,
            needsShell: true,
          },
          input: {
            command: "rm -rf /",
          },
          intent: {
            action: "deny",
            risk: "critical",
            reason: "Command matches a critical-risk shell pattern.",
            resource: {
              command: "rm -rf /",
              workdir: ".",
              paths: ["."],
            },
          },
        })

        expect(readDecision.action).toBe("allow")
        expect(writeDecision.action).toBe("ask")
        expect(writeDecision.derived.paths).toContain("README.md")
        expect(execDecision.action).toBe("deny")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission allows read-only tools to reference outside paths", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-read-outside-"))
  const outsideRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-read-outside-target-"))

  try {
    await createGitRepo(repositoryRoot, "permission-read-outside")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const outsideFile = path.join(outsideRoot, "outside.txt")
        const base = {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          projectID: Instance.project.id,
          agent: "default",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          input: {
            file_path: outsideFile,
          },
        }

        const readDecision = await Permission.evaluate({
          ...base,
          tool: {
            id: "read-file",
            kind: "read",
            readOnly: true,
            destructive: false,
            needsShell: false,
          },
        })
        const writeDecision = await Permission.evaluate({
          ...base,
          tool: {
            id: "replace-text",
            kind: "write",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
        })

        expect(readDecision.action).toBe("allow")
        expect(writeDecision.action).toBe("deny")
        expect(readDecision.derived.paths).toContain(outsideFile.replaceAll("\\", "/"))
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
    await rm(outsideRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission defaults classify workflow, interaction, and delegation tools explicitly", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-tool-kinds-"))

  try {
    await createGitRepo(repositoryRoot, "permission-tool-kinds")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const baseInput = {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          projectID: Instance.project.id,
          agent: "default",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          input: {},
        }

        await expect(Permission.evaluate({
          ...baseInput,
          tool: {
            id: "AskUserQuestion",
            kind: "interaction",
            readOnly: true,
            destructive: false,
            needsShell: false,
          },
        })).resolves.toMatchObject({
          action: "allow",
          risk: "low",
        })

        await expect(Permission.evaluate({
          ...baseInput,
          tool: {
            id: "EnterPlanMode",
            kind: "workflow",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
        })).resolves.toMatchObject({
          action: "ask",
          risk: "low",
        })

        await expect(Permission.evaluate({
          ...baseInput,
          tool: {
            id: "spawn_subagent",
            kind: "delegation",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
        })).resolves.toMatchObject({
          action: "ask",
          risk: "medium",
        })
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission evaluates tool intents before falling back to tool kind defaults", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-intents-"))

  try {
    await createGitRepo(repositoryRoot, "permission-intents")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const baseInput = {
          sessionID: Identifier.ascending("session"),
          messageID: Identifier.ascending("message"),
          projectID: Instance.project.id,
          agent: "plan",
          cwd: Instance.directory,
          worktree: Instance.worktree,
          tool: {
            id: "intent-tool",
            kind: "other" as const,
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
          input: {},
        }

        await expect(Permission.evaluate({
          ...baseInput,
          toolCallID: "toolcall_intent_allow",
          intent: {
            action: "allow",
            risk: "low",
            reason: "Tool assessed this call as safe.",
          },
        })).resolves.toMatchObject({
          action: "allow",
          reason: "Tool assessed this call as safe.",
        })

        await expect(Permission.evaluate({
          ...baseInput,
          toolCallID: "toolcall_intent_ask",
          intent: {
            action: "ask",
            risk: "medium",
            reason: "Tool requires user confirmation.",
          },
        })).resolves.toMatchObject({
          action: "ask",
          reason: "Tool requires user confirmation.",
        })

        await expect(Permission.evaluate({
          ...baseInput,
          toolCallID: "toolcall_intent_deny",
          intent: {
            action: "deny",
            risk: "critical",
            reason: "Tool blocked this operation.",
          },
        })).resolves.toMatchObject({
          action: "deny",
          reason: "Tool blocked this operation.",
          risk: "critical",
        })
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission approval can complete a waiting read-file tool call without resuming the LLM loop", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-approve-"))

  try {
    await createGitRepo(repositoryRoot, "permission-approve")

    const request = await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const assistant: Message.Assistant = {
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "assistant",
          created: Date.now(),
          parentID: "",
          modelID: "test-model",
          providerID: "test-provider",
          agent: "plan",
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0,
            },
          },
        }

        Session.DataBaseCreate("messages", assistant)

        const toolPart = Message.ToolPart.parse({
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistant.id,
          type: "tool",
          callID: "toolcall_readme",
          tool: "read-file",
          state: {
            status: "waiting-approval",
            approvalID: "approval_readme",
            input: {
              path: "README.md",
            },
            title: "Read File",
            time: {
              start: Date.now(),
            },
          },
        })

        await Session.updatePart(toolPart)
        return await Permission.registerApprovalRequest({
          assistant,
          toolPart,
        })
      },
    })

    const resolved = await Permission.resolveRequest(request.id, {
      decision: "allow",
    })

    expect(resolved.request.status).toBe("approved")

    const restoredSession = Session.DataBaseRead("sessions", request.sessionID)
    expect(restoredSession).not.toBeNull()

    const toolParts = db.findManyWithSchema("parts", Message.Part, {
      where: [{ column: "messageID", value: request.messageID }],
    })

    const updatedTool = toolParts.find(
      (part): part is Message.ToolPart => part.type === "tool" && part.callID === request.toolCallID,
    )

    expect(updatedTool?.state.status).toBe("completed")
    if (updatedTool?.state.status === "completed") {
      expect(updatedTool.state.output).toContain("README.md")
    }
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
