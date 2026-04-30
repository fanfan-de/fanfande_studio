import z from "zod"
import * as Session from "#session/session.ts"
import * as Tool from "#tool/tool.ts"

const Parameters = z.object({
  title: z.string().min(1).max(120).optional().describe("Optional short title for the plan."),
  body: z.string().min(1).describe(
    "The proposed implementation plan in markdown. Include scope, assumptions or risks, concrete steps, and verification.",
  ),
})

function normalizePlanBody(body: string) {
  return body.trim().replace(/\r\n/g, "\n")
}

function inferPlanTitle(title: string | undefined, body: string) {
  const explicit = title?.trim()
  if (explicit) return explicit

  const heading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "))

  return heading ? heading.slice(2).trim() : "Implementation plan"
}

export const ExitPlanModeTool = Tool.define(
  "ExitPlanMode",
  async () => {
    return {
      title: "Exit Plan Mode",
      description:
        "Submit the completed plan, return to execution mode, and continue under that plan.",
      parameters: Parameters,
      assessPermission: (parameters, ctx) => {
        const session = Session.DataBaseRead("sessions", ctx.sessionID) as Session.SessionInfo | null
        const workflow = Session.normalizeWorkflowState(session?.workflow)
        const body = normalizePlanBody(parameters.body)

        if (!session || workflow.mode !== "planning") {
          return {
            action: "deny",
            risk: "medium",
            reason: "ExitPlanMode can only be used while the session is in planning mode.",
            resource: {
              body,
            },
            allowInPlanning: true,
          }
        }

        return {
          action: "allow",
          risk: "medium",
          reason: "Submitting a plan only changes the session workflow state before execution resumes.",
          resource: {
            body,
          },
          allowInPlanning: true,
        }
      },
      validate: (parameters, ctx) => {
        const session = Session.DataBaseRead("sessions", ctx.sessionID) as Session.SessionInfo | null
        if (!session) {
          return `Session '${ctx.sessionID}' was not found.`
        }

        const workflow = Session.normalizeWorkflowState(session.workflow)
        if (workflow.mode !== "planning") {
          return "ExitPlanMode can only be used while the session is in planning mode."
        }

        if (!normalizePlanBody(parameters.body)) {
          return "The submitted plan must not be empty."
        }
      },
      describeApproval: (parameters) => {
        const body = normalizePlanBody(parameters.body)
        const title = inferPlanTitle(parameters.title, body)
        return {
          title: `Review plan: ${title}`,
          summary: "Record the implementation plan before execution resumes.",
          details: {
            body,
          },
        }
      },
      execute: async (parameters, ctx) => {
        const session = Session.DataBaseRead("sessions", ctx.sessionID) as Session.SessionInfo | null
        if (!session) {
          throw new Error(`Session '${ctx.sessionID}' was not found.`)
        }

        const workflow = Session.normalizeWorkflowState(session.workflow)
        if (workflow.mode !== "planning") {
          throw new Error("ExitPlanMode can only be executed while the session is in planning mode.")
        }

        const body = normalizePlanBody(parameters.body)
        const title = inferPlanTitle(parameters.title, body)
        const updated = Session.updateSessionWorkflow(ctx.sessionID, () => {
          const now = Date.now()
          return {
            mode: "execution",
            plan: {
              status: "approved",
              draftMarkdown: body,
              pendingRequestID: undefined,
              approvedMarkdown: body,
              approvedAt: now,
              updatedAt: now,
            },
          }
        })

        if (!updated) {
          throw new Error(`Session '${ctx.sessionID}' was not found.`)
        }

        return {
          title: "Plan approved",
          text: [
            `Approved plan: ${title}`,
            "The session is back in execution mode.",
            "The next loop iteration should implement the approved plan.",
          ].join("\n"),
          metadata: {
            kind: "workflow-control",
            action: "exit-plan-mode",
            mode: "execution",
            approvedPlanTitle: title,
            approvedPlanMarkdown: body,
          },
        }
      },
      toModelOutput: async (result) => {
        const metadata = (result.metadata ?? {}) as Record<string, unknown>
        return {
          type: "json",
          value: {
            kind: "workflow-control",
            action: "exit-plan-mode",
            mode: "execution",
            approvedPlanTitle:
              typeof metadata.approvedPlanTitle === "string" ? metadata.approvedPlanTitle : undefined,
            approvedPlanMarkdown:
              typeof metadata.approvedPlanMarkdown === "string" ? metadata.approvedPlanMarkdown : undefined,
            message: result.text,
          },
        }
      },
    }
  },
  {
    title: "Exit Plan Mode",
    aliases: ["exit_plan_mode", "exit-plan-mode"],
    capabilities: {
      kind: "workflow",
      readOnly: false,
      destructive: false,
      concurrency: "exclusive",
    },
  },
)
