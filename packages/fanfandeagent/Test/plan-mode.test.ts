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
import { EnterPlanModeTool } from "#tool/enter-plan-mode.ts"
import { ExitPlanModeTool } from "#tool/exit-plan-mode.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

test("plan mode tools switch workflow state and persist the approved plan", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-mode-tools-"))

  try {
    await createGitRepo(repositoryRoot, "plan-mode-tools")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const enterRuntime = await EnterPlanModeTool.init()
        const exitRuntime = await ExitPlanModeTool.init()
        const ctx = {
          sessionID: session.id,
          messageID: Identifier.ascending("message"),
        }

        await enterRuntime.execute(
          {
            goal: "Plan the implementation before editing files.",
          },
          ctx,
        )

        const planningSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const planningWorkflow = Session.normalizeWorkflowState(planningSession?.workflow)
        expect(planningWorkflow.mode).toBe("planning")
        expect(planningWorkflow.plan.status).toBe("draft")

        await exitRuntime.execute(
          {
            title: "Implement background task controls",
            body: [
              "# Implement background task controls",
              "",
              "## Scope",
              "- add task status reads",
              "",
              "## Risks",
              "- command termination races",
              "",
              "## Steps",
              "1. register the new tools",
              "2. add tests",
              "",
              "## Verification",
              "- run tool tests",
            ].join("\n"),
          },
          ctx,
        )

        const executionSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const executionWorkflow = Session.normalizeWorkflowState(executionSession?.workflow)
        expect(executionWorkflow.mode).toBe("execution")
        expect(executionWorkflow.plan.status).toBe("approved")
        expect(executionWorkflow.plan.approvedMarkdown).toContain("## Steps")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("planning mode permissions only allow research tools and auto-run plan submission", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-mode-permissions-"))

  try {
    await createGitRepo(repositoryRoot, "plan-mode-permissions")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        Session.updateSessionWorkflow(session.id, () => ({
          mode: "planning",
          plan: {
            status: "draft",
            updatedAt: Date.now(),
          },
        }))

        const baseInput = {
          sessionID: session.id,
          messageID: Identifier.ascending("message"),
          projectID: Instance.project.id,
          agent: "plan",
          cwd: Instance.directory,
          worktree: Instance.worktree,
        }

        const readDecision = await Permission.evaluate({
          ...baseInput,
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
          ...baseInput,
          tool: {
            id: "replace-text",
            kind: "write",
            readOnly: false,
            destructive: true,
            needsShell: false,
          },
          input: {
            file_path: "README.md",
            old_string: "# plan-mode-permissions",
            new_string: "# changed",
          },
        })

        const askDecision = await Permission.evaluate({
          ...baseInput,
          tool: {
            id: "AskUserQuestion",
            kind: "interaction",
            readOnly: true,
            destructive: false,
            needsShell: false,
          },
          input: {
            question: "Which option should we choose?",
          },
          intent: {
            action: "allow",
            risk: "low",
            reason: "Asking the user a question is safe in planning mode.",
          },
        })

        const planBody = "# Plan\n\n## Steps\n1. Do work\n\n## Verification\n- Run tests"
        const exitDecision = await Permission.evaluate({
          ...baseInput,
          tool: {
            id: "ExitPlanMode",
            kind: "workflow",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
          input: {
            title: "Implementation plan",
            body: planBody,
          },
          intent: {
            action: "allow",
            risk: "medium",
            reason: "Submitting a plan only changes the session workflow state before execution resumes.",
            resource: {
              body: planBody,
            },
            allowInPlanning: true,
          },
        })

        const executionSession = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })
        const nonPlanningExitBody = "# Plan\n\n## Steps\n1. Should not submit"
        const nonPlanningExitDecision = await Permission.evaluate({
          ...baseInput,
          sessionID: executionSession.id,
          tool: {
            id: "ExitPlanMode",
            kind: "workflow",
            readOnly: false,
            destructive: false,
            needsShell: false,
          },
          input: {
            title: "Implementation plan",
            body: nonPlanningExitBody,
          },
          intent: {
            action: "deny",
            risk: "medium",
            reason: "ExitPlanMode can only be used while planning mode is active.",
            resource: {
              body: nonPlanningExitBody,
            },
            allowInPlanning: true,
          },
        })

        expect(readDecision.action).toBe("allow")
        expect(writeDecision.action).toBe("deny")
        expect(askDecision.action).toBe("allow")
        expect(exitDecision.action).toBe("allow")
        expect(nonPlanningExitDecision.action).toBe("deny")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("registering an ExitPlanMode approval request stages the draft plan and approval denial keeps planning active", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-mode-approval-"))

  try {
    await createGitRepo(repositoryRoot, "plan-mode-approval")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        Session.updateSessionWorkflow(session.id, () => ({
          mode: "planning",
          plan: {
            status: "draft",
            updatedAt: Date.now(),
          },
        }))

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
          callID: "toolcall_exit_plan_mode",
          tool: "ExitPlanMode",
          state: {
            status: "waiting-approval",
            approvalID: "approval_exit_plan_mode",
            input: {
              title: "Implementation plan",
              body: "# Plan\n\n## Steps\n1. Stage the work\n\n## Verification\n- Run tests",
            },
            title: "Submit implementation plan",
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

        expect(request.prompt?.details?.body).toContain("## Steps")

        const pendingSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const pendingWorkflow = Session.normalizeWorkflowState(pendingSession?.workflow)
        expect(pendingWorkflow.mode).toBe("planning")
        expect(pendingWorkflow.plan.status).toBe("pending-approval")
        expect(pendingWorkflow.plan.pendingRequestID).toBe(request.id)

        await Permission.resolveRequest(request.id, {
          decision: "deny",
          note: "Clarify the rollout steps first.",
        })

        const deniedSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const deniedWorkflow = Session.normalizeWorkflowState(deniedSession?.workflow)
        expect(deniedWorkflow.mode).toBe("planning")
        expect(deniedWorkflow.plan.status).toBe("draft")
        expect(deniedWorkflow.plan.pendingRequestID).toBeUndefined()
        expect(deniedWorkflow.plan.draftMarkdown).toContain("## Steps")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
