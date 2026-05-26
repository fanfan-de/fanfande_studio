import type { JSONValue } from "@ai-sdk/provider"
import z from "zod"
import * as SessionRollback from "#session/core/rollback.ts"
import * as Tool from "#tool/tool.ts"

const Parameters = z.object({
  includeInactive: z.boolean().optional().describe(
    "When true, include checkpoints from abandoned/inactive branches. Defaults to false, returning only the active branch.",
  ),
  limit: z.number().int().min(1).max(200).optional().describe(
    "Maximum number of checkpoints to return from the end of the selected history. Defaults to 80.",
  ),
})

type Parameters = z.infer<typeof Parameters>

function formatCheckpoint(checkpoint: SessionRollback.RollbackCheckpoint) {
  const restore = checkpoint.canRestoreWorkspace
    ? `, restore snapshot from ${checkpoint.snapshotMessageID} (${checkpoint.snapshotSource})`
    : ""
  return [
    `- ${checkpoint.messageID}`,
    `  role: ${checkpoint.role}`,
    `  activePath: ${checkpoint.activePath}`,
    `  preview: ${checkpoint.preview}`,
    `  parentMessageID: ${checkpoint.parentMessageID ?? "null"}${restore}`,
  ].join("\n")
}

export const ListRollbackCheckpointsTool = Tool.define(
  "list_rollback_checkpoints",
  async () => ({
    title: "List Rollback Checkpoints",
    description:
      "Read rollback checkpoint candidates for the current session, including message IDs, previews, active-branch status, and snapshot availability. Use this before rollback_to_checkpoint when you do not already know the exact targetMessageID.",
    parameters: Parameters,
    assessPermission: () => ({
      action: "allow",
      risk: "low",
      reason: "Listing rollback checkpoints only reads conversation metadata for the current session.",
      allowInPlanning: true,
    }),
    execute: async (parameters: Parameters, ctx) => {
      const result = SessionRollback.listRollbackCheckpoints({
        sessionID: ctx.sessionID,
        includeInactive: parameters.includeInactive,
        limit: parameters.limit,
      })

      return {
        title: "Rollback checkpoints",
        text: [
          `Active message: ${result.activeMessageID ?? "none"}`,
          `Returned ${result.checkpoints.length} of ${result.total} checkpoint(s).`,
          result.truncated ? "The list was truncated; pass a larger limit for more history." : "",
          "",
          ...result.checkpoints.map(formatCheckpoint),
        ].filter(Boolean).join("\n"),
        metadata: {
          kind: "rollback-checkpoints",
          ...result,
        },
        data: result,
      }
    },
    toModelOutput: async (result) => ({
      type: "json" as const,
      value: (result.data ?? result.metadata ?? { message: result.text }) as JSONValue,
    }),
  }),
  {
    title: "List Rollback Checkpoints",
    aliases: ["list-rollback-checkpoints", "ListRollbackCheckpoints"],
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
