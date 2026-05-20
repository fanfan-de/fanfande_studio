import z from "zod"
import type { JSONValue } from "@ai-sdk/provider"
import * as Identifier from "#id/id.ts"
import * as Tool from "#tool/tool.ts"
import * as Subtask from "#session/tasks/subtask.ts"
import { renderSubtaskText, toSubtaskModelValue } from "#tool/subagent-shared.ts"

const ReadSubagentParameters = z.object({
  id: Identifier.schema("task").describe("Subagent task id."),
  maxSummaryChars: z.number().int().positive().max(50_000).optional().describe("Maximum summary characters returned."),
})

export const ReadSubagentTool = Tool.define(
  "read_subagent",
  async () => {
    return {
      title: "Read Subagent",
      description: "Read the latest status and summarized result of a child agent session.",
      parameters: ReadSubagentParameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Reading subagent status has no side effects.",
      }),
      execute: async (parameters) => {
        const task = Subtask.readSubtask(parameters.id)
        if (!task) {
          throw new Error(`Subtask '${parameters.id}' was not found.`)
        }

        return {
          title: task.title,
          text: renderSubtaskText(task, {
            maxSummaryChars: parameters.maxSummaryChars,
          }),
          metadata: {
            ...toSubtaskModelValue(task, {
              action: "read",
              maxSummaryChars: parameters.maxSummaryChars,
              instruction:
                task.status === "running"
                  ? "The subagent is still running. Call read_subagent again later for a fresher result."
                  : task.status === "blocked"
                    ? "The subagent is blocked. Surface the blocker or inspect the child session before continuing."
                    : undefined,
            }),
          },
        }
      },
      toModelOutput: async (result) => ({
        type: "json",
        value: {
          ...(result.metadata as Record<string, unknown>),
        } as JSONValue,
      }),
    }
  },
  {
    title: "Read Subagent",
    aliases: ["read-subagent"],
    capabilities: {
      kind: "delegation",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
