import { test, expect } from "bun:test"
import "./sqlite.cleanup.ts"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Instance } from "#project/instance.ts"
import * as Identifier from "#id/id.ts"
import * as EventStore from "#session/event-store.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Session from "#session/session.ts"
import { UpdatePlanProgressTool } from "#tool/update-plan-progress.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

test("UpdatePlanProgress persists snapshots in planning and execution and reuses item ids", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-progress-"))

  try {
    await createGitRepo(repositoryRoot, "plan-progress")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })
        const runtime = await UpdatePlanProgressTool.init()
        const ctx = {
          sessionID: session.id,
          messageID: Identifier.ascending("message"),
          toolCallID: "toolcall_progress_1",
        }

        Session.updateSessionWorkflow(session.id, () => ({
          mode: "planning",
          plan: {
            status: "draft",
            updatedAt: Date.now(),
          },
        }))

        const firstResult = await runtime.execute(
          {
            explanation: "Initial progress",
            plan: [
              { step: "Inspect code", status: "completed" },
              { step: "Implement tool", status: "in_progress" },
              { step: "Run tests", status: "pending" },
            ],
          },
          ctx,
        )
        const firstModelOutput = await runtime.toModelOutput?.(firstResult)

        const planningSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const planningWorkflow = Session.normalizeWorkflowState(planningSession?.workflow)
        expect(firstModelOutput).toMatchObject({
          type: "json",
          value: {
            kind: "plan-progress",
            updated: true,
          },
        })
        expect(planningWorkflow.mode).toBe("planning")
        expect(planningWorkflow.progress?.items.map((item) => item.status)).toEqual([
          "completed",
          "in_progress",
          "pending",
        ])
        const implementID = planningWorkflow.progress?.items[1]?.id

        Session.updateSessionWorkflow(session.id, (workflow) => ({
          ...workflow,
          mode: "execution",
        }))

        await runtime.execute(
          {
            explanation: "Implementation finished",
            plan: [
              { step: "Inspect code", status: "completed" },
              { step: "Implement tool", status: "completed" },
              { step: "Run tests", status: "in_progress" },
            ],
          },
          {
            ...ctx,
            toolCallID: "toolcall_progress_2",
          },
        )

        const executionSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const executionWorkflow = Session.normalizeWorkflowState(executionSession?.workflow)
        expect(executionWorkflow.mode).toBe("execution")
        expect(executionWorkflow.progress?.items[1]?.id).toBe(implementID)
        expect(executionWorkflow.progress?.items[1]?.status).toBe("completed")
        expect(executionWorkflow.progress?.toolCallID).toBe("toolcall_progress_2")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("UpdatePlanProgress rejects multiple in-progress items", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-progress-invalid-"))

  try {
    await createGitRepo(repositoryRoot, "plan-progress-invalid")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })
        const runtime = await UpdatePlanProgressTool.init()

        await expect(runtime.execute(
          {
            plan: [
              { step: "One", status: "in_progress" },
              { step: "Two", status: "in_progress" },
            ],
          },
          {
            sessionID: session.id,
            messageID: Identifier.ascending("message"),
          },
        )).rejects.toThrow("At most one plan item may be in_progress")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)

test("plan progress runtime events are stored and projected", async () => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-plan-progress-event-"))

  try {
    await createGitRepo(repositoryRoot, "plan-progress-event")

    await Instance.provide({
      directory: repositoryRoot,
      async fn() {
        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })
        const progress = {
          items: [
            {
              id: Identifier.ascending("task"),
              step: "Project event",
              status: "in_progress",
            },
          ],
          updatedAt: Date.now(),
        } satisfies RuntimeEvent.RuntimeEventPayloadByType["plan.progress.updated"]["progress"]
        const factory = RuntimeEvent.createRuntimeEventFactory({
          sessionID: session.id,
          turnID: Identifier.ascending("turn"),
        })
        const event = factory.next("plan.progress.updated", {
          progress,
        })

        EventStore.appendAndProject(event)

        const events = EventStore.listTurnEvents({
          sessionID: session.id,
          turnID: event.turnID,
        })
        const projectedSession = Session.DataBaseRead("sessions", session.id) as Session.SessionInfo | null
        const workflow = Session.normalizeWorkflowState(projectedSession?.workflow)

        expect(events.some((item) => item.type === "plan.progress.updated")).toBe(true)
        expect(workflow.progress?.items[0]?.step).toBe("Project event")
      },
    })
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true })
  }
}, 120000)
