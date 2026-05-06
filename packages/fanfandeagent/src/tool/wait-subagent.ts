import z from "zod"
import type { JSONValue } from "@ai-sdk/provider"
import * as Identifier from "#id/id.ts"
import * as Tool from "#tool/tool.ts"
import * as Subtask from "#session/tasks/subtask.ts"
import { renderSubtaskText, toSubtaskModelValue } from "#tool/subagent-shared.ts"

const DEFAULT_WAIT_TIMEOUT_MS = 30_000
const MAX_WAIT_TIMEOUT_MS = 300_000
const WAIT_POLL_INTERVAL_MS = 100

const WaitSubagentParameters = z.object({
  id: Identifier.schema("task").describe("Subagent task id."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(MAX_WAIT_TIMEOUT_MS)
    .optional()
    .describe("Maximum time to wait in milliseconds. Defaults to 30000."),
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitInstruction(task: Subtask.SubtaskView) {
  if (task.status === "running") {
    return "The subagent is still running. Call wait_subagent or read_subagent again later for a fresher result."
  }

  if (task.status === "blocked") {
    return "The subagent is blocked. Surface the blocker or inspect the child session before continuing."
  }

  return undefined
}

async function waitForSubtask(id: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let task = Subtask.readSubtask(id)

  if (!task) {
    throw new Error(`Subtask '${id}' was not found.`)
  }

  while (task.status === "running" && Date.now() < deadline) {
    const remaining = deadline - Date.now()
    await sleep(Math.min(WAIT_POLL_INTERVAL_MS, Math.max(1, remaining)))
    task = Subtask.readSubtask(id)
    if (!task) {
      throw new Error(`Subtask '${id}' was not found.`)
    }
  }

  return task
}

export const WaitSubagentTool = Tool.define(
  "wait_subagent",
  async () => {
    return {
      title: "Wait Subagent",
      description: "Wait for a child agent session to finish, or return its current status when the wait times out.",
      parameters: WaitSubagentParameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Waiting for subagent status has no side effects.",
      }),
      execute: async (parameters) => {
        const task = await waitForSubtask(parameters.id, parameters.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)

        return {
          title: task.title,
          text: renderSubtaskText(task),
          metadata: {
            ...toSubtaskModelValue(task, {
              action: "read",
              instruction: waitInstruction(task),
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
    title: "Wait Subagent",
    aliases: ["wait-subagent"],
    capabilities: {
      kind: "delegation",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
