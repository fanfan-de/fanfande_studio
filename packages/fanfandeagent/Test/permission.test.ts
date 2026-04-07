import { test, expect } from "bun:test"
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

test("permission defaults allow reads, ask writes, and deny dangerous commands", async () => {
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
            id: "write-file",
            kind: "write",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
          input: {
            path: "README.md",
            content: "changed",
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
            id: "exec_command",
            kind: "exec",
            readOnly: false,
            destructive: true,
            needsShell: true,
          },
          input: {
            command: "rm -rf /",
          },
        })

        expect(readDecision.action).toBe("allow")
        expect(writeDecision.action).toBe("ask")
        expect(execDecision.action).toBe("deny")
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
      decision: "allow-once",
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
