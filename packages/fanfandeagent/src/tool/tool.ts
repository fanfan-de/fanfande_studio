import z from "zod"
import type * as Agent from "#agent/agent.ts"

type Metadata = Record<string, unknown>

export interface InitContext {
  agent?: Agent.AgentInfo
}

export interface Context {
  sessionID: string
  messageID: string
  cwd?: string
  worktree?: string
  abort?: AbortSignal
}

export interface ToolResult<M extends Metadata = Metadata> {
  title?: string
  output: string
  metadata?: M
}

export interface ToolInfo<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
  id: string
  init: (ctx?: InitContext) => Promise<{
    description: string
    parameters: Parameters
    execute(args: z.infer<Parameters>, ctx: Context): Promise<ToolResult<M>> | ToolResult<M>
    formatValidationError?(error: z.ZodError): string
  }>
}

export function define<Parameters extends z.ZodType, Result extends Metadata>(
  id: string,
  init: ToolInfo<Parameters, Result>["init"],
): ToolInfo<Parameters, Result> {
  return {
    id,
    init: async (initctx) => {
      const toolinfo = await init(initctx)
      const execute = toolinfo.execute

      toolinfo.execute = async (args, ctx) => {
        const parsed = toolinfo.parameters.safeParse(args)
        if (!parsed.success) {
          if (toolinfo.formatValidationError) {
            throw new Error(toolinfo.formatValidationError(parsed.error), { cause: parsed.error })
          }

          throw new Error(
            `The ${id} tool was called with invalid arguments: ${parsed.error.message}. Please rewrite the input so it satisfies the expected schema.`,
            { cause: parsed.error },
          )
        }

        return await execute(parsed.data, ctx)
      }

      return toolinfo
    },
  }
}
