import { test, expect } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as Permission from "#permission/permission.ts"
import * as Session from "#session/core/session.ts"
import * as SessionUseCase from "#server/usecases/session.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

test("workflow API toggles plan mode and approves a proposed plan", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-mode-workflow-"))

  try {
    await createGitRepo(repositoryRoot, "plan-mode-workflow")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        SessionUseCase.updateSessionWorkflow(session.id, { action: "enter-plan" })
        const planning = Session.normalizeWorkflowState(
          (Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null)?.workflow,
        )
        expect(planning.mode).toBe("planning")
        expect(planning.plan.status).toBe("draft")
        expect(planning.plan.pendingInstruction).toBe("plan-mode")

        SessionUseCase.updateSessionWorkflow(session.id, { action: "leave-plan" })
        const left = Session.normalizeWorkflowState(
          (Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null)?.workflow,
        )
        expect(left.mode).toBe("execution")
        expect(left.plan.status).toBe("idle")
        expect(left.plan.pendingInstruction).toBe("exit-plan")

        const proposedPlanMarkdown = [
          "<proposed_plan>",
          "# Implement background task controls",
          "",
          "## Summary",
          "Add task status reads.",
          "",
          "## Implementation",
          "Register the new controls.",
          "",
          "## Tests",
          "Run tool tests.",
          "</proposed_plan>",
        ].join("\n")
        SessionUseCase.updateSessionWorkflow(session.id, {
          action: "approve-plan",
          proposedPlanMarkdown,
        })
        const approved = Session.normalizeWorkflowState(
          (Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null)?.workflow,
        )
        expect(approved.mode).toBe("execution")
        expect(approved.plan.status).toBe("approved")
        expect(approved.plan.approvedMarkdown).toBe(proposedPlanMarkdown)
        expect(approved.plan.pendingInstruction).toBe("execute-approved-plan")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("planning mode permissions allow research and AskUserQuestion but deny write tools", async () => {
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

        SessionUseCase.updateSessionWorkflow(session.id, { action: "enter-plan" })

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

        expect(readDecision.action).toBe("allow")
        expect(writeDecision.action).toBe("deny")
        expect(askDecision.action).toBe("allow")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
