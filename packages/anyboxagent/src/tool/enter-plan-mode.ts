import z from "zod"
import * as Session from "#session/core/session.ts"
import * as Tool from "#tool/tool.ts"

const Parameters = z.object({
  goal: z.string().min(1).optional().describe("Optional short statement of what should be planned."),
  reason: z.string().min(1).optional().describe("Optional reason for switching into planning mode."),
})

export const EnterPlanModeTool = Tool.define(
  "enter_plan_mode",
  async () => {
    return {
      title: "Enter Plan Mode",
      description:
        "Switch the current session into planning mode. This clears any previously approved plan for the active task and restarts the loop in read-only planning mode.",
      parameters: Parameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Entering planning mode only changes the session workflow state.",
        allowInPlanning: true,
      }),
      execute: async (parameters, ctx) => {
        const updated = Session.updateSessionWorkflow(ctx.sessionID, () => ({
          mode: "planning",
          plan: {
            status: "draft",
            draftMarkdown: undefined,
            pendingRequestID: undefined,
            approvedMarkdown: undefined,
            approvedAt: undefined,
            updatedAt: Date.now(),
          },
        }))

        if (!updated) {
          throw new Error(`Session '${ctx.sessionID}' was not found.`)
        }

        return {
          title: "Planning mode enabled",
          text: [
            "The session is now in planning mode.",
            parameters.goal ? `Goal: ${parameters.goal}` : undefined,
            parameters.reason ? `Reason: ${parameters.reason}` : undefined,
            "The loop will restart in read-only planning mode.",
          ].filter(Boolean).join("\n"),
          metadata: {
            kind: "workflow-control",
            action: "enter-plan-mode",
            mode: "planning",
            restartLoop: true,
            goal: parameters.goal,
            reason: parameters.reason,
          },
        }
      },
      toModelOutput: async (result) => {
        return {
          type: "json",
          value: {
            kind: "workflow-control",
            action: "enter-plan-mode",
            mode: "planning",
            restartLoop: true,
            message: result.text,
          },
        }
      },
    }
  },
  {
    title: "Enter Plan Mode",
    aliases: ["EnterPlanMode", "enter-plan-mode"],
    capabilities: {
      kind: "workflow",
      readOnly: false,
      destructive: false,
      concurrency: "exclusive",
    },
  },
)
