import z from "zod"
import * as Identifier from "#id/id.ts"
import { getShellTaskRegistry } from "#shell/task-registry.ts"
import * as Tool from "#tool/tool.ts"
import { toDisplayPath } from "#tool/shared.ts"

const StopBackgroundTaskParameters = z.object({
  id: Identifier.schema("task").describe("Background task id."),
})

interface StopBackgroundTaskMetadata extends Record<string, unknown> {
  id: string
  title: string
  command: string
  cwd: string
  displayCwd: string
  shell: string
  status: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  cursor: number
}

export const StopBackgroundTaskTool = Tool.define(
  "stop_background_task",
  async (): Promise<Tool.ToolRuntime<typeof StopBackgroundTaskParameters, StopBackgroundTaskMetadata>> => {
    return {
      title: "Stop Background Task",
      description: "Terminate a background shell task.",
      parameters: StopBackgroundTaskParameters,
      execute: async (parameters) => {
        const task = await getShellTaskRegistry().stop(parameters.id)
        if (!task) {
          throw new Error(`Background task '${parameters.id}' was not found.`)
        }

        const displayCwd = toDisplayPath(task.cwd)

        return {
          title: `Stopped ${task.id}`,
          text: [
            `Background Task ID: ${task.id}`,
            `Title: ${task.title}`,
            `Command: ${task.command}`,
            `Workdir: ${displayCwd}`,
            `Shell: ${task.shell}`,
            `Status: ${task.status}`,
            `Exit: ${task.exitCode ?? "unknown"}`,
          ].join("\n"),
          metadata: {
            id: task.id,
            title: task.title,
            command: task.command,
            cwd: task.cwd,
            displayCwd,
            shell: task.shell,
            status: task.status,
            exitCode: task.exitCode,
            signal: task.signal,
            cursor: task.cursor,
          },
        }
      },
      toModelOutput: async (result) => {
        const metadata = result.metadata
        if (!metadata) {
          return {
            type: "text",
            value: result.text,
          }
        }

        return {
          type: "json",
          value: {
            id: metadata.id,
            title: metadata.title,
            command: metadata.command,
            workdir: metadata.displayCwd,
            shell: metadata.shell,
            status: metadata.status,
            exitCode: metadata.exitCode,
            signal: metadata.signal,
            cursor: metadata.cursor,
          },
        }
      },
    }
  },
  {
    title: "Stop Background Task",
    aliases: ["stop-background-task"],
    capabilities: {
      kind: "exec",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
  },
)
