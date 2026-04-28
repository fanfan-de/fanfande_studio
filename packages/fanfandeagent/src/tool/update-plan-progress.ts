import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Message from "#session/message.ts"
import * as Orchestrator from "#session/orchestrator.ts"
import * as Progress from "#session/progress.ts"
import * as Session from "#session/session.ts"
import * as Tool from "#tool/tool.ts"

const PlanItemParameters = z.object({
  step: z.string().min(1).describe("A concise step in the current plan."),
  status: Progress.SessionProgressItemStatus.describe("The current status for this step."),
})

const Parameters = z
  .object({
    explanation: z.string().min(1).optional().describe("Optional short explanation for this progress update."),
    plan: z.array(PlanItemParameters).min(1).max(20).describe("The complete current progress list."),
  })
  .superRefine((value, ctx) => {
    const inProgressCount = value.plan.filter((item) => item.status === "in_progress").length
    if (inProgressCount > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["plan"],
        message: "At most one plan item may be in_progress.",
      })
    }

    value.plan.forEach((item, index) => {
      if (!Progress.normalizeProgressStepKey(item.step)) {
        ctx.addIssue({
          code: "custom",
          path: ["plan", index, "step"],
          message: "Plan item step must not be empty.",
        })
      }
    })
  })

function findSourceUserMessageID(sessionID: string, assistantMessageID: string) {
  const assistant = Session.DataBaseRead("messages", assistantMessageID) as Message.MessageInfo | null
  const assistantCreated = assistant?.role === "assistant" ? assistant.created : Number.MAX_SAFE_INTEGER
  const messages = db.findManyWithSchema("messages", Message.MessageInfo, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [{ column: "created", direction: "DESC" }],
  })

  return messages.find(
    (message): message is Message.User =>
      message.role === "user" && message.created <= assistantCreated,
  )?.id
}

function renderProgressText(progress: Progress.SessionProgressState) {
  const lines = progress.items.map((item) => `- [${item.status}] ${item.step}`)
  return [
    progress.explanation ? `Explanation: ${progress.explanation}` : undefined,
    `Progress updated: ${progress.items.filter((item) => item.status === "completed").length}/${progress.items.length} completed`,
    "",
    ...lines,
  ].filter((line): line is string => typeof line === "string").join("\n")
}

export const UpdatePlanProgressTool = Tool.define(
  "UpdatePlanProgress",
  async () => {
    return {
      title: "Update Plan Progress",
      description:
        "Replace the current session progress checklist with an explicit progress snapshot. Use this for long tasks in both planning and execution mode.",
      parameters: Parameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Updating the session progress checklist has no filesystem or command side effects.",
        allowInPlanning: true,
      }),
      execute: async (parameters, ctx) => {
        const session = Session.DataBaseRead("sessions", ctx.sessionID) as Session.SessionInfo | null
        if (!session) {
          throw new Error(`Session '${ctx.sessionID}' was not found.`)
        }

        const previousWorkflow = Session.normalizeWorkflowState(session.workflow)
        const progress = Progress.createSessionProgressState({
          explanation: parameters.explanation,
          plan: parameters.plan,
          previous: previousWorkflow.progress,
          sourceAssistantMessageID: ctx.messageID,
          sourceUserMessageID: findSourceUserMessageID(ctx.sessionID, ctx.messageID),
          toolCallID: ctx.toolCallID,
        })

        const updated = Session.updateSessionWorkflow(ctx.sessionID, (workflow) => ({
          ...workflow,
          progress,
        }))

        if (!updated) {
          throw new Error(`Session '${ctx.sessionID}' was not found.`)
        }

        Orchestrator.activeTurn(ctx.sessionID)?.emit("plan.progress.updated", {
          progress,
        })

        return {
          title: "Plan progress updated",
          text: renderProgressText(progress),
          metadata: {
            kind: "plan-progress",
            progress,
          },
          data: progress,
        }
      },
      toModelOutput: async (result) => {
        const metadata = (result.metadata ?? {}) as Record<string, unknown>
        const progress = Progress.SessionProgressState.safeParse(metadata.progress)
        return {
          type: "json" as const,
          value: {
            kind: "plan-progress",
            updated: true,
            progress: progress.success ? progress.data : undefined,
            message: result.text,
          },
        }
      },
    }
  },
  {
    title: "Update Plan Progress",
    aliases: ["update_plan", "update-plan-progress"],
    capabilities: {
      kind: "workflow",
      readOnly: true,
      destructive: false,
      concurrency: "exclusive",
    },
  },
)
