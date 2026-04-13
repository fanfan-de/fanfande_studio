import { test, expect } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import z from "zod"
import { createServerApp } from "#server/server.ts"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as Permission from "#permission/permission.ts"
import * as Message from "#session/message.ts"
import * as Session from "#session/session.ts"
import * as db from "#database/Sqlite.ts"

interface JsonEnvelope<T = Record<string, unknown>> {
  success: boolean
  requestId?: string
  data?: T
  error?: {
    code: string
    message: string
  }
}

type PermissionRequestRecord = z.infer<typeof Permission.Request>
type PermissionRuleRecord = z.infer<typeof Permission.Rule>

type PermissionRequestResponse = JsonEnvelope<{
  request: PermissionRequestRecord
  rule?: PermissionRuleRecord
}>

type PermissionRequestListResponse = JsonEnvelope<PermissionRequestRecord[]>
type PermissionRuleListResponse = JsonEnvelope<PermissionRuleRecord[]>

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

async function createApprovalRequest(repositoryRoot: string, targetPath: string) {
  return Instance.provide({
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
        callID: `toolcall_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        tool: "read-file",
        state: {
          status: "waiting-approval",
          approvalID: `approval_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          input: {
            path: targetPath,
          },
          title: "Read File",
          time: {
            start: Date.now(),
          },
        },
      })

      await Session.updatePart(toolPart)

      const request = await Permission.registerApprovalRequest({
        assistant,
        toolPart,
      })

      return {
        request,
        sessionID: session.id,
        messageID: assistant.id,
        toolCallID: toolPart.callID,
      }
    },
  })
}

function findToolPart(messageID: string, toolCallID: string) {
  const parts = db.findManyWithSchema("parts", Message.Part, {
    where: [{ column: "messageID", value: messageID }],
  })

  return parts.find(
    (part): part is Message.ToolPart => part.type === "tool" && part.callID === toolCallID,
  )
}

test("permission api approves a waiting tool request and completes the tool part", async () => {
  const app = createServerApp()
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-api-approve-"))

  try {
    await createGitRepo(repositoryRoot, "permission-api-approve")
    const seeded = await createApprovalRequest(repositoryRoot, "README.md")

    const approveResponse = await app.request(
      `http://localhost/api/permissions/requests/${seeded.request.id}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "once",
        }),
      },
    )
    const approveBody = (await approveResponse.json()) as PermissionRequestResponse

    expect(approveResponse.status).toBe(200)
    expect(approveBody.success).toBe(true)
    expect(approveBody.data?.request.status).toBe("approved")

    const requestResponse = await app.request(
      `http://localhost/api/permissions/requests/${seeded.request.id}`,
    )
    const requestBody = (await requestResponse.json()) as JsonEnvelope<PermissionRequestRecord>

    expect(requestResponse.status).toBe(200)
    expect(requestBody.data?.status).toBe("approved")

    const listResponse = await app.request(
      `http://localhost/api/permissions/requests?sessionID=${seeded.sessionID}`,
    )
    const listBody = (await listResponse.json()) as PermissionRequestListResponse

    expect(listResponse.status).toBe(200)
    expect(listBody.data?.some((request) => request.id === seeded.request.id)).toBe(true)

    const toolPart = findToolPart(seeded.messageID, seeded.toolCallID)
    expect(toolPart?.state.status).toBe("completed")
    if (toolPart?.state.status === "completed") {
      expect(toolPart.state.output).toContain("README.md")
    }
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission api deny creates a persisted rule and marks the tool part denied", async () => {
  const app = createServerApp()
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-api-deny-"))
  let createdRuleID: string | undefined

  try {
    await createGitRepo(repositoryRoot, "permission-api-deny")
    const seeded = await createApprovalRequest(repositoryRoot, "README.md")

    const denyResponse = await app.request(
      `http://localhost/api/permissions/requests/${seeded.request.id}/deny`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "project",
          reason: "Need explicit review first.",
        }),
      },
    )
    const denyBody = (await denyResponse.json()) as PermissionRequestResponse

    expect(denyResponse.status).toBe(200)
    expect(denyBody.success).toBe(true)
    expect(denyBody.data?.request.status).toBe("denied")
    expect(denyBody.data?.rule?.scope).toBe("project")
    expect(denyBody.data?.rule?.effect).toBe("deny")

    createdRuleID = denyBody.data?.rule?.id

    const rulesResponse = await app.request("http://localhost/api/permissions/rules")
    const rulesBody = (await rulesResponse.json()) as PermissionRuleListResponse

    expect(rulesResponse.status).toBe(200)
    expect(rulesBody.data?.some((rule) => rule.id === createdRuleID)).toBe(true)

    const toolPart = findToolPart(seeded.messageID, seeded.toolCallID)
    expect(toolPart?.state.status).toBe("denied")
    if (toolPart?.state.status === "denied") {
      expect(toolPart.state.reason).toContain("Need explicit review first.")
    }
  } finally {
    if (createdRuleID) {
      await Permission.deleteRule(createdRuleID)
    }
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("permission api approval keeps tool history consistent when the approved execution fails", async () => {
  const app = createServerApp()
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-permission-api-error-"))

  try {
    await createGitRepo(repositoryRoot, "permission-api-error")
    const seeded = await createApprovalRequest(repositoryRoot, "missing.txt")

    const approveResponse = await app.request(
      `http://localhost/api/permissions/requests/${seeded.request.id}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "once",
        }),
      },
    )
    const approveBody = (await approveResponse.json()) as PermissionRequestResponse

    expect(approveResponse.status).toBe(200)
    expect(approveBody.success).toBe(true)
    expect(approveBody.data?.request.status).toBe("approved")

    const toolPart = findToolPart(seeded.messageID, seeded.toolCallID)
    expect(toolPart?.state.status).toBe("error")
    if (toolPart?.state.status === "error") {
      expect(toolPart.state.error).toContain("missing.txt")
    }
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
