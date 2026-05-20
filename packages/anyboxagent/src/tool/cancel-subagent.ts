import z from "zod"
import type { JSONValue } from "@ai-sdk/provider"
import * as Identifier from "#id/id.ts"
import * as Tool from "#tool/tool.ts"
import * as Subtask from "#session/tasks/subtask.ts"
import { renderSubtaskText, toSubtaskModelValue } from "#tool/subagent-shared.ts"

const CancelSubagentParameters = z.object({
  id: Identifier.schema("task").describe("Subagent task id."),
})

export const CancelSubagentTool = Tool.define(
  "cancel_subagent",
  async () => {
    return {
      title: "Cancel Subagent",
      description: "Cancel a running child agent session.",
      parameters: CancelSubagentParameters,
      describeApproval: (parameters) => ({
        title: "Cancel subagent",
        summary: `Stop child agent task '${parameters.id}'.`,
      }),
      execute: async (parameters) => {
        const task = await Subtask.cancelSubtask(parameters.id)
        return {
          title: task.title,
          text: renderSubtaskText(task),
          metadata: {
            ...toSubtaskModelValue(task, {
              action: "cancel",
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
    title: "Cancel Subagent",
    aliases: ["cancel-subagent"],
    capabilities: {
      kind: "delegation",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
  },
)
